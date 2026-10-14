import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile,readdir,writeFile} from 'node:fs/promises'
import {createServer} from 'node:net'
import pg from 'pg'
import {localPostgres} from './with-local-postgres.mjs'
import {buildRulePlan} from '../shared/health.js'

const users=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']
const ids=['HISTORICAL_HASH_AND_WRAPPER','PRIVATE_VERSIONED_PLAN_EVIDENCE','SOURCE_WRITE_CAPTURE_RACE','SNAPSHOT_CLEANUP_AND_LEAVE','WRAPPER_HISTORY_TAMPER']
const report={scope:'Isolated PostgreSQL with synthetic input; no cloud or paid calls',cases:Object.fromEntries(ids.map(id=>[id,{status:'not_run'}])),passed:0,failed:0,not_run:ids.length}
const clients=[]
let server
const run=async(id,fn)=>{try{await fn();report.cases[id]={status:'passed'};report.passed++}catch(e){report.cases[id]={status:'failed',reason:e.message.slice(0,250)};report.failed++}report.not_run--}
try{
 const socket=createServer();await new Promise((ok,fail)=>socket.once('error',fail).listen(0,'127.0.0.1',ok))
 const port=socket.address().port;await new Promise(ok=>socket.close(ok));server=await localPostgres(port)
 const connect=async(role,user=null)=>{
  const c=new pg.Client({host:'127.0.0.1',port,database:'postgres',user:role,password:role==='test_admin'?server.adminPassword:server.authPassword})
  await c.connect();clients.push(c);await c.query("set statement_timeout='10000ms'")
  if(user)await c.query("select set_config('request.jwt.claim.sub',$1,false)",[user])
  return c
 }
 const admin=await connect('test_admin')
 await admin.query(`create role anon;create role authenticated login password ${admin.escapeLiteral(server.authPassword)};
  create role service_role login bypassrls password ${admin.escapeLiteral(server.authPassword)};
  alter default privileges grant execute on functions to anon,authenticated;
  create schema auth;create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,encrypted_password text);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
  create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text);`)
 for(let i=0;i<2;i++)await admin.query('insert into auth.users values($1,$2,now(),$3)',[users[i],['me@plans.invalid','w@plans.invalid'][i],'SYNTHETIC'])
 const dir=new URL('../supabase/migrations/',import.meta.url)
 for(const name of (await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('0009_')).sort()){
  const sql=(await readFile(new URL(name,dir),'utf8')).replace(/\r\n/g,'\n')
  await admin.query(sql);await admin.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)',[name.slice(0,12),[sql],name.slice(13,-4)])
 }
 await admin.query(await readFile(new URL('../supabase/admin/initialize-fixed-accounts.sql',import.meta.url),'utf8'))
 const one=await connect('authenticated',users[0]),two=await connect('authenticated',users[1]),other=await connect('authenticated',users[0]),service=await connect('service_role')
 const rpc=async(c,name,args=[],types=[])=> (await c.query(`select to_jsonb(public.${name}(${args.map((_,i)=>`$${i+1}${types[i]??''}`).join(',')})) v`,args)).rows[0].v
 const target=(await admin.query("select ((now() at time zone 'Asia/Shanghai')::date+1)::text d")).rows[0].d
 const schedulePayload=(owner,text,previous=null)=>({user_id:users[owner],record_date:target,raw_text:text,start_time:null,end_time:null,
  exercise_intent:'no',fixed_arrangements:'',meal_conditions:'SYNTHETIC canteen',constraints:'',is_shared:false,
  ...(previous?{expected_updated_at:previous.updated_at}:{}),submitted_at:new Date().toISOString(),parse_version:'manual-schedule-v1',confirmed_data:{
   user_slot:owner?'w':'me',record_date:target,exercise:{intent:'no',type:null,duration_minutes:null,location:null,equipment:null,explicit_start_time:null,explicit_end_time:null},
   meal:{conditions:'SYNTHETIC canteen',arrangements:null},constraints:[],fatigue:'unknown',sleep:'unknown',pain:null,ambiguous_fields:[]}})
 const saveSchedule=(c,owner,text,previous=null)=>rpc(c,'save_confirmed_schedule',[JSON.stringify(schedulePayload(owner,text,previous)),previous?.id??null],['::jsonb','::uuid'])
 let schedule=await saveSchedule(one,0,'SYNTHETIC initial')
 await rpc(one,'save_profile',[JSON.stringify({health_notes:'SYNTHETIC private profile'})],['::jsonb'])
 const content=buildRulePlan({date:target,slot:'me',schedule,rules:null}).content
 const request=c=>rpc(c,'request_plan_generation',[target,'rules'],['::date','::text'])
 const finish=async(job)=>{
  const claim=await rpc(service,'claim_generation_job',[job.id],['::uuid'])
  return rpc(service,'finish_generation_job',[job.id,claim.claim_token,JSON.stringify(content),claim.input_version,'rules',null],['::uuid','::uuid','::jsonb','::text','::text','::text'])
 }
 const historical=await finish(await request(one))
 const queued=await request(two)
 const exhausted=(await admin.query(`insert into generation_jobs(space_id,user_id,target_date,kind,scheduled_for,input_version,provider,status,attempts,error_code)
  select space_id,user_id,$1::date+1,'scheduled',now(),public.health_input_version(user_id,$1::date+1),'rules','exhausted',3,'MEAL_TEMPLATE_UNCONFIRMED' from fixed_accounts returning *`,[target])).rows
 const oldHashes=(await admin.query('select user_id,public.health_input_version(user_id,$1) hash from fixed_accounts order by user_id',[target])).rows
 const wrapper=await readFile(new URL('../supabase/admin/apply-input-snapshots-009.sql',import.meta.url),'utf8')
 const migration=await readFile(new URL('../supabase/migrations/202610140009_input_snapshots.sql',import.meta.url))
 report.migration_sha256=createHash('sha256').update(migration).digest('hex')
 report.wrapper_sha256=createHash('sha256').update(wrapper).digest('hex')
 await run(ids[0],async()=>{
  await admin.query(wrapper)
  assert.deepEqual((await admin.query('select user_id,public.health_input_version(user_id,$1) hash from fixed_accounts order by user_id',[target])).rows,oldHashes)
  assert.deepEqual((await admin.query('select * from generation_jobs where id=any($1::uuid[]) order by user_id',[exhausted.map(x=>x.id)])).rows,exhausted.sort((a,b)=>a.user_id.localeCompare(b.user_id)))
  assert.equal((await admin.query('select count(*)::int n from generation_input_snapshots')).rows[0].n,0)
  assert.equal((await admin.query('select error_code from generation_jobs where id=$1',[queued.id])).rows[0].error_code,'INPUT_SNAPSHOT_UNAVAILABLE')
  const state=(await admin.query('select * from generation_jobs order by id')).rows
  await admin.query(wrapper.replace(/\r?\n/g,'\r\n'))
  assert.deepEqual((await admin.query('select * from generation_jobs order by id')).rows,state)
  assert.equal(await rpc(one,'health_input_snapshot_schema_version'),9)
 })
 let job,oldSnapshot
 await run(ids[1],async()=>{
  job=await request(one);assert.equal(job.id,historical.id)
  oldSnapshot=(await one.query('select * from generation_input_snapshots where job_id=$1',[job.id])).rows[0]
  assert.equal(oldSnapshot.source_snapshot.schedule.id,schedule.id)
  assert.equal(oldSnapshot.source_snapshot.profile.health_notes,'SYNTHETIC private profile')
  assert.equal(oldSnapshot.source_snapshot.plans.some(p=>p.target_date===target),false)
  job=await finish(job);assert.notEqual(job.plan_id,historical.plan_id)
  oldSnapshot=(await one.query('select * from generation_input_snapshots where job_id=$1',[job.id])).rows[0]
  assert.equal(oldSnapshot.plan_id,job.plan_id)
  assert.equal((await admin.query('select count(*)::int n from generation_input_snapshots where plan_id=$1',[historical.plan_id])).rows[0].n,0)
  await admin.query('update members set share_plan=true');await admin.query('update daily_plans set is_shared=true where id=$1',[job.plan_id])
  assert.equal((await two.query('select id from daily_plans where id=$1',[job.plan_id])).rowCount,1)
  assert.equal((await two.query('select * from generation_input_snapshots where plan_id=$1',[job.plan_id])).rowCount,0)
  assert.equal((await service.query('select * from generation_input_snapshots where plan_id=$1',[job.plan_id])).rowCount,1)
  await assert.rejects(one.query('select public.health_input_snapshot($1,$2)',[users[1],target]),/permission denied/)
  await assert.rejects(one.query("update generation_input_snapshots set source_snapshot='{}'"),/permission denied/)
  assert.equal((await request(one)).id,job.id)
  assert.equal((await one.query('select * from generation_input_snapshots where job_id=$1',[job.id])).rowCount,1)
  schedule=await saveSchedule(one,0,'SYNTHETIC changed',schedule)
  job=await request(one)
  assert.notEqual(job.input_version,oldSnapshot.input_version)
  assert.deepEqual((await one.query('select * from generation_input_snapshots where job_id=$1 and input_version=$2',[job.id,oldSnapshot.input_version])).rows[0],oldSnapshot)
  job=await finish(job)
  assert.equal((await one.query('select * from generation_input_snapshots where job_id=$1',[job.id])).rowCount,2)
 })
 await run(ids[2],async()=>{
  const pidOne=(await one.query('select pg_backend_pid() p')).rows[0].p,pidOther=(await other.query('select pg_backend_pid() p')).rows[0].p
  await one.query('begin');let held=true
  try{
   schedule=await saveSchedule(one,0,'SYNTHETIC race source',schedule)
   const pending=request(other).then(value=>({value}),error=>({error}))
   let observed=false
   for(let i=0;i<150;i++){
    if((await admin.query('select pg_blocking_pids($1) p',[pidOther])).rows[0].p.includes(pidOne)){observed=true;break}
    await new Promise(resolve=>setTimeout(resolve,20))
   }
   assert.ok(observed,'Snapshot capture must wait for the source transaction')
   await one.query('commit');held=false
   const result=await pending;if(result.error)throw result.error;job=result.value
   const snapshot=(await one.query('select * from generation_input_snapshots where job_id=$1 and input_version=$2',[job.id,job.input_version])).rows[0]
   assert.equal(snapshot.source_snapshot.schedule.raw_text,'SYNTHETIC race source')
   assert.equal(snapshot.input_version,await rpc(service,'health_input_version',[users[0],target],['::uuid','::date']))
  }finally{if(held)await one.query('rollback')}
 })
 await run(ids[3],async()=>{
  await admin.query('delete from generation_jobs where id=$1',[job.id])
  assert.equal((await admin.query('select count(*)::int n from generation_input_snapshots where job_id=$1',[job.id])).rows[0].n,0)
  await request(one);await request(two)
  await rpc(one,'erase_own_health_data')
  assert.equal((await admin.query('select count(*)::int n from generation_input_snapshots where user_id=$1',[users[0]])).rows[0].n,0)
  assert.ok((await admin.query('select count(*)::int n from generation_input_snapshots where user_id=$1',[users[1]])).rows[0].n>0)
  await rpc(two,'leave_space')
  assert.equal((await admin.query('select count(*)::int n from generation_input_snapshots')).rows[0].n,0)
 })
 await run(ids[4],async()=>{
  await admin.query("update supabase_migrations.schema_migrations set statements=array['SYNTHETIC tamper'] where version='202610140008'")
  await assert.rejects(admin.query(wrapper),/Migration history mismatch/)
  await admin.query('rollback')
 })
}catch(error){report.setup_error=error.message.slice(0,250);process.exitCode=1}
finally{
 await Promise.allSettled(clients.map(c=>c.end()))
 if(server)await server.stop().catch(()=>{report.teardown_error=true})
 report.generated_at=new Date().toISOString()
 await writeFile(new URL('../test-results/integrity-input-snapshots-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
 console.log(`Input snapshots: ${report.passed} passed, ${report.failed} failed, ${report.not_run} not run`)
 if(report.failed||report.not_run||report.setup_error||report.teardown_error)process.exitCode=1
}
process.exit(process.exitCode||0)

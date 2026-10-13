import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const users = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333']
const date = '2026-10-14'

async function setup() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    alter default privileges grant execute on functions to anon,authenticated;
    create schema auth;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
  `)
  for (let i=0;i<2;i++) await db.query('insert into auth.users(id,email,email_confirmed_at,encrypted_password) values($1,$2,now(),$3)',[users[i],['me@plans.invalid','w@plans.invalid'][i],'SYNTHETIC'])
  const dir = new URL('../supabase/migrations/',import.meta.url)
  for (const file of (await readdir(dir)).filter(x=>/^20261013000[1-4]_.*\.sql$/.test(x)).sort())
    await db.exec(await readFile(new URL(file,dir),'utf8'))
  await db.exec(await readFile(new URL('../supabase/admin/initialize-fixed-accounts.sql',import.meta.url),'utf8'))
  await db.query('insert into auth.users(id,email,email_confirmed_at,encrypted_password) values($1,$2,now(),$3)',[users[2],'third@plans.invalid','SYNTHETIC'])
  const actor = async (i,sql,args=[]) => {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[i===null?'':users[i]])
    await db.exec(`set role ${i===null?'anon':'authenticated'}`)
    return db.query(sql,args)
  }
  const admin = async (sql,args=[]) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub','',false)"); return db.query(sql,args) }
  const service = async (sql,args=[]) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub','',false)"); await db.exec('set role service_role'); return db.query(sql,args) }
  const rpc = async (i,name,args=[],casts=[]) => (await actor(i,`select to_jsonb(public.${name}(${args.map((_,j)=>`$${j+1}${casts[j]??''}`).join(',')})) as v`,args)).rows[0].v
  return {db,actor,admin,service,rpc}
}

test('004 fixed-space RLS, private defaults, sharing, editing and erasure',async()=>{
  const {db,actor,admin,service,rpc}=await setup()
  try {
    assert.equal(await rpc(0,'health_schema_version'),4)
    await assert.rejects(actor(null,'select public.health_schema_version()'),/permission denied/)
    const rules={confirmed:true,equipment:'machines_only',ankle_status:'unknown',free_weekdays:[2],exercise_minutes:30,limitations:null,meal_notes:null}
    let row=await rpc(0,'save_health_rules',[JSON.stringify(rules),false],['::jsonb','::boolean'])
    assert.equal(row.version,1)
    await assert.rejects(rpc(0,'save_health_rules',[JSON.stringify({confirmed:true}),false],['::jsonb','::boolean']),/Invalid health rules/)
    assert.equal((await actor(1,'select * from public.health_rules')).rows.length,0)
    assert.equal((await actor(2,'select * from public.daily_plans')).rows.length,0)
    await assert.rejects(actor(1,'update public.health_rules set is_shared=true'),/permission denied/)
    const content={summary:'SYNTHETIC',meals:[],training:{mode:'rest',purpose:'SYNTHETIC',time:null,intensity:'none',equipment:'none',muscles:[],items:[],warmup:[],cooldown:[],total_seconds:0},warnings:[]}
    const badMeal={time:null,title:'SYNTHETIC',foods:[]}
    assert.equal((await admin('select public.health_valid_plan($1::jsonb) as valid',[JSON.stringify({...content,meals:[badMeal]})])).rows[0].valid,false)
    assert.equal((await admin('select public.health_valid_plan($1::jsonb) as valid',[JSON.stringify({...content,training:{...content.training,total_seconds:3601}})])).rows[0].valid,false)
    let plan=await rpc(0,'save_daily_plan',[date,JSON.stringify(content)],['::date','::jsonb'])
    assert.equal(plan.version,1)
    const originalId=plan.id
    await assert.rejects(rpc(0,'save_daily_plan',[date,JSON.stringify({...content,training:{...content.training,items:[{exercise_id:'invented'}]}}),1],['::date','::jsonb','::integer']),/Invalid plan/)
    await assert.rejects(rpc(0,'save_daily_plan',[date,JSON.stringify({...content,warnings:undefined}),1],['::date','::jsonb','::integer']),/Invalid plan/)
    assert.equal((await actor(1,'select * from public.daily_plans')).rows.length,0)
    await rpc(0,'save_health_sharing',[JSON.stringify({share_plan:true,share_training:false,share_meal:false,share_photo:false})],['::jsonb'])
    plan=await rpc(0,'save_daily_plan',[date,JSON.stringify(content),1,true],['::date','::jsonb','::integer','::boolean'])
    assert.equal(plan.version,2)
    assert.equal((await actor(1,'select * from public.daily_plans')).rows.length,1)
    assert.equal((await actor(1,'select * from public.daily_plans where id=$1',[originalId])).rows.length,0)
    await assert.rejects(rpc(1,'save_daily_plan',[date,JSON.stringify(content),2,true,users[0]],['::date','::jsonb','::integer','::boolean','::uuid']),/not found or access denied/)
    await rpc(0,'save_settings',[JSON.stringify({share_profile:false,share_schedule:false,share_weight:false,allow_partner_edit:true})],['::jsonb'])
    plan=await rpc(1,'save_daily_plan',[date,JSON.stringify({...content,summary:'SYNTHETIC PARTNER'}),2,true,users[0]],['::date','::jsonb','::integer','::boolean','::uuid'])
    assert.equal(plan.updated_by,users[1])
    await assert.rejects(rpc(1,'save_daily_plan',[date,JSON.stringify(content),3,false,users[0]],['::date','::jsonb','::integer','::boolean','::uuid']),/not found or access denied/)
    await rpc(0,'save_health_sharing',[JSON.stringify({share_plan:false,share_training:false,share_meal:false,share_photo:false})],['::jsonb'])
    assert.equal((await actor(1,'select * from public.daily_plans')).rows.length,0)
    assert.equal((await actor(0,'select is_stale from public.daily_plans where id=$1',[plan.id])).rows[0].is_stale,false)
    await rpc(0,'save_schedule',[JSON.stringify({user_id:users[0],record_date:date,raw_text:'SYNTHETIC',is_shared:false})],['::jsonb'])
    assert.equal((await actor(0,'select is_stale from public.daily_plans where id=$1',[plan.id])).rows[0].is_stale,true)
    await assert.rejects(rpc(0,'save_training_session',[JSON.stringify({status:'active',is_shared:false,data:{status:'active',started_at:new Date().toISOString(),sets:[]}})],['::jsonb']),/Invalid training session/)
    await assert.rejects(actor(0,"insert into public.photo_assets(space_id,user_id,sha256,storage_path,mime,width,height,bytes,updated_by) values(gen_random_uuid(),$1,repeat('a',64),'x','image/png',1,1,8,$1)",[users[0]]),/permission denied/)
    const space=(await admin('select space_id from public.fixed_accounts limit 1')).rows[0].space_id
    await admin("insert into public.photo_assets(space_id,user_id,sha256,storage_path,mime,width,height,bytes,updated_by) values($1,$2,repeat('a',64),'SYNTHETIC/object','image/png',1,1,8,$2)",[space,users[0]])
    await assert.rejects(rpc(0,'erase_own_health_data'),/Delete private photos first/)
    const photo=(await admin('select id from public.photo_assets where user_id=$1',[users[0]])).rows[0]
    assert.equal((await service('select public.begin_photo_delete($1::uuid,$2::uuid,$3::uuid) as path',[photo.id,users[0],space])).rows[0].path,'SYNTHETIC/object')
    assert.equal((await actor(0,'select id from public.photo_assets where id=$1',[photo.id])).rows.length,0)
    await assert.rejects(service('select public.reuse_photo_asset($1::uuid,$2::uuid,$3::uuid,null)',[photo.id,users[0],space]),/Photo unavailable/)
    await service('select public.unlink_photo_asset($1::uuid)',[photo.id])
    assert.equal((await admin('select id from public.photo_assets where id=$1',[photo.id])).rows.length,0)
    await rpc(0,'erase_own_health_data')
  } finally { await db.close() }
})

test('scheduled jobs anchor target to scheduled time and budget is atomic',async()=>{
  const {db,actor,admin,service,rpc}=await setup()
  try {
    await assert.rejects(actor(0,'select public.enqueue_scheduled_plans(now())'),/permission denied/)
    const meal=(title)=>({time:null,title,foods:[{name:'SYNTHETIC',portion:'1',unit:'份'}],
      prep_method:'自备',purchase_or_prep:'提前准备',alternative:'同类替换',notes:'已确认',snack_reason:null})
    await rpc(0,'save_health_rules',[JSON.stringify({confirmed:true,equipment:'machines_only',ankle_status:'no_issue',
      free_weekdays:[],meal_template:[meal('早餐'),meal('午餐'),meal('晚餐')]}),false],['::jsonb','::boolean'])
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]))
    const day=new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`)
    if(Number(parts.hour)*60+Number(parts.minute)<23*60+55) day.setUTCDate(day.getUTCDate()-1)
    const scheduled=new Date(day.getTime()+15*3600_000+55*60_000)
    const target=new Date(day.getTime()+24*3600_000).toISOString().slice(0,10)
    const count=(await service("select public.enqueue_scheduled_plans($1::timestamptz) as n",[scheduled.toISOString()])).rows[0].n
    assert.equal(count,2)
    const jobs=(await actor(0,"select id,target_date,kind,status from public.generation_jobs")).rows
    assert.equal(jobs.length,1)
    assert.equal(new Date(jobs[0].target_date).toISOString().slice(0,10),target)
    assert.equal((await actor(1,'select * from public.generation_jobs')).rows.length,1)
    assert.equal((await actor(2,'select * from public.generation_jobs')).rows.length,0)
    const claimed=(await service('select to_jsonb(public.claim_generation_job($1::uuid)) as v',[jobs[0].id])).rows[0].v
    assert.equal(claimed.attempts,1)
    assert.equal(claimed.status,'running')
    const content={summary:'SYNTHETIC',meals:[],training:{mode:'rest',purpose:'SYNTHETIC',time:null,
      intensity:'none',equipment:'none',muscles:[],items:[],warmup:[],cooldown:[],total_seconds:0},warnings:[]}
    await assert.rejects(service('select public.finish_generation_job($1::uuid,$2::uuid,$3::jsonb,$4,$5,null)',
      [claimed.id,claimed.claim_token,JSON.stringify(content),claimed.input_version,'rules']),/Unconfirmed automatic meals/)
    await assert.rejects(service('select public.finish_generation_job($1::uuid,$2::uuid,null,null,$3,$4)',
      [claimed.id,'44444444-4444-4444-8444-444444444444','rules','SYNTHETIC_ERROR']),/Job lease unavailable/)
    await service('select public.finish_generation_job($1::uuid,$2::uuid,null,null,$3,$4)',
      [claimed.id,claimed.claim_token,'rules','SYNTHETIC_ERROR'])
    assert.equal((await admin('select status from public.generation_jobs where id=$1',[claimed.id])).rows[0].status,'failed')
    await admin("update public.generation_jobs set status='running',attempts=max_attempts,lease_until=now()-interval '1 minute' where id=$1",[claimed.id])
    assert.equal((await service('select to_jsonb(public.claim_generation_job($1::uuid)) as v',[claimed.id])).rows[0].v,null)
    assert.equal((await admin('select status from public.generation_jobs where id=$1',[claimed.id])).rows[0].status,'exhausted')
    await rpc(0,'set_ai_consent',['text',true,2,'2026-10-13-openai-health-v1'],['::text','::boolean','::integer','::text'])
    await admin("insert into public.ai_monthly_budgets(period,limit_cents) values(date_trunc('month',now() at time zone 'Asia/Shanghai')::date,2)")
    const reservation=(await service('select public.reserve_ai_usage($1::uuid,$2,$3) as id',[users[0],'text',2])).rows[0].id
    await assert.rejects(service('select public.reserve_ai_usage($1::uuid,$2,$3)',[users[0],'text',1]),/Global AI budget exceeded/)
    await service('select public.settle_ai_usage($1::uuid,$2)',[reservation,1])
    const next=(await service('select public.reserve_ai_usage($1::uuid,$2,$3) as id',[users[0],'text',1])).rows[0].id
    assert.ok(next)
    await admin('update public.ai_monthly_budgets set limit_cents=5')
    await rpc(0,'set_ai_consent',['text',true,5,'2026-10-13-openai-health-v1'],['::text','::boolean','::integer','::text'])
    await service('select public.reserve_ai_usage($1::uuid,$2,$3)',[users[0],'text',1])
    await assert.rejects(service('select public.reserve_ai_usage($1::uuid,$2,$3)',[users[0],'text',1]),/AI rate limit exceeded/)
    await assert.rejects(actor(0,'select * from public.ai_usage'),/permission denied/)
  } finally { await db.close() }
})

test('input version changes for same-second profile edits and deleted nonlatest training',async()=>{
  const {db,admin,rpc}=await setup()
  const version=async()=>(await admin('select public.health_input_version($1::uuid,$2::date) as v',
    [users[0],date])).rows[0].v
  try{
    await rpc(0,'save_profile',[JSON.stringify({sex:'other',health_notes:'SYNTHETIC'})],['::jsonb'])
    await admin("update public.health_profiles set updated_at='2026-10-13T12:00:00.100001Z' where user_id=$1",[users[0]])
    const first=await version()
    await admin("update public.health_profiles set updated_at='2026-10-13T12:00:00.100002Z' where user_id=$1",[users[0]])
    assert.notEqual(await version(),first)
    const data=(at)=>({plan_id:null,status:'completed',started_at:`${date}T${at}:00Z`,active_since:null,
      rest_until:null,rest_remaining_seconds:0,ended_at:`${date}T${at}:01Z`,elapsed_seconds:60,stop_reason:null,sets:[]})
    const older=await rpc(0,'save_training_session',[JSON.stringify({status:'completed',is_shared:false,data:data('00:00')})],['::jsonb'])
    const newer=await rpc(0,'save_training_session',[JSON.stringify({status:'completed',is_shared:false,data:data('00:05')})],['::jsonb'])
    const withBoth=await version()
    await rpc(0,'delete_training_session',[older.id],['::uuid'])
    assert.notEqual(await version(),withBoth)
    assert.equal((await admin('select count(*)::int as n from public.training_sessions where user_id=$1',[users[0]])).rows[0].n,1)
    assert.equal(newer.user_id,users[0])
    const schedulePayload=JSON.stringify({user_id:users[0],record_date:date,raw_text:'SYNTHETIC',is_shared:false})
    const oldSchedule=await rpc(0,'save_schedule',[schedulePayload],['::jsonb'])
    const oldScheduleVersion=await version()
    await rpc(0,'delete_schedule',[oldSchedule.id],['::uuid'])
    const newSchedule=await rpc(0,'save_schedule',[schedulePayload],['::jsonb'])
    assert.notEqual(newSchedule.id,oldSchedule.id)
    assert.notEqual(await version(),oldScheduleVersion)
  }finally{await db.close()}
})

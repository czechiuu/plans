import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333']
const period=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'})
  .format(new Date())+'-01'

async function fixture(){
  const db=new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    alter default privileges grant execute on functions to anon,authenticated;
    create schema auth;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`)
  for(let i=0;i<2;i++) await db.query('insert into auth.users values($1,$2,now(),$3)',
    [ids[i],['me@plans.invalid','w@plans.invalid'][i],'SYNTHETIC'])
  const dir=new URL('../supabase/migrations/',import.meta.url)
  for(const name of (await readdir(dir)).filter(x=>/^20261013000[1-5]_.*\.sql$/.test(x)).sort())
    await db.exec(await readFile(new URL(name,dir),'utf8'))
  await db.exec(await readFile(new URL('../supabase/admin/initialize-fixed-accounts.sql',import.meta.url),'utf8'))
  await db.query('insert into auth.users values($1,$2,now(),$3)',[ids[2],'third@plans.invalid','SYNTHETIC'])
  async function as(role,index,sql,args=[]){
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[index===null?'':ids[index]])
    if(role) await db.exec(`set role ${role}`)
    return db.query(sql,args)
  }
  const rpc=(i,name,args=[],casts=[])=>as(i===null?'anon':'authenticated',i,
    `select to_jsonb(public.${name}(${args.map((_,j)=>`$${j+1}${casts[j]??''}`).join(',')})) v`,args)
    .then(x=>x.rows[0].v)
  return {db,as,rpc}
}

test('005 provider and purpose grants are private and revoked independently',async()=>{
  const {db,as,rpc}=await fixture()
  try{
    assert.equal(await rpc(0,'health_schema_version'),4)
    assert.equal(await rpc(0,'health_provider_schema_version'),5)
    await assert.rejects(rpc(null,'health_provider_schema_version'),/permission denied/)
    await assert.rejects(rpc(2,'set_ai_provider_consent',
      ['openai','parse_schedule',true,10,'2026-10-13-openai-health-v1'],
      ['::text','::text','::boolean','::integer','::text']),/Space membership required/)
    await assert.rejects(rpc(0,'set_ai_provider_consent',
      ['deepseek','parse_schedule',true,10,'2026-10-13-deepseek-health-v1'],
      ['::text','::text','::boolean','::integer','::text']),/not enabled/)
    await assert.rejects(rpc(0,'set_ai_provider_consent',
      [null,'parse_schedule',true,10,'2026-10-13-openai-health-v1'],
      ['::text','::text','::boolean','::integer','::text']),/Invalid provider consent/)
    const grant=await rpc(0,'set_ai_provider_consent',
      ['openai','parse_schedule',true,10,'2026-10-13-openai-health-v1'],
      ['::text','::text','::boolean','::integer','::text'])
    assert.equal(grant.enabled,true)
    assert.equal(grant.purpose,'parse_schedule')
    assert.equal((await as('authenticated',1,'select * from public.ai_consents')).rows.length,0)
    await assert.rejects(as('authenticated',0,'update public.ai_consents set enabled=true'),/permission denied/)
    await assert.rejects(rpc(0,'set_ai_plan_provider',['openai'],['::text']),/AI consent unavailable/)
    await rpc(0,'set_ai_provider_consent',
      ['openai','generate_plan',true,10,'2026-10-13-openai-health-v1'],
      ['::text','::text','::boolean','::integer','::text'])
    assert.equal(await rpc(0,'set_ai_plan_provider',['openai'],['::text']),'openai')
    const insertPlan=(day)=>as(null,null,`insert into public.daily_plans
      (space_id,user_id,target_date,version,source,status,input_version,content,updated_by)
      select space_id,$1,$2::date,1,'ai','published','SYNTHETIC','{}'::jsonb,$1
        from public.fixed_accounts where slot='me'`,[ids[0],day])
    await insertPlan('2026-10-15')
    await rpc(0,'set_ai_provider_consent',
      ['openai','generate_plan',false,0,'2026-10-13-openai-health-v1'],
      ['::text','::text','::boolean','::integer','::text'])
    assert.equal((await as('authenticated',0,'select plan_provider from public.ai_plan_preferences')).rows[0].plan_provider,'rules')
    await assert.rejects(insertPlan('2026-10-16'),/AI consent unavailable/)
    await assert.rejects(rpc(0,'set_ai_consent',['text',true,10,'old'],
      ['::text','::boolean','::integer','::text']),/provider and purpose/)
  }finally{await db.close()}
})

test('005 provider/probe spending shares the global budget and requires exact consent',async()=>{
  const {db,as,rpc}=await fixture()
  try{
    const p=period()
    await as(null,null,'insert into public.ai_monthly_budgets(period,limit_cents) values($1,10)',[p])
    await as(null,null,'insert into public.ai_provider_budgets(period,provider,limit_cents) values($1,$2,$3),($1,$4,$5)',
      [p,'openai',10,'deepseek',10])
    await assert.rejects(rpc(0,'reserve_ai_probe',['parse_schedule',1],['::text','::integer']),/permission denied/)
    await assert.rejects(as('service_role',null,'select public.reserve_ai_provider_usage($1,$2,$3,$4)',
      [ids[0],'openai','estimate_meal_photo',1]),/AI consent unavailable/)
    await rpc(0,'set_ai_provider_consent',
      ['openai','parse_schedule',true,10,'2026-10-13-openai-health-v1'],
      ['::text','::text','::boolean','::integer','::text'])
    const hold=(await as('service_role',null,'select public.reserve_ai_provider_usage($1,$2,$3,$4) id',
      [ids[0],'openai','parse_schedule',6])).rows[0].id
    await assert.rejects(as('service_role',null,'select public.settle_ai_usage($1,$2)',[hold,null]),/Invalid AI settlement/)
    await as('service_role',null,'select public.settle_ai_usage($1,$2)',[hold,6])
    await assert.rejects(as('service_role',null,'select public.reserve_ai_probe($1,$2)',
      ['estimate_meal_photo',5]),/Global AI budget exceeded/)
    const probe=(await as('service_role',null,'select public.reserve_ai_probe($1,$2) id',
      ['estimate_meal_photo',4])).rows[0].id
    await assert.rejects(as('service_role',null,'select public.settle_ai_probe($1,$2)',[probe,null]),/Invalid probe settlement/)
    await as('service_role',null,'select public.settle_ai_probe($1,$2)',[probe,3])
    assert.equal((await as('service_role',null,'select charged_cents from public.ai_probe_usage where id=$1',[probe])).rows[0].charged_cents,3)
    await assert.rejects(as('service_role',null,'select public.reserve_ai_usage($1,$2,$3)',
      [ids[0],'text',1]),/provider-specific/)
  }finally{await db.close()}
})

test('administrator budget script preserves lower caps and existing spending',async()=>{
  const {db,as}=await fixture()
  try{
    await as(null,null,'delete from auth.users where id=$1',[ids[2]])
    await db.exec(`create schema supabase_migrations;
      create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text)`)
    const source=(await readFile(new URL('../supabase/migrations/202610130005_ai_providers.sql',import.meta.url),'utf8'))
      .replace(/\r\n/g,'\n')
    await as(null,null,'insert into supabase_migrations.schema_migrations values($1,array[$2],$3)',
      ['202610130005',source,'ai_providers'])
    const sql=await readFile(new URL('../supabase/admin/set-ai-provider-budgets.sql',import.meta.url),'utf8')
    await db.exec(sql)
    const p=period()
    const caps=()=>as(null,null,'select provider,limit_cents from public.ai_provider_budgets where period=$1 order by provider',[p])
      .then(x=>x.rows.map(r=>[r.provider,r.limit_cents]))
    assert.deepEqual(await caps(),[['deepseek',10],['openai',200]])
    await as(null,null,'update public.ai_monthly_budgets set limit_cents=150 where period=$1',[p])
    await as(null,null,"update public.ai_provider_budgets set limit_cents=case provider when 'openai' then 50 else 7 end where period=$1",[p])
    await as(null,null,`insert into public.ai_usage(user_id,period,kind,provider,purpose,reserved_cents,charged_cents,status)
      values($1,$2,'text','openai','parse_schedule',2,2,'settled')`,[ids[0],p])
    await as(null,null,`insert into public.ai_probe_usage(period,provider,purpose,reserved_cents,charged_cents,status)
      values($1,'deepseek','parse_schedule',1,1,'settled')`,[p])
    await db.exec(sql)
    assert.deepEqual(await caps(),[['deepseek',7],['openai',50]])
    assert.equal((await as(null,null,'select limit_cents from public.ai_monthly_budgets where period=$1',[p])).rows[0].limit_cents,150)
    assert.equal((await as(null,null,'select count(*)::integer n from public.ai_usage')).rows[0].n,1)
    assert.equal((await as(null,null,'select count(*)::integer n from public.ai_probe_usage')).rows[0].n,1)
    await as(null,null,"update public.ai_provider_budgets set limit_cents=0 where period=$1 and provider='deepseek'",[p])
    await assert.rejects(db.exec(sql),/Existing AI usage exceeds/)
    await db.exec('rollback')
    assert.deepEqual(await caps(),[['deepseek',0],['openai',50]])
    await as(null,null,"update supabase_migrations.schema_migrations set statements=array['tampered'] where version='202610130005'")
    await assert.rejects(db.exec(sql),/not the reviewed source/)
    await db.exec('rollback')
  }finally{await db.close()}
})

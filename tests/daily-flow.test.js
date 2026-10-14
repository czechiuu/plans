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
  for(const name of (await readdir(dir)).filter(x=>/^202610(?:13000[1-5]|14000[67])_.*\.sql$/.test(x)).sort())
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


import { buildRulePlan,validateGeneratedPlan } from '../shared/health.js'

test('007 SQL permits confirmed timed strength and rejects shifted, oversized or badminton strength plans',async()=>{
 const {db,as,rpc}=await fixture()
 try{
  const date=(await as(null,null,"select (now() at time zone 'Asia/Shanghai')::date::text d")).rows[0].d
  const rules={confirmed:true,equipment:'machines_only',ankle_status:'no_issue',free_weekdays:[],exercise_minutes:60,
    max_session_minutes:60,max_gym_visits:2,weekly_strength_limit:2,free_day_training_forbidden:false,
    free_day_meal_unrestricted:false,training_history_complete:true,meal_template:null,limitations:null,meal_notes:null}
  let rr=await rpc(0,'save_health_rules',[JSON.stringify(rules),false],['::jsonb','::boolean'])
  rr=await rpc(0,'confirm_training_history',[rr.updated_at],['::timestamptz'])
  const data={user_slot:'me',record_date:date,exercise:{intent:'yes',type:'力量训练',duration_minutes:10,
    location:null,equipment:null,explicit_start_time:'19:00',explicit_end_time:'19:10'},meal:{conditions:null,arrangements:null},constraints:[],fatigue:'unknown',sleep:'unknown',pain:null,ambiguous_fields:[]}
  const payload={user_id:ids[0],record_date:date,raw_text:'SYNTHETIC strength 19:00–19:10',start_time:'19:00',end_time:'19:10',exercise_intent:'yes',fixed_arrangements:'',meal_conditions:'',constraints:'',is_shared:false,confirmed_data:data,submitted_at:new Date().toISOString(),parse_version:'manual-schedule-v1'}
  let schedule=await rpc(0,'save_confirmed_schedule',[JSON.stringify(payload)],['::jsonb'])
  const content=buildRulePlan({date,rules:rr.rules,slot:'me',schedule,historyComplete:true,trainingHistoryConfirmedAt:rr.training_history_confirmed_at}).content
  assert.equal(content.training.mode,'workout')
  const allowed=async value=>(await as('service_role',null,'select public.health_plan_allowed($1,$2,$3) allowed',[ids[0],date,JSON.stringify(value)])).rows[0].allowed
  assert.equal(await allowed(content),true)
  assert.equal(await allowed({...content,training:{...content.training,time:'19:01'}}),false)
  const long=buildRulePlan({date,rules:rr.rules,slot:'me',schedule:{...schedule,confirmed_data:{...data,exercise:{...data.exercise,duration_minutes:60,explicit_end_time:'20:00'}}},historyComplete:true,trainingHistoryConfirmedAt:rr.training_history_confirmed_at}).content
  assert.ok(long.training.total_seconds>600);assert.equal(await allowed(long),false)
  for(const type of ['羽毛球','其他']){
    schedule=await rpc(0,'save_confirmed_schedule',[JSON.stringify({...payload,confirmed_data:{...data,exercise:{...data.exercise,type}},expected_updated_at:schedule.updated_at}),schedule.id],['::jsonb','::uuid'])
    assert.equal(await allowed(content),false)
  }
 }finally{await db.close()}
})

test('007 synthetic SQL daily flow preserves history, owner boundaries, stale snapshots, undo and budgets',async()=>{
 const {db,as,rpc}=await fixture();
 try{
  const date=(await as(null,null,"select (now() at time zone 'Asia/Shanghai')::date::text d")).rows[0].d;
  const content=buildRulePlan({date,rules:null}).content;
  assert.equal(content.meals.length,3);assert.ok(validateGeneratedPlan(content,content));
  let plan=await rpc(0,'save_daily_plan',[date,JSON.stringify(content)],['::date','::jsonb']);
  assert.equal(await rpc(0,'health_daily_flow_version'),7);
  await assert.rejects(rpc(1,'begin_meal_adjustment',[ids[0],date,'openai'],['::uuid','::date','::text']),/permission denied/);
  const begin=async()=> (await as('service_role',null,'select public.begin_meal_adjustment($1,$2,$3) v',[ids[0],date,'openai'])).rows[0].v;
  let claimed=await begin();assert.equal(claimed.acquired,true);assert.equal((await begin()).acquired,false);
  assert.equal((await as('authenticated',1,'select * from public.meal_adjustments')).rows.length,0);
  let adjustment=claimed.adjustment;
  const changed=structuredClone(content.meals[2]);changed.notes='SYNTHETIC balanced suggestion, no compensation';
  const suggestion={reason:'SYNTHETIC confirmed meal review',meal_changes:[{meal_index:2,meal:changed,reason:'SYNTHETIC available choice'}],warnings:['Unrecorded meals are unknown']};
  adjustment=(await as('service_role',null,'select to_jsonb(public.finish_meal_adjustment($1,$2)) v',[adjustment.id,JSON.stringify(suggestion)])).rows[0].v;
  assert.equal(adjustment.status,'draft');
  await assert.rejects(rpc(1,'apply_meal_adjustment',[adjustment.id,adjustment.updated_at],['::uuid','::timestamptz']),/access denied/);
  let applied=await rpc(0,'apply_meal_adjustment',[adjustment.id,adjustment.updated_at],['::uuid','::timestamptz']);assert.equal(applied.status,'applied');
  assert.equal((await rpc(0,'apply_meal_adjustment',[adjustment.id,adjustment.updated_at],['::uuid','::timestamptz'])).applied_plan_id,applied.applied_plan_id);
  assert.equal((await as('authenticated',0,'select count(*)::int n from public.daily_plans')).rows[0].n,2);
  assert.deepEqual((await as('authenticated',0,'select content from public.daily_plans where id=$1',[plan.id])).rows[0].content,content);
  const undone=await rpc(0,'undo_meal_adjustment',[applied.id,applied.updated_at],['::uuid','::timestamptz']);assert.equal(undone.status,'reverted');
  assert.equal((await rpc(0,'undo_meal_adjustment',[undone.id,undone.updated_at],['::uuid','::timestamptz'])).status,'reverted');
  assert.deepEqual((await as('authenticated',0,'select content from public.daily_plans where is_current')).rows[0].content,content);
  claimed=await begin();assert.equal(claimed.acquired,true);
  const mealData={recorded_at:date+'T12:00:00+08:00',kind:'lunch',items:[{name:'SYNTHETIC',portion:'1',unit:'bowl'}],eaten_fraction:0.5,shared_meal_id:null,photo_ids:[],cooking:null,oil:null,leftover:null,estimate:null};
  const meal=await rpc(0,'save_meal',[JSON.stringify({data:mealData,status:'confirmed',is_shared:false})],['::jsonb']);
  const stale=(await as('service_role',null,'select to_jsonb(public.finish_meal_adjustment($1,$2)) v',[claimed.adjustment.id,JSON.stringify(suggestion)])).rows[0].v;assert.equal(stale.status,'stale');
  claimed=await begin();
  const forbidden={...suggestion,meal_changes:[{meal_index:1,meal:content.meals[1],reason:'SYNTHETIC'}]};
  await assert.rejects(as('service_role',null,'select public.finish_meal_adjustment($1,$2)',[claimed.adjustment.id,JSON.stringify(forbidden)]),/Invalid remaining/);
  for(let attempt=2;attempt<=3;attempt++){
    await as('service_role',null,'select public.finish_meal_adjustment($1,null)',[claimed.adjustment.id]);
    claimed=await begin();assert.equal(claimed.acquired,true);assert.equal(claimed.adjustment.attempts,attempt);
  }
  await as('service_role',null,'select public.finish_meal_adjustment($1,null)',[claimed.adjustment.id]);
  assert.equal((await begin()).acquired,false);
  const estimated={...mealData,estimate:{energy_min_kcal:400,energy_max_kcal:600,uncertainty:'SYNTHETIC',assumptions:[]}};
  let estimatedMeal=await rpc(0,'save_meal',[JSON.stringify({data:estimated,status:'confirmed',is_shared:false,expected_updated_at:meal.updated_at}),meal.id],['::jsonb','::uuid']);
  const changedFood={...estimated,items:[{name:'SYNTHETIC',portion:'2',unit:'bowl'}]};
  estimatedMeal=await rpc(0,'save_meal',[JSON.stringify({data:changedFood,status:'confirmed',is_shared:false,expected_updated_at:estimatedMeal.updated_at}),meal.id],['::jsonb','::uuid']);
  assert.equal(estimatedMeal.data.estimate,null);
  const today=period();await as(null,null,'insert into public.ai_monthly_budgets(period,limit_cents) values($1,200)',[today]);
  await as(null,null,"insert into public.ai_provider_budgets(period,provider,limit_cents) values($1,'deepseek',10),($1,'openai',200)",[today]);
  const consentArgs=['deepseek','adjust_plan',true,10,'2026-10-13-deepseek-health-v1'];const casts=['::text','::text','::boolean','::integer','::text'];
  await assert.rejects(rpc(0,'set_ai_provider_consent',consentArgs,casts),/not enabled/);
  await as(null,null,"update public.ai_provider_settings set health_enabled=true where provider='deepseek'");
  await rpc(0,'set_ai_provider_consent',consentArgs,casts);
  const hold=(await as('service_role',null,'select public.reserve_ai_provider_usage($1,$2,$3,$4) id',[ids[0],'deepseek','adjust_plan',2])).rows[0].id;
  await as('service_role',null,'select public.settle_ai_usage($1,$2)',[hold,1]);
  await assert.rejects(as('service_role',null,'select public.reserve_ai_provider_usage($1,$2,$3,$4)',[ids[0],'deepseek','estimate_meal_photo',1]),/AI consent/);
  await rpc(0,'set_ai_provider_consent',['deepseek','adjust_plan',false,0,consentArgs[4]],casts);
  await assert.rejects(as('service_role',null,'select public.reserve_ai_provider_usage($1,$2,$3,$4)',[ids[0],'deepseek','adjust_plan',1]),/AI consent/);
  await as('service_role',null,'select public.begin_ai_request($1,$2,$3,$4)',[ids[0],'openai','parse_schedule','a'.repeat(64)]);
  await rpc(0,'erase_own_health_data');
  assert.equal((await as(null,null,'select count(*)::int n from public.ai_request_results')).rows[0].n,0);
  assert.equal((await as(null,null,'select count(*)::int n from public.meal_adjustments')).rows[0].n,0);
  assert.equal((await as(null,null,'select count(*)::int n from public.ai_usage')).rows[0].n,1);
 }finally{await db.close()}
});

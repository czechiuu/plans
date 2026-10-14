import test from 'node:test'
import assert from 'node:assert/strict'
import { generate } from '../supabase/functions/_shared/ai-core.js'
import { buildRulePlan, validateGeneratedPlan } from '../shared/health.js'

test('bound rules generation and retries never consult changed preferences or call AI',async()=>{
  const id='11111111-1111-4111-8111-111111111111',events=[]
  const job={id,user_id:id,target_date:'2026-10-14',status:'queued',provider:'rules',input_version:'SYNTHETIC',claim_token:id}
  const user={from(table){
    assert.notEqual(table,'ai_plan_preferences')
    return {select(){return this},eq(){return this},neq(){return this},gte(){return this},lte(){return this},
      async maybeSingle(){return {data:table==='generation_jobs'?job:null}},async range(){return {data:[]}}}
  }}
  const admin={rpc(name,args){
    events.push(name)
    if(name==='claim_generation_job') return {maybeSingle:async()=>({data:job})}
    if(name==='health_input_version') return {data:'SYNTHETIC'}
    assert.equal(name,'finish_generation_job')
    if(args.p_error_code){assert.equal(args.p_error_code,'INVALID_REQUEST');return {single:async()=>({data:{status:'failed'}})}}
    assert.equal(args.p_source,'rules');assert.equal(args.p_content.meals.length,3)
    return {single:async()=>({data:{status:'succeeded',plan_id:id,error_code:null}})}
  }}
  const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('No rules request may use network')}
  try{
    assert.equal((await generate({user,admin,id,slot:'me'},id,'rules')).status,'succeeded')
    job.status='failed'
    assert.equal((await generate({user,admin,id,slot:'me'},id,'rules')).status,'succeeded')
    assert.ok(events.every(x=>['claim_generation_job','health_input_version','finish_generation_job'].includes(x)))
    await assert.rejects(generate({user,admin,id,slot:'me'},id,'deepseek'),/INVALID_REQUEST/)
  }finally{globalThis.fetch=oldFetch}
})

test('claim controls provider and input version when the preflight row changes',async()=>{
  const id='11111111-1111-4111-8111-111111111111',events=[]
  const preflight={id,user_id:id,target_date:'2026-10-14',status:'queued',provider:'deepseek',input_version:'OLD'}
  const claimed={...preflight,provider:'rules',input_version:'NEW',claim_token:id}
  const user={from(table){return {select(){return this},eq(){return this},neq(){return this},gte(){return this},lte(){return this},
    async maybeSingle(){return {data:table==='generation_jobs'?preflight:null}},async range(){return {data:[]}}}}}
  const admin={rpc(name,args){
    events.push(name)
    if(name==='claim_generation_job')return {maybeSingle:async()=>({data:claimed})}
    if(name==='health_input_version')return {data:'NEW'}
    assert.equal(name,'finish_generation_job')
    assert.equal(args.p_source,'rules');assert.equal(args.p_input_version,'NEW')
    return {single:async()=>({data:{status:'succeeded',plan_id:id,error_code:null}})}
  }}
  const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Rules must not make a paid request')}
  try{
    assert.equal((await generate({user,admin,id,slot:'me'},id,'rules')).status,'succeeded')
    assert.deepEqual(events.filter(x=>x==='reserve_ai_provider_usage'),[])
    assert.deepEqual(events.filter(x=>x==='begin_ai_request'),[])
  }finally{globalThis.fetch=oldFetch}
})

test('no-template rules give three labelled meals and protect W Tuesday without compensating Wednesday',()=>{
  for(const date of ['2026-10-13','2026-10-14']){
    const {content}=buildRulePlan({date,rules:null,slot:'w'})
    assert.equal(content.meals.length,3);assert.equal(content.training.mode,'rest')
    assert.ok(content.warnings.some(x=>x.includes('未知')))
    assert.ok(validateGeneratedPlan(content,content))
  }
  const baseline=buildRulePlan({date:'2026-10-14',rules:null}).content
  const missing=structuredClone(baseline);missing.meals.pop();assert.equal(validateGeneratedPlan(missing,baseline),false)
  const unsafe=structuredClone(baseline);unsafe.training.mode='workout';assert.equal(validateGeneratedPlan(unsafe,baseline),false)
})

test('confirmed strength uses its exact time window while badminton does not add strength',()=>{
  const rules={confirmed:true,equipment:'machines_only',ankle_status:'no_issue',training_history_complete:true,
    free_weekdays:[],weekly_strength_limit:2,max_session_minutes:60,exercise_minutes:60}
  const base={date:'2026-10-14',rules,slot:'me',historyComplete:true,trainingHistoryConfirmedAt:'2026-10-14T08:00:00Z'}
  const schedule=type=>({exercise_intent:'yes',confirmed_data:{exercise:{intent:'yes',type,explicit_start_time:'19:00',explicit_end_time:'19:10',duration_minutes:10}}})
  const gym=buildRulePlan({...base,schedule:schedule('力量训练')}).content
  assert.equal(gym.training.mode,'workout');assert.equal(gym.training.time,'19:00')
  assert.ok(gym.training.total_seconds<=600);assert.ok(validateGeneratedPlan(gym,gym))
  for(const type of ['羽毛球','其他','可能打球也可能健身'])
    assert.equal(buildRulePlan({...base,schedule:schedule(type)}).content.training.mode,'rest')
  const tooShort=schedule('健身');tooShort.confirmed_data.exercise.explicit_end_time='19:03'
  assert.equal(buildRulePlan({...base,schedule:tooShort}).reason,'DURATION_LIMIT')
  const startOnly=schedule('健身');startOnly.confirmed_data.exercise.explicit_end_time=null;startOnly.confirmed_data.exercise.duration_minutes=null
  assert.equal(buildRulePlan({...base,schedule:startOnly}).content.training.time,'19:00')
  const weeklyBase={...base,date:'2026-10-15',trainingHistoryConfirmedAt:'2026-10-15T08:00:00Z'}
  const pastBadminton={record_date:'2026-10-12',status:'completed',data:{activity_type:'badminton',ended_at:'2026-10-12T20:00:00+08:00',duration_seconds:3600}}
  assert.equal(buildRulePlan({...weeklyBase,rules:{...rules,weekly_strength_limit:1},recentTraining:[pastBadminton],schedule:schedule('健身')}).content.training.mode,'workout')
  const partialBadminton={...pastBadminton,record_date:'2026-10-14',status:'stopped',data:{...pastBadminton.data,ended_at:'2026-10-14T20:00:00+08:00'}}
  assert.equal(buildRulePlan({...weeklyBase,recentTraining:[partialBadminton],schedule:schedule('健身')}).reason,'RECENT_TRAINING')
    const datedActivity={record_date:'2026-10-13',status:'completed',data:{activity_type:'badminton',record_date:'2026-10-13',duration_seconds:1800,started_at:null,ended_at:null}}
    assert.equal(buildRulePlan({...weeklyBase,recentTraining:[datedActivity],schedule:schedule('健身')}).reason,'RECENT_TRAINING')
    const olderActivity={...datedActivity,record_date:'2026-10-11',data:{...datedActivity.data,record_date:'2026-10-11'}}
    assert.equal(buildRulePlan({...weeklyBase,recentTraining:[olderActivity],schedule:schedule('健身')}).content.training.mode,'workout')
    const unknownLegacy={...datedActivity,data:{duration_seconds:1800,ended_at:null}}
    assert.equal(buildRulePlan({...weeklyBase,recentTraining:[unknownLegacy],schedule:schedule('健身')}).reason,'HISTORY_INCOMPLETE')
})

test('a Sunday target includes five lunch portions and staged storage only for me',()=>{
  const me=buildRulePlan({date:'2026-10-18',slot:'me',rules:null}).content
  const w=buildRulePlan({date:'2026-10-18',slot:'w',rules:null}).content
  assert.match(me.meals[1].purchase_or_prep,/5份午餐/)
  assert.match(me.meals[1].purchase_or_prep,/周三至周五.*冷冻/)
  assert.match(me.meals[1].prep_method,/2小时.*74°C/)
  assert.ok(!w.meals[1].purchase_or_prep.includes('5份午餐'))
  const omitted=structuredClone(me);omitted.meals[1].purchase_or_prep='普通备餐'
  assert.equal(validateGeneratedPlan(omitted,me),false)
})

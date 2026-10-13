import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRulePlan, validatePlan, maxCostCents } from '../shared/health.js'
import { exercises } from '../shared/exercises.js'
import { generatedPlanSchema, extractResponseJson } from '../shared/ai-schema.js'

const meal=(title)=>({time:null,title,foods:[{name:'SYNTHETIC',portion:'1',unit:'份'}],
  prep_method:'自备',purchase_or_prep:'提前准备',alternative:'同类替换',notes:'已确认模板',snack_reason:null})
const rules={confirmed:true,equipment:'machines_only',ankle_status:'cleared',free_weekdays:[2],
  free_day_training_forbidden:true,free_day_meal_unrestricted:true,training_history_complete:true,
  max_session_minutes:60,exercise_minutes:60,
  meal_template:[meal('早餐'),meal('午餐'),meal('晚餐')]}

test('rule plans are conservative with unknown history and respect confirmed free days',()=>{
  const trainingHistoryConfirmedAt='2026-10-13T12:00:00Z'
  const unknown=buildRulePlan({date:'2026-10-14',rules,historyComplete:false})
  assert.equal(unknown.content.training.mode,'rest')
  assert.equal(unknown.content.meals.length,3)
  assert.ok(validatePlan(unknown.content,{automatic:true}))
  const free=buildRulePlan({date:'2026-10-13',rules,historyComplete:true})
  assert.equal(free.content.training.mode,'rest')
  assert.equal(free.content.meals.length,0)
  const workout=buildRulePlan({date:'2026-10-14',rules,historyComplete:true,trainingHistoryConfirmedAt})
  assert.equal(workout.content.training.mode,'workout')
  assert.ok(validatePlan(workout.content,{automatic:true}))
  assert.ok(workout.content.training.items.every(x=>exercises.find(e=>e.id===x.exercise_id).demo.verificationStatus==='verified'))
  const bad=structuredClone(workout.content)
  bad.training.total_seconds-=1
  assert.equal(validatePlan(bad),false)
})

test('structured AI output requires complete response and verified catalog IDs',()=>{
  const schema=generatedPlanSchema()
  assert.ok(schema.properties.training.properties.items.items.properties.exercise_id.enum.length>0)
  assert.deepEqual(extractResponseJson({status:'completed',output:[{content:[{type:'output_text',text:'{"x":1}'}]}]}),{x:1})
  assert.throws(()=>extractResponseJson({status:'incomplete',output:[]}),/AI_INCOMPLETE/)
  assert.throws(()=>extractResponseJson({status:'completed',output:[{content:[{type:'refusal'}]}]}),/AI_REFUSAL/)
  assert.equal(maxCostCents({inputTokens:8192,outputTokens:2048,inputUsdPerMillion:0.75,outputUsdPerMillion:4.5}),2)
})

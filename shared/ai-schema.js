import { exercises } from './exercises.js'

const string = (maxLength = 500) => ({ type:'string', maxLength })
const nullable = (schema) => ({ anyOf:[schema,{type:'null'}] })
const object = (properties) => ({ type:'object', properties, required:Object.keys(properties), additionalProperties:false })
const array = (items,maxItems) => ({ type:'array', items,maxItems })

export const scheduleDraftSchema = object({
  user_slot:nullable({ type:'string',enum:['me','w'] }),
  record_date:nullable(string(10)),
  exercise:object({ intent:{type:'string',enum:['unknown','yes','no']}, type:nullable(string(120)),
    duration_minutes:nullable({type:'integer',minimum:0,maximum:300}), location:nullable(string(120)),
    equipment:nullable(string(120)), explicit_start_time:nullable(string(5)), explicit_end_time:nullable(string(5)) }),
  meal:object({ conditions:nullable(string(1000)), arrangements:nullable(string(1000)) }),
  constraints:array(string(300),20), fatigue:nullable({type:'string',enum:['unknown','low','normal','high']}), pain:nullable(string(300)),
  sleep:nullable({type:'string',enum:['unknown','poor','adequate','good']}), ambiguous_fields:array(string(100),20),
})

export const mealEstimateSchema = object({
  recognition_status:{type:'string',enum:['recognized','uncertain','unrecognized']},
  items:array(object({name:string(200),portion:string(100),unit:string(60),confidence:{type:'string',enum:['high','medium','low']}}),30),
  energy_min_kcal:nullable({type:'integer',minimum:0,maximum:10000}),
  energy_max_kcal:nullable({type:'integer',minimum:0,maximum:10000}),
  uncertainty:string(300), assumptions:array(string(300),12),
  cooking:nullable(string(300)),oil:nullable(string(300)),leftover:nullable(string(300)),
})

export function generatedPlanSchema() {
  const ids=exercises.filter(x=>x.demo?.verificationStatus==='verified').map(x=>x.id)
  if (ids.length===0) throw new Error('NO_VERIFIED_EXERCISE')
  const step=object({description:string(300),seconds:{type:'integer',minimum:0,maximum:9999}})
  return object({
    summary:string(1000),
    meals:array(object({time:nullable(string(5)),title:string(200),foods:array(object({name:string(200),portion:string(100),unit:string(60)}),15),
      prep_method:string(500),purchase_or_prep:string(500),alternative:string(500),notes:string(500),snack_reason:nullable(string(300))}),8),
    training:object({mode:{type:'string',enum:['rest','workout']},purpose:string(300),time:nullable(string(5)),
      intensity:string(100),equipment:string(150),muscles:array(string(80),20),warmup:array(step,8),
      items:array(object({exercise_id:{type:'string',enum:ids},sets:{type:'integer',minimum:1,maximum:2},
        reps:{type:'integer',minimum:0,maximum:999},work_seconds:{type:'integer',minimum:1,maximum:120},
        rest_seconds:{type:'integer',minimum:0,maximum:9999},transition_seconds:{type:'integer',minimum:0,maximum:9999},
        first_use_check:string(300),short_option:string(300)}),3),cooldown:array(step,8),
      total_seconds:{type:'integer',minimum:0,maximum:3600}}),warnings:array(string(300),20),
  })
}

export function extractResponseJson(response) {
  if (response.status !== 'completed' || response.incomplete_details) throw new Error('AI_INCOMPLETE')
  const blocks=response.output?.flatMap(item=>item.content??[])??[]
  if (blocks.some(block=>block.type==='refusal')) throw new Error('AI_REFUSAL')
  const texts=blocks.filter(block=>block.type==='output_text').map(block=>block.text)
  if (texts.length!==1 || typeof texts[0]!=='string') throw new Error('AI_OUTPUT_MISSING')
  return JSON.parse(texts[0])
}

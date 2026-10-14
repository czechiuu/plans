import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { adjustPlan } from '../supabase/functions/_shared/ai-core.js'

// Exercise the real client serializer, including PostgREST's default plural
// composite response versus application/vnd.pgrst.object+json. No network.
async function scenario(finalStatus,{rejectFinish=false}={}){
  const id='11111111-1111-4111-8111-111111111111'
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  const output={reason:'Synthetic: leave remaining meals unchanged',meal_changes:[],warnings:[]}
  const adjustment={id,status:'running',source_input_hash:'SYNTHETIC',source_snapshot:{slot:'me',
    plan:{content:{}},confirmed_meals:[],schedule:null,training_feedback:[],rules:null}}
  const calls=[]
  const fakeFetch=async(url,options={})=>{
    const path=new URL(url).pathname
    const accept=new Headers(options.headers).get('accept')
    if(path==='/rest/v1/ai_provider_settings')return Response.json([{health_enabled:true}])
    if(path==='/rest/v1/ai_consents')return Response.json([{enabled:true,policy_version:'2026-10-13-deepseek-health-v1'}])
    const name=path.split('/').at(-1),args=JSON.parse(options.body)
    calls.push({name,accept,args})
    if(name==='begin_meal_adjustment')return Response.json({acquired:true,adjustment})
    if(name==='health_remaining_meal_indices')return Response.json([0,2])
    if(name==='begin_ai_request')return Response.json({acquired:false,request:{id,status:'completed',output}})
    assert.equal(name,'finish_meal_adjustment')
    if(rejectFinish&&args.p_content!==null)return Response.json({code:'P0001',message:'Invalid adjustment plan'},{status:400})
    const row={...adjustment,status:args.p_content===null?'failed':finalStatus,content:args.p_content}
    return Response.json(accept==='application/vnd.pgrst.object+json'?row:[row])
  }
  const client=createClient('https://synthetic.invalid','SYNTHETIC_ONLY',{
    auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fakeFetch}})
  const previous=process.env.DEEPSEEK_API_KEY,fetchBefore=globalThis.fetch
  process.env.DEEPSEEK_API_KEY='SYNTHETIC_ONLY'
  globalThis.fetch=async()=>{throw new Error('No provider network allowed')}
  try{
    if(rejectFinish)await assert.rejects(adjustPlan({id,user:client,admin:client},'deepseek',date),/INVALID_GENERATED_PLAN/)
    else{
      const result=await adjustPlan({id,user:client,admin:client},'deepseek',date)
      assert.equal(Array.isArray(result.adjustment),false)
      assert.equal(result.adjustment.id,id);assert.equal(result.adjustment.status,finalStatus)
      assert.equal(result.needs_confirmation,finalStatus==='draft')
    }
    for(const call of calls){
      if(call.name==='finish_meal_adjustment')assert.equal(call.accept,'application/vnd.pgrst.object+json')
      else assert.notEqual(call.accept,'application/vnd.pgrst.object+json','jsonb and integer[] RPCs stay scalar')
    }
    const finished=calls.filter(x=>x.name==='finish_meal_adjustment')
    assert.equal(finished.length,rejectFinish?2:1)
    if(rejectFinish)assert.equal(finished[1].args.p_content,null)
    assert.equal(calls.some(x=>x.name==='reserve_ai_provider_usage'),false)
  }finally{
    globalThis.fetch=fetchBefore
    if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous
  }
}

test('adjustment finish returns one draft object with the real PostgREST client',()=>scenario('draft'))
test('a stale adjustment is one object and never asks for confirmation',()=>scenario('stale'))
test('finish rejection records a singular failed row without changing JSON RPC shapes',()=>scenario('failed',{rejectFinish:true}))

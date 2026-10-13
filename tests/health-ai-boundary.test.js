import assert from 'node:assert/strict'
import { test } from 'node:test'
import { response } from '../supabase/functions/_shared/ai-core.js'

function context(enabled,events){
  const consent={enabled,policy_version:'2026-10-13-openai-health-v1'}
  const query={select(){return this},eq(){return this},async maybeSingle(){return {data:consent,error:null}}}
  return {id:'11111111-1111-4111-8111-111111111111',user:{from(){return query}},
    admin:{async rpc(name){events.push(name);return {data:'22222222-2222-4222-8222-222222222222',error:null}}}}
}

test('disabled AI consent makes no provider request or budget reservation',async()=>{
  const events=[];const originalFetch=globalThis.fetch
  globalThis.fetch=async()=>{events.push('fetch');throw new Error('unexpected')}
  try{
    await assert.rejects(response(context(false,events),'openai','parse_schedule',
      {name:'test',schema:{},userText:'SYNTHETIC'}),/AI_CONSENT_REQUIRED/)
    assert.deepEqual(events,[])
  }finally{globalThis.fetch=originalFetch}
})

test('provider failure or timeout is explicit and never settles a fabricated response',async()=>{
  const previous=Object.fromEntries(['OPENAI_MODEL','OPENAI_PRICE_MODEL','OPENAI_API_KEY',
    'OPENAI_INPUT_USD_PER_MILLION','OPENAI_OUTPUT_USD_PER_MILLION','OPENAI_IMAGE_MAX_INPUT_TOKENS']
    .map(name=>[name,process.env[name]]))
  Object.assign(process.env,{OPENAI_MODEL:'synthetic-test-model',OPENAI_PRICE_MODEL:'synthetic-test-model',
    OPENAI_API_KEY:'SYNTHETIC_ONLY',OPENAI_INPUT_USD_PER_MILLION:'0.75',
    OPENAI_OUTPUT_USD_PER_MILLION:'4.5',OPENAI_IMAGE_MAX_INPUT_TOKENS:'3000'})
  const originalFetch=globalThis.fetch
  try{
    for(const simulated of ['failure','timeout']){
      const events=[]
      globalThis.fetch=async(url,options)=>{
        events.push('fetch')
        assert.equal(url,'https://api.openai.com/v1/responses')
        assert.equal(JSON.parse(options.body).store,false)
        assert.equal(JSON.parse(options.body).tools,undefined)
        if(simulated==='timeout') throw new DOMException('timed out','TimeoutError')
        return new Response('{}',{status:503})
      }
      await assert.rejects(response(context(true,events),'openai','parse_schedule',
        {name:'test',schema:{},userText:'SYNTHETIC'}),/AI_PROVIDER_FAILED/)
      assert.deepEqual(events,['reserve_ai_provider_usage','fetch'])
    }
  }finally{
    globalThis.fetch=originalFetch
    for(const [name,value] of Object.entries(previous)){
      if(value===undefined) delete process.env[name]
      else process.env[name]=value
    }
  }
})

test('complete three-meal Chinese input is sent intact with an output and cost ceiling',async()=>{
  const names=['早餐','午餐','晚餐']
  const meal=title=>({time:null,title,foods:[
    {name:'合成主食',portion:'1拳',unit:'拳'},{name:'合成蛋白质',portion:'1掌',unit:'掌'},
    {name:'合成蔬菜',portion:'2拳',unit:'拳'}],prep_method:'在宿舍先准备再带去上课',
    purchase_or_prep:'从食堂购买或提前准备',alternative:'同等份量的合成食物替换',
    notes:'本人已确认份量；不把其它人的份量算进来',snack_reason:null})
  const rules={confirmed:true,equipment:'machines_only',ankle_status:'no_issue',
    training_history_complete:true,meal_template:names.map(meal),limitations:'合成限制说明'.repeat(35)}
  const userText=JSON.stringify({date:'2026-10-14',rules,baseline:{meals:rules.meal_template,
    training:{mode:'workout',items:[]}},schedule:{},profile:{},recentTraining:[],existingPlans:[]})
  assert.ok(new TextEncoder().encode(userText).length>3000)
  assert.ok(new TextEncoder().encode(userText).length<8000)
  const previous=Object.fromEntries(['OPENAI_MODEL','OPENAI_PRICE_MODEL','OPENAI_API_KEY',
    'OPENAI_INPUT_USD_PER_MILLION','OPENAI_OUTPUT_USD_PER_MILLION','OPENAI_IMAGE_MAX_INPUT_TOKENS']
    .map(name=>[name,process.env[name]]))
  Object.assign(process.env,{OPENAI_MODEL:'synthetic-test-model',OPENAI_PRICE_MODEL:'synthetic-test-model',
    OPENAI_API_KEY:'SYNTHETIC_ONLY',OPENAI_INPUT_USD_PER_MILLION:'0.75',
    OPENAI_OUTPUT_USD_PER_MILLION:'4.5',OPENAI_IMAGE_MAX_INPUT_TOKENS:'3000'})
  const originalFetch=globalThis.fetch
  let requestBody,reserved
  const ctx=context(true,[])
  ctx.admin.rpc=async(name,args)=>{
    if(name==='reserve_ai_provider_usage') reserved=args.p_cents
    return {data:'22222222-2222-4222-8222-222222222222',error:null}
  }
  globalThis.fetch=async(_url,options)=>{
    requestBody=JSON.parse(options.body)
    return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:'{}'}]}],
      usage:{input_tokens:1000,output_tokens:2}}),{status:200})
  }
  try{
    await response(ctx,'openai','generate_plan',{name:'daily_health_plan',
      schema:{type:'object',properties:{},required:[],additionalProperties:false},userText})
    assert.equal(requestBody.input[1].content[0].text,userText)
    assert.equal(requestBody.max_output_tokens,8192)
    assert.ok(reserved>=4)
  }finally{
    globalThis.fetch=originalFetch
    for(const [name,value] of Object.entries(previous)){
      if(value===undefined) delete process.env[name]
      else process.env[name]=value
    }
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { generate, probeDeepSeek, response } from '../supabase/functions/_shared/ai-core.js'

const schema={type:'object',properties:{},required:[],additionalProperties:false}

test('standard job UUID reaches claim while a missing UUID segment is rejected',async()=>{
  const id='11111111-1111-4111-8111-111111111111'
  let claimed=false
  const user={from:table=>({select(){return this},eq(){return this},
    async maybeSingle(){return table==='ai_plan_preferences'?{data:null,error:null}:
      {data:{id,status:'queued',lease_until:null,provider:'rules'},error:null}}})}
  const admin={rpc(name,args){
    assert.equal(name,'claim_generation_job')
    assert.equal(args.p_id,id)
    claimed=true
    return {maybeSingle:async()=>({data:null,error:null})}
  }}
  await assert.rejects(generate({user,admin,id},id,'rules'),/JOB_NOT_AVAILABLE/)
  assert.equal(claimed,true)
  claimed=false
  await assert.rejects(generate({user,admin,id},'11111111-1111-4111-111111111111','rules'),/INVALID_REQUEST/)
  assert.equal(claimed,false)
})

test('synthetic probe without a server key is explicitly blocked',async()=>{
  const previous=process.env.DEEPSEEK_API_KEY,oldFetch=globalThis.fetch
  delete process.env.DEEPSEEK_API_KEY
  globalThis.fetch=async()=>{throw new Error('unexpected external call')}
  try{
    await assert.rejects(probeDeepSeek({},new Uint8Array([1])),/AI_DISABLED/)
  }finally{
    globalThis.fetch=oldFetch
    if(previous!==undefined) process.env.DEEPSEEK_API_KEY=previous
  }
})

test('real health DeepSeek calls stay disabled before any reservation or provider request',async()=>{
  const events=[];const previous=process.env.DEEPSEEK_API_KEY
  process.env.DEEPSEEK_API_KEY='SYNTHETIC_NOT_A_KEY'
  const oldFetch=globalThis.fetch
  globalThis.fetch=async()=>{events.push('fetch');throw new Error('unexpected')}
  try{
    await assert.rejects(response({id:'synthetic',admin:{from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:{health_enabled:false}}}}},rpc(){events.push('reserve')}}},
      'deepseek','parse_schedule',{name:'test',schema,userText:'SYNTHETIC'}),/AI_DISABLED/)
    assert.deepEqual(events,[])
  }finally{
    globalThis.fetch=oldFetch
    if(previous===undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY=previous
  }
})

test('synthetic probe uses four fixed tasks, peak-price reservations and no health rows',async()=>{
  const previous=process.env.DEEPSEEK_API_KEY,oldFetch=globalThis.fetch
  process.env.DEEPSEEK_API_KEY='SYNTHETIC_NOT_A_KEY'
  const calls=[]
  const validPlan={summary:'合成休息计划',meals:['早餐','午餐','晚餐'].map(title=>({time:null,title,
    foods:[{name:'合成食物',portion:'1拳',unit:'拳'}],prep_method:'简单备餐',
    purchase_or_prep:'购买或提前准备',alternative:'同份量替代食物',notes:'合成样例',snack_reason:null})),
    training:{mode:'rest',purpose:'合成测试',time:null,intensity:'无',equipment:'无',muscles:[],warmup:[],items:[],cooldown:[],total_seconds:0},warnings:[]}
  const reorderedPlan={...validPlan,meals:validPlan.meals.map(meal=>({snack_reason:meal.snack_reason,...meal}))}
  assert.notEqual(JSON.stringify(reorderedPlan.meals),JSON.stringify(validPlan.meals))
  const drafts=[
    {user_slot:'me',record_date:'2026-10-14',exercise:{intent:'yes',type:'其他',duration_minutes:30,
      location:null,equipment:null,explicit_start_time:'18:30',explicit_end_time:'19:00'},
      meal:{conditions:null,arrangements:null},constraints:[],fatigue:null,pain:null,sleep:null,ambiguous_fields:[]},
    {recognition_status:'uncertain',items:[{name:'苹果',portion:'未知',unit:'份',confidence:'low'},
      {name:'香蕉',portion:'未知',unit:'份',confidence:'low'}],
      energy_min_kcal:null,energy_max_kcal:null,uncertainty:'未知重量',assumptions:[],cooking:null,oil:null,leftover:null},
    {recognition_status:'uncertain',items:[{name:'苹果',portion:'未知',unit:'份',confidence:'medium'},
      {name:'香蕉',portion:'未知',unit:'份',confidence:'medium'}],energy_min_kcal:null,
      energy_max_kcal:null,uncertainty:'遮挡',assumptions:[],cooking:null,oil:null,leftover:null},
    reorderedPlan,
  ]
  let at=0
  globalThis.fetch=async(url,options)=>{
    assert.ok(url.startsWith('https://api.deepseek.com/'))
    if(url.endsWith('/user/balance')) return new Response(JSON.stringify({balance_infos:[{currency:'USD',total_balance:'1.00'}]}),{status:200})
    const body=JSON.parse(options.body)
    assert.equal(body.model,'deepseek-flash')
    assert.equal(body.reasoning.effort,'none')
    assert.equal(body.tools,undefined)
    assert.equal(body.store,undefined)
    assert.ok(!JSON.stringify(body).includes('real-user'))
    calls.push(body)
    return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(drafts[at++])}]}],
      usage:{input_tokens:1000,output_tokens:100}}),{status:200})
  }
  const reservations=[]
  const admin={from(){return {select(){return this},eq(){return this},
    async maybeSingle(){return {data:{limit_cents:10},error:null}}}},rpc:async(name,args)=>{
    if(name==='reserve_ai_probe') reservations.push(args)
    return {data:'11111111-1111-4111-8111-111111111111',error:null}
  }}
  try{
    const photo=new Uint8Array(await readFile(new URL('./fixtures/food-example-compact.png',import.meta.url)))
    const result=await probeDeepSeek(admin,photo)
    assert.equal(calls.length,4)
    assert.equal(calls[2].input[1].content[1].type,'input_image')
    assert.match(calls[1].input[0].content[0].text,/苹果和香蕉/)
    assert.match(calls[3].input[0].content[0].text,/confirmed_meals/)
    assert.match(calls[3].input[0].content[0].text,/total_seconds=0/)
    assert.equal(reservations.length,4)
    assert.ok(reservations.every(x=>x.p_cents>=1&&x.p_cents<=10))
    assert.equal(result.results.filter(x=>x.valid).length,4)
    assert.equal(result.results[0].schema_valid,true)
    assert.deepEqual(result.results[0].checks,{slot:true,date:true,start:true,end:true,duration:true})
    assert.equal(result.synthetic_only,true)
    assert.equal(result.balance_delta_is_attributable,false)
    const invalidCases=[
      [1,{...drafts[1],items:[drafts[1].items[0]]}],
      [0,{...drafts[0],exercise:{...drafts[0].exercise,explicit_end_time:'19:30'}}],
      [0,{...drafts[0],exercise:{...drafts[0].exercise,duration_minutes:31}}],
      [2,{...drafts[2],items:drafts[2].items.map(item=>({...item,name:'未知食物',portion:item.name}))}],
      [2,{...drafts[2],recognition_status:'unrecognized'}],
      [2,{...drafts[2],uncertainty:''}],
    ]
    for(const [index,badDraft] of invalidCases){
      const original=drafts[index]
      drafts[index]=badDraft
      at=0
      const rejected=await probeDeepSeek(admin,photo)
      assert.equal(rejected.results[index].valid,false)
      assert.equal(rejected.results[index].schema_valid,true)
      if(index===0) assert.ok(Object.values(rejected.results[index].checks).includes(false))
      drafts[index]=original
    }
    const malformed=drafts[0]
    drafts[0]={...malformed,exercise:{...malformed.exercise,explicit_end_time:123}}
    at=0
    const invalidSchema=await probeDeepSeek(admin,photo)
    assert.equal(invalidSchema.results[0].schema_valid,false)
    assert.equal(invalidSchema.results[0].checks,null)
    drafts[0]=malformed
    const before=calls.length
    at=0
    const scheduleOnly=await probeDeepSeek(admin,null,{scheduleOnly:true})
    assert.equal(calls.length,before+1)
    assert.equal(scheduleOnly.results.length,1)
    assert.equal(scheduleOnly.results[0].valid,true)
    assert.equal(calls.at(-1).input[1].content.length,1)
  }finally{
    globalThis.fetch=oldFetch
    if(previous===undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY=previous
  }
})

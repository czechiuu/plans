import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { cloudSetup, client, ok } from './test-helpers/cloud.mjs'
import { report, blocked, runCase } from './test-helpers/report.mjs'
import { scheduleDraftSchema } from '../shared/ai-schema.js'
import { maxCostCents } from '../shared/health.js'

const ids=['POLICY_CONSENT_REVOCATION','POLICY_PERSONAL_BUDGET','POLICY_RESTORE_ISOLATION']
const cases=[],details=[]
const purpose='parse_schedule',provider='deepseek',policy='2026-10-13-deepseek-health-v1'
const month=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'})
  .format(new Date())
const fail=(code)=>{throw Object.assign(new Error(code),{code})}
const check=(id,fn)=>runCase(cases,details,id,fn)
const usage=(status)=>status.providers.deepseek.usage
const ledger=(status)=>Object.fromEntries(Object.entries(usage(status)).map(([name,value])=>
  [name,{charged_cents:value.charged_cents,reserved_cents:value.reserved_cents}]))
const charged=(status)=>Object.values(usage(status)).reduce((total,value)=>total+value.charged_cents,0)
const bytes=(value)=>new TextEncoder().encode(value).length

let setup
try{setup=cloudSetup()}catch{setup={blocked:true}}
if(setup.blocked||process.env.TEST_DAILY_FLOW_APPROVED!=='YES'||
  process.env.TEST_DAILY_FLOW_POLICY_APPROVED!=='YES'){
  await report('cloud-health-policy','two-fixed-accounts-synthetic-negative-policy',blocked(ids))
}else{
  const networkFetch=globalThis.fetch
  globalThis.fetch=(input,init={})=>networkFetch(input,{...init,
    signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)})
  const api=[client(setup.url,setup.key),client(setup.url,setup.key)]
  let ownId,original,initialW,initialLedger,changed=false
  const idsSeen=[]
  const rpc=(i,name,args={})=>ok(api[i].rpc(name,args))
  const status=(i)=>ok(api[i].functions.invoke('health-ai',{body:{action:'status'}}))
  const ownConsent=async()=>{
    const row=await ok(api[0].from('ai_consents')
      .select('provider,purpose,enabled,monthly_limit_cents,policy_version')
      .eq('user_id',ownId).eq('provider',provider).eq('purpose',purpose).single())
    return row
  }
  const setConsent=async(enabled,limit)=>{
    changed=true
    const row=await ok(api[0].rpc('set_ai_provider_consent',{
      p_provider:provider,p_purpose:purpose,p_enabled:enabled,
      p_monthly_limit_cents:limit,p_policy_version:policy}).single())
    assert.equal(row.enabled,enabled)
    assert.equal(row.monthly_limit_cents,limit)
  }
  const deny=async(expected,nonce)=>{
    const body={action:'parse-schedule',provider,
      raw_text:`SYNTHETIC-POLICY-${nonce} 今天晚饭后散步，仅用于合成权限验收。`,
      submitted_at:new Date().toISOString()}
    const before=ledger(await status(0))
    const {data,error}=await api[0].functions.invoke('health-ai',{body})
    // Supabase FunctionsHttpError keeps the server JSON on context; never log its body.
    let code=data?.error
    if(error?.context instanceof Response){
      try{code=(await error.context.json()).error}catch{code=undefined}
    }
    const after=ledger(await status(0))
    assert.deepEqual(after,before,'Monthly usage changed after a denied request')
    if(!error) fail('UNEXPECTED_AI_SUCCESS')
    assert.equal(code,expected,'Unexpected server denial code')
  }
  try{
    for(let i=0;i<2;i++){
      const auth=await api[i].auth.signInWithPassword({email:setup.emails[i],password:setup.passwords[i]})
      if(auth.error||!auth.data?.user?.id) fail(`AUTH_${i}`)
      idsSeen.push(auth.data.user.id)
      assert.equal(await rpc(i,'current_account'),i===0?'me':'w')
    }
    assert.notEqual(idsSeen[0],idsSeen[1])
    ownId=idsSeen[0]
    original=await ownConsent()
    initialW={status:await status(1),consents:await ok(api[1].from('ai_consents')
      .select('provider,purpose,enabled,monthly_limit_cents,policy_version')
      .eq('user_id',idsSeen[1]).order('provider').order('purpose'))}
    const before=await status(0)
    assert.equal(month,'2026-10','Reviewed approval month changed')
    assert.equal(before.schema_version,7)
    assert.equal(before.providers.deepseek.configured,true)
    assert.equal(before.providers.deepseek.health_enabled,true)
    assert.equal(before.providers.deepseek.budget_configured,true)
    assert.equal(before.global_budget_configured,true)
    assert.equal(before.providers.deepseek.model,'deepseek-flash')
    assert.equal(original.enabled,true)
    assert.equal(original.monthly_limit_cents,2)
    assert.equal(original.policy_version,policy)
    assert.equal(before.providers.deepseek.consents[purpose].enabled,true)
    assert.equal(usage(before)[purpose].charged_cents,1)
    assert.equal(charged(before),4,'Reviewed business usage changed')
    assert.ok(Object.values(usage(before)).every(x=>x.reserved_cents===0))
    assert.equal(before.plan_provider,'rules')
    assert.equal(initialW.status.plan_provider,'rules')
    assert.ok(Object.values(initialW.status.providers).every(item=>
      Object.values(item.consents).every(x=>!x.enabled)))
    // Read the reviewed server prompt so its token bound cannot silently drift.
    const source=await readFile(new URL('../supabase/functions/_shared/ai-core.js',import.meta.url),'utf8')
    const common=source.match(/const systemText=\s*\n\s*'([^']*)'/)?.[1]
    const schedule=source.match(/\(name==='schedule_draft'\?'([^']*)'/)?.[1]
    assert.ok(common&&schedule,'Reviewed server prompt changed')
    assert.match(source,/return \{model:'deepseek-flash',key,inputRate:0\.3,outputRate:1\.2/)
    assert.match(source,/const outputCap=\['daily_health_plan','meal_adjustment'\]\.includes\(name\)\?8192:2048/)
    assert.match(source,/inputCap=userBytes\+encode\.encode\(systemText\)\.length\+\s*encode\.encode\(JSON\.stringify\(schema\)\)\.length\+images\.length\*cfg\.imageCap\+2048/)
    const example=JSON.stringify({raw_text:`SYNTHETIC-POLICY-${randomUUID()} 今天晚饭后散步，仅用于合成权限验收。`,
      submitted_at:new Date().toISOString(),submitted_shanghai:'X'.repeat(64),current_user_slot:'me'})
    const cap=maxCostCents({inputTokens:bytes(JSON.stringify(scheduleDraftSchema))+bytes(example)+bytes(common+schedule)+2048,
      outputTokens:2048,inputUsdPerMillion:0.3,outputUsdPerMillion:1.2})
    assert.equal(cap,1,'Parse reservation upper bound exceeds the remaining 1 cent')
    assert.ok(charged(before)+cap<=5,'Whole-run approved cap exceeded')
    initialLedger=ledger(before)

    await check(ids[0],async()=>{
      await setConsent(false,original.monthly_limit_cents)
      await deny('AI_CONSENT_REQUIRED',randomUUID())
      assert.deepEqual(ledger(await status(0)),initialLedger)
      await setConsent(original.enabled,original.monthly_limit_cents)
    })
    await check(ids[1],async()=>{
      await setConsent(true,usage(before)[purpose].charged_cents)
      await deny('AI_BUDGET_EXCEEDED',randomUUID())
      assert.deepEqual(ledger(await status(0)),initialLedger)
    })
  }catch(error){
    if(!cases.some(x=>x.status==='failed')){
      cases.push({id:ids[0],status:'failed'})
      details.push({id:ids[0],error})
    }
  }finally{
    if(original&&changed){
      try{
        await check(ids[2],async()=>{
          await setConsent(original.enabled,original.monthly_limit_cents)
          assert.deepEqual(await ownConsent(),original)
          assert.deepEqual(ledger(await status(0)),initialLedger)
          assert.deepEqual({status:await status(1),consents:await ok(api[1].from('ai_consents')
            .select('provider,purpose,enabled,monthly_limit_cents,policy_version')
            .eq('user_id',idsSeen[1]).order('provider').order('purpose'))},initialW)
          assert.equal((await status(0)).plan_provider,'rules')
        })
      }catch{
        // runCase has recorded the restoration failure in the final report.
      }
    }
    for(const id of ids)if(!cases.some(item=>item.id===id))cases.push({id,status:'notrun'})
    for(const c of api)try{await c.auth.signOut({scope:'local'})}catch{}
    globalThis.fetch=networkFetch
    await report('cloud-health-policy','two-fixed-accounts-synthetic-negative-policy',cases,details)
  }
}

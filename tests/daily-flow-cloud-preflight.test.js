import test from 'node:test'
import assert from 'node:assert/strict'
const fetchBeforeImport=globalThis.fetch
const {requirePaidReady,spending,requireRunBudget,requirePreflightRpc}=await import('../scripts/verify-daily-flow-cloud.mjs')

const purposes=['parse_schedule','generate_plan','estimate_meal_photo','adjust_plan','estimate_meal_text']
const status=()=>({schema_version:7,global_budget_configured:true,providers:{deepseek:{
 health_enabled:true,configured:true,budget_configured:true,model:'deepseek-flash',
 consents:Object.fromEntries(purposes.map(p=>[p,{enabled:true,monthly_limit_cents:2}])),
 usage:Object.fromEntries(purposes.map(p=>[p,{charged_cents:0,reserved_cents:0}]))}}})
const rejected=(fn,code,state='blocked')=>assert.throws(fn,error=>error.code===code&&error.checkCode===code&&error.verificationStatus===state&&error.message===code)

test('each missing personal consent or insufficient purpose budget is blocked with a non-sensitive code',()=>{
 for(const purpose of purposes.slice(0,4)){
  const s=status(),consent=s.providers.deepseek.consents[purpose],usage=s.providers.deepseek.usage[purpose]
  consent.enabled=false
  rejected(()=>requirePaidReady(s),`PREFLIGHT_CONSENT_${purpose.toUpperCase()}`)
  consent.enabled=true;consent.monthly_limit_cents=0
  rejected(()=>requirePaidReady(s),`PREFLIGHT_PURPOSE_BUDGET_${purpose.toUpperCase()}`)
  consent.monthly_limit_cents=2;usage.reserved_cents=1
  rejected(()=>requirePaidReady(s),`PREFLIGHT_PURPOSE_BUDGET_${purpose.toUpperCase()}`)
  usage.reserved_cents=0;requirePaidReady(s)
 }
})

test('provider configuration failures are explicit, and malformed accounting fails rather than reducing cost',()=>{
 for(const [field,code] of [['health_enabled','PREFLIGHT_DEEPSEEK_DISABLED'],['configured','PREFLIGHT_DEEPSEEK_NOT_CONFIGURED'],['budget_configured','PREFLIGHT_DEEPSEEK_BUDGET_MISSING']]){
  const s=status();s.providers.deepseek[field]=false;rejected(()=>requirePaidReady(s),code)
 }
 const s=status();s.providers.deepseek.usage.adjust_plan.charged_cents=NaN
 rejected(()=>spending(s),'PREFLIGHT_ACCOUNTING_ADJUST_PLAN_CHARGED_CENTS','failed')
})

test('schema and account checks classify missing RPCs and mismatch without exposing server response text',()=>{
 const privateResult={error:{code:'PGRST202',message:'SYNTHETIC confidential diagnostic'},data:null}
 rejected(()=>requirePreflightRpc(privateResult,9,'PREFLIGHT_SNAPSHOT_SCHEMA_0'),'PREFLIGHT_SNAPSHOT_SCHEMA_0')
 rejected(()=>requirePreflightRpc({error:null,data:8},9,'PREFLIGHT_SNAPSHOT_SCHEMA_0'),'PREFLIGHT_SNAPSHOT_SCHEMA_0')
 rejected(()=>requirePreflightRpc({error:null,data:'w'},'me','PREFLIGHT_ACCOUNT_0','failed'),'PREFLIGHT_ACCOUNT_0','failed')
 requirePreflightRpc({error:null,data:9},9,'PREFLIGHT_SNAPSHOT_SCHEMA_0')
})

test('the fixed approval counts cumulative monthly charges and reservations across every restart',()=>{
 const s=status()
 s.providers.deepseek.usage.parse_schedule.charged_cents=1
 s.providers.deepseek.usage.generate_plan.charged_cents=2
 requireRunBudget(s,'2026-10') // 3 charged + 2 worst-case == 5.
 s.providers.deepseek.usage.estimate_meal_photo.reserved_cents=1
 rejected(()=>requireRunBudget(s,'2026-10'),'RUN_BUDGET_EXCEEDED')
 const restarted=JSON.parse(JSON.stringify(s))
 rejected(()=>requireRunBudget(restarted,'2026-10'),'RUN_BUDGET_EXCEEDED')
 s.providers.deepseek.usage.estimate_meal_photo.reserved_cents=0
 s.providers.deepseek.usage.adjust_plan.charged_cents=2
 rejected(()=>requireRunBudget(s,'2026-10'),'RUN_BUDGET_EXCEEDED')
 rejected(()=>requireRunBudget(status(),'2026-11'),'PREFLIGHT_APPROVAL_PERIOD_CHANGED')
})

test('importing safety checks never installs a network interceptor or runs cloud preflight',()=>{
 assert.equal(globalThis.fetch,fetchBeforeImport)
})

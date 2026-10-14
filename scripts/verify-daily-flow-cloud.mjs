import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { cloudSetup, client, ok } from './test-helpers/cloud.mjs'
import { report, blocked, runCase } from './test-helpers/report.mjs'

// Explicitly authorized synthetic business calls; never grants consent or changes budgets.
const ids=['DAILY_FLOW_PREFLIGHT','RULES_BOTH_USERS','MEAL_PHOTO_PRIVATE','DEEPSEEK_SCHEDULE',
  'DEEPSEEK_PLAN','DEEPSEEK_PHOTO','DEEPSEEK_ADJUST','ADJUST_APPLY_UNDO','ACTIVITY_REFRESH','SYNTHETIC_CLEANUP']
const cases=[],details=[],created={schedules:[],meals:[],photos:[],jobs:[],plans:[],adjustments:[],ai_requests:[],training:[]}
const marker=`SYNTHETIC-DAILY-${randomUUID()}`
const baselineJobs=[]
const baselineColumns='id,user_id,status,plan_id,kind,target_date,error_code,attempts,max_attempts,scheduled_for'
const baselineIds=new Set((process.env.TEST_DAILY_FLOW_BASELINE_JOB_IDS??'').split(',').filter(Boolean))
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const networkFetch=globalThis.fetch
globalThis.fetch=(input,init={})=>networkFetch(input,{...init,
  signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)})
const tomorrow=new Date(Date.parse(today+'T00:00:00Z')+86400000).toISOString().slice(0,10)
const check=(id,fn)=>runCase(cases,details,id,fn)
let setup,api=[],users=[],safe=false
try{setup=cloudSetup()}catch{setup={blocked:true}}
if(setup.blocked||process.env.TEST_DAILY_FLOW_APPROVED!=='YES'){
  await report('daily-flow-cloud','not-run-without-explicit-synthetic-approval',blocked(ids))
}else{
  try{
    api=[client(setup.url,setup.key),client(setup.url,setup.key)]
    const rpc=(i,name,args={})=>ok(api[i].rpc(name,args))
    const edge=(i,body)=>ok(api[i].functions.invoke('health-ai',{body}))
    await check('DAILY_FLOW_PREFLIGHT',async()=>{
      if(baselineIds.size!==0&&(baselineIds.size!==2||[...baselineIds].some(id=>!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))))
        throw Object.assign(new Error('Two reviewed baseline job IDs required'),{code:'BASELINE_JOB_IDS_INVALID'})
      for(let i=0;i<2;i++){
        const auth=await ok(api[i].auth.signInWithPassword({email:setup.emails[i],password:setup.passwords[i]}))
        users.push(auth.user.id)
        assert.equal(await rpc(i,'current_account'),i===0?'me':'w')
        assert.equal(await rpc(i,'health_daily_flow_version'),7)
        assert.equal(await rpc(i,'health_activity_schema_version'),8)
        // Count only; do not download any existing personal content. Abort before writes
        // if generation could use existing real data, even on another date.
        for(const table of ['health_profiles','health_rules','weights','schedules','meals','training_sessions','daily_plans','photo_assets']){
          const result=await api[i].from(table).select('*',{head:true,count:'exact'}).eq('user_id',users[i])
          if(result.error) throw result.error
          if(result.count!==0) throw Object.assign(new Error('Existing health data blocks synthetic-only run'),{code:'EXISTING_HEALTH_DATA'})
        }
        const oldJobs=await ok(api[i].from('generation_jobs').select(baselineColumns).eq('user_id',users[i]))
        if(oldJobs.length>1||oldJobs.some(job=>!baselineIds.has(job.id)||job.status!=='exhausted'||job.plan_id!==null||
          job.kind!=='scheduled'||job.target_date!=='2026-10-14'||job.error_code!=='MEAL_TEMPLATE_UNCONFIRMED'||
          job.attempts!==3||job.max_attempts!==3||Date.parse(job.scheduled_for)!==Date.parse('2026-10-13T12:00:00Z')))
          throw Object.assign(new Error('Existing jobs are not the reviewed exhausted baseline'),{code:'EXISTING_JOB_DATA'})
        baselineJobs.push(...oldJobs)
      }
      if(baselineJobs.length!==0&&baselineJobs.length!==2) throw Object.assign(new Error('Incomplete baseline job pair'),{code:'EXISTING_JOB_DATA'})
      safe=true
    })
    await check('RULES_BOTH_USERS',async()=>{
      const before=[],jobs=[]
      for(let i=0;i<2;i++){
        before.push(await edge(i,{action:'status'}))
        const job=await rpc(i,'request_plan_generation',{p_target_date:tomorrow,p_provider:'rules'})
        created.jobs.push({id:job.id,user_id:users[i]})
        assert.equal(job.provider,'rules');assert.equal(job.status,'queued');jobs.push(job)
      }
      const deadline=Date.now()+6*60_000,results=[]
      const progress=setInterval(()=>process.stdout.write('等待现有五分钟后台领取规则任务；这不是 20:00 准点验收。\n'),30_000)
      try{
        while(results.filter(Boolean).length<2){
          if(Date.now()>=deadline) throw Object.assign(new Error('Background worker did not complete both jobs'),{code:'BACKGROUND_WORKER_TIMEOUT'})
          for(let i=0;i<2;i++){
            if(results[i])continue
            const remaining=deadline-Date.now()
            if(remaining<=0)throw Object.assign(new Error('Background worker deadline reached'),{code:'BACKGROUND_WORKER_TIMEOUT'})
            const row=await ok(api[i].from('generation_jobs').select('id,status,plan_id,provider,attempts')
              .eq('id',jobs[i].id).single().abortSignal(AbortSignal.timeout(remaining)))
            assert.equal(row.provider,'rules')
            if(row.status==='exhausted')throw Object.assign(new Error('Background worker exhausted job'),{code:'BACKGROUND_WORKER_FAILED'})
            if(row.status==='succeeded'){
              assert.ok(row.plan_id);assert.ok(row.attempts>=1);results[i]=row
              created.plans.push({id:row.plan_id,user_id:users[i]})
            }
          }
          if(results.filter(Boolean).length<2)await new Promise(resolve=>setTimeout(resolve,Math.min(10_000,Math.max(0,deadline-Date.now()))))
        }
      }finally{clearInterval(progress)}
      for(let i=0;i<2;i++){
        const result=results[i]
        const plans=await ok(api[i].from('daily_plans').select('id,content,source').eq('id',result.plan_id))
        assert.equal(plans[0].source,'rules');assert.equal(plans[0].content.meals.length,3)
        assert.equal((await ok(api[1-i].from('daily_plans').select('id').eq('id',result.plan_id))).length,0)
        assert.deepEqual((await edge(i,{action:'status'})).providers,before[i].providers)
      }
    })
    let meal
    await check('MEAL_PHOTO_PRIVATE',async()=>{
      meal=await rpc(0,'save_meal',{p_payload:{status:'draft',is_shared:false,data:{
        recorded_at:today+'T12:00:00+08:00',kind:'lunch',items:[{name:marker+' apple and banana',portion:'unknown',unit:'portion'}],
        eaten_fraction:0.5,shared_meal_id:null,photo_ids:[],cooking:null,oil:null,leftover:'half remaining',estimate:null}}})
      created.meals.push({id:meal.id,user_id:users[0]})
      const form=new FormData();form.append('file',new Blob([await readFile(new URL('../tests/fixtures/food-example-compact.png',import.meta.url))],{type:'image/png'}),'synthetic.png')
      form.append('meal_id',meal.id);form.append('is_shared','false')
      const photo=await ok(api[0].functions.invoke('health-photo?action=upload',{body:form}))
      created.photos.push({id:photo.photo_id,user_id:users[0]})
      assert.equal((await ok(api[1].from('photo_assets').select('id').eq('id',photo.photo_id))).length,0)
      assert.equal((await ok(api[1].from('meals').select('id').eq('id',meal.id))).length,0)
    })
    const paid=process.env.TEST_DAILY_FLOW_DEEPSEEK_APPROVED==='YES'
    if(!paid){cases.push(...blocked(ids.slice(3,8)))}else{
      const initial=await edge(0,{action:'status'}),provider=initial.providers.deepseek
      assert.ok(provider.health_enabled&&provider.configured&&provider.budget_configured)
      for(const purpose of ['parse_schedule','generate_plan','estimate_meal_photo','adjust_plan']) assert.ok(provider.consents[purpose]?.enabled)
      const spending=status=>Object.values(status.providers.deepseek.usage).reduce((n,x)=>n+x.charged_cents+x.reserved_cents,0)
      const initialSpent=spending(initial)
      const call=async(body,worst)=>{
        for(const table of ['health_profiles','health_rules','weights','training_sessions']){
          const result=await api[0].from(table).select('*',{head:true,count:'exact'}).eq('user_id',users[0])
          if(result.error) throw result.error
          if(result.count!==0) throw Object.assign(new Error('Synthetic inputs changed'),{code:'EXISTING_HEALTH_DATA'})
        }
        for(const [table,list] of [['schedules','schedules'],['meals','meals'],['daily_plans','plans'],['generation_jobs','jobs'],['photo_assets','photos']]){
          const rows=await ok(api[0].from(table).select('id').eq('user_id',users[0]))
          if(rows.some(row=>!created[list].some(x=>x.id===row.id)&&!(table==='generation_jobs'&&baselineJobs.some(x=>x.id===row.id))))
            throw Object.assign(new Error('Synthetic inputs changed'),{code:'EXISTING_HEALTH_DATA'})
        }
        // Enforce an additional 5-cent run ceiling; the server atomically enforces
        // unchanged site/provider/purpose budgets including concurrent callers.
        const before=await edge(0,{action:'status'})
        if(spending(before)-initialSpent+worst>5) throw Object.assign(new Error('Run budget exhausted'),{code:'RUN_BUDGET_EXCEEDED'})
        const result=await edge(0,{...body,provider:'deepseek'})
        if(result.ai_request_id) created.ai_requests.push({id:result.ai_request_id,user_id:users[0]})
        return result
      }
      await check('DEEPSEEK_SCHEDULE',async()=>{
        const submitted=new Date().toISOString(),raw=`${marker}，我是我（me），${today} 今天不训练，三餐在食堂吃。`
        const parsed=await call({action:'parse-schedule',raw_text:raw,submitted_at:submitted},1)
        assert.equal(parsed.draft.user_slot,'me');assert.equal(parsed.draft.record_date,today);assert.equal(parsed.draft.exercise.intent,'no')
        const schedule=await rpc(0,'save_confirmed_schedule',{p_payload:{user_id:users[0],record_date:today,
          raw_text:raw,start_time:null,end_time:null,exercise_intent:'no',fixed_arrangements:'',meal_conditions:'食堂',constraints:'',is_shared:false,
          confirmed_data:parsed.draft,submitted_at:submitted,parse_version:parsed.parse_version}})
        created.schedules.push({id:schedule.id,user_id:users[0]})
      })
      await check('DEEPSEEK_PLAN',async()=>{
        const job=await rpc(0,'request_plan_generation',{p_target_date:today,p_provider:'deepseek'})
        created.jobs.push({id:job.id,user_id:users[0]})
        const result=await call({action:'generate-plan',job_id:job.id},2)
        assert.equal(result.status,'succeeded');created.plans.push({id:result.plan_id,user_id:users[0]})
      })
      await check('DEEPSEEK_PHOTO',async()=>{
        const result=await call({action:'estimate-meal',meal_id:meal.id},1)
        assert.ok(result.needs_confirmation);assert.ok(result.draft.uncertainty)
        const current=(await ok(api[0].from('meals').select('*').eq('id',meal.id)))[0]
        const draft=result.draft
        meal=await rpc(0,'save_meal',{p_id:meal.id,p_payload:{status:'confirmed',is_shared:false,expected_updated_at:current.updated_at,
          data:{...current.data,estimate:{energy_min_kcal:draft.energy_min_kcal,energy_max_kcal:draft.energy_max_kcal,uncertainty:draft.uncertainty,assumptions:draft.assumptions}}}})
      })
      let adjustment
      await check('DEEPSEEK_ADJUST',async()=>{
        const result=await call({action:'adjust-plan',record_date:today},2)
        adjustment=result.adjustment;assert.equal(adjustment.status,'draft')
        created.adjustments.push({id:adjustment.id,user_id:users[0]})
        assert.ok(adjustment.source_input_hash&&adjustment.content.reason)
      })
      if(adjustment.content.meal_changes.length===0) cases.push({id:'ADJUST_APPLY_UNDO',status:'blocked'})
      else await check('ADJUST_APPLY_UNDO',async()=>{
        const applied=await rpc(0,'apply_meal_adjustment',{p_id:adjustment.id,p_expected_updated_at:adjustment.updated_at})
        created.plans.push({id:applied.applied_plan_id,user_id:users[0]})
        const undone=await rpc(0,'undo_meal_adjustment',{p_id:applied.id,p_expected_updated_at:applied.updated_at})
        assert.equal(undone.status,'reverted')
        // Only this run owns the previously empty date; collect exact generated version IDs.
        for(const p of await ok(api[0].from('daily_plans').select('id,user_id').eq('user_id',users[0]).eq('target_date',today)))
          if(!created.plans.some(x=>x.id===p.id)) created.plans.push(p)
      })
    }
    await check('ACTIVITY_REFRESH',async()=>{
      const payload={status:'completed',is_shared:false,data:{plan_id:null,status:'completed',
        record_date:today,activity_type:'badminton',duration_seconds:600,elapsed_seconds:600,
        started_at:null,ended_at:null,active_since:null,rest_until:null,rest_remaining_seconds:0,
        stop_reason:null,sets:[],intensity:'light',pain:'none',notes:marker}}
      const activity=await rpc(0,'save_training_session',{p_payload:payload})
      created.training.push({id:activity.id,user_id:users[0]})
      const independent=client(setup.url,setup.key)
      try{
        await ok(independent.auth.signInWithPassword({email:setup.emails[0],password:setup.passwords[0]}))
        const row=await ok(independent.from('training_sessions').select('id,record_date,data').eq('id',activity.id).single())
        assert.equal(row.record_date,today);assert.deepEqual(row.data,payload.data)
        assert.equal((await ok(api[1].from('training_sessions').select('id').eq('id',activity.id))).length,0)
      }finally{await independent.auth.signOut().catch(()=>{})}
    })
  }catch(error){
    details.push({id:'DAILY_FLOW_RUN',error})
    for(const id of ids) if(!cases.some(x=>x.id===id)&&id!=='SYNTHETIC_CLEANUP') cases.push({id,status:'blocked'})
  }finally{
    if(safe) await check('SYNTHETIC_CLEANUP',async()=>{
      await mkdir(new URL('../test-results/private/',import.meta.url),{recursive:true})
      await writeFile(new URL('../test-results/private/daily-flow-cleanup.json',import.meta.url),JSON.stringify({marker,created,read_only_baseline_jobs:baselineJobs.map(x=>x.id),needs_administrator_exact_id_cleanup:['jobs','plans','adjustments','ai_requests'],uncertain_failed_requests_require_manual_audit:true},null,2))
      for(const job of baselineJobs){
        const owner=users.indexOf(job.user_id)
        const current=await ok(api[owner].from('generation_jobs').select(baselineColumns).eq('id',job.id))
        assert.deepEqual(current,[job])
      }
      for(const photo of created.photos) await ok(api[0].functions.invoke(`health-photo?action=delete&photo_id=${photo.id}`,{method:'DELETE'}))
      for(const m of created.meals) await ok(api[0].rpc('delete_meal',{p_id:m.id}))
      for(const s of created.schedules) await ok(api[0].rpc('delete_schedule',{p_id:s.id}))
      for(const t of created.training) await ok(api[0].rpc('delete_training_session',{p_id:t.id}))
      // No bulk cleanup RPC exists for plans/jobs; never clear the user's health data.
    }).catch(()=>{})
    else if(!cases.some(x=>x.id==='SYNTHETIC_CLEANUP')) cases.push({id:'SYNTHETIC_CLEANUP',status:'blocked'})
    for(const c of api) await c.auth.signOut().catch(()=>{})
    await report('daily-flow-cloud','real-two-account-synthetic-business-flow',cases,details)
  }
}

import test from 'node:test'
import assert from 'node:assert/strict'

test('cron denies anonymous calls and exposes only aggregated safe failure codes',async()=>{
  const previousDeno=globalThis.Deno,previousFetch=globalThis.fetch
  const envKeys=['HEALTH_CRON_SECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']
  const previousEnv=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]))
  let handle
  globalThis.Deno={serve:fn=>{handle=fn},env:{get:name=>process.env[name]}}
  try{
    const {classifyGenerationFailure}=await import('../supabase/bundles/health-cron.js')
    assert.equal(classifyGenerationFailure(Object.assign(new Error('INVALID_REQUEST'),
      {dbCode:'PGRST202',id:'private-id',detail:'private health text'})),'INVALID_REQUEST')
    assert.deepEqual(classifyGenerationFailure(Object.assign(new Error('private health text'),
      {dbCode:'UNSAFE'})),'GENERATION_FAILED')
    const anonymous=await handle(new Request('https://example.test/health-cron',{
      method:'POST',body:JSON.stringify({action:'probe-deepseek-schedule'})}))
    assert.equal(anonymous.status,401)
    assert.deepEqual(await anonymous.json(),{error:'AUTH_REQUIRED'})

    process.env.HEALTH_CRON_SECRET='SYNTHETIC_CRON_SECRET_32_CHARACTERS_LONG'
    process.env.SUPABASE_URL='https://synthetic.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY='SYNTHETIC_NOT_A_KEY'
    const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']
    const jobs=ids.map(id=>({id,user_id:id,provider:'rules',input_version:'SYNTHETIC_INPUT',
      target_date:'2026-10-14',claim_token:id,space_id:'33333333-3333-4333-8333-333333333333',status:'queued',lease_until:null}))
    let claimed=0,deniedPlanReads=0,failedJobs=0
    globalThis.fetch=async(url,options)=>{
      const parsed=new URL(url),path=parsed.pathname
      if(path==='/rest/v1/rpc/enqueue_scheduled_plans') return Response.json(2)
      if(path==='/rest/v1/generation_jobs'){
        const id=parsed.searchParams.get('id')?.replace(/^eq\./,'')
        return Response.json(id?jobs.filter(job=>job.id===id):jobs)
      }
      if(path==='/rest/v1/rpc/claim_generation_job'){
        claimed++
        const id=JSON.parse(options.body).p_id
        return Response.json(jobs.filter(job=>job.id===id).map(job=>({...job,status:'running'})))
      }
      if(path==='/rest/v1/rpc/health_input_version') return Response.json('SYNTHETIC_INPUT')
      if(path==='/rest/v1/daily_plans'){
        deniedPlanReads++
        return Response.json({code:'42501',message:'private health text',details:'private-id'}, {status:403})
      }
      if(path==='/rest/v1/rpc/finish_generation_job'){
        failedJobs++
        assert.equal(JSON.parse(options.body).p_error_code,'INVALID_REQUEST')
        return Response.json(null)
      }
      throw new Error(`Unexpected test path ${path}`)
    }
    const response=await handle(new Request('https://example.test/health-cron',{
      method:'POST',headers:{'x-cron-secret':process.env.HEALTH_CRON_SECRET},body:'{}'}))
    assert.equal(response.status,503)
    const body=await response.json()
    assert.deepEqual(body,{enqueued:2,attempted:2,
      failures:[{code:'INVALID_REQUEST',count:2}]})
    assert.deepEqual({claimed,deniedPlanReads,failedJobs},{claimed:2,deniedPlanReads:2,failedJobs:2})
    assert.ok(!JSON.stringify(body).includes('private'))
    assert.ok(ids.every(id=>!JSON.stringify(body).includes(id)))
  }finally{
    globalThis.Deno=previousDeno
    globalThis.fetch=previousFetch
    for(const key of envKeys){
      if(previousEnv[key]===undefined) delete process.env[key]
      else process.env[key]=previousEnv[key]
    }
  }
})

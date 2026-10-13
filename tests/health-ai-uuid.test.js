import test from 'node:test'
import assert from 'node:assert/strict'

test('meal estimate accepts a standard UUID and rejects a missing-segment UUID',async()=>{
  const keys=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY']
  const prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]))
  const oldDeno=globalThis.Deno,oldFetch=globalThis.fetch
  let handle
  globalThis.Deno={serve:fn=>{handle=fn},env:{get:name=>process.env[name]}}
  process.env.SUPABASE_URL='https://synthetic.supabase.co'
  process.env.SUPABASE_ANON_KEY='SYNTHETIC_PUBLIC_KEY'
  process.env.SUPABASE_SERVICE_ROLE_KEY='SYNTHETIC_ADMIN_KEY'
  const paths=[]
  globalThis.fetch=async url=>{
    const path=new URL(url).pathname
    paths.push(path)
    if(path==='/auth/v1/user') return Response.json({id:'11111111-1111-4111-8111-111111111111'})
    if(path==='/rest/v1/rpc/current_account') return Response.json('me')
    if(path==='/rest/v1/rpc/current_space_id') return Response.json('33333333-3333-4333-8333-333333333333')
    if(path==='/rest/v1/meals') return Response.json([])
    throw new Error(`Unexpected test path ${path}`)
  }
  try{
    await import('../supabase/bundles/health-ai.js')
    const request=id=>new Request('https://example.test/health-ai',{method:'POST',
      headers:{Authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},
      body:JSON.stringify({action:'estimate-meal',provider:'openai',meal_id:id})})
    const valid=await handle(request('22222222-2222-4222-8222-222222222222'))
    assert.equal(valid.status,400)
    assert.deepEqual(await valid.json(),{error:'INVALID_REQUEST'})
    assert.ok(paths.includes('/rest/v1/meals'),JSON.stringify(paths))
    paths.length=0
    const malformed=await handle(request('22222222-2222-4222-222222222222'))
    assert.equal(malformed.status,400)
    assert.deepEqual(await malformed.json(),{error:'INVALID_REQUEST'})
    assert.ok(!paths.includes('/rest/v1/meals'))
  }finally{
    globalThis.Deno=oldDeno
    globalThis.fetch=oldFetch
    for(const key of keys){
      if(prior[key]===undefined) delete process.env[key]
      else process.env[key]=prior[key]
    }
  }
})

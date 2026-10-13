import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allowedOrigin, preflight, safeError } from '../supabase/functions/_shared/runtime.js'

test('SDK preflight and errors preserve the allowed origin', () => {
  const previous=process.env.HEALTH_ALLOWED_ORIGINS
  process.env.HEALTH_ALLOWED_ORIGINS='https://czechiuu.github.io,http://localhost:5173'
  try{
    const request=new Request('https://example.test/health-ai',{method:'OPTIONS',headers:{
      Origin:'https://czechiuu.github.io',
      'Access-Control-Request-Method':'POST',
      'Access-Control-Request-Headers':'authorization,apikey,content-type,x-client-info',
    }})
    const origin=allowedOrigin(request)
    const response=preflight(request)
    assert.equal(response.status,204)
    assert.equal(response.headers.get('access-control-allow-origin'),origin)
    for(const header of ['authorization','apikey','content-type','x-client-info'])
      assert.match(response.headers.get('access-control-allow-headers'),new RegExp(`\\b${header}\\b`))
    const error=safeError(new Error('AI_DISABLED'),origin)
    assert.equal(error.headers.get('access-control-allow-origin'),origin)
    assert.throws(()=>allowedOrigin(new Request('https://example.test',{headers:{Origin:'https://unexpected.test'}})),/ORIGIN_DENIED/)
  }finally{
    if(previous===undefined) delete process.env.HEALTH_ALLOWED_ORIGINS
    else process.env.HEALTH_ALLOWED_ORIGINS=previous
  }
})

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const project='wnzbtitlvteptkvwhavw';
const siteOrigin='https://czechiuu.github.io';
const badOrigin='https://untrusted.invalid';
const fakeJwt='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.invalid';
const photoId='00000000-0000-4000-8000-000000000001';
const ids=['PHOTO_ANON_GET','PHOTO_FORGED_JWT','PHOTO_BAD_ORIGIN',
  'PHOTO_PREFLIGHT_ALLOWED','PHOTO_PREFLIGHT_DENIED','PHOTO_ANON_POST',
  'AI_ANON_POST','AI_FORGED_JWT','AI_BAD_ORIGIN','AI_PREFLIGHT_ALLOWED','AI_PREFLIGHT_DENIED',
  'CRON_ANON_POST','CRON_BAD_SECRET','CRON_PROBE_BAD_SECRET'];
const report={started_at:new Date().toISOString(),generated_at:null,
  scope:'Production public HTTP rejection checks only; no real account, upload, paid AI, or private data',
  cases:Object.fromEntries(ids.map(id=>[id,{status:'not_run'}])),
  passed:0,failed:0,not_run:ids.length};
try{
  const previous=JSON.parse(await readFile(new URL('../test-results/edge-public-results.json',import.meta.url),'utf8'));
  report.previous_photo_run={started_at:previous.started_at,generated_at:previous.generated_at,
    passed:previous.passed,failed:previous.failed,not_run:previous.not_run};
}catch{}
const sha=value=>createHash('sha256').update(value).digest('hex');
const config=Object.fromEntries((await readFile(new URL('../.env.local',import.meta.url),'utf8'))
  .split(/\r?\n/).filter(line=>/^VITE_SUPABASE_(URL|PUBLISHABLE_KEY)=/.test(line))
  .map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1).trim().replace(/^['"]|['"]$/g,'')]}));
const origin=new URL(config.VITE_SUPABASE_URL??'');
assert.equal(origin.href,`https://${project}.supabase.co/`);
assert.match(config.VITE_SUPABASE_PUBLISHABLE_KEY??'',/^sb_publishable_[A-Za-z0-9_-]+$/);
const endpoint=`${origin.href}functions/v1/health-photo`;
const aiEndpoint=`${origin.href}functions/v1/health-ai`;
const cronEndpoint=`${origin.href}functions/v1/health-cron`;
const headers={apikey:config.VITE_SUPABASE_PUBLISHABLE_KEY};
async function run(id,request,expected){
  try{
    const response=await fetch(request.url??endpoint,{method:request.method??'GET',
      headers:{...headers,...request.headers},body:request.body,
      signal:AbortSignal.timeout(15000),redirect:'manual'});
    const raw=await response.text();
    assert.ok(raw.length<2048,'Unexpected large response');
    let body=null;
    if(raw){try{body=JSON.parse(raw)}catch{throw new Error('Non-JSON rejection: gateway or HTML response')}}
    assert.equal(response.status,expected.status);
    if(expected.error) assert.deepEqual(body,{error:expected.error});
    if(expected.allowOrigin) assert.equal(response.headers.get('access-control-allow-origin'),expected.allowOrigin);
    if(expected.noAllowOrigin) assert.equal(response.headers.get('access-control-allow-origin'),null);
    report.cases[id]={status:'passed',http_status:response.status,
      response_code:body?.error??null,source:body?.error?'application':'preflight'};
    report.passed++;
  }catch(error){
    report.cases[id]={status:'failed',error_name:error.name,
      reason:String(error.message).replace(config.VITE_SUPABASE_PUBLISHABLE_KEY,'[public-key]').slice(0,160)};
    report.failed++;
  }
  report.not_run--;
}
try{
  const photoUrl=`${endpoint}?action=download&photo_id=${photoId}`;
  await run('PHOTO_ANON_GET',{url:photoUrl},{status:401,error:'AUTH_REQUIRED'});
  await run('PHOTO_FORGED_JWT',{url:photoUrl,headers:{authorization:`Bearer ${fakeJwt}`}},{status:401,error:'AUTH_REQUIRED'});
  await run('PHOTO_BAD_ORIGIN',{url:photoUrl,headers:{origin:badOrigin}},{status:403,error:'ORIGIN_DENIED',noAllowOrigin:true});
  await run('PHOTO_PREFLIGHT_ALLOWED',{method:'OPTIONS',headers:{origin:siteOrigin,'access-control-request-method':'GET'}},
    {status:204,allowOrigin:siteOrigin});
  await run('PHOTO_PREFLIGHT_DENIED',{method:'OPTIONS',headers:{origin:badOrigin,'access-control-request-method':'GET'}},
    {status:403,error:'ORIGIN_DENIED',noAllowOrigin:true});
  await run('PHOTO_ANON_POST',{method:'POST',url:`${endpoint}?action=upload`},{status:401,error:'AUTH_REQUIRED'});
  await run('AI_ANON_POST',{method:'POST',url:aiEndpoint},{status:401,error:'AUTH_REQUIRED'});
  await run('AI_FORGED_JWT',{method:'POST',url:aiEndpoint,headers:{authorization:`Bearer ${fakeJwt}`}},{status:401,error:'AUTH_REQUIRED'});
  await run('AI_BAD_ORIGIN',{method:'POST',url:aiEndpoint,headers:{origin:badOrigin}},{status:403,error:'ORIGIN_DENIED',noAllowOrigin:true});
  await run('AI_PREFLIGHT_ALLOWED',{method:'OPTIONS',url:aiEndpoint,headers:{origin:siteOrigin,'access-control-request-method':'POST'}},
    {status:204,allowOrigin:siteOrigin});
  await run('AI_PREFLIGHT_DENIED',{method:'OPTIONS',url:aiEndpoint,headers:{origin:badOrigin,'access-control-request-method':'POST'}},
    {status:403,error:'ORIGIN_DENIED',noAllowOrigin:true});
  await run('CRON_ANON_POST',{method:'POST',url:cronEndpoint},{status:401,error:'AUTH_REQUIRED'});
  await run('CRON_BAD_SECRET',{method:'POST',url:cronEndpoint,headers:{'x-cron-secret':'synthetic-invalid-secret'}},
    {status:401,error:'AUTH_REQUIRED',noAllowOrigin:true});
  await run('CRON_PROBE_BAD_SECRET',{method:'POST',url:cronEndpoint,
    headers:{'x-cron-secret':'synthetic-invalid-secret','content-type':'application/json'},
    body:JSON.stringify({action:'probe-deepseek'})},{status:401,error:'AUTH_REQUIRED'});
}finally{
  report.generated_at=new Date().toISOString();
  report.script_sha256=sha(await readFile(new URL('./verify-edge-public.mjs',import.meta.url)));
  await writeFile('test-results/edge-public-results.json',JSON.stringify(report,null,2)+'\n');
  console.log(`edge public: ${report.passed} passed, ${report.failed} failed, ${report.not_run} not run`);
  if(report.failed||report.not_run) process.exitCode=1;
}

import { createClient } from '@supabase/supabase-js'
import { env, json, safeError } from '../_shared/runtime.js'
import { generate } from '../_shared/ai-core.js'

function validSecret(actual,expected){
  if(!actual||!expected||expected.length<32) return false
  const a=new TextEncoder().encode(actual),b=new TextEncoder().encode(expected)
  let diff=a.length^b.length
  for(let i=0;i<Math.max(a.length,b.length);i++) diff|=(a[i]??0)^(b[i]??0)
  return diff===0
}

function lastShanghaiEight(now){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'})
    .formatToParts(now).map(part=>[part.type,part.value]))
  const day=new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`)
  if(Number(parts.hour)<20) day.setUTCDate(day.getUTCDate()-1)
  return new Date(day.getTime()).toISOString()
}

async function handle(request){
  if(request.method!=='POST') throw new Error('INVALID_REQUEST')
  if(!validSecret(request.headers.get('x-cron-secret'),env('HEALTH_CRON_SECRET')))
    throw new Error('AUTH_REQUIRED')
  const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!key) throw new Error('SERVER_NOT_CONFIGURED')
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  const scheduledFor=lastShanghaiEight(new Date())
  const enqueue=await admin.rpc('enqueue_scheduled_plans',{p_scheduled_for:scheduledFor})
  if(enqueue.error) throw new Error('INTERNAL_ERROR')
  const now=new Date().toISOString()
  const pending=await admin.from('generation_jobs').select('id,user_id,space_id,status,lease_until')
    .in('status',['queued','failed','running']).lte('next_run_at',now).order('next_run_at').limit(20)
  if(pending.error) throw new Error('INTERNAL_ERROR')
  let attempted=0
  for(const job of pending.data){
    if(job.status==='running' && (!job.lease_until||Date.parse(job.lease_until)>=Date.now())) continue
    attempted++
    try{await generate({user:admin,admin,id:job.user_id,spaceId:job.space_id},job.id)}catch{}
  }
  return json(200,{enqueued:enqueue.data,attempted})
}

Deno.serve(async request=>{
  try{return await handle(request)}catch(error){return safeError(error)}
})

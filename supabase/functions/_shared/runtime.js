import { createClient } from '@supabase/supabase-js'

export const env = (name) => typeof Deno === 'undefined' ? process.env[name] : Deno.env.get(name)
export const json = (status,body,origin=null) => new Response(JSON.stringify(body),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    ...(origin?{'access-control-allow-origin':origin,'vary':'Origin'}:{})},
})
export const failure = (code,status=400,origin=null) => json(status,{error:code},origin)

export function allowedOrigin(request){
  const origin=request.headers.get('origin')
  const configured=(env('HEALTH_ALLOWED_ORIGINS')??'').split(',').map(x=>x.trim()).filter(Boolean)
  if(origin && !configured.includes(origin)) throw new Error('ORIGIN_DENIED')
  return origin
}

export function preflight(request){
  const origin=allowedOrigin(request)
  return new Response(null,{status:204,headers:{
    ...(origin?{'access-control-allow-origin':origin,'vary':'Origin'}:{}),
    'access-control-allow-methods':'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers':'authorization,apikey,content-type,x-client-info',
    'access-control-max-age':'300',
  }})
}

export async function readBounded(request,maxBytes){
  const reader=request.body?.getReader()
  if(!reader) throw new Error('INVALID_REQUEST')
  const parts=[];let length=0
  for(;;){
    const {done,value}=await reader.read()
    if(done) break
    length+=value.length
    if(length>maxBytes){await reader.cancel();throw new Error('INVALID_REQUEST')}
    parts.push(value)
  }
  const bytes=new Uint8Array(length);let at=0
  for(const part of parts){bytes.set(part,at);at+=part.length}
  return bytes
}

export function clients(jwt){
  const url=env('SUPABASE_URL'),key=env('SUPABASE_ANON_KEY'),secret=env('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!key||!secret) throw new Error('SERVER_NOT_CONFIGURED')
  const options={auth:{persistSession:false,autoRefreshToken:false}}
  return {
    user:createClient(url,key,{...options,global:{headers:{Authorization:`Bearer ${jwt}`}}}),
    admin:createClient(url,secret,options),
  }
}

export async function authenticate(request){
  const jwt=request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if(!jwt) throw new Error('AUTH_REQUIRED')
  const {user,admin}=clients(jwt)
  const auth=await user.auth.getUser(jwt)
  if(auth.error||!auth.data.user) throw new Error('AUTH_REQUIRED')
  const slot=await user.rpc('current_account')
  if(slot.error||!['me','w'].includes(slot.data)) throw new Error('ACCOUNT_DENIED')
  const space=await user.rpc('current_space_id')
  if(space.error||!space.data) throw new Error('SPACE_REQUIRED')
  return {user,admin,id:auth.data.user.id,slot:slot.data,spaceId:space.data}
}

export function safeError(error,origin=null){
  const code=error instanceof Error?error.message:'INTERNAL_ERROR'
  const known=new Set(['ORIGIN_DENIED','SERVER_NOT_CONFIGURED','AUTH_REQUIRED','ACCOUNT_DENIED','SPACE_REQUIRED',
    'INVALID_REQUEST','INVALID_PNG','PHOTO_NOT_FOUND','PHOTO_ALREADY_USED','PHOTO_STORAGE_FAILED','PHOTO_DB_FAILED',
    'AI_DISABLED','AI_CONSENT_REQUIRED','AI_BUDGET_EXCEEDED','AI_RATE_LIMIT','AI_INCOMPLETE','AI_REFUSAL','AI_OUTPUT_MISSING',
    'INVALID_GENERATED_PLAN','NO_VERIFIED_EXERCISE','MEAL_TEMPLATE_UNCONFIRMED','JOB_NOT_AVAILABLE','AI_PROVIDER_FAILED'])
  const publicCode=known.has(code)?code:'INTERNAL_ERROR'
  const status=publicCode==='AUTH_REQUIRED'?401:publicCode==='ORIGIN_DENIED'||publicCode==='ACCOUNT_DENIED'||publicCode==='SPACE_REQUIRED'?403:
    publicCode==='INTERNAL_ERROR'||publicCode==='SERVER_NOT_CONFIGURED'?503:400
  return failure(publicCode,status,origin)
}

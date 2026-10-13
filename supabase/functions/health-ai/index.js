import { allowedOrigin, preflight, authenticate, json, safeError, readBounded } from '../_shared/runtime.js'
import { scheduleDraftSchema, mealEstimateSchema } from '../../../shared/ai-schema.js'
import { status, response, generate } from '../_shared/ai-core.js'

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function handle(request){
  const origin=allowedOrigin(request)
  if(request.method==='OPTIONS') return preflight(request)
  if(request.method!=='POST') throw new Error('INVALID_REQUEST')
  const ctx=await authenticate(request)
  const size=Number(request.headers.get('content-length')||0)
  if(size>16000) throw new Error('INVALID_REQUEST')
  const raw=new TextDecoder().decode(await readBounded(request,16000))
  let body
  try{body=JSON.parse(raw)}catch{throw new Error('INVALID_REQUEST')}
  if(body?.action==='status') return json(200,await status(ctx),origin)
  if(body?.action==='generate-plan') return json(200,await generate(ctx,body.job_id),origin)
  if(body?.action==='parse-schedule'){
    if(typeof body.raw_text!=='string'||new TextEncoder().encode(body.raw_text).length>3000||
      typeof body.submitted_at!=='string'||!Number.isFinite(Date.parse(body.submitted_at))) throw new Error('INVALID_REQUEST')
    const submittedShanghai=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',
      year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
      .format(new Date(body.submitted_at))
    const draft=await response(ctx,'text',{name:'schedule_draft',schema:scheduleDraftSchema,
      userText:JSON.stringify({raw_text:body.raw_text,submitted_at:body.submitted_at,
        submitted_shanghai:submittedShanghai})})
    return json(200,{draft,needs_confirmation:true,parse_version:'health-schedule-v1',submitted_at:body.submitted_at},origin)
  }
  if(body?.action==='estimate-meal'){
    if(!uuid.test(body.meal_id??'')) throw new Error('INVALID_REQUEST')
    const meal=await ctx.user.from('meals').select('data').eq('id',body.meal_id).eq('user_id',ctx.id).maybeSingle()
    if(meal.error||!meal.data) throw new Error('INVALID_REQUEST')
    const data=meal.data.data
    const photos=await ctx.user.from('photo_assets').select('id,storage_path').eq('meal_id',body.meal_id)
      .eq('user_id',ctx.id).limit(3)
    if(photos.error||photos.data.length>2) throw new Error('INVALID_REQUEST')
    const images=[]
    for(const photo of photos.data){
      const object=await ctx.admin.storage.from('health-photos').download(photo.storage_path)
      if(object.error||!object.data) throw new Error('INVALID_REQUEST')
      const stillAllowed=await ctx.user.from('photo_assets').select('id').eq('id',photo.id).eq('meal_id',body.meal_id).maybeSingle()
      if(stillAllowed.error||!stillAllowed.data) throw new Error('INVALID_REQUEST')
      images.push(new Uint8Array(await object.data.arrayBuffer()))
    }
    const draft=await response(ctx,images.length?'photo':'text',{name:'meal_estimate',schema:mealEstimateSchema,
      userText:JSON.stringify({items:data.items,eaten_fraction:data.eaten_fraction,cooking:data.cooking,
        oil:data.oil,leftover:data.leftover}),images})
    return json(200,{draft,needs_confirmation:true},origin)
  }
  throw new Error('INVALID_REQUEST')
}

Deno.serve(async request=>{
  let origin=null
  try{origin=allowedOrigin(request);return await handle(request)}
  catch(error){return safeError(error,origin)}
})

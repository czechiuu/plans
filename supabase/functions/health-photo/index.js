import { validateSanitizedPng, pngFailureReasons } from '../../../shared/png.js'
import { allowedOrigin, preflight, authenticate, json, safeError } from '../_shared/runtime.js'

const bucket='health-photos'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function boundedForm(request){
  const reader=request.body?.getReader()
  if(!reader) throw new Error('INVALID_REQUEST')
  const parts=[];let length=0
  for(;;){
    const {done,value}=await reader.read()
    if(done) break
    length+=value.length
    if(length>5*1024*1024){await reader.cancel();throw Object.assign(new Error('INVALID_PNG'),{pngReason:'REQUEST_SIZE'})}
    parts.push(value)
  }
  const bytes=new Uint8Array(length);let at=0
  for(const part of parts){bytes.set(part,at);at+=part.length}
  return new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')??''},body:bytes}).formData()
}

async function handle(request){
  const origin=allowedOrigin(request)
  if(request.method==='OPTIONS') return preflight(request)
  const {user,admin,id,spaceId}=await authenticate(request)
  const action=new URL(request.url).searchParams.get('action')
  if(request.method==='POST'&&action==='upload'){
    const size=Number(request.headers.get('content-length')||0)
    if(size>5*1024*1024) throw Object.assign(new Error('INVALID_PNG'),{pngReason:'REQUEST_SIZE'})
    const form=await boundedForm(request)
    const file=form.get('file'),mealId=form.get('meal_id'),share=form.get('is_shared')??'false'
    if(!(file instanceof Blob)||file.type!=='image/png'||file.size>4194304||
      !['true','false'].includes(share)||
      (mealId!==null&&(!uuid.test(String(mealId))||typeof mealId!=='string')))
      throw new Error('INVALID_REQUEST')
    if(mealId){
      const meal=await user.from('meals').select('id').eq('id',mealId).eq('user_id',id).single()
      if(meal.error||!meal.data) throw new Error('PHOTO_NOT_FOUND')
    }
    const bytes=new Uint8Array(await file.arrayBuffer())
    const meta=await validateSanitizedPng(bytes)
    const begun=await admin.rpc('begin_photo_upload',{p_owner:id,p_space:spaceId,p_sha256:meta.sha256,
      p_width:meta.width,p_height:meta.height,p_bytes:meta.bytes,p_meal_id:mealId||null,p_shared:share==='true'})
    if(begun.error||!begun.data) throw new Error('PHOTO_ALREADY_USED')
    const asset=begun.data
    if(asset.uploading){
      const uploaded=await admin.storage.from(bucket).upload(asset.storage_path,bytes,{contentType:'image/png',upsert:false,cacheControl:'0'})
      if(uploaded.error){
        // Keep the reservation: uncertain Storage outcomes remain owner-visible and deletable.
        await admin.rpc('begin_photo_delete',{p_id:asset.id,p_owner:id,p_space:spaceId})
        throw new Error('PHOTO_STORAGE_FAILED')
      }
      const completed=await admin.rpc('complete_photo_upload',{p_id:asset.id,p_owner:id,p_space:spaceId})
      if(completed.error) throw new Error('PHOTO_DB_FAILED')
    }
    return json(200,{photo_id:asset.id,mime:meta.mime,width:meta.width,height:meta.height,bytes:meta.bytes},origin)
  }
  const photoId=new URL(request.url).searchParams.get('photo_id')
  if(!uuid.test(photoId??'')) throw new Error('INVALID_REQUEST')
  if(request.method==='GET'&&action==='download'){
    // The user-scoped query rechecks RLS on every request, including after share revocation.
    const row=await user.from('photo_assets').select('storage_path,mime').eq('id',photoId).eq('deleting',false).eq('uploading',false).maybeSingle()
    if(row.error||!row.data) throw new Error('PHOTO_NOT_FOUND')
    const object=await admin.storage.from(bucket).download(row.data.storage_path)
    if(object.error||!object.data) throw new Error('PHOTO_STORAGE_FAILED')
    const stillAllowed=await user.from('photo_assets').select('id').eq('id',photoId).eq('deleting',false).eq('uploading',false).maybeSingle()
    if(stillAllowed.error||!stillAllowed.data) throw new Error('PHOTO_NOT_FOUND')
    return new Response(object.data,{status:200,headers:{'content-type':'image/png','cache-control':'private, no-store, max-age=0',
      'x-content-type-options':'nosniff',...(origin?{'access-control-allow-origin':origin,'vary':'Origin'}:{})}})
  }
  if(request.method==='DELETE'&&action==='delete'){
    const begun=await admin.rpc('begin_photo_delete',{p_id:photoId,p_owner:id,p_space:spaceId})
    if(begun.error||!begun.data) throw new Error('PHOTO_NOT_FOUND')
    const removed=await admin.storage.from(bucket).remove([begun.data])
    if(removed.error) throw new Error('PHOTO_STORAGE_FAILED')
    const deleted=await admin.rpc('unlink_photo_asset',{p_id:photoId})
    if(deleted.error) throw new Error('PHOTO_DB_FAILED')
    return json(200,{deleted:true},origin)
  }
  throw new Error('INVALID_REQUEST')
}

Deno.serve(async request=>{
  let origin=null
  try{origin=allowedOrigin(request);return await handle(request)}
  catch(error){
    if(error instanceof Error&&error.message==='INVALID_PNG') console.warn(JSON.stringify({
      event:'photo_png_rejected',revision:'2026-10-15-sbit',
      reason:pngFailureReasons.includes(error.pngReason)?error.pngReason:'UNKNOWN',
    }))
    return safeError(error,origin)
  }
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { browserOrigin, launchBrowser } from '../scripts/test-helpers/browser.mjs'
import { report, runCase } from '../scripts/test-helpers/report.mjs'

const ids=['PNG_BINARY_DOWNLOAD','PHOTO_DENIED_CODE']
const cases=[],details=[],check=(id,fn)=>runCase(cases,details,id,fn)
const fixture=await readFile(new URL('./fixtures/food-example-compact.png',import.meta.url))
let browser
try {
  browser=await launchBrowser()
  const context=await browser.newContext()
  await context.route('**/src/main.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:'export {}'}))
  let denied=false,authorized=false
  await context.route('**/functions/v1/health-photo?*',route=>{
    const request=route.request()
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'authorization,apikey'}})
    authorized=request.headers().authorization==='Bearer synthetic-token' && Boolean(request.headers().apikey)
    return route.fulfill({status:denied?403:200,contentType:denied?'application/json':'image/png',headers:{'access-control-allow-origin':'*'},body:denied?'{"error":"PHOTO_NOT_FOUND"}':fixture})
  })
  const page=await context.newPage()
  await page.goto(browserOrigin())
  await check('PNG_BINARY_DOWNLOAD',async()=>{
    const result=await page.evaluate(async()=>{
      const {api}=await import('/src/api.js')
      const blob=await api.withAuthToken('synthetic-token',()=>api.downloadPhoto('11111111-1111-4111-8111-111111111111'))
      return {isBlob:blob instanceof Blob,type:blob.type,size:blob.size}
    })
    assert.equal(authorized,true)
    assert.deepEqual(result,{isBlob:true,type:'image/png',size:fixture.length})
  })
  await check('PHOTO_DENIED_CODE',async()=>{
    denied=true
    const code=await page.evaluate(async()=>{
      const {api}=await import('/src/api.js')
      try{await api.withAuthToken('synthetic-token',()=>api.downloadPhoto('11111111-1111-4111-8111-111111111111'))}
      catch(error){return error.code}
      return null
    })
    assert.equal(code,'PHOTO_NOT_FOUND')
  })
  await context.close()
} catch(error) {
  if(process.env.TEST_DEBUG_PHOTO_DOWNLOAD==='1')process.stderr.write(`${error?.stack || error}\n`)
  if(!cases.some(item=>item.status==='failed')){cases.push({id:'PHOTO_DOWNLOAD_SETUP',status:'failed'});details.push({id:'PHOTO_DOWNLOAD_SETUP',error})}
} finally {
  await browser?.close()
  for(const id of ids)if(!cases.some(item=>item.id===id))cases.push({id,status:'notrun'})
  await report('frontend-photo-download','synthetic-private-png-transport',cases,details)
}

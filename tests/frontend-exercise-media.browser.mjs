import assert from 'node:assert/strict'
import { mockApiModule } from './browser-fixture.js'
import { exercises } from '../shared/exercises.js'
import { browserOrigin, launchBrowser } from '../scripts/test-helpers/browser.mjs'
import { report, runCase } from '../scripts/test-helpers/report.mjs'

const ids=['MEDIA_LAZY','MEDIA_FAILURE','MEDIA_GIFS','MEDIA_VIDEOS','MEDIA_TRAINING']
const cases=[],details=[],check=(id,fn)=>runCase(cases,details,id,fn)
const gif=Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=','base64')
let browser
try{
  browser=await launchBrowser()
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true})
  await context.route('**/src/api.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:mockApiModule()}))
  let requests=0,fail=false
  await context.route('https://static.exercisedb.dev/media/*.gif',route=>{
    requests++
    return fail ? route.abort('failed') : route.fulfill({status:200,contentType:'image/gif',body:gif})
  })
  const page=await context.newPage()
  await page.goto(browserOrigin())
  await page.locator('[data-form="signin"] [name="slot"][value="me"]').check()
  await page.getByLabel('密码',{exact:true}).fill('Synthetic-only-password')
  await page.getByRole('button',{name:'登录',exact:true}).click()
  await page.getByRole('button',{name:'训练',exact:true}).click()
  const slot=id=>page.locator(`[data-demo-slot="${id}"]`)
  await check(ids[0],async()=>{
    assert.equal(requests,0)
    assert.equal(await page.locator('.exercise-gif,object').count(),0)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  })
  await check(ids[1],async()=>{
    fail=true
    const row=slot('machine_seated_row')
    await row.getByRole('button',{name:'查看动作示范'}).click()
    await row.getByText('动作示范加载失败，请重试；也可查看原视频示范。').waitFor()
    assert.equal(await row.locator('img').count(),0)
    assert.equal(await row.locator('..').getByRole('link',{name:'原视频备用入口'}).getAttribute('href'),exercises.find(x=>x.id==='machine_seated_row').demo.url)
    fail=false
    await row.getByRole('button',{name:'重试动作示范'}).click()
    await page.waitForFunction(()=>document.querySelector('[data-demo-slot="machine_seated_row"] img')?.naturalWidth>0)
    await row.getByRole('button',{name:'收起动作示范'}).click()
  })
  await check(ids[2],async()=>{
    for(const exercise of exercises.filter(x=>x.demo.mediaType==='external_gif')){
      const current=slot(exercise.id)
      await current.getByRole('button',{name:'查看动作示范'}).click()
      await page.waitForFunction(id=>document.querySelector(`[data-demo-slot="${id}"] img`)?.naturalWidth>0,exercise.id)
      const image=current.locator('img.exercise-gif')
      assert.equal(await image.getAttribute('src'),exercise.demo.gifUrl)
      assert.deepEqual(await image.evaluate(node=>[getComputedStyle(node).width,getComputedStyle(node).height,getComputedStyle(node).objectFit]),['180px','180px','contain'])
      assert.equal(await current.getByRole('button',{name:'暂停'}).count(),0)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
      await current.getByRole('button',{name:'收起动作示范'}).click()
      assert.equal(await current.locator('img').count(),0)
    }
    assert.ok(requests>=4)
  })
  await check(ids[3],async()=>{
    for(const exercise of exercises.filter(x=>x.demo.mediaType==='source_video')){
      const current=slot(exercise.id)
      assert.equal(await current.getByRole('link',{name:'查看原视频示范'}).getAttribute('href'),exercise.demo.url)
      assert.equal(await current.locator('img,object').count(),0)
    }
  })
  await check(ids[4],async()=>{
    await page.evaluate(()=>window.__synthetic.seedTodayPlan())
    await page.getByRole('button',{name:'刷新数据'}).click()
    await page.getByRole('button',{name:'开始本次训练'}).click()
    await page.getByText('训练已开始；请记录实际完成的每一组',{exact:true}).waitFor()
  })
  await context.close()
}catch(error){
  if(!cases.some(item=>item.status==='failed')){cases.push({id:'MEDIA_SETUP',status:'failed'});details.push({id:'MEDIA_SETUP',error})}
}finally{
  await browser?.close()
  for(const id of ids)if(!cases.some(item=>item.id===id))cases.push({id,status:'notrun'})
  await report('frontend-exercise-media','synthetic-mobile-gif-and-video-controls',cases,details)
}

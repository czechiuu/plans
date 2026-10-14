import assert from 'node:assert/strict'
import { mockApiModule } from './browser-fixture.js'
import { browserOrigin, launchBrowser } from '../scripts/test-helpers/browser.mjs'
import { report, runCase } from '../scripts/test-helpers/report.mjs'

const ids=['LINKED_PHOTO_TWO_LOCATIONS','DEEPSEEK_PHOTO_CONSENT_LABEL','CLOUD_NEXT_TRAINING_SELECTORS']
const cases=[],details=[],check=(id,fn)=>runCase(cases,details,id,fn)
let browser
try {
  browser=await launchBrowser()
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true})
  await context.route('**/src/api.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:mockApiModule()}))
  const page=await context.newPage()
  await page.goto(browserOrigin())
  await page.getByLabel('密码',{exact:true}).fill('Synthetic-only-password')
  await page.getByRole('button',{name:'登录',exact:true}).click()
  await page.getByRole('heading',{name:'记录当下，再看下一步'}).waitFor()
  await page.getByRole('button',{name:'饮食',exact:true}).click()
  await check('LINKED_PHOTO_TWO_LOCATIONS',async()=>{
    const form=page.locator('[data-form="meal"]')
    await form.locator('[data-meal-item] [name="name"]').fill('合成水果')
    await form.locator('[data-meal-item] [name="portion"]').fill('1份')
    await form.locator('[data-meal-item] [name="unit"]').fill('份')
    await form.locator('[name="status"]').selectOption('confirmed')
    await form.getByRole('button',{name:'保存餐食'}).click()
    await page.getByText('餐食已保存',{exact:true}).waitFor()
    const {mealId,photoId}=await page.evaluate(()=>{const mealId=window.__synthetic.mealRows()[0].id;return {mealId,photoId:window.__synthetic.seedLinkedPhoto(mealId)}})
    await page.locator('[data-action="refresh"]').first().click()
    const photo=await page.evaluate(()=>window.__synthetic.photoRows()[0])
    assert.equal(photo.meal_id,mealId)
    assert.equal(photo.deleting,false)
    assert.equal(photo.uploading,false)
    assert.equal((await page.evaluate(()=>window.__synthetic.mealRows()[0])).data.photo_ids[0],photoId)
    assert.equal(await page.locator(`[data-action="view-photo"][data-id="${photoId}"]`).count(),2)
    assert.equal(await page.locator(`article.list-item [data-action="view-photo"][data-id="${photoId}"]`).count(),1)
    assert.equal(await page.locator(`aside [data-action="view-photo"][data-id="${photoId}"]`).count(),1)
  })
  await check('DEEPSEEK_PHOTO_CONSENT_LABEL',async()=>{
    await page.evaluate(()=>window.__synthetic.seedDeepSeekPhotoConsent())
    await page.locator('[data-action="refresh"]').first().click()
    const stats=page.locator('.stat-grid').first()
    assert.match(await stats.innerText(),/OpenAI.*未授权/)
    assert.match(await stats.innerText(),/DeepSeek.*已授权/)
  })
  await check('CLOUD_NEXT_TRAINING_SELECTORS',async()=>{
    await page.evaluate(()=>window.__synthetic.seedPartialTrainingPlan())
    await page.locator('[data-action="refresh"]').first().click()
    await page.getByRole('button',{name:'训练',exact:true}).click()
    await page.getByRole('button',{name:'播放本地动作示意'}).first().click()
    await page.waitForFunction(()=>document.querySelector('.demo-slot object')?.contentDocument?.querySelector('.a')?.getAnimations().length>0)
    await page.getByRole('button',{name:'开始本次训练'}).click()
    await page.getByText('训练已开始；请记录实际完成的每一组',{exact:true}).waitFor()
    const form=page.locator('[data-form="training-set"]')
    await form.locator('[name="exercise_id"]').selectOption('machine_leg_press')
    await form.locator('[name="reps"]').fill('8')
    await form.getByRole('button',{name:'保存这一组'}).click()
    await page.getByText('实际训练组已保存',{exact:true}).waitFor()
    await page.getByRole('button',{name:'暂停训练'}).click()
    await page.getByRole('button',{name:'继续训练'}).waitFor()
    await page.locator('[data-action="refresh"]').first().click()
    await page.getByRole('button',{name:'继续训练'}).click()
    await page.getByRole('button',{name:'暂停训练'}).waitFor()
    await page.getByRole('button',{name:'完成训练'}).click()
    await page.getByText('本次训练已按实际记录完成',{exact:true}).waitFor()
    await page.getByText('部分完成',{exact:false}).waitFor()
    await page.getByText('1 组实际记录',{exact:false}).waitFor()
  })
  await context.close()
} catch(error) {
  if(process.env.TEST_DEBUG_PHOTO==='1')process.stderr.write(`${error?.stack || error}\n`)
  if(!cases.some(item=>item.status==='failed')){cases.push({id:'PHOTO_SETUP',status:'failed'});details.push({id:'PHOTO_SETUP',error})}
} finally {
  await browser?.close()
  for(const id of ids)if(!cases.some(item=>item.id===id))cases.push({id,status:'notrun'})
  await report('frontend-photo','synthetic-linked-photo-and-provider-label',cases,details)
}

import assert from 'node:assert/strict'
import { mockApiModule } from './browser-fixture.js'
import { browserOrigin, launchBrowser } from '../scripts/test-helpers/browser.mjs'
import { report, runCase } from '../scripts/test-helpers/report.mjs'

const ids=['DEEPSEEK_FOUR_CONSENTS','UNSAVED_CONSENT_DRAFT']
const cases=[], details=[], check=(id,fn)=>runCase(cases,details,id,fn)
let browser
try {
  browser=await launchBrowser()
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true})
  await context.route('**/src/api.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:mockApiModule()}))
  const page=await context.newPage(), pageErrors=[]
  page.on('pageerror',error=>pageErrors.push(error.message))
  await page.goto(browserOrigin())
  await page.evaluate(()=>window.__synthetic.enableDeepSeek())
  await page.getByLabel('密码',{exact:true}).fill('Synthetic-only-password')
  await page.getByRole('button',{name:'登录',exact:true}).click()
  await page.getByRole('heading',{name:'记录当下，再看下一步'}).waitFor()
  await page.getByRole('button',{name:'设置',exact:true}).click()
  const card=purpose=>page.locator(`form[data-form="ai-consent"][data-provider="deepseek"][data-purpose="${purpose}"]`)
  const save=async purpose=>{
    await card(purpose).locator('[name="enabled"]').check()
    await card(purpose).locator('[name="monthly_limit_cents"]').fill('2')
    await card(purpose).getByRole('button',{name:'保存这一项授权'}).click()
    await page.getByText('授权设置已保存',{exact:true}).waitFor()
  }
  await check('DEEPSEEK_FOUR_CONSENTS',async()=>{
    const purposes=['parse_schedule','generate_plan','estimate_meal_photo','adjust_plan']
    for(const purpose of purposes) await save(purpose)
    const calls=await page.evaluate(()=>window.__synthetic.consentCalls)
    assert.deepEqual(calls,purposes.map(purpose=>({provider:'deepseek',purpose,enabled:true,limit:2,version:'2026-10-13-deepseek-health-v1'})))
    const rows=await page.evaluate(()=>window.__synthetic.consentRows())
    for(const purpose of purposes) assert.equal(rows.filter(row=>row.provider==='deepseek'&&row.purpose===purpose&&row.enabled&&row.monthly_limit_cents===2).length,1)
    await page.locator('[data-action="refresh"]').first().click()
    for(const purpose of purposes) {
      assert.equal(await card(purpose).locator('[name="enabled"]').isChecked(),true)
      assert.equal(await card(purpose).locator('[name="monthly_limit_cents"]').inputValue(),'2')
    }
    assert.deepEqual(pageErrors,[])
  })
  await check('UNSAVED_CONSENT_DRAFT',async()=>{
    const unsaved=card('estimate_meal_text')
    await unsaved.locator('[name="enabled"]').check()
    await unsaved.locator('[name="monthly_limit_cents"]').fill('3')
    await card('parse_schedule').locator('[name="monthly_limit_cents"]').fill('4')
    await card('parse_schedule').getByRole('button',{name:'保存这一项授权'}).click()
    await page.getByText('授权设置已保存',{exact:true}).waitFor()
    assert.equal(await unsaved.locator('[name="enabled"]').isChecked(),true)
    assert.equal(await unsaved.locator('[name="monthly_limit_cents"]').inputValue(),'3')
    assert.match(await unsaved.innerText(),/未保存/)
    assert.equal((await page.evaluate(()=>window.__synthetic.consentRows())).some(row=>row.provider==='deepseek'&&row.purpose==='estimate_meal_text'),false)
  })
  await context.close()
} catch(error) {
  if(process.env.TEST_DEBUG_CONSENT==='1')process.stderr.write(`${error?.stack || error}\n`)
  if(!cases.some(item=>item.status==='failed')) {cases.push({id:'CONSENT_SETUP',status:'failed'});details.push({id:'CONSENT_SETUP',error})}
} finally {
  await browser?.close()
  for(const id of ids)if(!cases.some(item=>item.id===id))cases.push({id,status:'notrun'})
  await report('frontend-consent','synthetic-deepseek-consent',cases,details)
}

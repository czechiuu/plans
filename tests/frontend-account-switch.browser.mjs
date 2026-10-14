import assert from 'node:assert/strict'
import { mockApiModule } from './browser-fixture.js'
import { browserOrigin, launchBrowser } from '../scripts/test-helpers/browser.mjs'

const browser=await launchBrowser()
try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true})
  await context.route('**/src/api.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:mockApiModule()}))
  const page=await context.newPage()
  await page.goto(browserOrigin())
  const signIn=async slot=>{
    await page.locator('[data-form="signin"] button:not([disabled])').waitFor()
    await page.locator(`[data-form="signin"] [name="slot"][value="${slot}"]`).check()
    await page.getByLabel('密码',{exact:true}).fill('Synthetic-only-password')
    await page.getByRole('button',{name:'登录',exact:true}).click()
    await page.getByRole('navigation',{name:'主导航'}).waitFor()
  }
  await signIn('w')
  assert.equal(await page.evaluate(()=>window.__synthetic.currentSlot()),'w')
  await page.getByRole('button',{name:'设置',exact:true}).click()
  await page.getByRole('button',{name:'退出此设备／切换账号',exact:true}).click()
  await page.getByRole('heading',{name:'欢迎回来'}).waitFor()
  await signIn('me')
  assert.equal(await page.evaluate(()=>window.__synthetic.currentSlot()),'me')
  await page.getByRole('button',{name:'趋势',exact:true}).click()
  await page.getByRole('button',{name:'刷新数据',exact:true}).click()
  await page.getByRole('navigation',{name:'主导航'}).waitFor()
  assert.equal(await page.evaluate(()=>window.__synthetic.currentSlot()),'me')
  process.stdout.write('合成账号切换与刷新：1 通过、0 失败。\n')
  await context.close()
}finally{await browser.close()}

import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { mockApiModule } from '../tests/browser-fixture.js'
import { shanghaiDate, addDays } from '../src/domain.js'
import { report, runCase } from './test-helpers/report.mjs'
import { browserOrigin, launchBrowser } from './test-helpers/browser.mjs'

const ids = ['UI_FIXED_LOGIN','UI_SCHEDULE','UI_WEIGHT_CONFLICT','UI_PRIVATE_SWITCH','UI_LATE_LOAD','UI_PASSWORD']
const cases=[], details=[]
const check=(id,fn)=>runCase(cases,details,id,fn)
const noOverflow=async page=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
let browser
try {
  browser=await launchBrowser()
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1,timezoneId:'America/Los_Angeles',reducedMotion:'reduce'})
  await context.route('**/src/api.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:mockApiModule()}))
  await context.addInitScript(()=>{
    addEventListener('DOMContentLoaded',()=>{
      const mark=document.createElement('div')
      mark.textContent='界面测试 · 合成资料 / 模拟接口'
      Object.assign(mark.style,{position:'fixed',top:'0',right:'0',zIndex:'999',background:'#772f20',color:'white',fontSize:'11px',padding:'4px 8px',pointerEvents:'none'})
      document.body.append(mark)
    })
  })
  const page=await context.newPage(), pageErrors=[]
  page.on('pageerror',error=>pageErrors.push(error.message))
  const login=async(slot,password='Synthetic-only-password')=>{
    await page.locator(`[data-form="signin"] [name="slot"][value="${slot}"]`).check()
    await page.getByLabel('密码',{exact:true}).fill(password)
    await page.getByRole('button',{name:'登录',exact:true}).click()
    await page.getByRole('heading',{name:'照顾自己，也看见彼此'}).waitFor()
  }
  const logout=async()=>{
    await page.getByRole('button',{name:'设置',exact:true}).click()
    await page.getByRole('button',{name:'退出此设备／切换账号',exact:true}).click()
    await page.getByRole('heading',{name:'欢迎回来'}).waitFor()
  }
  const day=addDays(shanghaiDate(),1)
  await check('UI_FIXED_LOGIN',async()=>{
    await page.goto(browserOrigin())
    await page.getByRole('heading',{name:'欢迎回来'}).waitFor()
    assert.equal(await page.getByLabel('邮箱').count(),0)
    assert.equal(await page.getByRole('button',{name:'创建账号'}).count(),0)
    await page.getByLabel('密码',{exact:true}).fill('wrong-password')
    await page.getByRole('button',{name:'登录',exact:true}).click()
    await page.getByRole('alert').waitFor()
    await login('me')
    await noOverflow(page)
  })
  await check('UI_SCHEDULE',async()=>{
    await page.getByRole('button',{name:'日程',exact:true}).click()
    const form=page.locator('[data-form="schedule"]')
    await form.locator('[name="record_date"]').fill(day)
    await form.locator('[name="raw_text"]').fill('合成测试：甲的私有日程')
    await form.locator('[name="start_time"]').fill('19:00')
    await form.locator('[name="end_time"]').fill('20:00')
    assert.equal(await form.locator('[name="is_shared"]').isChecked(),false)
    await form.getByRole('button',{name:'保存日程',exact:true}).click()
    await page.getByText('日程已保存',{exact:true}).waitFor()
    await page.getByRole('button',{name:'今日',exact:true}).click()
    await page.getByText('合成测试：甲的私有日程',{exact:true}).waitFor()
    await noOverflow(page)
    await page.screenshot({path:fileURLToPath(new URL('../test-results/mobile-dashboard-synthetic.png',import.meta.url)),fullPage:true})
  })
  await check('UI_WEIGHT_CONFLICT',async()=>{
    await page.getByRole('button',{name:'体重',exact:true}).click()
    let form=page.locator('[data-form="weight"]')
    await form.locator('[name="record_date"]').fill(shanghaiDate())
    await form.locator('[name="weight_kg"]').fill('70.2')
    await form.getByRole('button',{name:'保存体重',exact:true}).click()
    await page.getByText('体重已保存',{exact:true}).waitFor()
    await page.locator('[data-action="edit-weight"]').click()
    form=page.locator('[data-form="weight"]')
    await form.locator('[name="notes"]').fill('conflict-test')
    await form.getByRole('button',{name:'保存修改',exact:true}).click()
    await page.getByRole('alert').filter({hasText:'已在其他设备更新'}).waitFor()
    await noOverflow(page)
  })
  await check('UI_PRIVATE_SWITCH',async()=>{
    await page.getByRole('button',{name:'设置',exact:true}).click()
    for(const key of ['share_profile','share_schedule','share_weight','allow_partner_edit'])
      assert.equal(await page.locator(`[data-form="settings"] [name="${key}"]`).isChecked(),false)
    await page.locator('#profile-import').setInputFiles({name:'synthetic-profile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({age:31,health_notes:'SYNTHETIC PRIVATE ME',user_id:'ignored',is_shared:true}))})
    await page.getByText('已填入导入内容，请逐项确认后保存。',{exact:true}).waitFor()
    assert.equal(await page.locator('[data-form="profile"] [name="is_shared"]').isChecked(),false)
    await page.locator('[data-form="profile"]').getByRole('button',{name:'保存档案',exact:true}).click()
    await page.getByText('档案已保存',{exact:true}).waitFor()
    await logout()
    await login('w')
    await page.getByRole('button',{name:'设置',exact:true}).click()
    assert.equal(await page.getByText('SYNTHETIC PRIVATE ME',{exact:true}).count(),0)
    await page.getByRole('button',{name:'日程',exact:true}).click()
    await page.locator('#schedule-date').fill(day)
    assert.equal(await page.getByText('合成测试：甲的私有日程',{exact:true}).count(),0)
    await logout()
    await login('me')
    await page.getByRole('button',{name:'设置',exact:true}).click()
    await page.getByText('SYNTHETIC PRIVATE ME',{exact:true}).waitFor()
  })
  await check('UI_LATE_LOAD',async()=>{
    await page.evaluate(()=>window.__synthetic.holdNextLoad())
    await page.locator('[data-action="refresh"]').click()
    await page.waitForFunction(()=>window.__synthetic.isHeld())
    await page.getByRole('button',{name:'退出此设备／切换账号',exact:true}).click()
    await page.getByRole('heading',{name:'欢迎回来'}).waitFor()
    await page.evaluate(()=>window.__synthetic.releaseLoad())
    await login('w')
    await page.getByRole('button',{name:'设置',exact:true}).click()
    assert.equal(await page.getByText('SYNTHETIC PRIVATE ME',{exact:true}).count(),0)
    assert.deepEqual(pageErrors,[])
  })
  await check('UI_PASSWORD',async()=>{
    const form=page.locator('[data-form="password"]')
    await form.locator('[name="current_password"]').fill('Synthetic-only-password')
    await form.locator('[name="new_password"]').fill('New-synthetic-password')
    await form.locator('[name="confirm_password"]').fill('mismatch-password')
    await form.getByRole('button',{name:'保存新密码并退出此设备'}).click()
    await page.getByRole('alert').filter({hasText:'不一致'}).waitFor()
    assert.equal(await page.evaluate(()=>window.__synthetic.passwordCalls),0)
    await form.locator('[name="new_password"]').fill('New-synthetic-password')
    await form.locator('[name="confirm_password"]').fill('New-synthetic-password')
    await form.locator('[name="current_password"]').fill('wrong-password')
    await form.getByRole('button',{name:'保存新密码并退出此设备'}).click()
    await page.getByRole('alert').filter({hasText:'当前密码不正确'}).waitFor()
    assert.equal(await page.evaluate(()=>window.__synthetic.passwordCalls),1)
    await form.locator('[name="new_password"]').fill('New-synthetic-password')
    await form.locator('[name="confirm_password"]').fill('New-synthetic-password')
    await form.locator('[name="current_password"]').fill('Synthetic-only-password')
    await form.getByRole('button',{name:'保存新密码并退出此设备'}).click()
    await page.getByRole('heading',{name:'欢迎回来'}).waitFor()
    await login('w','New-synthetic-password')
    await noOverflow(page)
    assert.deepEqual(pageErrors,[])
  })
  await context.close()
} catch(error) {
  if (!cases.some(item=>item.status==='failed')) {cases.push({id:'UI_SETUP',status:'failed'});details.push({id:'UI_SETUP',error})}
} finally {
  await browser?.close()
  for(const id of ids) if(!cases.some(item=>item.id===id)) cases.push({id,status:'notrun'})
  await report('ui-mock','two-fixed-accounts-synthetic-ui',cases,details)
}

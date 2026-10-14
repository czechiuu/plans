import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { mockApiModule } from './browser-fixture.js'
import { shanghaiDate } from '../src/domain.js'
import { browserOrigin, launchBrowser } from '../scripts/test-helpers/browser.mjs'
import { report, runCase } from '../scripts/test-helpers/report.mjs'

const ids=['WEIGHT_HOME_SHORTCUT','WEIGHT_SAVE_REFRESH','WEIGHT_TREND_SHORTCUT']
const cases=[],details=[],check=(id,fn)=>runCase(cases,details,id,fn)
const noOverflow=async page=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
let browser
try{
  browser=await launchBrowser()
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,
    timezoneId:'America/Los_Angeles'})
  await context.route('**/src/api.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:mockApiModule()}))
  await context.addInitScript(()=>addEventListener('DOMContentLoaded',()=>{
    const mark=document.createElement('div')
    mark.textContent='界面测试 · 合成资料 / 模拟接口'
    Object.assign(mark.style,{position:'fixed',top:'0',right:'0',zIndex:'999',background:'#772f20',color:'white',fontSize:'11px',padding:'4px 8px',pointerEvents:'none'})
    document.body.append(mark)
  }))
  const page=await context.newPage()
  await page.goto(browserOrigin())
  await page.getByLabel('密码',{exact:true}).fill('Synthetic-only-password')
  await page.getByRole('button',{name:'登录',exact:true}).click()
  await page.getByRole('navigation',{name:'主导航'}).waitFor()
  await check(ids[0],async()=>{
    await page.locator('.today-actions').getByRole('button',{name:'记录体重',exact:true}).click()
    const form=page.locator('[data-form="weight"]')
    await form.waitFor()
    assert.equal(await form.locator('[name="record_date"]').inputValue(),shanghaiDate())
    assert.equal(await form.locator('[name="weight_kg"]').inputValue(),'')
    assert.equal(await form.locator('[name="measured_at"]').inputValue(),'')
    assert.equal(await form.locator('[name="waist_cm"]').inputValue(),'')
    assert.equal(await form.locator('[name="is_shared"]').isChecked(),false)
    assert.equal(await form.locator('[name="weight_kg"]').evaluate(node=>document.activeElement===node),true)
    await noOverflow(page)
  })
  await check(ids[1],async()=>{
    const form=page.locator('[data-form="weight"]')
    await form.locator('[name="weight_kg"]').fill('71.4')
    await form.getByRole('button',{name:'保存体重',exact:true}).click()
    await page.getByText('体重已保存',{exact:true}).waitFor()
    await page.getByRole('img',{name:'1条真实体重记录的趋势'}).waitFor()
    await page.getByText('71.4 kg',{exact:false}).first().waitFor()
    await page.getByRole('button',{name:'刷新数据',exact:true}).click()
    await page.getByRole('img',{name:'1条真实体重记录的趋势'}).waitFor()
    assert.equal(await page.locator('.list-item').filter({hasText:'71.4 kg'}).count(),1)
    await noOverflow(page)
    await page.evaluate(()=>scrollTo(0,0))
    await page.screenshot({path:fileURLToPath(new URL('../test-results/frontend-weight-shortcut-synthetic.png',import.meta.url)),fullPage:true})
  })
  await check(ids[2],async()=>{
    const placement=await page.evaluate(()=>{
      scrollTo(0,0)
      const buttons=[...document.querySelectorAll('main [data-action="record-weight"]')]
      const weekly=[...document.querySelectorAll('main h2')].find(node=>node.textContent==='周变化')
      const box=buttons[0]?.getBoundingClientRect()
      return {count:buttons.length,before:!!weekly && !!(buttons[0].compareDocumentPosition(weekly)&Node.DOCUMENT_POSITION_FOLLOWING),top:box?.top,bottom:box?.bottom,height:innerHeight}
    })
    assert.equal(placement.count,1)
    assert.equal(placement.before,true)
    assert.ok(placement.top>=0 && placement.bottom<=placement.height)
    await page.locator('[data-action="edit-weight"]').click()
    await page.locator('[data-form="weight"]').getByRole('button',{name:'保存修改'}).waitFor()
    await page.getByRole('button',{name:'记录体重',exact:true}).click()
    await page.locator('[data-form="weight"]').getByRole('button',{name:'保存体重'}).waitFor()
    await page.getByRole('button',{name:'伴侣',exact:true}).click()
    await page.getByRole('button',{name:'记录体重',exact:true}).click()
    const form=page.locator('[data-form="weight"]')
    assert.equal(await form.locator('[name="record_date"]').inputValue(),shanghaiDate())
    assert.equal(await form.locator('[name="weight_kg"]').inputValue(),'')
    assert.equal(await form.locator('[name="is_shared"]').isChecked(),false)
    assert.equal(await form.locator('[name="weight_kg"]').evaluate(node=>document.activeElement===node),true)
    await page.setViewportSize({width:375,height:812})
    await noOverflow(page)
    const unavailable=await browser.newContext({viewport:{width:375,height:812},isMobile:true})
    try{
      await unavailable.route('**/src/api.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:mockApiModule().replace('healthAvailable:true','healthAvailable:false')}))
      const legacy=await unavailable.newPage()
      await legacy.goto(browserOrigin())
      await legacy.getByLabel('密码',{exact:true}).fill('Synthetic-only-password')
      await legacy.getByRole('button',{name:'登录',exact:true}).click()
      await legacy.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'趋势'}).click()
      assert.equal(await legacy.getByRole('heading',{name:'周变化',exact:true}).count(),0)
      await legacy.locator('main [data-action="record-weight"]').click()
      await legacy.locator('[data-form="weight"]').waitFor()
      await noOverflow(legacy)
    }finally{await unavailable.close()}
  })
  await context.close()
}catch(error){
  if(!cases.some(item=>item.status==='failed')){cases.push({id:'WEIGHT_SETUP',status:'failed'});details.push({id:'WEIGHT_SETUP',error})}
}finally{
  await browser?.close()
  for(const id of ids)if(!cases.some(item=>item.id===id))cases.push({id,status:'notrun'})
  await report('frontend-weight-shortcut','synthetic-mobile-private-weight-entry',cases,details)
}

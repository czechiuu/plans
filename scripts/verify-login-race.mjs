import test from 'node:test'
import assert from 'node:assert/strict'
import { launchBrowser } from './test-helpers/browser.mjs'
import { login } from './test-helpers/browser-login.mjs'

test('delayed logout rerender cannot clear the next login submission',async()=>{
  const browser=await launchBrowser()
  try {
    const page=await browser.newPage()
    await page.setContent(`<main id="app"></main><script>
      const app=document.querySelector('#app')
      const render=busy=>{app.innerHTML='<h1>欢迎回来</h1><form data-form="signin"><label><input name="slot" type="radio" value="me" checked>我</label><label><input name="slot" type="radio" value="w">W</label><label>密码<input name="password" type="password" required></label><button '+(busy?'disabled':'')+'>登录</button></form>';app.querySelector('form').onsubmit=e=>{e.preventDefault();window.submitted={slot:new FormData(e.target).get('slot'),password:new FormData(e.target).get('password')};app.innerHTML='<h2>照顾自己，也看见彼此</h2>'}}
      window.startLogout=()=>render(true)
      window.finishLogout=()=>render(false)
      render(true)
    </script>`)
    await page.getByRole('heading',{name:'欢迎回来'}).waitFor()
    await page.locator('[name="slot"][value="w"]').check()
    await page.getByLabel('密码',{exact:true}).fill('synthetic-test-value')
    await page.evaluate(()=>window.finishLogout())
    assert.equal(await page.locator('[name="slot"][value="me"]').isChecked(),true)
    assert.equal(await page.getByLabel('密码',{exact:true}).inputValue(),'')
    await page.evaluate(()=>window.startLogout())
    const pending=login(page,'w','synthetic-test-value')
    await page.locator('button:disabled').waitFor()
    await page.evaluate(()=>window.finishLogout())
    await pending
    assert.deepEqual(await page.evaluate(()=>window.submitted),{slot:'w',password:'synthetic-test-value'})
  } finally { await browser.close() }
})


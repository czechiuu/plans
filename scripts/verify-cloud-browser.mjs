import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import { report, blocked, runCase } from './test-helpers/report.mjs'
import { cloudSetup, client, ok } from './test-helpers/cloud.mjs'
import { launchBrowser } from './test-helpers/browser.mjs'
import { addDays, shanghaiDate } from '../src/domain.js'

const ids = ['E2E_CONFIG','E2E_REAL_BUILD','E2E_ACCOUNTS','E2E_PERSISTENCE','E2E_PARTNER','E2E_EXPORT','E2E_REOPEN']
const manual = ['SIGNUP_CONFIRMATION_EMAIL','PASSWORD_RECOVERY_EMAIL','PASSWORD_RESET_NEW_PASSWORD','TWO_PHYSICAL_DEVICES','INVITE_EXPIRY','BACKEND_PHYSICAL_DELETION']
const cases = [], details = []
let setup
try { setup = cloudSetup(['E2E_BASE_URL']) } catch(error) { setup = { blocked:true, reason:String(error) } }
if (!setup.blocked) {
  try {
    const url = new URL(process.env.E2E_BASE_URL)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('Use HTTPS deployed site or local production preview')
    if (url.port === '5173' || url.search || url.hash) throw new Error('Use production build URL, not Vite dev server')
    setup.pageUrl = url.href
  } catch(error) { setup = { blocked:true, reason:String(error) } }
}
await mkdir(new URL('../test-results/',import.meta.url),{recursive:true})
try {
  await writeFile(new URL('../test-results/cloud-manual-gates.json',import.meta.url),JSON.stringify({scope:'manual-real-account-and-device-evidence',passed:0,failed:0,blocked:manual.length,notrun:0,cases:blocked(manual)},null,2)+'\n',{flag:'wx'})
} catch(error) { if(error.code!=='EEXIST') throw error }
if (setup.blocked) {
  process.stderr.write(`云端浏览器未运行：${setup.reason}\n`)
  await report('cloud-browser','real-build-real-supabase-browser',blocked(ids),[{id:'CONFIG',error:setup.reason}])
} else {
  const api = [client(setup.url,setup.key),client(setup.url,setup.key)]
  let cleanAccountsVerified = false
  let browser, contextA, contextB
  try {
    browser = await launchBrowser()
    contextA = await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1})
    contextB = await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1})
    let pageA = await contextA.newPage(), pageB = await contextB.newPage()
    const assets = []
    pageA.on('request',request => assets.push(request.url()))
    pageB.on('request',request => assets.push(request.url()))
    await runCase(cases,details,'E2E_CONFIG',async()=>{
      assert.ok(setup.pageUrl)
      assert.equal(new Set(setup.emails).size,3)
    })
    await runCase(cases,details,'E2E_REAL_BUILD',async()=>{
      const response = await pageA.goto(setup.pageUrl)
      assert.ok(response?.ok())
      const moduleSrc = await pageA.locator('script[type="module"][src]').first().getAttribute('src')
      assert.match(moduleSrc,/(^|\/)assets\/[^/]+\.js$/)
      assert.ok(assets.some(url=>/\/assets\/[^/]+\.js$/.test(new URL(url).pathname)))
      assert.equal(assets.some(url=>url.includes('/@vite/client')||url.includes('/src/main.js')),false)
      await pageA.getByRole('heading',{name:'欢迎回来'}).waitFor()
    })
    await runCase(cases,details,'E2E_ACCOUNTS',async()=>{
      const users=[]
      for(let i=0;i<2;i++){
        const result=await ok(api[i].auth.signInWithPassword({email:setup.emails[i],password:setup.passwords[i]}))
        users.push(result.user.id)
        assert.equal((await ok(api[i].from('members').select('space_id').eq('user_id',result.user.id))).length,0,'Use empty dedicated accounts')
        await api[i].auth.signOut()
      }
      assert.equal(new Set(users).size,2)
      cleanAccountsVerified = true
    })
    const login = async(page,index) => {
      await page.getByLabel('邮箱',{exact:true}).fill(setup.emails[index])
      await page.getByLabel('密码',{exact:true}).fill(setup.passwords[index])
      await page.getByRole('button',{name:'登录',exact:true}).click()
      await page.getByRole('heading',{name:'从这里开始'}).waitFor()
    }
    const text = `SYNTHETIC E2E ${Date.now()}`
    const partnerText = `SYNTHETIC PARTNER ${Date.now()}`
    const day = addDays(shanghaiDate(),1)
    await runCase(cases,details,'E2E_PERSISTENCE',async()=>{
      await login(pageA,0)
      const backendHosts=[...new Set(assets.map(value=>new URL(value).hostname).filter(host=>host.endsWith('.supabase.co')))]
      assert.deepEqual(backendHosts,[new URL(setup.url).hostname],'Site must call the configured test project')
      await pageA.getByLabel('空间名称').fill('SYNTHETIC E2E SPACE')
      await pageA.getByLabel('你的昵称').fill('SYNTHETIC A')
      await pageA.getByRole('button',{name:'创建私人空间'}).click()
      await pageA.getByRole('heading',{name:'照顾自己，也看见彼此'}).waitFor()
      await pageA.getByRole('button',{name:'日程',exact:true}).click()
      const form=pageA.locator('[data-form="schedule"]')
      await form.locator('[name="record_date"]').fill(day)
      await form.locator('[name="raw_text"]').fill(text)
      await form.locator('[name="start_time"]').fill('19:00')
      await form.locator('[name="end_time"]').fill('20:00')
      await form.locator('[name="is_shared"]').check()
      await form.getByRole('button',{name:'保存日程'}).click()
      await pageA.getByText('日程已保存',{exact:true}).waitFor()
      await pageA.reload()
      await pageA.getByRole('button',{name:'日程',exact:true}).click()
      await pageA.locator('#schedule-date').fill(day)
      await pageA.getByText(text,{exact:true}).waitFor()
    })
    await runCase(cases,details,'E2E_PARTNER',async()=>{
      await pageA.getByRole('button',{name:'设置',exact:true}).click()
      await pageA.locator('[data-form="settings"] [name="share_schedule"]').check()
      await pageA.locator('[data-form="settings"]').getByRole('button',{name:'保存共享设置'}).click()
      await pageA.getByText('共享设置已保存',{exact:true}).waitFor()
      await pageA.locator('[data-action="invite"]').click()
      const invite=await pageA.locator('.code-box').innerText()
      await pageB.goto(setup.pageUrl); await login(pageB,1)
      await pageB.locator('[data-action="space-join"]').click()
      await pageB.getByLabel('邀请令牌').fill(invite)
      await pageB.getByLabel('你的昵称').fill('SYNTHETIC B')
      await pageB.getByRole('button',{name:'加入私人空间'}).click()
      await pageB.getByRole('heading',{name:'照顾自己，也看见彼此'}).waitFor()
      await pageB.getByRole('button',{name:'日程',exact:true}).click()
      await pageB.locator('#schedule-date').fill(day)
      await pageB.locator('[data-action="scope"][data-scope="partner"]').first().click()
      await pageB.getByText(text,{exact:true}).waitFor()
      await pageB.locator('[data-action="scope"][data-scope="mine"]').first().click()
      const partnerForm=pageB.locator('[data-form="schedule"]')
      await partnerForm.locator('[name="record_date"]').fill(day)
      await partnerForm.locator('[name="raw_text"]').fill(partnerText)
      await partnerForm.locator('[name="is_shared"]').check()
      await partnerForm.getByRole('button',{name:'保存日程'}).click()
      await pageB.getByText('日程已保存',{exact:true}).waitFor()
      await pageB.getByRole('button',{name:'设置',exact:true}).click()
      await pageB.locator('[data-form="settings"] [name="share_schedule"]').check()
      await pageB.locator('[data-form="settings"]').getByRole('button',{name:'保存共享设置'}).click()
      await pageB.getByText('共享设置已保存',{exact:true}).waitFor()
      await pageA.locator('[data-action="refresh"]').click()
      await pageA.getByRole('button',{name:'日程',exact:true}).click()
      await pageA.locator('#schedule-date').fill(day)
      await pageA.locator('[data-action="scope"][data-scope="partner"]').first().click()
      await pageA.getByText(partnerText,{exact:true}).waitFor()
      const backendHosts=[...new Set(assets.map(value=>new URL(value).hostname).filter(host=>host.endsWith('.supabase.co')))]
      assert.deepEqual(backendHosts,[new URL(setup.url).hostname])
    })
    await runCase(cases,details,'E2E_EXPORT',async()=>{
      await pageA.getByRole('button',{name:'设置',exact:true}).click()
      const pending=pageA.waitForEvent('download')
      await pageA.locator('[data-action="export"]').click()
      const download=await pending
      const stream=await download.createReadStream()
      const chunks=[]
      for await(const chunk of stream) chunks.push(chunk)
      const exported=JSON.parse(Buffer.concat(chunks).toString('utf8'))
      assert.equal(exported.schedules.length,1)
      assert.equal(exported.schedules[0].raw_text,text)
      assert.equal(exported.schedules[0].record_date,day)
      assert.equal(exported.schedules[0].start_time.slice(0,5),'19:00')
      assert.equal(exported.schedules[0].end_time.slice(0,5),'20:00')
      assert.equal(exported.schedules.some(row=>row.raw_text===partnerText),false)
      assert.equal(exported.profile,null)
      assert.equal(exported.weights.length,0)
    })
    await runCase(cases,details,'E2E_REOPEN',async()=>{
      await pageA.getByRole('button',{name:'退出登录',exact:true}).click()
      await pageA.getByRole('heading',{name:'欢迎回来'}).waitFor()
      await contextA.close()
      contextA=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1})
      pageA=await contextA.newPage(); await pageA.goto(setup.pageUrl)
      await pageA.getByLabel('邮箱',{exact:true}).fill(setup.emails[0])
      await pageA.getByLabel('密码',{exact:true}).fill(setup.passwords[0])
      await pageA.getByRole('button',{name:'登录',exact:true}).click()
      await pageA.getByRole('button',{name:'日程',exact:true}).click()
      await pageA.locator('#schedule-date').fill(day)
      await pageA.getByText(text,{exact:true}).waitFor()
      await mkdir(new URL('../test-results/private/',import.meta.url),{recursive:true})
      await pageA.screenshot({path:fileURLToPath(new URL('../test-results/private/cloud-browser-a.png',import.meta.url)),fullPage:true})
      await pageB.screenshot({path:fileURLToPath(new URL('../test-results/private/cloud-browser-b.png',import.meta.url)),fullPage:true})
    })
  } catch(error) {
    if(!cases.some(item=>item.status==='failed')) { cases.push({id:'E2E_SETUP',status:'failed'}); details.push({id:'E2E_SETUP',error:String(error?.stack||error)}) }
    for(const id of ids) if(!cases.some(item=>item.id===id)) cases.push({id,status:'notrun'})
  } finally {
    await contextA?.close(); await contextB?.close(); await browser?.close()
    for(let i=0;i<2;i++) if(cleanAccountsVerified) {
      try {
        const user=(await ok(api[i].auth.signInWithPassword({email:setup.emails[i],password:setup.passwords[i]}))).user
        if((await ok(api[i].from('members').select('space_id').eq('user_id',user.id))).length) await ok(api[i].rpc('leave_space'))
      } catch(error) { cases.push({id:`E2E_CLEANUP_${i}`,status:'failed'}); details.push({id:`E2E_CLEANUP_${i}`,error}) }
      await api[i].auth.signOut()
    }
    await report('cloud-browser','real-build-real-supabase-browser',cases,details)
  }
}

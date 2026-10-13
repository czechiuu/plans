import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { addDays, shanghaiDate } from '../src/domain.js'
import { report, blocked, runCase } from './test-helpers/report.mjs'
import { cloudPublicSetup, cloudSetup, client, ok } from './test-helpers/cloud.mjs'
import { launchBrowser } from './test-helpers/browser.mjs'
import { login } from './test-helpers/browser-login.mjs'

const ids=['E2E_BUILD','E2E_AUTH_SETTINGS','E2E_ACCOUNTS','E2E_DATA_SAFETY','E2E_FIXED_LOGIN','E2E_PERSISTENCE','E2E_PARTNER','E2E_EXPORT','E2E_SWITCH','E2E_CLEANUP']
const cases=[],details=[]
const check=(id,fn)=>runCase(cases,details,id,fn)
const buildOnly=process.argv.includes('--build-only')
let setup
try { setup=buildOnly?cloudPublicSetup():cloudSetup(['E2E_BASE_URL']) } catch { setup={blocked:true,reason:'Invalid configuration'} }
if (!setup.blocked) {
  try {
    const url=new URL(process.env.E2E_BASE_URL)
    assert.ok(url.protocol==='https:' || (url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))
    assert.notEqual(url.port,'5173','Use a production build, not Vite dev')
    assert.equal(url.search,'');assert.equal(url.hash,'')
    setup.pageUrl=url.href
  } catch { setup={blocked:true,reason:'E2E_BASE_URL must be a deployed HTTPS site or local production preview'} }
}
async function verifyBuild(page) {
  const response=await page.goto(setup.pageUrl)
  assert.equal(response?.ok(),true)
  await page.getByRole('heading',{name:'欢迎回来'}).waitFor()
  const src=await page.locator('script[type="module"][src]').first().getAttribute('src')
  assert.match(src,/(^|\/)assets\/[^/]+\.js$/)
  const assetUrl=new URL(src,setup.pageUrl)
  const assetResponse=await page.request.get(assetUrl.href)
  assert.equal(assetResponse.ok(),true)
  const js=await assetResponse.text()
  assert.ok(js.includes(new URL(setup.url).origin),'Production bundle must target configured Supabase project')
  assert.equal(js.includes('/@vite/client'),false)
  assert.equal(js.includes('/src/main.js'),false)
  assert.equal(await page.getByLabel('邮箱').count(),0)
  assert.equal(await page.getByRole('button',{name:'创建账号'}).count(),0)
}
if (buildOnly) {
  if (setup.blocked) throw new Error(setup.reason)
  const browser=await launchBrowser()
  try {
    const page=await browser.newPage()
    await verifyBuild(page)
    process.stdout.write('E2E_BUILD preflight passed\n')
  } finally { await browser.close() }
} else if (setup.blocked) {
  process.stderr.write(`云端浏览器未运行：${setup.reason}\n`)
  await report('cloud-browser','two-fixed-accounts-real-build',blocked(ids))
} else {
  const api=[client(setup.url,setup.key),client(setup.url,setup.key)]
  const users=[], original=[]
  const marker=`SYNTHETIC-E2E-${randomUUID()}`
  const day=addDays(shanghaiDate(),-30)
  const rpc=(i,name,args={})=>ok(api[i].rpc(name,args))
  const own=(i,table)=>ok(api[i].from(table).select('*').eq('user_id',users[i]))
  let browser, contextA, contextB, pageA, pageB, safeToMutate=false, settingsChanged=false
  const pageErrors=[], requestFailures=[], backendHosts=new Set()
  const observe=page=>{
    page.on('pageerror',e=>pageErrors.push(e.name))
    page.on('requestfailed',r=>requestFailures.push(new URL(r.url()).pathname.split('/')[1]||'root'))
    page.on('request',r=>{ const host=new URL(r.url()).hostname; if(host.endsWith('.supabase.co')) backendHosts.add(host) })
  }
  const viewDay=async page=>{
    await page.getByRole('button',{name:'日程',exact:true}).click()
    await page.locator('#schedule-date').fill(day)
  }
  const createSchedule=async(page,text)=>{
    await viewDay(page)
    const form=page.locator('[data-form="schedule"]')
    await form.locator('[name="record_date"]').fill(day)
    await form.locator('[name="raw_text"]').fill(text)
    await form.locator('[name="is_shared"]').check()
    await form.getByRole('button',{name:'保存日程',exact:true}).click()
    await page.getByText('日程已保存',{exact:true}).waitFor()
  }
  const setShare=async page=>{
    await page.getByRole('button',{name:'设置',exact:true}).click()
    await page.locator('[data-form="settings"] [name="share_schedule"]').check()
    settingsChanged=true
    await page.locator('[data-form="settings"]').getByRole('button',{name:'保存共享设置'}).click()
    await page.getByText('共享设置已保存',{exact:true}).waitFor()
  }
  try {
    browser=await launchBrowser()
    contextA=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1,acceptDownloads:true})
    contextB=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1})
    pageA=await contextA.newPage();pageB=await contextB.newPage()
    observe(pageA);observe(pageB)
    await check('E2E_BUILD',()=>verifyBuild(pageA))
    await check('E2E_AUTH_SETTINGS',async()=>{
      const response=await fetch(new URL('/auth/v1/settings',setup.url),{headers:{apikey:setup.key}})
      assert.equal(response.ok,true)
      assert.equal((await response.json()).disable_signup,true)
    })
    await check('E2E_ACCOUNTS',async()=>{
      for(let i=0;i<2;i++){
        const data=await ok(api[i].auth.signInWithPassword({email:setup.emails[i],password:setup.passwords[i]}))
        assert.ok(data.user?.id); users.push(data.user.id)
        assert.equal(await rpc(i,'current_account'),i===0?'me':'w')
        const rows=await ok(api[i].from('members').select('space_id,user_id,share_profile,share_schedule,share_weight,allow_partner_edit').eq('user_id',users[i]))
        assert.equal(rows.length,1)
        original.push(Object.fromEntries(['share_profile','share_schedule','share_weight','allow_partner_edit'].map(key=>[key,rows[0][key]])))
        if(i===0) setup.spaceId=rows[0].space_id
        else assert.equal(rows[0].space_id,setup.spaceId)
      }
      assert.notEqual(users[0],users[1])
    })
    await check('E2E_DATA_SAFETY',async()=>{
      for(let i=0;i<2;i++) for(const table of ['health_profiles','schedules','weights'])
        if((await own(i,table)).length) throw Object.assign(new Error('Existing health data'),{code:'EXISTING_HEALTH_DATA'})
      safeToMutate=true
    })
    await check('E2E_FIXED_LOGIN',async()=>{
      await pageA.getByLabel('密码',{exact:true}).fill(`wrong-${randomUUID()}`)
      await pageA.getByRole('button',{name:'登录',exact:true}).click()
      await pageA.getByRole('alert').waitFor()
      await login(pageA,'me',setup.passwords[0])
      await pageB.goto(setup.pageUrl)
      await login(pageB,'w',setup.passwords[1])
      assert.deepEqual([...backendHosts],[new URL(setup.url).hostname])
    })
    await check('E2E_PERSISTENCE',async()=>{
      await createSchedule(pageA,`${marker}-ME`)
      await pageA.reload()
      await viewDay(pageA)
      await pageA.getByText(`${marker}-ME`,{exact:true}).waitFor()
    })
    await check('E2E_PARTNER',async()=>{
      await setShare(pageA)
      await pageB.getByRole('button',{name:'设置',exact:true}).click()
      await pageB.locator('[data-action="refresh"]').click()
      await viewDay(pageB)
      await pageB.locator('[data-action="scope"][data-scope="partner"]').first().click()
      await pageB.getByText(`${marker}-ME`,{exact:true}).waitFor()
      await pageB.locator('[data-action="scope"][data-scope="mine"]').first().click()
      await createSchedule(pageB,`${marker}-W`)
      await setShare(pageB)
      await pageA.locator('[data-action="refresh"]').click()
      await viewDay(pageA)
      await pageA.locator('[data-action="scope"][data-scope="partner"]').first().click()
      await pageA.getByText(`${marker}-W`,{exact:true}).waitFor()
    })
    await check('E2E_EXPORT',async()=>{
      await pageA.getByRole('button',{name:'设置',exact:true}).click()
      const pending=pageA.waitForEvent('download')
      await pageA.locator('[data-action="export"]').click()
      const stream=await (await pending).createReadStream(), chunks=[]
      for await(const chunk of stream) chunks.push(chunk)
      const exported=JSON.parse(Buffer.concat(chunks).toString('utf8'))
      assert.equal(exported.schedules.length,1)
      assert.equal(exported.schedules[0].raw_text,`${marker}-ME`)
      assert.equal(exported.schedules[0].record_date,day)
      assert.equal(exported.schedules.some(row=>row.raw_text===`${marker}-W`),false)
    })
    await check('E2E_SWITCH',async()=>{
      let step='SAVE_WEIGHT'
      try {
      await pageA.getByRole('button',{name:'体重',exact:true}).click()
      await pageA.locator('[data-action="scope"][data-scope="mine"]').first().click()
      const form=pageA.locator('[data-form="weight"]')
      await form.locator('[name="record_date"]').fill(day)
      await form.locator('[name="weight_kg"]').fill('70.1')
      await form.locator('[name="notes"]').fill(`${marker}-PRIVATE`)
      assert.equal(await form.locator('[name="is_shared"]').isChecked(),false)
      await form.getByRole('button',{name:'保存体重',exact:true}).click()
      await pageA.getByText('体重已保存',{exact:true}).waitFor()
      await pageA.getByText(`${marker}-PRIVATE`,{exact:true}).waitFor()
      step='SIGNOUT_ME'
      await pageA.getByRole('button',{name:'设置',exact:true}).click()
      await pageA.getByRole('button',{name:'退出此设备／切换账号',exact:true}).click()
      await pageA.getByRole('heading',{name:'欢迎回来'}).waitFor()
      step='LOGIN_W'
      await login(pageA,'w',setup.passwords[1])
      step='VERIFY_W'
      await pageA.getByRole('button',{name:'设置',exact:true}).click()
      await pageA.getByText('当前固定账号：W',{exact:false}).waitFor()
      await pageA.getByRole('button',{name:'体重',exact:true}).click()
      assert.equal(await pageA.getByText(`${marker}-PRIVATE`,{exact:true}).count(),0)
      step='SIGNOUT_W'
      await pageA.getByRole('button',{name:'设置',exact:true}).click()
      await pageA.getByRole('button',{name:'退出此设备／切换账号',exact:true}).click()
      await pageA.getByRole('heading',{name:'欢迎回来'}).waitFor()
      step='REOPEN_ME'
      await contextA.close()
      contextA=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1})
      pageA=await contextA.newPage();observe(pageA)
      await pageA.goto(setup.pageUrl)
      await login(pageA,'me',setup.passwords[0])
      await viewDay(pageA)
      await pageA.getByText(`${marker}-ME`,{exact:true}).waitFor()
      await pageA.getByRole('button',{name:'体重',exact:true}).click()
      await pageA.getByText(`${marker}-PRIVATE`,{exact:true}).waitFor()
      step='FINAL_CHECK'
      assert.deepEqual(pageErrors,[])
      assert.deepEqual(requestFailures,[])
      await mkdir(new URL('../test-results/private/',import.meta.url),{recursive:true})
      await pageA.screenshot({path:fileURLToPath(new URL('../test-results/private/cloud-browser-me.png',import.meta.url)),fullPage:true})
      await pageB.screenshot({path:fileURLToPath(new URL('../test-results/private/cloud-browser-w.png',import.meta.url)),fullPage:true})
      } catch(error) {
        error.code=`E2E_SWITCH_${step}`
        process.stderr.write(`${error.code}\n`)
        throw error
      }
    })
  } catch(error) {
    if(error?.code==='EXISTING_HEALTH_DATA') cases.find(item=>item.id==='E2E_DATA_SAFETY').status='blocked'
    else if(!cases.some(item=>item.status==='failed')) {cases.push({id:'E2E_SETUP',status:'failed'});details.push({id:'E2E_SETUP',error})}
  } finally {
    await contextA?.close();await contextB?.close();await browser?.close()
    if(safeToMutate){
      try{
        for(let i=0;i<2;i++){
          for(const [table,field,rpcName] of [['schedules','raw_text','delete_schedule'],['weights','notes','delete_weight']])
            for(const row of await own(i,table)) if(row.record_date===day && row[field]?.startsWith(marker))
              await rpc(i,rpcName,{p_id:row.id})
          if(settingsChanged) await rpc(i,'save_settings',{p_settings:original[i]})
        }
        cases.push({id:'E2E_CLEANUP',status:'passed'})
      }catch(error){
        if(settingsChanged) for(let i=0;i<2;i++) try{await rpc(i,'save_settings',{p_settings:{share_profile:false,share_schedule:false,share_weight:false,allow_partner_edit:false}})}catch{}
        cases.push({id:'E2E_CLEANUP',status:'failed'});details.push({id:'E2E_CLEANUP',error})
      }
    }
    for(const id of ids) if(!cases.some(item=>item.id===id)) cases.push({id,status:safeToMutate?'notrun':'blocked'})
    for(const c of api) try{await c.auth.signOut({scope:'local'})}catch{}
    await report('cloud-browser','two-fixed-accounts-real-build',cases,details)
  }
}

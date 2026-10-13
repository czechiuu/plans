import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './test-helpers/browser.mjs'

const site = 'https://czechiuu.github.io/plans/'
const project = 'https://wnzbtitlvteptkvwhavw.supabase.co'
const sourceSha = 'd9447478fa326b43fe8e6d74f61a2fcc1c133c5e'
const runId = '38393501421'
const cases = []
const errors = { console:0, page:0, request:0, http:0 }
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const check = async (id, fn) => {
  try { await fn(); cases.push({id,status:'passed'}); return true }
  catch { cases.push({id,status:'failed'}); return false }
}
const reportPath = new URL('../test-results/fixed-deployment-results.json',import.meta.url)
const observe = page => {
  page.on('console',message=>{if(message.type()==='error') errors.console++})
  page.on('pageerror',()=>errors.page++)
  page.on('requestfailed',()=>errors.request++)
  page.on('response',response=>{if(response.status()>=400) errors.http++})
}
const localHtml = await readFile(new URL('../dist/index.html',import.meta.url),'utf8')
const localBase = new URL('../dist/index.html',import.meta.url)
const assetPath = (html,ext) => html.match(new RegExp(`(?:src|href)="([^"]+\\/assets\\/[^"]+\\.${ext})"`))?.[1]
const localJsPath = assetPath(localHtml,'js')
const localCssPath = assetPath(localHtml,'css')
const deployedPath = path => new URL(path,site).pathname
let browser, desktopContext, mobileContext
let jsHash, cssHash, remoteJsPath, remoteCssPath, desktop
try {
  browser = await launchBrowser()
  desktopContext = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1})
  mobileContext = await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1})
  desktop = await desktopContext.newPage()
  const mobile = await mobileContext.newPage()
  observe(desktop); observe(mobile)
  await check('FIXED_HTML',async()=>{
    const response=await desktop.goto(site,{waitUntil:'networkidle'})
    assert.equal(response?.status(),200)
    assert.equal(new URL(desktop.url()).pathname,'/plans/')
    await desktop.getByRole('heading',{name:'欢迎回来'}).waitFor()
    const html=await response.text()
    remoteJsPath=assetPath(html,'js')
    remoteCssPath=assetPath(html,'css')
    assert.ok(remoteJsPath && remoteCssPath)
    assert.ok(deployedPath(remoteJsPath).startsWith('/plans/assets/'))
    assert.ok(deployedPath(remoteCssPath).startsWith('/plans/assets/'))
  })
  await check('FIXED_ARTIFACT',async()=>{
    assert.ok(localJsPath && localCssPath && remoteJsPath && remoteCssPath)
    assert.equal(deployedPath(remoteJsPath),deployedPath(localJsPath))
    assert.equal(deployedPath(remoteCssPath),deployedPath(localCssPath))
    const [localJs,localCss,remoteJs,remoteCss]=await Promise.all([
      readFile(new URL(localJsPath,localBase)),
      readFile(new URL(localCssPath,localBase)),
      desktop.request.get(new URL(remoteJsPath,site).href).then(async r=>{assert.equal(r.status(),200);return Buffer.from(await r.body())}),
      desktop.request.get(new URL(remoteCssPath,site).href).then(async r=>{assert.equal(r.status(),200);return Buffer.from(await r.body())})
    ])
    jsHash=sha256(remoteJs);cssHash=sha256(remoteCss)
    assert.equal(jsHash,sha256(localJs))
    assert.equal(cssHash,sha256(localCss))
    assert.ok(remoteJs.toString('utf8').includes(project))
    assert.equal(remoteJs.toString('utf8').includes('/@vite/client'),false)
  })
  await check('FIXED_LOGIN_UI',async()=>{
    await desktop.getByRole('heading',{name:'欢迎回来'}).waitFor()
    assert.equal(await desktop.locator('[data-form="signin"] [name="slot"][value="me"]').count(),1)
    assert.equal(await desktop.locator('[data-form="signin"] [name="slot"][value="w"]').count(),1)
    assert.equal(await desktop.getByLabel('密码',{exact:true}).count(),1)
    assert.equal(await desktop.getByLabel('邮箱').count(),0)
    for(const label of ['创建账号','注册','忘记密码','找回密码','发送重置邮件','输入邀请令牌'])
      assert.equal(await desktop.getByRole('button',{name:label,exact:true}).count(),0)
    assert.equal(await desktop.locator('form').count(),1)
  })
  await check('FIXED_DESKTOP',async()=>{
    assert.equal(await desktop.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    assert.equal(await desktop.getByRole('button',{name:'登录',exact:true}).isVisible(),true)
    await desktop.screenshot({path:fileURLToPath(new URL('../test-results/fixed-deployment-desktop-login.png',import.meta.url)),fullPage:true})
  })
  await check('FIXED_MOBILE',async()=>{
    const response=await mobile.goto(site,{waitUntil:'networkidle'})
    assert.equal(response?.status(),200)
    await mobile.getByRole('heading',{name:'欢迎回来'}).waitFor()
    await mobile.locator('[data-form="signin"] [name="slot"][value="w"]').check()
    assert.equal(await mobile.locator('[data-form="signin"] [name="slot"][value="w"]').isChecked(),true)
    assert.equal(await mobile.getByRole('button',{name:'登录',exact:true}).isVisible(),true)
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    await mobile.screenshot({path:fileURLToPath(new URL('../test-results/fixed-deployment-mobile-login.png',import.meta.url)),fullPage:true})
  })
  await check('FIXED_REFRESH',async()=>{
    const response=await desktop.reload({waitUntil:'networkidle'})
    assert.equal(response?.status(),200)
    await desktop.getByRole('heading',{name:'欢迎回来'}).waitFor()
    assert.equal(await desktop.locator('form').count(),1)
  })
  await check('FIXED_CALLBACK',async()=>{
    const response=await desktop.goto(`${site}?code=invalid#access_token=invalid&type=recovery`,{waitUntil:'networkidle'})
    assert.equal(response?.status(),200)
    await desktop.getByRole('heading',{name:'欢迎回来'}).waitFor()
    assert.equal(await desktop.locator('[data-form="signin"]').count(),1)
  })
  await check('FIXED_RUNTIME_ERRORS',async()=>{
    assert.deepEqual(errors,{console:0,page:0,request:0,http:0})
  })
} catch {
  if(!cases.some(item=>item.status==='failed')) cases.push({id:'FIXED_SETUP',status:'failed'})
} finally {
  await mobileContext?.close()
  await desktopContext?.close()
  await browser?.close()
  const passed=cases.filter(item=>item.status==='passed').length
  const failed=cases.filter(item=>item.status==='failed').length
  await writeFile(reportPath,JSON.stringify({
    generated_at:new Date().toISOString(),
    scope:'anonymous-published-login-page-only',
    source_sha_claim:sourceSha,
    deployment_run_id:runId,
    production_url:site,
    artifact_match_local_build:cases.some(item=>item.id==='FIXED_ARTIFACT'&&item.status==='passed'),
    asset_sha256:{javascript:jsHash||null,css:cssHash||null},
    passed,failed,blocked:0,notrun:0,cases,
    runtime_error_counts:errors,
    limitations:['No account password was entered','No authenticated data or physical device was tested']
  },null,2)+'\n')
  process.stdout.write(JSON.stringify({scope:'anonymous-published-login-page-only',passed,failed})+'\n')
  if(failed) process.exitCode=1
}

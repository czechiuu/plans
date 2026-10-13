import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { protectTerminal, readHidden, readLine } from './secure-input.mjs'
import { fixedEmails } from './test-helpers/cloud.mjs'
import { readVerifiedPassword } from './test-helpers/auth-preflight.mjs'

const projectRoot = fileURLToPath(new URL('../',import.meta.url))
const publicConfigFile = new URL('../.env.local',import.meta.url)
const site = 'https://czechiuu.github.io/plans/'
const expectedProject = 'wnzbtitlvteptkvwhavw.supabase.co'
const systemNames = ['SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','HOMEDRIVE','HOMEPATH']

async function publicConfig() {
  const values = new Map()
  for (const line of (await readFile(publicConfigFile,'utf8')).split(/\r?\n/u)) {
    const match = /^(VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY)=(.+)$/u.exec(line)
    if (!match) continue
    if (values.has(match[1])) throw new Error('公开配置项重复')
    values.set(match[1],match[2])
  }
  if (values.size !== 2) throw new Error('缺少本项目公开配置')
  const url = new URL(values.get('VITE_SUPABASE_URL'))
  const key = values.get('VITE_SUPABASE_PUBLISHABLE_KEY')
  assert.ok(url.protocol==='https:' && url.hostname===expectedProject &&
    url.pathname==='/' && !url.port && !url.username && !url.password && !url.search && !url.hash,
    'Supabase 地址不是本项目')
  assert.ok(key.length>=30 && /^sb_publishable_[A-Za-z0-9_-]+$/u.test(key),'仅允许 publishable 公钥')
  return { url:url.href, key }
}

function childEnvironment(config, mePassword, wPassword, browser) {
  const env = Object.fromEntries(systemNames.filter(name=>process.env[name]!==undefined).map(name=>[name,process.env[name]]))
  Object.assign(env,{
    SUPABASE_URL:config.url,
    SUPABASE_PUBLISHABLE_KEY:config.key,
    TEST_ME_PASSWORD:mePassword,
    TEST_W_PASSWORD:wPassword,
    TEST_FIXED_ACCOUNTS_APPROVED:'YES'
  })
  if (browser) env.E2E_BASE_URL=site
  return env
}

function runChild(script,env) {
  return new Promise(resolve=>{
    const child=spawn(process.execPath,[script],{
      cwd:projectRoot,env,stdio:['ignore','inherit','inherit'],windowsHide:true,shell:false
    })
    let finished=false
    child.once('error',()=>{if(!finished){finished=true;resolve(1)}})
    child.once('close',code=>{if(!finished){finished=true;resolve(code??1)}})
  })
}

async function reportStatus(name, startedAt, exitCode) {
  try {
    const report=JSON.parse(await readFile(new URL(`../test-results/${name}-results.json`,import.meta.url),'utf8'))
    if (Date.parse(report.generated_at)<startedAt-1000) throw new Error('stale report')
    return `通过 ${report.passed}、失败 ${report.failed}、阻塞 ${report.blocked}、未运行 ${report.notrun}；退出码 ${exitCode}`
  } catch {
    return `未生成本轮报告；退出码 ${exitCode}`
  }
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Interactive TTY required')
  if (process.argv.length>3 || (process.argv[2] && process.argv[2]!=='--browser-only'))
    throw new Error('仅支持 --browser-only 参数')
  const browserOnly=process.argv[2]==='--browser-only'
  const config=await publicConfig()
  const answer=await readLine(`${browserOnly?'仅运行浏览器验收。':''}仅在两个固定账号资料为空时写入合成记录，且只清理本次记录。输入 YES 继续：`)
  if (answer!=='YES') throw new Error('用户取消，未运行云端测试')
  let mePassword, wPassword
  let terminal
  const results=[]
  try {
    terminal=protectTerminal()
    const verify=(slot,email)=>readVerifiedPassword({
      slot,email,
      auth:createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}).auth,
      readHidden:label=>{terminal.check();return readHidden(label)},write:text=>process.stdout.write(text)
    })
    process.stdout.write('正在验证我账号。\n')
    mePassword=await verify('我',fixedEmails[0])
    terminal.check()
    process.stdout.write('我账号已验证。正在验证 W 账号。\n')
    wPassword=await verify('W',fixedEmails[1])
    terminal.check()
    process.stdout.write('W 账号已验证。\n')
    for (const [name,script,browser] of [
      ['cloud-api','scripts/verify-cloud.mjs',false],
      ['cloud-browser','scripts/verify-cloud-browser.mjs',true]
    ].filter(([, , browser])=>!browserOnly || browser)) {
      process.stdout.write(browser?'开始浏览器验收。\n':'开始云端接口验收。\n')
      let env=childEnvironment(config,mePassword,wPassword,browser)
      const startedAt=Date.now()
      let exitCode
      try { exitCode=await runChild(script,env) }
      finally { env.TEST_ME_PASSWORD='';env.TEST_W_PASSWORD='' }
      env=null
      const status=await reportStatus(name,startedAt,exitCode)
      results.push({name,exitCode,status})
      process.stdout.write(`${name}：${status}\n`)
      terminal.check()
    }
  } finally {
    mePassword=null;wPassword=null
    terminal?.restore()
    delete process.env.TEST_ME_PASSWORD
    delete process.env.TEST_W_PASSWORD
    delete process.env.TEST_FIXED_ACCOUNTS_APPROVED
  }
  if (results.some(item=>item.exitCode!==0)) process.exitCode=1
}

let interactive=Boolean(process.stdin.isTTY && process.stdout.isTTY)
try { await main() }
catch(error) {
  process.stderr.write(`云测未完成：${error?.message || '未知错误'}\n`)
  process.exitCode=1
}
finally {
  if (interactive) {
    try { await readLine('按 Enter 关闭窗口。') }
    catch { /* Ctrl+C at the closing prompt also restores terminal state. */ }
    process.exit(process.exitCode || 0)
  }
}

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
const networkFetch = (input, init={}) => fetch(input,{...init,signal:init.signal ? AbortSignal.any([init.signal,AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)})

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
  for(const name of ['TEST_DAILY_FLOW_APPROVED','TEST_DAILY_FLOW_DEEPSEEK_APPROVED'])
    if(process.env[name]==='YES') env[name]='YES'
  if(process.env.TEST_DAILY_FLOW_BASELINE_JOB_IDS) env.TEST_DAILY_FLOW_BASELINE_JOB_IDS=process.env.TEST_DAILY_FLOW_BASELINE_JOB_IDS
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
  const mode=process.argv[2] || 'all'
  if (process.argv.length>3 || !['all','--browser-only','--health-only','--daily-flow'].includes(mode))
    throw new Error('仅支持 --browser-only、--health-only 或 --daily-flow 参数')
  if(mode==='--daily-flow'&&process.env.TEST_DAILY_FLOW_APPROVED!=='YES')
    throw new Error('日常链路验收需要显式 TEST_DAILY_FLOW_APPROVED=YES；可能保留本轮计划和任务待管理员按精确 ID 清理')
  const config=await publicConfig()
  const intro=mode==='--daily-flow'?`仅运行日常链路合成验收。${process.env.TEST_DAILY_FLOW_DEEPSEEK_APPROVED==='YES'?'已明确允许 DeepSeek 合成业务，本轮费用不超过 5 美分；本人分用途同意仍须已存在。':'付费 AI 不运行。'}`:mode==='--browser-only'?'仅运行浏览器云验收。':mode==='--health-only'?'仅运行健康功能云验收。':'依次运行接口、健康功能和浏览器云验收。'
  const safety=mode==='--health-only'
    ? '只写本轮标记的合成健康记录，按本轮 ID 清理；无法安全验证的项目会阻塞。'
    : mode==='--browser-only'
      ? '仅在测试日期未被占用时写入合成记录；若共享开关可能暴露已有记录，相关测试会阻塞；清理本轮记录并恢复原开关。'
      : '接口与浏览器测试仅在测试日期未被占用时写入合成记录；若共享开关可能暴露已有记录，相关测试会阻塞；健康测试按本轮 ID 清理。'
  const answer=await readLine(`${intro}${safety}输入 YES 继续：`)
  if (answer!=='YES') throw new Error('用户取消，未运行云端测试')
  let mePassword, wPassword
  let terminal
  const results=[]
  try {
    terminal=protectTerminal()
    const verify=(slot,email)=>readVerifiedPassword({
      slot,email,
      auth:createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:networkFetch}}).auth,
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
      ['cloud-health','scripts/verify-cloud-health.mjs',false],
      ['daily-flow-cloud','scripts/verify-daily-flow-cloud.mjs',false],
      ['cloud-browser','scripts/verify-cloud-browser.mjs',true]
    ].filter(([name])=>mode==='--daily-flow'?name==='daily-flow-cloud':name!=='daily-flow-cloud'&&(mode==='all' || (mode==='--browser-only' ? name==='cloud-browser' : name==='cloud-health')))) {
      process.stdout.write(name==='cloud-api'?'开始云端接口验收。\n':name==='cloud-health'?'开始健康功能云验收。\n':name==='daily-flow-cloud'?'开始合成日常链路验收，规则计划等待现有后台调度。\n':'开始浏览器云验收。\n')
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

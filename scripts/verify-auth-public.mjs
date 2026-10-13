import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { report, blocked, runCase } from './test-helpers/report.mjs'
import { cloudPublicSetup, client } from './test-helpers/cloud.mjs'

const ids=['AUTH_SIGNUP_DISABLED','AUTH_SIGNUP_REJECTED']
const cases=[], details=[]
const setup=cloudPublicSetup()
if (setup.blocked) {
  process.stderr.write(`公开 Auth 检查未运行：${setup.reason}\n`)
  await report('cloud-auth-public','real-public-auth-settings',blocked(ids))
} else {
  try {
    await runCase(cases,details,ids[0],async()=>{
      const response=await fetch(new URL('/auth/v1/settings',setup.url),{headers:{apikey:setup.key}})
      assert.equal(response.ok,true)
      const settings=await response.json()
      assert.equal(settings.disable_signup,true,'Registration must already be disabled')
    })
    await runCase(cases,details,ids[1],async()=>{
      const probe=client(setup.url,setup.key)
      const result=await probe.auth.signUp({
        email:`signup-probe-${randomUUID()}@plans.invalid`,
        password:`Synthetic-${randomUUID()}`
      })
      assert.ok(result.error,'Direct signup must fail')
      assert.equal(result.data.user,null,'No account may be created')
      assert.match(`${result.error.code||''} ${result.error.message||''}`,/signup.{0,30}(disabled|not allowed)|signups? not allowed/i,'Rejection must be due to closed signup')
    })
  } catch {
    for(const id of ids) if(!cases.some(item=>item.id===id)) cases.push({id,status:'notrun'})
  }
  await report('cloud-auth-public','real-public-auth-settings',cases,details)
}

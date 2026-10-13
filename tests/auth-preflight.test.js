import test from 'node:test'
import assert from 'node:assert/strict'
import { readVerifiedPassword } from '../scripts/test-helpers/auth-preflight.mjs'

const email='me@plans.invalid'
const input=async()=> 'synthetic-test-value'

test('wrong password retries only this slot, then clears local session',async()=>{
  let calls=0, signOutScope, output=''
  const auth={
    signInWithPassword:async()=> ++calls===1
      ? { error:{ code:'invalid_credentials' } }
      : { data:{ user:{ email } } },
    signOut:async({scope})=>{ signOutScope=scope; return {error:null} }
  }
  const value=await readVerifiedPassword({slot:'我',email,auth,readHidden:input,write:text=>output+=text})
  assert.equal(value,'synthetic-test-value')
  assert.equal(calls,2)
  assert.equal(signOutScope,'local')
  assert.match(output,/我密码不正确/)
  assert.equal(output.includes(value),false)
})

test('three invalid credentials stop before cloud tests',async()=>{
  let calls=0
  const auth={signInWithPassword:async()=>{calls++;return {error:{code:'invalid_credentials'}}}}
  await assert.rejects(readVerifiedPassword({slot:'W',email,auth,readHidden:input,write:()=>{}}),/连续三次不正确/)
  assert.equal(calls,3)
})

test('other auth failures do not retry or reveal server text',async()=>{
  let calls=0
  const auth={signInWithPassword:async()=>{calls++;return {error:{code:'over_request_rate_limit',message:'private server text'}}}}
  await assert.rejects(readVerifiedPassword({slot:'我',email,auth,readHidden:input,write:()=>{}}),error=>{
    assert.match(error.message,/over_request_rate_limit/)
    assert.equal(error.message.includes('private server text'),false)
    return true
  })
  assert.equal(calls,1)
})

test('input cancellation does not call authentication',async()=>{
  const auth={signInWithPassword:()=>{throw new Error('must not run')}}
  await assert.rejects(readVerifiedPassword({slot:'我',email,auth,readHidden:()=>{throw new Error('Input cancelled')},write:()=>{}}),/Input cancelled/)
})

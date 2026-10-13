import test from 'node:test'
import assert from 'node:assert/strict'
import { verifiedUser } from '../src/fixed-account.js'

const me = { access_token: 'me-token', user: { id: 'me-id' } }
const w = { access_token: 'w-token', user: { id: 'w-id' } }

function fakeClient(getUser, rpc = async () => ({ data: 'me', error: null })) {
  let session = me, signOuts = 0
  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser,
      signOut: async () => { signOuts++; session = null; return { error: null } }
    },
    rpc,
    switchToW: () => { session = w },
    get signOuts() { return signOuts }
  }
}

test('delayed old getUser failure cannot sign out a newly selected account', async () => {
  let failOld
  const client = fakeClient(() => new Promise((_, reject) => { failOld = reject }))
  const pending = verifiedUser(client)
  await new Promise(resolve => setImmediate(resolve))
  client.switchToW()
  failOld(new Error('old request failed'))
  await assert.rejects(pending, { code: 'ACCOUNT_CHANGED' })
  assert.equal(client.signOuts, 0)
  assert.equal((await client.auth.getSession()).data.session, w)
})

test('delayed old registry response cannot sign out a newly selected account', async () => {
  let finishOld
  const client = fakeClient(async () => ({ data: { user: { id: 'me-id', email: 'me@plans.invalid' } }, error: null }), () => new Promise(resolve => { finishOld = resolve }))
  const pending = verifiedUser(client)
  await new Promise(resolve => setImmediate(resolve))
  client.switchToW()
  finishOld({ data: null, error: new Error('old RPC failed') })
  await assert.rejects(pending, { code: 'ACCOUNT_CHANGED' })
  assert.equal(client.signOuts, 0)
})

test('old email mismatch cannot sign out the new session', async () => {
  let finishOld
  const client = fakeClient(() => new Promise(resolve => { finishOld = resolve }))
  const pending = verifiedUser(client)
  await new Promise(resolve => setImmediate(resolve))
  client.switchToW()
  finishOld({ data: { user: { id: 'me-id', email: 'wrong@example.invalid' } }, error: null })
  await assert.rejects(pending, { code: 'ACCOUNT_CHANGED' })
  assert.equal(client.signOuts, 0)
})

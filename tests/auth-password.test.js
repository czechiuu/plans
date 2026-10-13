import test from 'node:test'
import assert from 'node:assert/strict'
import { updatePasswordWithToken } from '../src/auth-password.js'

test('password update keeps the initiating JWT across an asynchronous account switch', async () => {
  let release
  let currentToken = 'old-token'
  let request
  const fetcher = async (url, options) => {
    request = { url, options }
    await new Promise(resolve => { release = resolve })
    return { ok: true, json: async () => ({ id: 'old-user' }) }
  }
  const operation = updatePasswordWithToken(fetcher, 'https://example.supabase.co', 'public-key', currentToken, 'old-secret', 'new-secret')
  currentToken = 'new-account-token'
  release()
  assert.equal(await operation, 'old-user')
  assert.equal(request.options.headers.Authorization, 'Bearer old-token')
  assert.equal(request.options.method, 'PUT')
  assert.deepEqual(JSON.parse(request.options.body), { current_password: 'old-secret', password: 'new-secret' })
  assert.equal(currentToken, 'new-account-token')
})

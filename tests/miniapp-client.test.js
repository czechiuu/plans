import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createApi } = require('../miniprogram/lib/api.js')
const { createClient, requestJson, fail } = require('../miniprogram/lib/client.js')
const config = { url: 'https://synthetic.supabase.co', key: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_123456' }
const owner = '11111111-1111-4111-8111-111111111111'
const space = '33333333-3333-4333-8333-333333333333'

function fixture(overrides = {}) {
  const calls = [], storage = new Map()
  let refreshes = 0
  const wx = {
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    getFileSystemManager: () => ({ unlink: ({ success }) => success({}) }),
    request(options) {
      calls.push(options)
      Promise.resolve().then(async () => {
        if (overrides.request) {
          const answer = await overrides.request(options)
          if (answer !== undefined) return answer
        }
        const path = new URL(options.url).pathname
        if (options.url.includes('grant_type=password')) return { access_token: 'login-token', refresh_token: 'refresh-1', expires_in: overrides.shortToken ? 1 : 3600 }
        if (options.url.includes('grant_type=refresh_token')) {
          refreshes++
          return { access_token: 'fresh-token', refresh_token: 'refresh-2', expires_in: 3600 }
        }
        if (path === '/auth/v1/user') return { id: owner, email: 'me@plans.invalid' }
        if (path === '/auth/v1/logout') return null
        if (path.endsWith('/current_account')) return 'me'
        if (path.endsWith('/current_space_id')) return space
        if (path === '/rest/v1/members') return [{ space_id: space, user_id: owner }]
        if (path.startsWith('/rest/v1/rpc/health_')) return ({ health_schema_version: 4, health_provider_schema_version: 5,
          health_daily_flow_version: 7, health_activity_schema_version: 8, health_input_snapshot_schema_version: 9 })[path.split('/').at(-1)]
        if (path === '/rest/v1/spaces') return [{ id: space, name: 'Synthetic' }]
        if (path === '/rest/v1/schedules' && overrides.pages) {
          const offset = Number(new URL(options.url).searchParams.get('offset'))
          return offset === 0 ? Array.from({ length: 500 }, (_, i) => ({ id: `synthetic-${i}`, record_date: '2026-10-14' })) :
            [{ id: 'synthetic-last', record_date: '2026-10-15' }]
        }
        if (path.startsWith('/rest/v1/')) return path.includes('/rpc/') ? [{ id: 'synthetic-row' }] : []
        if (path === '/functions/v1/health-ai') return { schema_version: 7, plan_provider: 'rules', providers: {} }
        throw new Error('Unexpected mock path: ' + path)
      }).then(data => options.success({ statusCode: data?.__status || 200, data, header: {} }), error => options.fail({ errMsg: error.message }))
    }
  }
  return { wx, calls, storage, api: createApi(wx, config), get refreshes() { return refreshes } }
}

test('fixed sign-in verifies Auth, slot and membership without exposing tokens; load paginates', async () => {
  const f = fixture({ pages: true })
  await f.api.signIn('me', 'synthetic-password')
  assert.deepEqual(Object.keys(f.api.session()).sort(), ['account', 'spaceId', 'user'])
  assert.equal(JSON.stringify(f.api.session()).includes('login-token'), false)
  const data = await f.api.load()
  assert.equal(data.schedules.length, 501)
  assert.equal(data.space.id, space)
  assert.equal(data.range.to, '2026-10-15')
  assert.ok(f.calls.some(x => x.url.includes('offset=500')))
  assert.ok(f.calls.every(x => !Object.keys(x.header || {}).some(name => name.toLowerCase() === 'origin')))
  assert.ok(f.calls.filter(x => x.url.includes('/rest/v1/')).every(x => x.header.Authorization === 'Bearer login-token'))
  await f.api.signOut()
  assert.equal(f.api.session(), null)
  assert.equal(f.storage.has('plans-mini:session'), false)
})

test('refresh is single-flight and every resumed write uses the verified rotated token', async () => {
  const f = fixture({ shortToken: true })
  await f.api.signIn('me', 'synthetic-password')
  await Promise.all([f.api.saveWeight({ user_id: owner, record_date: '2026-10-14', weight_kg: 70 }),
    f.api.saveMeal({ user_id: owner, data: { items: [] } })])
  assert.equal(f.refreshes, 1)
  assert.equal(f.storage.get('plans-mini:session').refresh_token, 'refresh-2')
  const writes = f.calls.filter(x => /\/rpc\/(save_weight|save_meal)$/.test(x.url))
  assert.equal(writes.length, 2)
  assert.ok(writes.every(x => x.header.Authorization === 'Bearer fresh-token'))
})

test('account exit discards a late write response and offline write is never retried', async () => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  const f = fixture({ request: async options => {
    if (options.url.endsWith('/save_weight')) return pending
  } })
  await f.api.signIn('me', 'synthetic-password')
  const saving = f.api.saveWeight({ user_id: owner, record_date: '2026-10-14', weight_kg: 70 })
  await new Promise(resolve => setTimeout(resolve, 0))
  await f.api.signOut()
  release([{ id: 'late-write' }])
  await assert.rejects(saving, { code: 'ACCOUNT_CHANGED' })
  assert.equal(f.calls.filter(x => x.url.endsWith('/save_weight')).length, 1)
  const offline = fixture({ request: options => {
    if (options.url.endsWith('/save_meal')) throw new Error('offline')
  } })
  await offline.api.signIn('me', 'synthetic-password')
  await assert.rejects(offline.api.saveMeal({ user_id: owner }), { code: 'NETWORK_ERROR' })
  assert.equal(offline.calls.filter(x => x.url.endsWith('/save_meal')).length, 1)
})

test('composite RPC rejects zero or multiple rows and fixed identity mismatch', async () => {
  for (const result of [[], [{ id: 'a' }, { id: 'b' }]]) {
    const f = fixture({ request: options => options.url.endsWith('/save_weight') ? result : undefined })
    await f.api.signIn('me', 'synthetic-password')
    await assert.rejects(f.api.saveWeight({ user_id: owner }), { code: 'INVALID_RESPONSE' })
  }
  const wrong = fixture({ request: options => options.url.endsWith('/current_account') ? 'w' : undefined })
  await assert.rejects(wrong.api.signIn('me', 'synthetic-password'), { code: 'ACCOUNT_DENIED' })
  assert.equal(wrong.storage.has('plans-mini:session'), false)
})

test('local sign-out clears storage immediately and revokes only the captured session', async () => {
  let release
  const logout = new Promise(resolve => { release = resolve })
  const f = fixture({ request: options => new URL(options.url).pathname === '/auth/v1/logout' ? logout : undefined })
  await f.api.signIn('me', 'synthetic-password')
  const exiting = f.api.signOut()
  assert.equal(f.api.session(), null)
  assert.equal(f.storage.has('plans-mini:session'), false)
  await new Promise(resolve => setTimeout(resolve, 0))
  const request = f.calls.find(x => new URL(x.url).pathname === '/auth/v1/logout')
  assert.equal(new URL(request.url).searchParams.get('scope'), 'local')
  assert.equal(request.method, 'POST')
  assert.equal(request.header.Authorization, 'Bearer login-token')
  release(null)
  await exiting

  const failed = fixture({ request: options => { if (new URL(options.url).pathname === '/auth/v1/logout') throw new Error('offline') } })
  await failed.api.signIn('me', 'synthetic-password')
  await assert.rejects(failed.api.signOut(), { code: 'SIGNOUT_UNCONFIRMED' })
  assert.equal(failed.api.session(), null)
  assert.equal(failed.storage.has('plans-mini:session'), false)
})

test('multi-request load and export reject an account change before returning mixed data', async () => {
  for (const table of ['meal_adjustments', 'generation_input_snapshots']) {
    let release
    const pending = new Promise(resolve => { release = resolve })
    const f = fixture({ request: options => new URL(options.url).pathname === `/rest/v1/${table}` ? pending : undefined })
    await f.api.signIn('me', 'synthetic-password')
    const work = table === 'meal_adjustments' ? f.api.load() : f.api.exportOwnData()
    while (!f.calls.some(x => new URL(x.url).pathname === `/rest/v1/${table}`)) await new Promise(resolve => setTimeout(resolve, 0))
    await f.api.signOut()
    release([])
    await assert.rejects(work, { code: 'ACCOUNT_CHANGED' })
  }
})

test('PostgREST failure preserves the server explanation without retrying a write', async () => {
  const f = fixture({ request: options => options.url.endsWith('/save_health_rules') ?
    { __status: 409, code: 'P0001', message: '规则版本已变化，请刷新' } : undefined })
  await f.api.signIn('me', 'synthetic-password')
  await assert.rejects(f.api.saveHealthRules({}, false, 'synthetic-revision'), error => {
    assert.equal(error.code, 'P0001')
    assert.equal(error.message, '规则版本已变化，请刷新')
    return true
  })
  assert.equal(f.calls.filter(x => x.url.endsWith('/save_health_rules')).length, 1)
})

test('offline restore keeps saved credentials hidden until a later successful recheck', async () => {
  let offline = false
  const f = fixture({ request: options => {
    if (offline && new URL(options.url).pathname === '/auth/v1/user') throw new Error('offline')
  } })
  await f.api.signIn('me', 'synthetic-password')
  const reopened = createApi(f.wx, config)
  offline = true
  await assert.rejects(reopened.restore(), { code: 'NETWORK_ERROR' })
  assert.equal(reopened.session(), null)
  assert.equal(f.storage.has('plans-mini:session'), true)
  offline = false
  assert.equal((await reopened.restore()).account, 'me')
})

test('refresh verification offline preserves rotated token and never resends the failed write', async () => {
  let offline = true
  const f = fixture({ shortToken: true, request: options => {
    if (offline && new URL(options.url).pathname === '/auth/v1/user' &&
      options.header.Authorization === 'Bearer fresh-token') throw new Error('offline')
  } })
  await f.api.signIn('me', 'synthetic-password')
  await assert.rejects(f.api.saveWeight({ user_id: owner }), { code: 'NETWORK_ERROR' })
  assert.equal(f.api.session(), null)
  assert.equal(f.storage.get('plans-mini:session').refresh_token, 'refresh-2')
  assert.equal(f.calls.filter(x => x.url.endsWith('/save_weight')).length, 0)
  offline = false
  assert.equal((await f.api.restore()).account, 'me')
  await f.api.saveWeight({ user_id: owner })
  assert.equal(f.calls.filter(x => x.url.endsWith('/save_weight')).length, 1)
  assert.equal(f.refreshes, 1)
})

function limitedTransport(wx) {
  let active = 0, peak = 0, rejected = 0
  for (const name of ['request', 'uploadFile', 'downloadFile']) {
    if (!wx[name]) continue
    const original = wx[name].bind(wx)
    wx[name] = options => {
      if (active === 10) { rejected++; options.fail({ errMsg: `${name}:fail maximum concurrent requests` }); return }
      active++; peak = Math.max(peak, active)
      const finish = callback => value => { active--; callback(value) }
      original({ ...options, success: finish(options.success), fail: finish(options.fail) })
    }
  }
  return { get active() { return active }, get peak() { return peak }, get rejected() { return rejected } }
}

test('13-table load stays within the shared transport limit and a failed load can refresh', async () => {
  let failing = false
  const f = fixture({ request: options => {
    if (failing && new URL(options.url).pathname === '/rest/v1/weights') throw new Error('offline')
  } })
  const transport = limitedTransport(f.wx)
  await f.api.signIn('me', 'synthetic-password')
  assert.equal((await f.api.load()).account, 'me')
  failing = true
  await assert.rejects(f.api.load(), { code: 'NETWORK_ERROR' })
  failing = false
  assert.equal((await f.api.load()).account, 'me')
  assert.equal(transport.peak, 10)
  assert.equal(transport.rejected, 0)
  assert.equal(transport.active, 0)
})

test('requests, uploads and downloads on one wx instance share the same ten slots', async () => {
  const sent = []
  const wx = Object.fromEntries(['request', 'uploadFile', 'downloadFile'].map(method => [method, options => {
    sent.push(method)
    setImmediate(() => options.success(method === 'downloadFile' ?
      { statusCode: 200, tempFilePath: '/synthetic.png', header: { 'Content-Type': 'image/png' } } :
      { statusCode: 200, data: method === 'uploadFile' ? '{"photo_id":"synthetic"}' : [] }))
  }]))
  const transport = limitedTransport(wx)
  const session = { capture: async () => ({ token: 'synthetic-token', epoch: 1 }), assert: () => {} }
  const client = createClient(wx, config, session)
  const secondClient = createClient(wx, config, session)
  const work = [
    ...Array.from({ length: 12 }, () => client.rows('weights')),
    ...Array.from({ length: 3 }, () => secondClient.upload('/synthetic.png', 'synthetic-meal', false)),
    ...Array.from({ length: 3 }, (_, i) => secondClient.download(`synthetic-${i}`))
  ]
  await Promise.all(work)
  assert.equal(sent.length, 18)
  assert.equal(sent.filter(method => method === 'uploadFile').length, 3)
  assert.equal(sent.filter(method => method === 'downloadFile').length, 3)
  assert.equal(transport.peak, 10)
  assert.equal(transport.rejected, 0)
  assert.equal(transport.active, 0)
})

test('failed uploads and downloads release their shared slots without retrying', async () => {
  const sent = []
  const wx = Object.fromEntries(['request', 'uploadFile', 'downloadFile'].map(method => [method, options => {
    sent.push(method)
    setImmediate(() => method === 'request' ? options.success({ statusCode: 200, data: [] }) : options.fail({ errMsg: `${method}:fail offline` }))
  }]))
  const transport = limitedTransport(wx)
  const session = { capture: async () => ({ token: 'synthetic-token', epoch: 1 }), assert: () => {} }
  const client = createClient(wx, config, session)
  const outcomes = await Promise.allSettled([
    client.upload('/synthetic.png', 'synthetic-meal', false), client.download('synthetic-photo'),
    ...Array.from({ length: 16 }, () => client.rows('weights'))
  ])
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 16)
  assert.deepEqual(outcomes.filter(result => result.status === 'rejected').map(result => result.reason.code), ['NETWORK_ERROR', 'NETWORK_ERROR'])
  assert.equal(sent.filter(method => method === 'uploadFile').length, 1)
  assert.equal(sent.filter(method => method === 'downloadFile').length, 1)
  assert.deepEqual(await client.rows('weights'), [])
  assert.equal(transport.peak, 10)
  assert.equal(transport.rejected, 0)
  assert.equal(transport.active, 0)
})

test('sign-out while requests are queued prevents old reads, uploads and downloads from sending', async () => {
  let epoch = 1
  const sent = []
  const wx = Object.fromEntries(['request', 'uploadFile', 'downloadFile'].map(method => [method, options => { sent.push({ method, options }) }]))
  const session = {
    capture: async () => ({ token: 'synthetic-token', epoch }),
    assert: expected => { if (expected !== epoch) throw fail('ACCOUNT_CHANGED') }
  }
  const client = createClient(wx, config, session)
  const active = Array.from({ length: 10 }, () => client.rows('weights'))
  const queued = [client.rows('meals'), client.upload('/synthetic.png', 'synthetic-meal', false), client.download('synthetic-photo')]
  const results = Promise.allSettled([...active, ...queued])
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(sent.length, 10)
  epoch++ // 本机退出立即改变 epoch，排队工作尚未发送。
  for (const { options } of sent) options.success({ statusCode: 200, data: [] })
  assert.ok((await results).every(result => result.reason?.code === 'ACCOUNT_CHANGED'))
  assert.equal(sent.length, 10)
  assert.ok(sent.every(item => item.method === 'request'))
})

test('a queued login request is cancelled after local sign-out before sending its password', async () => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  const f = fixture({ request: options => new URL(options.url).pathname === '/block' ? pending : undefined })
  const blockers = Array.from({ length: 10 }, () => requestJson(f.wx, { url: `${config.url}/block` }))
  await new Promise(resolve => setImmediate(resolve))
  const signingIn = f.api.signIn('me', 'synthetic-password')
  const result = assert.rejects(signingIn, { code: 'ACCOUNT_CHANGED' })
  await new Promise(resolve => setImmediate(resolve))
  await f.api.signOut()
  release([])
  await Promise.all(blockers)
  await result
  assert.equal(f.calls.some(options => options.url.includes('grant_type=password')), false)
  assert.equal(f.api.session(), null)
})

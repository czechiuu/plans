import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { refresh, baseData } = require('../miniprogram/lib/page.js')
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const pageFixture = () => ({ data: { ...baseData }, received: [], setData(value) { Object.assign(this.data, value) }, receive(data) { this.received.push(data) } })
const snapshot = value => ({ user: { id: 'synthetic-owner' }, value })

function withApp(loadData, run) {
  const oldApp = globalThis.getApp
  const app = { globalData: { offline: false }, loadData, api: { session: () => ({ user: { id: 'synthetic-owner' } }) } }
  globalThis.getApp = () => app
  return Promise.resolve().then(run).finally(() => { globalThis.getApp = oldApp })
}

test('page refresh ends loading on success and after a failed refresh can succeed again', async () => {
  let failure = false
  await withApp(async () => { if (failure) throw Object.assign(new Error('NETWORK_ERROR'), { code: 'NETWORK_ERROR' }); return snapshot('loaded') }, async () => {
    const page = pageFixture()
    assert.equal((await refresh(page)).value, 'loaded')
    assert.equal(page.data.loading, false)
    assert.equal(page.ownerUserId, 'synthetic-owner')
    failure = true
    assert.equal(await refresh(page), null)
    assert.equal(page.data.loading, false)
    assert.match(page.data.error, /网络连接失败/)
    failure = false
    await refresh(page)
    assert.equal(page.data.loading, false)
    assert.equal(page.data.error, '')
    assert.equal(page.received.length, 2)
  })
})

test('page rendering failure also ends the loading state and exposes the failure', async () => {
  await withApp(async () => snapshot('loaded'), async () => {
    const page = pageFixture()
    page.receive = () => { throw new Error('合成页面处理失败') }
    assert.equal(await refresh(page), null)
    assert.equal(page.data.loading, false)
    assert.equal(page.data.error, '合成页面处理失败')
  })
})

test('an older refresh finishing first cannot stop the active refresh or replace its data', async () => {
  const first = deferred(), second = deferred(), queue = [first, second]
  await withApp(() => queue.shift().promise, async () => {
    const page = pageFixture(), old = refresh(page), current = refresh(page)
    first.resolve(snapshot('old'))
    await old
    assert.equal(page.data.loading, true)
    assert.deepEqual(page.received, [])
    second.resolve(snapshot('current'))
    await current
    assert.equal(page.data.loading, false)
    assert.deepEqual(page.received.map(data => data.value), ['current'])
  })
})

test('a late older success cannot hide the latest refresh failure', async () => {
  const first = deferred(), second = deferred(), queue = [first, second]
  await withApp(() => queue.shift().promise, async () => {
    const page = pageFixture(), old = refresh(page), current = refresh(page)
    second.reject(Object.assign(new Error('NETWORK_ERROR'), { code: 'NETWORK_ERROR' }))
    await current
    assert.equal(page.data.loading, false)
    first.resolve(snapshot('old'))
    await old
    assert.equal(page.data.loading, false)
    assert.match(page.data.error, /网络连接失败/)
    assert.deepEqual(page.received, [])
  })
})

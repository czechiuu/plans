import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const photoPath = require.resolve('../miniprogram/lib/photo.js')
const photoHelpers = require(photoPath)
let control, definition
const previousPage = globalThis.Page
require.cache[photoPath].exports = { ...photoHelpers,
  choosePhoto: (...args) => control.choose(...args),
  sanitizePhoto: (...args) => control.sanitize(...args) }
globalThis.Page = value => { definition = value }
delete require.cache[require.resolve('../miniprogram/pages/meal/index.js')]
require('../miniprogram/pages/meal/index.js')
require.cache[photoPath].exports = photoHelpers
globalThis.Page = previousPage

const tick = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const owner = 'synthetic-owner', mealId = 'synthetic-meal'
const photo = (id, fields = {}) => ({ id, meal_id: mealId, user_id: owner, deleting: false, uploading: false, ...fields })
function records(userId = owner, photos = []) {
  return { user: { id: userId }, meals: [{ id: mealId, user_id: userId, updated_at: 'synthetic-v1', status: 'draft', is_shared: false,
    data: { recorded_at: '2026-10-01T04:00:00Z', kind: 'lunch', items: [], eaten_fraction: 1 } }],
  photo_assets: photos, meal_adjustments: [], daily_plans: [], dailyFlowAvailable: true, providerAiAvailable: true }
}
function fixture(photos = []) {
  let session = { user: { id: owner } }, source = records(owner, photos)
  const calls = { downloads: [], uploads: [], deletes: [], previews: [], relaunch: [], ai: 0 }
  control = { choose: async () => '/local/original.jpg', sanitize: async () => '/local/clean.png',
    download: async id => `/private/${id}.png`,
    upload: async () => { source.photo_assets.push(photo('uploaded')); return { photo_id: 'uploaded', mime: 'image/png' } },
    remove: async id => { source.photo_assets = source.photo_assets.filter(item => item.id !== id) } }
  const api = {
    session: () => session,
    downloadPhoto: async id => { calls.downloads.push(id); return control.download(id) },
    uploadPhoto: async (...args) => { calls.uploads.push(args); return control.upload(...args) },
    deletePhoto: async id => { calls.deletes.push(id); return control.remove(id) },
    estimateMeal: async () => { calls.ai++; throw new Error('AI must not run') }
  }
  const app = { api, globalData: { offline: false }, clearViewData() {},
    loadData: async () => { if (!session) throw Object.assign(new Error('AUTH_REQUIRED'), { code: 'AUTH_REQUIRED' }); return source } }
  globalThis.wx = { getStorageSync() {}, previewImage: value => calls.previews.push(value),
    reLaunch: value => calls.relaunch.push(value), stopPullDownRefresh() {} }
  globalThis.getApp = () => app
  function page() {
    const instance = { ...definition, data: structuredClone(definition.data) }
    instance.setData = patch => { for (const [path, value] of Object.entries(patch)) {
      const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.'); let target = instance.data
      for (const part of parts.slice(0, -1)) target = target[part]
      target[parts.at(-1)] = value
    } }
    instance.onLoad({ id: mealId })
    return instance
  }
  return { calls, page, get source() { return source }, set source(value) { source = value },
    setSession(value) { session = value }, control }
}
const event = (id, attempt, dimensions = { width: 640, height: 480 }) => ({ currentTarget: { dataset: { id, attempt } }, detail: dimensions })

test('selected local photo appears before processing completes, opens full-size, and stays unsent', async () => {
  const f = fixture(), p = f.page(), processing = deferred()
  await p.onShow()
  f.control.sanitize = () => processing.promise
  const choosing = p.choose()
  await tick()
  assert.equal(p.data.photoPath, '/local/original.jpg')
  assert.equal(p.data.photoPreparing, true)
  assert.equal(p.data.photoPending, false)
  assert.match(p.data.notice, /未上传/)
  p.viewLocalPhoto()
  assert.deepEqual(f.calls.previews[0], { current: '/local/original.jpg', urls: ['/local/original.jpg'] })
  processing.resolve('/local/clean.png')
  await choosing
  assert.equal(p.data.photoPath, '/local/clean.png')
  assert.equal(p.data.photoPending, true)
  assert.equal(p.data.photoPreparing, false)
  assert.deepEqual(f.calls.uploads, [])
  assert.equal(f.calls.ai, 0)
})

test('failed upload retains the local thumbnail; successful retry shows an authenticated server preview', async () => {
  const f = fixture(), p = f.page(), uploading = deferred()
  await p.onShow(); await p.choose()
  f.control.upload = () => uploading.promise
  const saving = p.uploadPhoto()
  assert.equal(p.data.photoUploading, true)
  assert.equal(p.data.photoPath, '/local/clean.png')
  uploading.reject(Object.assign(new Error('INVALID_PNG'), { code: 'INVALID_PNG' }))
  await saving
  assert.equal(p.data.photoUploading, false)
  assert.equal(p.data.photoPath, '/local/clean.png')
  assert.equal(p.data.photoPending, true)
  assert.match(p.data.error, /PNG/)
  assert.equal(p.data.photos.length, 0)
  f.control.upload = async () => { f.source.photo_assets.push(photo('uploaded')); return { photo_id: 'uploaded', mime: 'image/png' } }
  await p.uploadPhoto(); await tick()
  assert.equal(p.data.photoPath, '')
  assert.equal(p.data.photoPending, false)
  assert.equal(p.data.photos[0].previewPath, '/private/uploaded.png')
  assert.equal(p.data.photos[0].previewState, 'loading', 'download completion is not image display success')
  p.photoLoaded(event('uploaded', p.data.photos[0].previewAttempt))
  assert.equal(p.data.photos[0].previewState, 'ready')
  await p.viewPhoto(event('uploaded'))
  assert.deepEqual(f.calls.previews[0], { current: '/private/uploaded.png', urls: ['/private/uploaded.png'] })
  assert.deepEqual(f.calls.uploads, [['/local/clean.png', mealId, false], ['/local/clean.png', mealId, false]])
  assert.equal(f.calls.ai, 0)
})

test('reopening automatically loads only own active meal photos, while unload drops displayed paths', async () => {
  const f = fixture([photo('active'), photo('deleting', { deleting: true }), photo('uploading', { uploading: true }),
    photo('partner', { user_id: 'synthetic-partner' }), photo('other-meal', { meal_id: 'other' })])
  const p = f.page()
  await p.onShow(); await tick()
  assert.deepEqual(f.calls.downloads, ['active'])
  assert.equal(p.data.photos.find(item => item.id === 'active').previewPath, '/private/active.png')
  assert.equal(p.data.photos.find(item => item.id === 'deleting').previewPath, '')
  p.onUnload()
  assert.deepEqual(p.data.photos, [])
  assert.equal(p.data.photoPath, '')
  const reopened = f.page()
  await reopened.onShow(); await tick()
  assert.deepEqual(f.calls.downloads, ['active', 'active'])
  assert.equal(reopened.data.photos[0].previewPath, '/private/active.png')
})

test('account switch or unload discards a late private download and any local preview', async () => {
  for (const close of ['account', 'unload']) {
    const f = fixture([photo('late')]), p = f.page(), downloading = deferred()
    f.control.download = id => id === 'late' ? downloading.promise : Promise.resolve('/private/partner.png')
    await p.onShow(); await p.choose()
    if (close === 'account') {
      f.setSession({ user: { id: 'synthetic-partner' } })
      f.source = records('synthetic-partner', [photo('partner', { user_id: 'synthetic-partner' })])
      p.receive(f.source)
      await tick()
    } else p.onUnload()
    downloading.resolve('/private/late.png')
    await tick()
    assert.equal(p.data.photoPath, '')
    if (close === 'account') {
      assert.equal(p.data.photos.length, 1)
      assert.equal(p.data.photos[0].id, 'partner')
      assert.equal(p.data.photos[0].previewPath, '/private/partner.png', 'old account response cannot clear the new account view')
    } else assert.deepEqual(p.data.photos, [])
  }
})

test('deletion hides immediately; failed deletion and stale metadata cannot revive the image', async () => {
  const f = fixture([photo('remove')]), p = f.page(), downloading = deferred(), deleting = deferred()
  f.control.download = () => downloading.promise
  f.control.remove = () => deleting.promise
  await p.onShow()
  const removing = p.deletePhoto(event('remove'))
  assert.equal(p.data.photos[0].deleting, true)
  assert.equal(p.data.photos[0].previewPath, '')
  downloading.resolve('/private/revoked.png')
  await tick()
  assert.equal(p.data.photos[0].previewPath, '')
  deleting.reject(Object.assign(new Error('NETWORK_ERROR'), { code: 'NETWORK_ERROR' }))
  await removing
  p.receive(f.source)
  await tick()
  assert.equal(p.data.photos[0].deleteRequested, true)
  assert.equal(p.data.photos[0].previewPath, '')
  assert.deepEqual(f.calls.downloads, ['remove'])
  await p.viewPhoto(event('remove'))
  assert.deepEqual(f.calls.previews, [])
  f.control.remove = async id => { f.source.photo_assets = f.source.photo_assets.filter(item => item.id !== id) }
  await p.deletePhoto(event('remove'))
  assert.deepEqual(p.data.photos, [])
  assert.deepEqual(f.calls.deletes, ['remove', 'remove'])
})

test('image display failure retries a fresh authenticated download and ignores obsolete image events', async () => {
  const f = fixture([photo('display')]), p = f.page()
  let downloads = 0
  f.control.download = async () => `/private/display-${++downloads}.png`
  await p.onShow(); await tick()
  const first = p.data.photos[0].previewAttempt
  p.photoFailed(event('display', first))
  assert.equal(p.data.photos[0].previewState, 'error')
  assert.equal(p.data.photos[0].previewPath, '')
  await p.retryPhoto(event('display'))
  const second = p.data.photos[0].previewAttempt
  assert.equal(p.data.photos[0].previewPath, '/private/display-2.png')
  p.photoLoaded(event('display', first))
  assert.equal(p.data.photos[0].previewState, 'loading')
  p.photoLoaded(event('display', second))
  assert.equal(p.data.photos[0].previewState, 'ready')
  assert.equal(f.calls.ai, 0)
})

test('server download failures are visible and retryable, and deletion metadata blocks retry', async () => {
  const f = fixture([photo('download')]), p = f.page()
  f.control.download = async () => { throw Object.assign(new Error('NETWORK_ERROR'), { code: 'NETWORK_ERROR' }) }
  await p.onShow(); await tick()
  assert.equal(p.data.photos[0].previewState, 'error')
  assert.equal(p.data.photos[0].previewPath, '')
  assert.match(p.data.photos[0].previewError, /网络/)
  f.control.download = async () => '/private/download.png'
  await p.retryPhoto(event('download'))
  assert.equal(p.data.photos[0].previewPath, '/private/download.png')
  f.source.photo_assets[0].deleting = true
  p.receive(f.source)
  await p.retryPhoto(event('download'))
  assert.equal(p.data.photos[0].previewPath, '')
  assert.equal(f.calls.downloads.length, 2)
})

test('cancel and sign-out remove local previews without allowing processing to restore them', async () => {
  const f = fixture(), p = f.page(), processing = deferred()
  await p.onShow()
  f.control.sanitize = () => processing.promise
  const choosing = p.choose()
  await tick()
  p.cancelPhoto()
  processing.resolve('/local/late.png')
  await choosing
  assert.equal(p.data.photoPath, '')
  assert.equal(p.data.photoPending, false)
  assert.equal(p._photoPath, null)
  f.control.sanitize = async () => '/local/clean.png'
  await p.choose()
  f.setSession(null)
  await p.onShow()
  assert.equal(p.data.photoPath, '')
  assert.deepEqual(p.data.photos, [])
  assert.deepEqual(f.calls.relaunch, [{ url: '/pages/login/index' }])
})

test('photo cards bind genuine local or authenticated paths with uncropped rendering and retry controls', () => {
  const wxml = readFileSync(new URL('../miniprogram/pages/meal/index.wxml', import.meta.url), 'utf8')
  assert.match(wxml, /src="\{\{photoPath\}\}" mode="aspectFit"/)
  assert.match(wxml, /src="\{\{item\.previewPath\}\}" mode="aspectFit"/)
  assert.match(wxml, /bindtap="viewLocalPhoto"/)
  assert.match(wxml, /bindtap="viewPhoto"/)
  assert.match(wxml, /binderror="photoFailed"/)
  assert.match(wxml, /bindtap="retryPhoto"/)
  assert.match(wxml, /!item\.deleting && !item\.uploading/)
  assert.doesNotMatch(wxml, /publicUrl|https?:\/\//)
})

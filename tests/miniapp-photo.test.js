import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { choosePhoto, sanitizePhoto } = require('../miniprogram/lib/photo.js')
const { errorText } = require('../miniprogram/lib/page.js')
const { createApi } = require('../miniprogram/lib/api.js')
const config = { url: 'https://synthetic.supabase.co', key: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_123456' }
const owner = '11111111-1111-4111-8111-111111111111'
const space = '33333333-3333-4333-8333-333333333333'
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
const callback = (value, method = 'success') => options => queueMicrotask(() => options[method](value))

test('privacy gate precedes image choice and cancellation is explicit', async () => {
  const events = []
  const wx = {
    requirePrivacyAuthorize(options) { events.push('privacy'); options.success({}) },
    chooseMedia(options) { events.push('choose'); options.fail({ errMsg: 'chooseMedia:fail cancel' }) }
  }
  await assert.rejects(choosePhoto(wx, {}), { code: 'CANCELLED' })
  assert.deepEqual(events, ['privacy', 'choose'])
  wx.chooseMedia = options => options.success({ tempFiles: [{ tempFilePath: '/synthetic.jpg' }] })
  assert.equal(await choosePhoto(wx, {}), '/synthetic.jpg')
  wx.requirePrivacyAuthorize = callback({ errMsg: 'requirePrivacyAuthorize:fail cancel' }, 'fail')
  await assert.rejects(choosePhoto(wx, {}), { code: 'CANCELLED' })
})

test('privacy failure is local, stops image choice and only displays a safe stage code', async () => {
  let chosen = 0
  const wx = {
    requirePrivacyAuthorize: callback({ errMsg: 'requirePrivacyAuthorize:fail synthetic-private-path https://private.invalid?token=synthetic' }, 'fail'),
    chooseMedia: () => { chosen++ }
  }
  await assert.rejects(choosePhoto(wx, {}), error => {
    assert.equal(error.code, 'PHOTO_PRIVACY_FAILED')
    assert.match(errorText(error), /隐私确认未完成/)
    assert.match(errorText(error), /PHOTO_PRIVACY_FAILED/)
    assert.doesNotMatch(errorText(error), /https:|token=|synthetic-private-path/)
    return true
  })
  assert.equal(chosen, 0)
})

test('camera permission denial and other selection failures have distinct Chinese explanations', async () => {
  for (const [reason, code, text] of [
    ['chooseMedia:fail auth deny', 'PHOTO_PERMISSION_DENIED', /相机或相册权限被拒绝/],
    ['chooseMedia:fail unexpected', 'PHOTO_CHOOSE_FAILED', /未能选择照片/]
  ]) {
    const wx = { requirePrivacyAuthorize: callback({}), chooseMedia: callback({ errMsg: reason }, 'fail') }
    await assert.rejects(choosePhoto(wx, {}), error => error.code === code && text.test(errorText(error)))
  }
})

test('unreadable image and unavailable canvas report the actual processing stage', async () => {
  const unreadable = { getImageInfo: callback({ errMsg: 'getImageInfo:fail /private-photo.jpg' }, 'fail') }
  await assert.rejects(sanitizePhoto(unreadable, {}, '/private-photo.jpg'), error =>
    error.code === 'PHOTO_READ_FAILED' && /无法读取所选照片/.test(errorText(error)) && !errorText(error).includes('/private-photo.jpg'))
  const page = { createSelectorQuery: () => ({ select() { return this }, fields() { return this }, exec(callback) { callback([]) } }) }
  await assert.rejects(sanitizePhoto({ getImageInfo: callback({ width: 640, height: 480 }) }, page, '/synthetic.jpg'), { code: 'PHOTO_CANVAS_UNAVAILABLE' })
})

test('meal page shows translated photo errors and cancellation does not claim an upload', async () => {
  const oldPage = globalThis.Page, oldWx = globalThis.wx
  let definition
  try {
    globalThis.Page = value => { definition = value }
    delete require.cache[require.resolve('../miniprogram/pages/meal/index.js')]
    require('../miniprogram/pages/meal/index.js')
    const page = { data: { photoPending: false }, setData(value) { Object.assign(this.data, value) } }
    globalThis.wx = { requirePrivacyAuthorize: callback({ errMsg: 'requirePrivacyAuthorize:fail synthetic' }, 'fail') }
    await definition.choose.call(page)
    assert.match(page.data.error, /隐私确认未完成/)
    assert.equal(page.data.photoPending, false)
    globalThis.wx = { requirePrivacyAuthorize: callback({}), chooseMedia: callback({ errMsg: 'chooseMedia:fail cancel' }, 'fail') }
    await definition.choose.call(page)
    assert.equal(page.data.error, '')
    assert.equal(page.data.notice, '已取消选择照片')
    assert.equal(page.data.photoPending, false)
    assert.equal(page._photoPath, undefined)
  } finally { globalThis.Page = oldPage; globalThis.wx = oldWx }
})

test('canvas produces bounded PNG and rejects oversized or false PNG results', async () => {
  const drawn = [], canvas = { getContext: () => ({ clearRect() {}, drawImage: (...args) => drawn.push(args) }),
    createImage: () => ({ set src(value) { queueMicrotask(() => this.onload()) } }) }
  const page = { createSelectorQuery: () => ({ select() { return this }, fields() { return this }, exec(callback) { callback([{ node: canvas }]) } }) }
  let size = png.length, bytes = png
  const wx = {
    getImageInfo: callback({ width: 4000, height: 2000 }),
    canvasToTempFilePath(options) {
      assert.equal(options.fileType, 'png')
      assert.deepEqual([options.destWidth, options.destHeight], [1280, 640])
      options.success({ tempFilePath: '/clean.png' })
    },
    getFileInfo(options) { options.success({ size }) },
    getFileSystemManager: () => ({ readFile(options) { options.success({ data: bytes.buffer }) } })
  }
  assert.equal(await sanitizePhoto(wx, page, '/camera.jpg'), '/clean.png')
  assert.equal(canvas.width, 1280); assert.equal(canvas.height, 640)
  assert.equal(drawn.length, 1)
  size = 4 * 1024 * 1024 + 1
  await assert.rejects(sanitizePhoto(wx, page, '/camera.jpg'), { code: 'INVALID_PNG' })
  size = png.length; bytes = Uint8Array.from([0, ...png.slice(1)])
  await assert.rejects(sanitizePhoto(wx, page, '/camera.jpg'), { code: 'INVALID_PNG' })
})

function photoApiFixture(existing = false, contentType = 'image/png', onRead = null, unauthorized = false, refreshUnauthorized = false) {
  const files = [], requests = [], uploads = [], storage = new Map()
  const wx = {
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    getFileInfo: callback({ size: png.length }),
    getFileSystemManager: () => ({ readFile(options) { if (onRead) onRead(options); else options.success({ data: png.buffer }) },
      unlink(options) { files.push(options.filePath);options.success({}) } }),
    request(options) {
      requests.push(options)
      queueMicrotask(() => {
        const path = new URL(options.url).pathname
        let data
        if (options.url.includes('grant_type=password')) data = { access_token: 'token', refresh_token: 'refresh', expires_in: refreshUnauthorized ? 60 : 3600 }
        else if (options.url.includes('grant_type=refresh_token') && refreshUnauthorized) data = { code: 'invalid_grant', message: 'JWT expired' }
        else if (path === '/auth/v1/user') data = { id: owner, email: 'me@plans.invalid' }
        else if (path === '/auth/v1/logout') data = null
        else if (path.endsWith('/current_account')) data = 'me'
        else if (path.endsWith('/current_space_id')) data = space
        else if (path === '/rest/v1/members') data = [{ space_id: space }]
        else if (path === '/rest/v1/photo_assets') data = existing ? [{ id: 'existing-photo' }] : []
        else if (path.endsWith('/save_weight') && unauthorized) data = { code: 'PGRST301', message: 'JWT expired' }
        else throw new Error('Unexpected mock path: ' + path)
        options.success({ statusCode: (path.endsWith('/save_weight') && unauthorized) ||
          (options.url.includes('grant_type=refresh_token') && refreshUnauthorized) ? 401 : 200, data, header: {} })
      })
    },
    uploadFile(options) { uploads.push(options); options.success({ statusCode: 200, data: JSON.stringify({ photo_id: 'new-photo', mime: 'image/png' }) }) },
    downloadFile(options) { options.success({ statusCode: 200, tempFilePath: '/download.png', header: { 'Content-Type': contentType } }) }
  }
  return { api: createApi(wx, config), files, requests, uploads }
}

test('owner photo preflight prevents duplicate upload and private download cleans on exit', async () => {
  const prior = photoApiFixture(true)
  await prior.api.signIn('me', 'synthetic-password')
  await assert.rejects(prior.api.uploadPhoto('/clean.png', 'synthetic-meal'), { code: 'PHOTO_UPLOAD_REVIEW_REQUIRED' })
  assert.equal(prior.uploads.length, 0)
  const fresh = photoApiFixture()
  await fresh.api.signIn('me', 'synthetic-password')
  assert.equal((await fresh.api.uploadPhoto('/clean.png', 'synthetic-meal')).photo_id, 'new-photo')
  assert.equal(fresh.uploads.length, 1)
  assert.equal(fresh.uploads[0].header.Authorization, 'Bearer token')
  assert.equal(await fresh.api.downloadPhoto('synthetic-photo'), '/download.png')
  await fresh.api.signOut()
  assert.deepEqual(fresh.files, ['/download.png'])
  assert.equal(fresh.requests.some(x => x.url.includes('publicUrl')), false)
})

test('download rejects wrong content type and removes untrusted temporary file', async () => {
  const wrong = photoApiFixture(false, 'text/html')
  await wrong.api.signIn('me', 'synthetic-password')
  await assert.rejects(wrong.api.downloadPhoto('synthetic-photo'), { code: 'PHOTO_INVALID_RESPONSE' })
  assert.deepEqual(wrong.files, ['/download.png'])
})

test('download finishing after sign-out cannot return or retain a private file', async () => {
  let releaseRead, started
  const readStarted = new Promise(resolve => { started = resolve })
  const f = photoApiFixture(false, 'image/png', options => { releaseRead = () => options.success({ data: png.buffer }); started() })
  await f.api.signIn('me', 'synthetic-password')
  const downloading = f.api.downloadPhoto('synthetic-photo')
  await readStarted
  await f.api.signOut()
  releaseRead()
  await assert.rejects(downloading, { code: 'ACCOUNT_CHANGED' })
  assert.deepEqual(f.files, ['/download.png'])
})

test('expired authorization clears local identity and previously downloaded private files', async () => {
  const f = photoApiFixture(false, 'image/png', null, true)
  await f.api.signIn('me', 'synthetic-password')
  await f.api.downloadPhoto('synthetic-photo')
  await assert.rejects(f.api.saveWeight({ user_id: owner }), { code: 'AUTH_REQUIRED' })
  assert.equal(f.api.session(), null)
  assert.deepEqual(f.files, ['/download.png'])
  assert.equal(f.requests.filter(x => x.url.endsWith('/save_weight')).length, 1)
})

test('rejected token refresh also removes private files before exposing login state', async () => {
  const originalNow = Date.now
  let now = originalNow()
  Date.now = () => now
  try {
    const f = photoApiFixture(false, 'image/png', null, false, true)
    await f.api.signIn('me', 'synthetic-password')
    await f.api.downloadPhoto('synthetic-photo')
    now += 40000
    const outcomes = await Promise.allSettled([
      f.api.saveWeight({ user_id: owner }), f.api.saveWeight({ user_id: owner })
    ])
    assert.deepEqual(outcomes.map(result => result.reason?.code), ['AUTH_REQUIRED', 'AUTH_REQUIRED'])
    assert.equal(f.api.session(), null)
    assert.deepEqual(f.files, ['/download.png'])
    assert.equal(f.requests.filter(x => x.url.endsWith('/save_weight')).length, 0)
    assert.equal(f.requests.filter(x => x.url.includes('grant_type=refresh_token')).length, 1)
  } finally { Date.now = originalNow }
})

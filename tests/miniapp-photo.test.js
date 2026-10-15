import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { choosePhoto, sanitizePhoto, assertPngFile } = require('../miniprogram/lib/photo.js')
const { errorText } = require('../miniprogram/lib/page.js')
const { createApi } = require('../miniprogram/lib/api.js')
const config = { url: 'https://synthetic.supabase.co', key: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_123456' }
const owner = '11111111-1111-4111-8111-111111111111'
const space = '33333333-3333-4333-8333-333333333333'
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
const callback = (value, method = 'success') => options => queueMicrotask(() => options[method](value))

const sourceChoice = (tapIndex = 0) => callback({ tapIndex })

test('source menu precedes privacy and invokes only the selected native source', async () => {
  for (const [tapIndex, expected] of [[0, 'camera'], [1, 'album']]) {
    const events = []
    const wx = {
      showActionSheet(options) { events.push('source'); assert.deepEqual(options.itemList, ['现在拍照', '从手机相册选择']); options.success({ tapIndex }) },
      requirePrivacyAuthorize(options) { events.push('privacy'); options.success({}) },
      chooseMedia(options) {
        events.push('choose'); assert.deepEqual(options.sourceType, [expected]); assert.deepEqual(options.mediaType, ['image']); assert.equal(options.count, 1)
        options.success({ tempFiles: [{ tempFilePath: '/synthetic.jpg' }] })
      }
    }
    assert.equal(await choosePhoto(wx), '/synthetic.jpg')
    assert.deepEqual(events, ['source', 'privacy', 'choose'])
  }
})

test('source menu cancellation or invalid response never opens privacy or image selection', async () => {
  let opened = 0
  const wx = { showActionSheet: callback({ errMsg: 'showActionSheet:fail cancel' }, 'fail'),
    requirePrivacyAuthorize: () => { opened++ }, chooseMedia: () => { opened++ } }
  await assert.rejects(choosePhoto(wx), { code: 'CANCELLED' })
  wx.showActionSheet = callback({ tapIndex: 2 })
  await assert.rejects(choosePhoto(wx), { code: 'PHOTO_SOURCE_FAILED' })
  assert.equal(opened, 0)
})

test('privacy and native image cancellation remain explicit after source selection', async () => {
  const wx = { showActionSheet: sourceChoice(), requirePrivacyAuthorize: callback({}), chooseMedia: callback({ errMsg: 'chooseMedia:fail cancel' }, 'fail') }
  await assert.rejects(choosePhoto(wx), { code: 'CANCELLED' })
  wx.requirePrivacyAuthorize = callback({ errMsg: 'requirePrivacyAuthorize:fail cancel' }, 'fail')
  await assert.rejects(choosePhoto(wx), { code: 'CANCELLED' })
})

test('privacy failure is local, stops image choice and only displays a safe stage code', async () => {
  let chosen = 0
  const wx = {
    showActionSheet: sourceChoice(),
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
  wx.requirePrivacyAuthorize = callback({ errMsg: 'requirePrivacyAuthorize:fail auth deny' }, 'fail')
  await assert.rejects(choosePhoto(wx), error => error.code === 'PHOTO_PRIVACY_FAILED' && error.photoStage === 'privacy')
  assert.equal(chosen, 0)
})

test('native failures keep a safe stage, exact category and numeric code without copying private diagnostics', async () => {
  for (const [reason, code, text] of [
    ['chooseMedia:fail auth deny', 'PHOTO_PERMISSION_DENIED', /权限被拒绝/],
    ['chooseMedia:fail api scope is not declared in the privacy agreement', 'PHOTO_CHOOSE_FAILED', /隐私指引未声明此接口/],
    ['chooseMedia:fail not supported', 'PHOTO_CHOOSE_FAILED', /当前微信环境不支持此接口/],
    ['chooseMedia:fail unexpected', 'PHOTO_CHOOSE_FAILED', /原因尚未识别/]
  ]) {
    const wx = { showActionSheet: sourceChoice(), requirePrivacyAuthorize: callback({}),
      chooseMedia: callback({ errMsg: `${reason} /private/person.jpg https://private.invalid?token=secret HEALTH_TEXT`, errCode: 123, errno: 456 }, 'fail') }
    await assert.rejects(choosePhoto(wx), error => {
      assert.equal(error.code, code)
      assert.match(errorText(error), text)
      assert.match(errorText(error), /阶段：微信选图/)
      assert.match(errorText(error), /微信 errCode：123/)
      assert.match(errorText(error), /微信 errno：456/)
      assert.doesNotMatch(errorText(error), /private|person|https:|token|secret|HEALTH_TEXT/)
      assert.equal(error.cause, undefined)
      return true
    })
  }
})

test('missing native API is explicit and nonnumeric error codes never reach the page', async () => {
  const wx = { showActionSheet: sourceChoice(), requirePrivacyAuthorize: callback({}) }
  await assert.rejects(choosePhoto(wx), error => error.photoStage === 'choose' && error.photoReason === 'unsupported')
  wx.chooseMedia = callback({ errMsg: 'chooseMedia:fail unexpected', errCode: 'secret-token', errno: 'secret-url' }, 'fail')
  await assert.rejects(choosePhoto(wx), error => !errorText(error).includes('secret-token') && !errorText(error).includes('secret-url') && !errorText(error).includes('微信 err'))
})

test('native success without exactly one nonempty file path differs from native fail', async () => {
  for (const result of [undefined, {}, { tempFiles: [] }, { tempFiles: [{}] }, { tempFiles: [{ tempFilePath: '' }] }, { tempFiles: [{ tempFilePath: '/a' }, { tempFilePath: '/b' }] }]) {
    const wx = { showActionSheet: sourceChoice(), requirePrivacyAuthorize: callback({}), chooseMedia: callback(result) }
    await assert.rejects(choosePhoto(wx), error => error.code === 'PHOTO_EMPTY_RESULT' && /微信返回成功/.test(errorText(error)))
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
    globalThis.wx = { showActionSheet: sourceChoice(), requirePrivacyAuthorize: callback({ errMsg: 'requirePrivacyAuthorize:fail synthetic' }, 'fail') }
    await definition.choose.call(page)
    assert.match(page.data.error, /隐私确认未完成/)
    assert.equal(page.data.photoPending, false)
    globalThis.wx = { showActionSheet: sourceChoice(), requirePrivacyAuthorize: callback({}), chooseMedia: callback({ errMsg: 'chooseMedia:fail cancel' }, 'fail') }
    await definition.choose.call(page)
    assert.equal(page.data.error, '')
    assert.equal(page.data.notice, '已取消选择照片')
    assert.equal(page.data.photoPending, false)
    assert.equal(page._photoPath, undefined)
  } finally { globalThis.Page = oldPage; globalThis.wx = oldWx }
})

test('meal page rapid taps open one source menu and cancellation releases the lock without upload', async () => {
  const oldPage = globalThis.Page, oldWx = globalThis.wx
  let definition, menu, menus = 0, privateApis = 0
  try {
    globalThis.Page = value => { definition = value }
    delete require.cache[require.resolve('../miniprogram/pages/meal/index.js')]
    require('../miniprogram/pages/meal/index.js')
    const page = { data: { photoPending: false }, setData(value) { Object.assign(this.data, value) } }
    globalThis.wx = { showActionSheet(options) { menus++; menu = options }, requirePrivacyAuthorize() { privateApis++ }, chooseMedia() { privateApis++ }, uploadFile() { privateApis++ } }
    const first = definition.choose.call(page), second = definition.choose.call(page)
    assert.equal(menus, 1)
    menu.fail({ errMsg: 'showActionSheet:fail cancel' })
    await Promise.all([first, second])
    assert.equal(page._choosingPhoto, false)
    assert.equal(page.data.photoPending, false)
    assert.equal(privateApis, 0)
    assert.equal(page._photoPath, undefined)
    const third = definition.choose.call(page)
    assert.equal(menus, 2)
    menu.fail({ errMsg: 'showActionSheet:fail cancel' })
    await third
  } finally { globalThis.Page = oldPage; globalThis.wx = oldWx }
})

test('a selected image becomes a local pending PNG and never uploads or sends an AI request', async () => {
  const oldPage = globalThis.Page, oldWx = globalThis.wx
  let definition, remote = 0
  try {
    globalThis.Page = value => { definition = value }
    delete require.cache[require.resolve('../miniprogram/pages/meal/index.js')]
    require('../miniprogram/pages/meal/index.js')
    const canvas = { getContext: () => ({ clearRect() {}, drawImage() {} }),
      createImage: () => ({ set src(value) { queueMicrotask(() => this.onload()) } }) }
    const page = { data: { photoPending: false }, setData(value) { Object.assign(this.data, value) },
      createSelectorQuery: () => ({ select() { return this }, fields() { return this }, exec(callback) { callback([{ node: canvas }]) } }) }
    globalThis.wx = { showActionSheet: sourceChoice(1), requirePrivacyAuthorize: callback({}),
      chooseMedia: callback({ tempFiles: [{ tempFilePath: '/synthetic.jpg' }] }), getImageInfo: callback({ width: 640, height: 480 }),
      canvasToTempFilePath: callback({ tempFilePath: '/local-clean.png' }), getFileInfo: callback({ size: png.length }),
      getFileSystemManager: () => ({ readFile: callback({ data: png.buffer }) }),
      uploadFile() { remote++ }, request() { remote++ } }
    await definition.choose.call(page)
    assert.equal(page._photoPath, '/local-clean.png')
    assert.equal(page.data.photoPending, true)
    assert.equal(page._choosingPhoto, false)
    assert.match(page.data.notice, /保存草稿或点击上传后才会发送/)
    assert.equal(remote, 0)
  } finally { globalThis.Page = oldPage; globalThis.wx = oldWx }
})

test('one PNG export bounds large square and portrait images to 960 and never enlarges small images', async () => {
  for (const [source, expected] of [
    [[4000, 4000], [960, 960]], [[4000, 2000], [960, 480]], [[3000, 6000], [480, 960]], [[640, 480], [640, 480]]
  ]) {
    const drawn = [], canvas = { getContext: () => ({ clearRect() {}, drawImage: (...args) => drawn.push(args) }),
      createImage: () => ({ set src(value) { queueMicrotask(() => this.onload()) } }) }
    const page = { createSelectorQuery: () => ({ select() { return this }, fields() { return this }, exec(callback) { callback([{ node: canvas }]) } }) }
    let exports = 0
    const wx = {
      getImageInfo: callback({ width: source[0], height: source[1] }),
      canvasToTempFilePath(options) {
        exports++
        assert.equal(options.fileType, 'png')
        assert.deepEqual([options.destWidth, options.destHeight], expected)
        options.success({ tempFilePath: '/clean.png' })
      },
      getFileInfo: callback({ size: png.length }),
      getFileSystemManager: () => ({ readFile: callback({ data: png.buffer }) })
    }
    assert.equal(await sanitizePhoto(wx, page, '/camera.jpg'), '/clean.png')
    assert.deepEqual([canvas.width, canvas.height], expected)
    assert.equal(drawn.length, 1)
    assert.equal(exports, 1)
    assert.ok(canvas.width * canvas.height * 4 + canvas.height < 4 * 1024 * 1024 - 500000)
  }
})

test('invalid source dimensions stop before the canvas and are not called a PNG size failure', async () => {
  for (const dimensions of [{ width: 0, height: 4 }, { width: 4.5, height: 4 }, { width: 4 }, null]) {
    const wx = { getImageInfo: callback(dimensions) }
    await assert.rejects(sanitizePhoto(wx, {}, '/private.jpg'), error => {
      assert.equal(error.code, 'PHOTO_DIMENSIONS_INVALID')
      assert.match(errorText(error), /未返回有效的照片宽高/)
      assert.doesNotMatch(errorText(error), /超过|private/)
      return true
    })
  }
})

test('PNG validation distinguishes actual oversize, invalid metadata, mismatched bytes, data type and signature', async () => {
  let size = png.length, data = png.buffer, reads = 0
  const wx = { getFileInfo(options) { options.success({ size }) },
    getFileSystemManager: () => ({ readFile(options) { reads++; options.success({ data }) } }) }
  assert.deepEqual(await assertPngFile(wx, '/private.png'), { bytes: png.length })
  for (size of [undefined, 0, -1, 1.5, '12']) {
    await assert.rejects(assertPngFile(wx, '/private.png'), error => error.code === 'PHOTO_FILE_SIZE_INVALID' && !errorText(error).includes('超过'))
  }
  const priorReads = reads
  size = 4 * 1024 * 1024 + 1
  await assert.rejects(assertPngFile(wx, '/private.png'), error => {
    assert.equal(error.code, 'PHOTO_TOO_LARGE')
    assert.match(errorText(error), /4194305 字节/)
    return true
  })
  assert.equal(reads, priorReads)
  size = png.length + 1
  await assert.rejects(assertPngFile(wx, '/private.png'), error => {
    assert.equal(error.code, 'PHOTO_FILE_SIZE_MISMATCH')
    assert.match(errorText(error), /文件：13 字节/)
    assert.match(errorText(error), /读取：12 字节/)
    return true
  })
  size = png.length; data = 'secret-photo-path https://private.invalid?token=secret'
  await assert.rejects(assertPngFile(wx, '/private.png'), error => {
    assert.equal(error.code, 'PHOTO_FILE_DATA_INVALID')
    assert.match(errorText(error), /数据类型：string/)
    assert.doesNotMatch(errorText(error), /secret|https:|private|token=/)
    return true
  })
  data = Uint8Array.from([0, ...png.slice(1)]).buffer
  await assert.rejects(assertPngFile(wx, '/private.png'), error => {
    assert.equal(error.code, 'INVALID_PNG')
    assert.match(errorText(error), /文件头不是 PNG/)
    assert.doesNotMatch(errorText(error), /超过|private/)
    return true
  })
  wx.getFileSystemManager = () => { throw Object.assign(new Error('secret path /private/photo.png'), { code: 'NATIVE_PRIVATE_FAILURE' }) }
  await assert.rejects(assertPngFile(wx, '/private.png'), error => error.code === 'PHOTO_READ_FAILED' && !errorText(error).includes('secret'))
})

test('PNG processing failures show only safe output dimensions and bytes and never upload', async () => {
  const oldPage = globalThis.Page, oldWx = globalThis.wx
  let definition, remote = 0
  try {
    globalThis.Page = value => { definition = value }
    delete require.cache[require.resolve('../miniprogram/pages/meal/index.js')]
    require('../miniprogram/pages/meal/index.js')
    const canvas = { getContext: () => ({ clearRect() {}, drawImage() {} }),
      createImage: () => ({ set src(value) { queueMicrotask(() => this.onload()) } }) }
    const page = { data: { photoPending: false }, setData(value) { Object.assign(this.data, value) },
      createSelectorQuery: () => ({ select() { return this }, fields() { return this }, exec(callback) { callback([{ node: canvas }]) } }) }
    globalThis.wx = { showActionSheet: sourceChoice(), requirePrivacyAuthorize: callback({}),
      chooseMedia: callback({ tempFiles: [{ tempFilePath: '/private-camera.jpg' }] }), getImageInfo: callback({ width: 6000, height: 6000 }),
      canvasToTempFilePath: callback({ tempFilePath: '/private-clean.png' }), getFileInfo: callback({ size: 4194305 }),
      uploadFile() { remote++ }, request() { remote++ } }
    await definition.choose.call(page)
    assert.match(page.data.error, /PHOTO_TOO_LARGE/)
    assert.match(page.data.error, /输出：960×960/)
    assert.match(page.data.error, /4194305 字节/)
    assert.doesNotMatch(page.data.error, /private-camera|private-clean/)
    assert.equal(page._photoPath, undefined)
    assert.equal(page.data.photoPending, false)
    assert.equal(page._choosingPhoto, false)
    assert.equal(remote, 0)
  } finally { globalThis.Page = oldPage; globalThis.wx = oldWx }
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

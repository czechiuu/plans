const { wxCall, fail } = require('./client.js')

const signature = [137, 80, 78, 71, 13, 10, 26, 10]
const maxBytes = 4 * 1024 * 1024
// 960² RGBA8 is 3,686,400 bytes, leaving over 0.5 MB for PNG encoding; actual bytes are still checked.
const maxDimension = 960
const arrayBufferByteLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get
const processingCodes = new Set(['PHOTO_READ_FAILED', 'PHOTO_FILE_SIZE_INVALID', 'PHOTO_TOO_LARGE',
  'PHOTO_FILE_DATA_INVALID', 'PHOTO_FILE_SIZE_MISMATCH', 'INVALID_PNG', 'PHOTO_DIMENSIONS_INVALID',
  'PHOTO_CANVAS_UNAVAILABLE', 'PHOTO_SANITIZE_FAILED'])

async function photoStep(wx, method, options, code, stage) {
  if (typeof wx[method] !== 'function') throw Object.assign(fail(code), { photoStage: stage, photoReason: 'unsupported' })
  try {
    return await wxCall(wx[method].bind(wx), options, code)
  } catch (error) {
    const cause = error.cause || {}, reason = typeof cause.errMsg === 'string' ? cause.errMsg : ''
    if (/^(?:showActionSheet|requirePrivacyAuthorize|chooseMedia):fail cancel(?:led|ed)?(?:\s|$)/i.test(reason)) throw fail('CANCELLED')
    const denied = /^(?:requirePrivacyAuthorize|chooseMedia):fail (?:auth deny|permission denied|permission is denied)\b/i.test(reason)
    const category = denied ? 'permission-denied' : /(?:api|scope) (?:is )?not declared in (?:the )?privacy agreement/i.test(reason) ? 'privacy-declaration' :
      /^(?:showActionSheet|requirePrivacyAuthorize|chooseMedia):fail (?:api )?not support(?:ed)?\b/i.test(reason) ? 'unsupported' : 'unknown'
    throw Object.assign(fail(denied && stage === 'choose' ? 'PHOTO_PERMISSION_DENIED' : code), { photoStage: stage, photoReason: category,
      ...(Number.isSafeInteger(cause.errCode) ? { wxErrCode: cause.errCode } : {}),
      ...(Number.isSafeInteger(cause.errno) ? { wxErrno: cause.errno } : {}) })
  }
}

async function choosePhoto(wx) {
  const source = await photoStep(wx, 'showActionSheet', { itemList: ['现在拍照', '从手机相册选择'] }, 'PHOTO_SOURCE_FAILED', 'source')
  if (source?.tapIndex !== 0 && source?.tapIndex !== 1) throw Object.assign(fail('PHOTO_SOURCE_FAILED'), { photoStage: 'source', photoReason: 'unknown' })
  await photoStep(wx, 'requirePrivacyAuthorize', {}, 'PHOTO_PRIVACY_FAILED', 'privacy')
  const result = await photoStep(wx, 'chooseMedia', { count: 1, mediaType: ['image'],
    sourceType: [source.tapIndex === 0 ? 'camera' : 'album'], sizeType: ['original'] }, 'PHOTO_CHOOSE_FAILED', 'choose')
  const path = result?.tempFiles?.[0]?.tempFilePath
  if (result?.tempFiles?.length !== 1 || typeof path !== 'string' || !path) throw fail('PHOTO_EMPTY_RESULT')
  return path
}

async function assertPngFile(wx, path) {
  let size
  try {
    if (typeof path !== 'string' || !path) throw fail('PHOTO_READ_FAILED')
    const info = await wxCall(options => wx.getFileInfo(options), { filePath: path }, 'PHOTO_READ_FAILED')
    size = info?.size
    if (!Number.isSafeInteger(size) || size <= 0) throw fail('PHOTO_FILE_SIZE_INVALID')
    if (size > maxBytes) throw fail('PHOTO_TOO_LARGE')
    const fs = wx.getFileSystemManager()
    const file = await wxCall(fs.readFile.bind(fs), { filePath: path }, 'PHOTO_READ_FAILED')
    const data = file?.data
    try { arrayBufferByteLength.call(data) }
    catch { throw Object.assign(fail('PHOTO_FILE_DATA_INVALID'), {
      photoDataType: data === null ? 'null' : ArrayBuffer.isView(data) ? 'TypedArray' : typeof data }) }
    const bytes = new Uint8Array(data)
    if (bytes.length !== size) throw Object.assign(fail('PHOTO_FILE_SIZE_MISMATCH'), { photoReadBytes: bytes.length })
    if (signature.some((byte, index) => bytes[index] !== byte)) throw fail('INVALID_PNG')
    return { bytes: size }
  } catch (error) {
    throw Object.assign(processingCodes.has(error?.code) ? error : fail('PHOTO_READ_FAILED'), { photoStage: 'validate',
      ...(Number.isSafeInteger(size) && size >= 0 ? { photoBytes: size } : {}) })
  }
}

async function sanitizePhoto(wx, page, path) {
  let width, height
  try {
    const source = await wxCall(options => wx.getImageInfo(options), { src: path }, 'PHOTO_READ_FAILED')
    if (!Number.isSafeInteger(source?.width) || !Number.isSafeInteger(source?.height) || source.width <= 0 || source.height <= 0)
      throw fail('PHOTO_DIMENSIONS_INVALID')
    const scale = Math.min(1, maxDimension / Math.max(source.width, source.height))
    width = Math.max(1, Math.round(source.width * scale))
    height = Math.max(1, Math.round(source.height * scale))
    const canvas = await new Promise((resolve, reject) => {
      page.createSelectorQuery().select('#photoCanvas').fields({ node: true, size: true }).exec(result => {
        if (!result?.[0]?.node) reject(fail('PHOTO_CANVAS_UNAVAILABLE'))
        else resolve(result[0].node)
      })
    })
    canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d')
    const image = canvas.createImage()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(fail('PHOTO_READ_FAILED'))
      image.src = path
    })
    context.clearRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    const result = await new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({ canvas, x: 0, y: 0, width, height, destWidth: width, destHeight: height,
        fileType: 'png', success: resolve, fail: error => reject(Object.assign(fail('PHOTO_SANITIZE_FAILED'), { cause: error })) }, page)
    })
    await assertPngFile(wx, result.tempFilePath)
    return result.tempFilePath
  } catch (error) {
    throw Object.assign(processingCodes.has(error?.code) ? error : fail('PHOTO_SANITIZE_FAILED'), {
      photoStage: ['validate', 'sanitize'].includes(error?.photoStage) ? error.photoStage : 'sanitize',
      ...(width && height ? { photoWidth: width, photoHeight: height } : {}) })
  }
}

module.exports = { choosePhoto, sanitizePhoto, assertPngFile }

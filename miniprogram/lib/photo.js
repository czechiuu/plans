const { wxCall, fail } = require('./client.js')

const signature = [137, 80, 78, 71, 13, 10, 26, 10]
const maxBytes = 4 * 1024 * 1024

async function choosePhoto(wx, page) {
  try {
    await wxCall(wx.requirePrivacyAuthorize.bind(wx), {})
    const result = await wxCall(wx.chooseMedia.bind(wx), { count: 1, mediaType: ['image'],
      sourceType: ['album', 'camera'], sizeType: ['original'] })
    const path = result.tempFiles?.[0]?.tempFilePath
    if (!path || result.tempFiles.length !== 1) throw fail('PHOTO_CHOOSE_FAILED')
    return path
  } catch (error) {
    if (/cancel/i.test(error.cause?.errMsg || error.errMsg || '')) throw fail('CANCELLED')
    throw error
  }
}

async function assertPngFile(wx, path) {
  if (typeof path !== 'string' || !path) throw fail('INVALID_PNG')
  const info = await wxCall(wx.getFileInfo.bind(wx), { filePath: path })
  if (!Number.isInteger(info.size) || info.size <= 0 || info.size > maxBytes) throw fail('INVALID_PNG')
  const fs = wx.getFileSystemManager()
  const file = await wxCall(fs.readFile.bind(fs), { filePath: path })
  const bytes = new Uint8Array(file.data)
  if (bytes.length !== info.size || signature.some((byte, index) => bytes[index] !== byte)) throw fail('INVALID_PNG')
  return { bytes: info.size }
}

async function sanitizePhoto(wx, page, path) {
  const source = await wxCall(wx.getImageInfo.bind(wx), { src: path })
  if (!Number.isFinite(source.width) || !Number.isFinite(source.height) || source.width <= 0 || source.height <= 0)
    throw fail('INVALID_PNG')
  const scale = Math.min(1, 1280 / Math.max(source.width, source.height))
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
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
    image.onerror = () => reject(fail('INVALID_PNG'))
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
}

module.exports = { choosePhoto, sanitizePhoto, assertPngFile }

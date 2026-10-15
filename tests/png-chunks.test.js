import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { validateSanitizedPng } from '../shared/png.js'

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]), result = Buffer.alloc(body.length + 8)
  result.writeUInt32BE(data.length)
  body.copy(result, 4)
  let crc = 0xffffffff
  for (const value of body) {
    crc ^= value
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4)
  return result
}

function image(width = 128, height = 128, colorType = 6) {
  const header = Buffer.alloc(13), rowBytes = 1 + width * (colorType === 6 ? 4 : 3), raw = Buffer.alloc(rowBytes * height)
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = colorType
  let state = 0x12345678
  for (let index = 0; index < raw.length; index++) {
    if (index % rowBytes === 0) continue
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5
    raw[index] = state & 255
  }
  return { header, raw, compressed: deflateSync(raw), width, height }
}

function png(value, parts = [value.compressed], before = []) {
  return Buffer.concat([signature, chunk('IHDR', value.header), ...before, ...parts.map(part => chunk('IDAT', part)), chunk('IEND', Buffer.alloc(0))])
}

function split(data, count) {
  return Array.from({ length: count }, (_, index) => data.subarray(Math.floor(index * data.length / count), Math.floor((index + 1) * data.length / count)))
}

test('valid RGB and RGBA PNGs accept one or 386 consecutive IDAT chunks for the same image', async () => {
  for (const colorType of [2, 6]) {
    const value = image(128, 128, colorType), parts = split(value.compressed, 386)
    assert.equal(parts.length, 386)
    assert.ok(parts.every(part => part.length > 0))
    for (const bytes of [png(value), png(value, parts)]) {
      const result = await validateSanitizedPng(bytes)
      assert.deepEqual({ width: result.width, height: result.height, mime: result.mime }, { width: 128, height: 128, mime: 'image/png' })
      assert.equal(result.bytes, bytes.length)
      assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'))
    }
  }
})

test('many empty and small IDAT chunks remain valid within the existing total byte limit', async () => {
  const value = image(), parts = [...Array.from({ length: 10000 }, () => Buffer.alloc(0)), ...split(value.compressed, 386)]
  const bytes = png(value, parts)
  assert.ok(bytes.length < 4194304)
  assert.equal((await validateSanitizedPng(bytes)).bytes, bytes.length)
})

test('the PNG byte limit, CRC checks and sanitized chunk allowlist still reject invalid files', async () => {
  const value = image(), valid = png(value), badCrc = Buffer.from(valid)
  badCrc[badCrc.length - 1] ^= 1
  const unknown = png(value, [value.compressed], [chunk('tEXt', Buffer.from('key\0value'))])
  const oversized = Buffer.concat([valid, Buffer.alloc(4194305 - valid.length)])
  for (const bytes of [badCrc, unknown, oversized]) await assert.rejects(validateSanitizedPng(bytes), /INVALID_PNG/)
})

test('IDAT chunks cannot be separated by an otherwise permitted ancillary chunk', async () => {
  const value = image(), parts = split(value.compressed, 2), physical = Buffer.alloc(9)
  physical.writeUInt32BE(1); physical.writeUInt32BE(1, 4)
  const metadata = chunk('pHYs', physical)
  await validateSanitizedPng(png(value, [value.compressed], [metadata]))
  const interrupted = Buffer.concat([signature, chunk('IHDR', value.header), chunk('IDAT', parts[0]), metadata,
    chunk('IDAT', parts[1]), chunk('IEND', Buffer.alloc(0))])
  await assert.rejects(validateSanitizedPng(interrupted), /INVALID_PNG/)
})

test('exact decompressed length, PNG filter values and dimension bounds remain enforced', async () => {
  const value = image(), badFilter = Buffer.from(value.raw)
  badFilter[0] = 5
  for (const raw of [badFilter, value.raw.subarray(0, -1), Buffer.concat([value.raw, Buffer.from([0])])])
    await assert.rejects(validateSanitizedPng(png(value, [deflateSync(raw)])), /INVALID_PNG/)
  for (const value of [image(4097, 1), image(1, 4097)]) await assert.rejects(validateSanitizedPng(png(value)), /INVALID_PNG/)
})

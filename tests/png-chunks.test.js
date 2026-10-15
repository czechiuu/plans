import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { validateSanitizedPng, pngFailureReasons } from '../shared/png.js'
import { json, safeError } from '../supabase/functions/_shared/runtime.js'

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

test('RGB and RGBA sBIT accept significant bits 1 through 8 with one or 386 consecutive IDAT chunks', async () => {
  for (const colorType of [2, 6]) {
    const value = image(128, 128, colorType), channels = colorType === 6 ? 4 : 3
    for (let bits = 1; bits <= 8; bits++) {
      const metadata = chunk('sBIT', Buffer.alloc(channels, bits))
      for (const parts of [[value.compressed], split(value.compressed, 386)]) {
        const bytes = png(value, parts, [metadata]), result = await validateSanitizedPng(bytes)
        assert.equal(result.bytes, bytes.length)
        assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'))
      }
    }
  }
})

test('sBIT rejects wrong lengths, out-of-range values, duplicates, late placement and bad CRC', async () => {
  for (const colorType of [2, 6]) {
    const value = image(16, 16, colorType), channels = colorType === 6 ? 4 : 3
    const metadata = chunk('sBIT', Buffer.alloc(channels, 8))
    const invalid = [0, channels - 1, channels + 1].map(length => chunk('sBIT', Buffer.alloc(length, 8)))
    for (const bits of [0, 9]) {
      const data = Buffer.alloc(channels, 8); data[channels - 1] = bits
      invalid.push(chunk('sBIT', data))
    }
    for (const malformed of invalid)
      await assert.rejects(validateSanitizedPng(png(value, [value.compressed], [malformed])), { message: 'INVALID_PNG', pngReason: 'SBIT' })
    await assert.rejects(validateSanitizedPng(png(value, [value.compressed], [metadata, metadata])), { message: 'INVALID_PNG', pngReason: 'SBIT' })
    const late = Buffer.concat([signature, chunk('IHDR', value.header), chunk('IDAT', value.compressed), metadata, chunk('IEND', Buffer.alloc(0))])
    await assert.rejects(validateSanitizedPng(late), { message: 'INVALID_PNG', pngReason: 'ANCILLARY_ORDER' })
    const corrupted = Buffer.from(metadata); corrupted[corrupted.length - 1] ^= 1
    await assert.rejects(validateSanitizedPng(png(value, [value.compressed], [corrupted])), { message: 'INVALID_PNG', pngReason: 'CHUNK_CRC' })
  }
})

test('PNG diagnostics use fixed reasons and preserve filter and length failures through decompression', async () => {
  const value = image(), badFilter = Buffer.from(value.raw)
  badFilter[0] = 5
  const cases = [
    [png(value, [deflateSync(badFilter)]), 'FILTER'],
    [png(value, [deflateSync(value.raw.subarray(0, -1))]), 'SCANLINE_LENGTH'],
    [png(value, [deflateSync(Buffer.concat([value.raw, Buffer.from([0])]))]), 'SCANLINE_LENGTH'],
    [png(value, [Buffer.from([0, 1, 2])]), 'DEFLATE'],
    [png(value, [value.compressed], [chunk('tEXt', Buffer.from('private-photo-path\0private health text'))]), 'CHUNK_TYPE'],
  ]
  for (const [bytes, reason] of cases) {
    await assert.rejects(validateSanitizedPng(bytes), error => {
      assert.equal(error.message, 'INVALID_PNG')
      assert.equal(error.pngReason, reason)
      assert.ok(pngFailureReasons.includes(error.pngReason))
      assert.deepEqual(Object.keys(error), ['pngReason'])
      assert.doesNotMatch(JSON.stringify(error), /private|tEXt/)
      return true
    })
  }
})

async function photoEndpoint(validator = validateSanitizedPng) {
  const source = await readFile(new URL('../supabase/functions/health-photo/index.js', import.meta.url), 'utf8')
  const logs = []; let handle
  new Function('validateSanitizedPng', 'pngFailureReasons', 'allowedOrigin', 'preflight', 'authenticate', 'json', 'safeError', 'Deno', 'console',
    source.replace(/^import .+\r?\n/gm, ''))(validator, pngFailureReasons, () => null, () => { throw new Error('Unexpected preflight') },
    async () => ({ user: {}, admin: { async rpc() { return { data: { id: 'synthetic-photo', uploading: false } } } },
      id: 'synthetic-user', spaceId: 'synthetic-space' }), json, safeError,
    { serve(handler) { handle = handler } }, { warn(line) { logs.push(JSON.parse(line)) } })
  return { handle, logs }
}

function uploadRequest(bytes) {
  const form = new FormData()
  form.set('file', new Blob([bytes], { type: 'image/png' }), 'private-photo-path.png')
  form.set('is_shared', 'false')
  return new Request('https://synthetic.invalid/health-photo?action=upload', { method: 'POST', body: form })
}

test('multipart byte streams preserve PNG high bytes, sBIT and split IDAT chunks', async () => {
  const value = image(16, 16), bytes = png(value, split(value.compressed, 386), [chunk('sBIT', Buffer.from([8, 8, 8, 8]))])
  const endpoint = await photoEndpoint(async received => {
    assert.deepEqual(Buffer.from(received), bytes)
    return validateSanitizedPng(received)
  })
  const request = uploadRequest(bytes), body = new Uint8Array(await request.arrayBuffer())
  assert.ok(body.some(byte => byte > 127))
  let offset = 0
  const stream = new ReadableStream({ pull(controller) {
    if (offset === body.length) { controller.close(); return }
    const end = Math.min(offset + 17, body.length)
    controller.enqueue(body.subarray(offset, end)); offset = end
  } })
  const response = await endpoint.handle(new Request(request.url, { method: 'POST', headers: request.headers, body: stream, duplex: 'half' }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { photo_id: 'synthetic-photo', mime: 'image/png', width: 16, height: 16, bytes: bytes.length })
  assert.deepEqual(endpoint.logs, [])
})

test('photo rejection logs only fixed event, revision and reason and preserves its public error', async () => {
  const value = image(), bytes = png(value, [value.compressed], [chunk('tEXt', Buffer.from('private-photo-path\0private health text'))])
  for (const [validator, reason] of [[validateSanitizedPng, 'CHUNK_TYPE'],
    [async () => { throw Object.assign(new Error('INVALID_PNG'), { pngReason: 'private health text', userId: 'private-user' }) }, 'UNKNOWN']]) {
    const endpoint = await photoEndpoint(validator)
    const response = await endpoint.handle(uploadRequest(bytes))
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'INVALID_PNG' })
    assert.deepEqual(endpoint.logs, [{ event: 'photo_png_rejected', revision: '2026-10-15-sbit', reason }])
    assert.doesNotMatch(JSON.stringify(endpoint.logs), /private|tEXt/)
  }
})

test('oversized upload headers and actual bodies produce only the fixed request-size diagnostic', async () => {
  const url = 'https://synthetic.invalid/health-photo?action=upload', size = 5 * 1024 * 1024 + 1
  for (const request of [new Request(url, { method: 'POST', headers: { 'content-length': String(size) }, body: '' }),
    new Request(url, { method: 'POST', body: new Uint8Array(size) })]) {
    const endpoint = await photoEndpoint()
    const response = await endpoint.handle(request)
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'INVALID_PNG' })
    assert.deepEqual(endpoint.logs, [{ event: 'photo_png_rejected', revision: '2026-10-15-sbit', reason: 'REQUEST_SIZE' }])
  }
})

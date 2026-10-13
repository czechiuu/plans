import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateSanitizedPng } from '../shared/png.js';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, payload) {
  const name = Buffer.from(type);
  const body = Buffer.concat([name, payload]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(payload.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), out.length - 4);
  return out;
}

test('photo validator rejects a CRC-correct PNG with invalid compressed image data', async () => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', Buffer.from([0, 1, 2])),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  await assert.rejects(validateSanitizedPng(png), /INVALID_PNG/);
});

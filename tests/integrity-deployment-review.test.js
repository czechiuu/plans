import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { request } from 'node:http'
import { createDeploymentReviewServer } from '../scripts/serve-deployment-review.mjs'

test('deployment review exposes exactly four complete files with precise hashes, on loopback only', async () => {
  const server = await createDeploymentReviewServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  try {
    assert.equal(server.address().address, '127.0.0.1')
    const get = (path, method = 'GET') => new Promise((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method }, response => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', chunk => { body += chunk })
        response.on('end', () => resolve({ status: response.statusCode, body, headers: response.headers }))
      })
      req.once('error', reject)
      req.end()
    })
    const result = await get('/')
    assert.equal(result.status, 200)
    assert.equal(result.headers['cache-control'], 'no-store')
    assert.match(result.headers['content-security-policy'], /default-src 'none'/)
    const textareas = [...result.body.matchAll(/<textarea\b[^>]*\breadonly[^>]*>([\s\S]*?)<\/textarea>/g)]
    assert.equal(textareas.length, 4)
    const paths = ['supabase/admin/apply-input-snapshots-009.sql', ...['health-ai', 'health-photo', 'health-cron'].map(name => `supabase/bundles/${name}.js`)]
    for (const [index, path] of paths.entries()) {
      const bytes = await readFile(new URL(`../${path}`, import.meta.url))
      const original = textareas[index][1].replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
      assert.equal(original, bytes.toString('utf8'))
      assert.ok(result.body.includes(`<output id="bytes-${index}">${bytes.length}</output>`))
      assert.ok(result.body.includes(`<output id="sha256-${index}">${createHash('sha256').update(bytes).digest('hex')}</output>`))
    }
    for (const path of ['/../.env', '/%2e%2e/.env', '/supabase/admin/apply-daily-flow-006-008.sql', '/?path=.env', '/private/', '/api']) {
      const denied = await get(path)
      assert.equal(denied.status, 404)
      assert.equal(denied.body, 'Not found')
    }
    assert.equal((await get('/', 'POST')).status, 404)
  } finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
})

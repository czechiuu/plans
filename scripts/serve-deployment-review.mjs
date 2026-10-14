import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const artifacts = [
  ['006 / 007 / 008 数据库执行包', 'supabase/admin/apply-daily-flow-006-008.sql'],
  ['health-ai', 'supabase/bundles/health-ai.js'],
  ['health-photo', 'supabase/bundles/health-photo.js'],
  ['health-cron', 'supabase/bundles/health-cron.js'],
]
const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function createDeploymentReviewServer() {
  const sections = await Promise.all(artifacts.map(async ([label, path], index) => {
    const bytes = await readFile(new URL(`../${path}`, import.meta.url))
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return `<section><h2>${label}</h2><p>${path}</p><p>字节数：<output id="bytes-${index}">${bytes.length}</output> SHA256：<output id="sha256-${index}">${sha256}</output></p><label for="source-${index}">${label} 完整原文</label><br><textarea id="source-${index}" rows="12" cols="100" readonly spellcheck="false">${escapeHtml(text)}</textarea></section>`
  }))
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>部署文件审阅</title><body><h1>部署文件审阅</h1><p>仅显示启动时读取的四项部署文件。源文件变化后请重启此服务。此页面不会修改云端。</p>${sections.join('\n')}</body></html>`
  return createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
    response.setHeader('X-Content-Type-Options', 'nosniff')
    if (request.method !== 'GET' || request.url !== '/') {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Not found')
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(html)
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argument = process.argv[2] ?? '4319'
  if (process.argv.length > 3 || !/^\d+$/.test(argument) || Number(argument) < 1 || Number(argument) > 65535)
    throw new Error('Usage: node scripts/serve-deployment-review.mjs [port: 1-65535]')
  const server = await createDeploymentReviewServer()
  server.listen(Number(argument), '127.0.0.1', () => {
    console.log(`Deployment review: http://127.0.0.1:${server.address().port}/ (4 read-only artifacts)`)
  })
}

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './test-helpers/browser.mjs'

const site = 'https://czechiuu.github.io/plans/'
const sourceShaSupplied = process.env.DEPLOYED_SOURCE_SHA
const deploymentRunSupplied = process.env.DEPLOYED_RUN_URL
assert.match(sourceShaSupplied ?? '', /^[0-9a-f]{40}$/i, 'DEPLOYED_SOURCE_SHA must be a full 40-character commit SHA')
assert.match(deploymentRunSupplied ?? '', /^https:\/\/github\.com\/czechiuu\/plans\/actions\/runs\/[1-9][0-9]*$/, 'DEPLOYED_RUN_URL must identify a czechiuu/plans GitHub Actions run')
const ids = ['PUBLIC_HTTP_REDIRECT','PUBLIC_HTTPS_HTML','PUBLIC_SUBPATH_ASSETS','PUBLIC_MOBILE_LOGIN','PUBLIC_DESKTOP_LOGIN','PUBLIC_REFRESH','PUBLIC_AUTH_CALLBACK_URL','PUBLIC_RUNTIME_ERRORS']
const cases = [], diagnostics = { page_errors: 0, console_errors: 0, request_failures: 0, asset_http_errors: 0 }
const hashes = {}
const screenshots = []
const check = async (id, fn) => {
  try { await fn(); cases.push({ id, status: 'passed' }) }
  catch (error) { cases.push({ id, status: 'failed' }); throw error }
}
const sha256 = value => createHash('sha256').update(value).digest('hex')
const loginVisible = async page => {
  await page.getByRole('heading', { name: '欢迎回来' }).waitFor()
  assert.equal(await page.locator('[data-form="signin"] input[type="password"]').count(), 1)
  assert.equal(await page.locator('[data-form="signin"] input[name="slot"]').count(), 2)
  assert.equal(await page.getByRole('button', { name: '登录', exact: true }).count(), 1)
  assert.equal(await page.locator('nav[aria-label="主导航"]').count(), 0)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
}

let browser, mobile, desktop, errorKind = null
try {
  await check(ids[0], async () => {
    const response = await fetch('http://czechiuu.github.io/plans/', { redirect: 'manual' })
    assert.ok([301, 302, 307, 308].includes(response.status))
    assert.equal(new URL(response.headers.get('location'), 'http://czechiuu.github.io').href, site)
  })
  browser = await launchBrowser()
  mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1, reducedMotion: 'reduce' })
  desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  const mobilePage = await mobile.newPage(), desktopPage = await desktop.newPage()
  for (const page of [mobilePage, desktopPage]) {
    page.on('pageerror', () => diagnostics.page_errors++)
    page.on('console', message => { if (message.type() === 'error') diagnostics.console_errors++ })
    page.on('requestfailed', () => diagnostics.request_failures++)
    page.on('response', response => { if (/\/plans\/assets\//.test(response.url()) && !response.ok()) diagnostics.asset_http_errors++ })
  }
  await check(ids[1], async () => {
    const response = await mobilePage.goto(site)
    assert.equal(response?.status(), 200)
    assert.equal(new URL(mobilePage.url()).pathname, '/plans/')
    assert.match(await mobilePage.title(), /两个人的日常/)
    await loginVisible(mobilePage)
  })
  await check(ids[2], async () => {
    const assets = await mobilePage.evaluate(() => ({
      js: document.querySelector('script[type="module"][src]')?.getAttribute('src'),
      css: document.querySelector('link[rel="stylesheet"][href]')?.getAttribute('href'),
    }))
    for (const [kind, path] of Object.entries(assets)) {
      assert.ok(path, `${kind} reference missing`)
      const asset = new URL(path, site)
      assert.equal(asset.origin, new URL(site).origin)
      assert.match(asset.pathname, /^\/plans\/assets\/[^/]+\.(js|css)$/)
      const response = await mobilePage.request.get(asset.href)
      assert.equal(response.status(), 200)
      hashes[kind] = sha256(await response.body())
    }
  })
  await check(ids[3], async () => {
    await loginVisible(mobilePage)
    await mobilePage.screenshot({ path: fileURLToPath(new URL('../test-results/public-mobile-login.png', import.meta.url)) })
    screenshots.push('test-results/public-mobile-login.png')
  })
  await check(ids[4], async () => {
    const response = await desktopPage.goto(site)
    assert.equal(response?.status(), 200)
    await loginVisible(desktopPage)
    await desktopPage.screenshot({ path: fileURLToPath(new URL('../test-results/public-desktop-login.png', import.meta.url)) })
    screenshots.push('test-results/public-desktop-login.png')
  })
  await check(ids[5], async () => {
    const response = await mobilePage.reload()
    assert.equal(response?.status(), 200)
    await loginVisible(mobilePage)
  })
  await check(ids[6], async () => {
    const callback = `${site}index.html?code=SYNTHETIC_INVALID&state=SYNTHETIC_INVALID#access_token=SYNTHETIC_INVALID&type=recovery`
    const response = await mobilePage.goto(callback)
    assert.equal(response?.status(), 200)
    await loginVisible(mobilePage)
    assert.equal(new URL(mobilePage.url()).pathname, '/plans/index.html')
  })
  await check(ids[7], async () => assert.deepEqual(diagnostics, { page_errors: 0, console_errors: 0, request_failures: 0, asset_http_errors: 0 }))
} catch (error) {
  errorKind = error?.name || 'Error'
} finally {
  await mobile?.close(); await desktop?.close(); await browser?.close()
  for (const id of ids) if (!cases.some(item => item.id === id)) cases.push({ id, status: 'notrun' })
  const counts = Object.fromEntries(['passed','failed','notrun'].map(status => [status, cases.filter(item => item.status === status).length]))
  const report = { generated_at: new Date().toISOString(), scope: 'published-anonymous-page-only', site, source_sha_supplied: sourceShaSupplied, deployment_run_supplied: deploymentRunSupplied, ...counts, cases, asset_sha256: hashes, runtime_error_counts: diagnostics, screenshots, limitations: ['No real password or authenticated account was used', 'No health data, AI call, or physical device was tested'], ...(errorKind ? { failure_kind: errorKind } : {}) }
  await writeFile(new URL('../test-results/deployed-public-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(JSON.stringify({ scope: report.scope, ...counts }) + '\n')
  if (counts.failed || counts.notrun) process.exitCode = 1
}

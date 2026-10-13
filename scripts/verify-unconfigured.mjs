import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { report, runCase } from './test-helpers/report.mjs'
import { browserOrigin, launchBrowser } from './test-helpers/browser.mjs'

const cases = [], details = []
let browser
try {
  browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Los_Angeles' })
  const origin = browserOrigin()
  await runCase(cases, details, 'UNCONFIGURED_PAGE', async () => {
    await page.goto(origin)
    await page.getByRole('heading', { name: '先连接私人后台' }).waitFor()
    assert.equal(await page.locator('form').count(), 0)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: fileURLToPath(new URL('../test-results/desktop-unconfigured.png', import.meta.url)), fullPage: true })
  })
  await runCase(cases, details, 'PRIVATE_PATH_DENIED', async () => {
    const response = await page.request.get(origin + '/private/my-profile.json')
    assert.equal(response.status(), 403)
  })
} catch { /* runCase already records the failure; launch errors are recorded below. */
  if (!cases.some(item => item.status === 'failed')) { cases.push({ id: 'UNCONFIGURED_SETUP', status: 'failed' }); details.push({ id: 'UNCONFIGURED_SETUP', error: 'Browser launch or origin failed' }) }
} finally {
  await browser?.close()
  for (const id of ['UNCONFIGURED_PAGE','PRIVATE_PATH_DENIED']) if (!cases.some(item => item.id === id)) cases.push({ id, status:'notrun' })
  await report('unconfigured', 'real-unconfigured-local', cases, details)
}

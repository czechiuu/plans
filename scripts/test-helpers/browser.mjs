import { chromium } from 'playwright'
import { existsSync } from 'node:fs'

export function browserOrigin() {
  const url = new URL(process.env.TEST_SITE_URL || 'http://127.0.0.1:5173/')
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol !== 'http:') throw new Error('Local browser checks require a local HTTP server')
  return url.origin
}

export async function launchBrowser() {
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  const executablePath = process.env.TEST_BROWSER_PATH || (existsSync(chrome) ? chrome : undefined)
  return chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
}

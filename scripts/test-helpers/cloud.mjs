import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { validateConfig } from '../../src/domain.js'

export const fixedEmails = ['me@plans.invalid', 'w@plans.invalid']
export const requiredCloudNames = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'TEST_ME_PASSWORD', 'TEST_W_PASSWORD']

export function cloudPublicSetup() {
  const missing = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'].filter(name => !process.env[name])
  if (missing.length) return { blocked:true, reason:`Missing ${missing.join(', ')}` }
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key } = process.env
  const validation = validateConfig(url, key)
  if (!validation.configured) return { blocked:true, reason:validation.error }
  if (new URL(url).hostname !== 'wnzbtitlvteptkvwhavw.supabase.co')
    return { blocked:true, reason:'Wrong Supabase project' }
  return { url, key }
}

export function cloudSetup(extra = []) {
  const missing = [...requiredCloudNames, ...extra].filter(name => !process.env[name])
  if (process.env.TEST_FIXED_ACCOUNTS_APPROVED !== 'YES') missing.push('TEST_FIXED_ACCOUNTS_APPROVED=YES')
  if (missing.length) return { blocked: true, reason: `Missing ${missing.join(', ')}` }
  const publicSetup = cloudPublicSetup()
  if (publicSetup.blocked) return publicSetup
  const { url, key } = publicSetup
  return { url, key, emails: fixedEmails, passwords: [process.env.TEST_ME_PASSWORD, process.env.TEST_W_PASSWORD] }
}

export function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function ok(promise) {
  const { data, error } = await promise
  if (error) throw error
  return data
}

export async function denied(promise, expectedCodes) {
  const { error } = await promise
  assert.ok(error, 'Expected server denial')
  assert.ok(expectedCodes.includes(error.code), `Expected SQL rejection, got ${error.code || 'no-code'}`)
}

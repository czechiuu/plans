import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { validateConfig } from '../../src/domain.js'

export const requiredCloudNames = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', ...'ABC'.split('').flatMap(label => [`TEST_${label}_EMAIL`, `TEST_${label}_PASSWORD`])]

export function cloudSetup(extra = []) {
  const missing = [...requiredCloudNames, ...extra].filter(name => !process.env[name])
  if (process.env.TEST_ACCOUNTS_ARE_DISPOSABLE !== 'YES') missing.push('TEST_ACCOUNTS_ARE_DISPOSABLE=YES')
  if (missing.length) return { blocked: true, reason: `Missing ${missing.join(', ')}` }
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key } = process.env
  const validation = validateConfig(url, key)
  if (!validation.configured) return { blocked: true, reason: validation.error }
  const emails = 'ABC'.split('').map(label => process.env[`TEST_${label}_EMAIL`])
  assert.equal(new Set(emails).size, 3, 'Dedicated account emails must be distinct')
  return { url, key, emails, passwords: 'ABC'.split('').map(label => process.env[`TEST_${label}_PASSWORD`]) }
}

export function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function ok(promise) {
  const { data, error } = await promise
  if (error) throw error
  return data
}

export async function denied(promise) {
  const { error } = await promise
  assert.ok(error, 'Expected server denial')
}

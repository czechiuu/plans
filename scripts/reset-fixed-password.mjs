import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'
import { emails } from '../src/fixed-account.js'

const projectUrl = 'https://wnzbtitlvteptkvwhavw.supabase.co'
const fail = code => { throw Object.assign(new Error(code), { code }) }
const safeCodes = new Set(['INPUT_INVALID', 'REGISTRY_READ_FAILED', 'REGISTRY_MISMATCH', 'AUTH_LIST_FAILED', 'AUTH_MISMATCH', 'AUTH_UPDATE_FAILED', 'AUTH_UPDATE_UNCONFIRMED'])

export async function resetFixedPassword(client, slot, password) {
  if (!Object.hasOwn(emails, slot) || typeof password !== 'string' || password.length < 8) fail('INPUT_INVALID')
  const registry = await client.from('fixed_accounts').select('slot,user_id,space_id')
  if (registry.error) fail('REGISTRY_READ_FAILED')
  const rows = registry.data
  if (!Array.isArray(rows) || rows.length !== 2 || new Set(rows.map(row => row.slot)).size !== 2 ||
      !rows[0].space_id || !rows.every(row => Object.hasOwn(emails, row.slot) && row.user_id && row.space_id === rows[0].space_id)) fail('REGISTRY_MISMATCH')

  const listed = await client.auth.admin.listUsers({ page: 1, perPage: 3 })
  if (listed.error) fail('AUTH_LIST_FAILED')
  const users = listed.data?.users
  if (!Array.isArray(users) || users.length !== 2 ||
      !rows.every(row => users.some(user => user.id === row.user_id && user.email === emails[row.slot]))) fail('AUTH_MISMATCH')

  const target = rows.find(row => row.slot === slot)
  const updated = await client.auth.admin.updateUserById(target.user_id, { password })
  if (updated.error) fail('AUTH_UPDATE_FAILED')
  if (updated.data?.user?.id !== target.user_id || updated.data.user.email !== emails[slot]) fail('AUTH_UPDATE_UNCONFIRMED')
}

async function main() {
  const slot = process.argv[2]
  const secret = process.env.PH_RESET_ADMIN_SECRET
  const password = process.env.PH_RESET_NEW_PASSWORD
  delete process.env.PH_RESET_ADMIN_SECRET
  delete process.env.PH_RESET_NEW_PASSWORD
  if (!Object.hasOwn(emails, slot) || !secret || !password) fail('INPUT_INVALID')
  const client = createClient(projectUrl, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  await resetFixedPassword(client, slot, password)
  process.stdout.write(`RESET_OK:${slot}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { process.stderr.write(`RESET_FAILED:${safeCodes.has(error?.code) ? error.code : 'UNEXPECTED'}\n`); process.exitCode = 1 })
}

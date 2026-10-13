import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'
import { emails } from '../src/fixed-account.js'
import { readHidden } from './secure-input.mjs'

const projectUrl = 'https://wnzbtitlvteptkvwhavw.supabase.co'
const fail = code => { throw Object.assign(new Error(code), { code }) }
const safeCodes = new Set(['INPUT_INVALID', 'INPUT_CANCELLED', 'TTY_REQUIRED', 'PASSWORD_MISMATCH', 'REGISTRY_READ_FAILED', 'REGISTRY_MISMATCH', 'AUTH_LIST_FAILED', 'AUTH_MISMATCH', 'AUTH_UPDATE_FAILED', 'AUTH_UPDATE_UNCONFIRMED'])

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
  if (process.argv.length !== 3 || !Object.hasOwn(emails, slot)) fail('INPUT_INVALID')
  const stdin = process.stdin
  if (!stdin.isTTY || !process.stdout.isTTY || typeof stdin.setRawMode !== 'function') fail('TTY_REQUIRED')
  const wasRaw = Boolean(stdin.isRaw)
  let secret, password, confirmation
  try {
    stdin.setRawMode(true)
    secret = await readHidden('输入本项目管理员 secret/service_role 密钥: ')
    password = await readHidden('输入新密码: ')
    confirmation = await readHidden('再次输入新密码: ')
  } finally {
    stdin.setRawMode(wasRaw)
    stdin.pause()
  }
  if (!secret || password.length < 8) fail('INPUT_INVALID')
  if (password !== confirmation) fail('PASSWORD_MISMATCH')
  const client = createClient(projectUrl, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  await resetFixedPassword(client, slot, password)
  process.stdout.write(`RESET_OK:${slot}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { process.stderr.write(`RESET_FAILED:${safeCodes.has(error?.code) ? error.code : 'UNEXPECTED'}\n`); process.exitCode = 1 })
}

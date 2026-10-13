import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { validateConfig } from '../src/domain.js'

const names = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'TEST_A_EMAIL', 'TEST_A_PASSWORD', 'TEST_B_EMAIL', 'TEST_B_PASSWORD', 'TEST_C_EMAIL', 'TEST_C_PASSWORD']
const missing = names.filter(name => !process.env[name])
if (missing.length) {
  console.error(`云端核验未运行：缺少 ${missing.join(', ')}。这不是通过结果。`)
  process.exit(1)
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_PUBLISHABLE_KEY
const validation = validateConfig(url, key)
if (!validation.configured) {
  console.error(`云端配置不合格：${validation.error}`)
  process.exit(1)
}

const anonymous = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const clients = ['A', 'B', 'C'].map(label => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
}))
const made = [false, false, false]
let count = 0

async function ok(promise) {
  const { data, error } = await promise
  if (error) throw error
  return data
}
async function shouldFail(promise) {
  const { error } = await promise
  assert.ok(error, 'expected server denial')
  count++
}

try {
  await shouldFail(anonymous.from('members').select('user_id'))
  await shouldFail(anonymous.from('weights').select('id'))
  await shouldFail(anonymous.rpc('create_space', { p_name: 'SYNTHETIC ANONYMOUS', p_display_name: 'Anonymous' }))
  const users = []
  for (let i = 0; i < 3; i++) {
    const label = 'ABC'[i]
    const data = await ok(clients[i].auth.signInWithPassword({
      email: process.env[`TEST_${label}_EMAIL`], password: process.env[`TEST_${label}_PASSWORD`]
    }))
    assert.ok(data.user)
    users.push(data.user.id)
  }
  assert.equal(new Set(users).size, 3, 'test accounts must be distinct')
  for (let i = 0; i < 3; i++) {
    const member = await ok(clients[i].from('members').select('space_id').eq('user_id', users[i]))
    assert.equal(member.length, 0, 'test account already belongs to a space; use clean accounts')
  }

  const stamp = `synthetic-${Date.now()}`
  const spaceA = await ok(clients[0].rpc('create_space', { p_name: stamp, p_display_name: 'Synthetic A' }))
  made[0] = true
  const invite = (await ok(clients[0].rpc('create_invite')))[0]
  assert.ok(invite?.token)
  await ok(clients[1].rpc('join_space', { p_token: invite.token, p_display_name: 'Synthetic B', p_settings: {} }))
  made[1] = true
  await shouldFail(clients[2].rpc('join_space', { p_token: invite.token, p_display_name: 'Synthetic C', p_settings: {} }))
  await shouldFail(clients[0].rpc('create_invite'))
  const spaceC = await ok(clients[2].rpc('create_space', { p_name: `${stamp}-other`, p_display_name: 'Synthetic C' }))
  made[2] = true
  assert.notEqual(spaceA, spaceC)
  count++
  assert.equal((await ok(clients[2].from('spaces').select('id').eq('id', spaceA))).length, 0)
  count++

  const day = '2026-10-13'
  const profile = await ok(clients[0].rpc('save_profile', { p_payload: { age: 30, health_notes: 'SYNTHETIC TEST ONLY', is_shared: false } }).single())
  const schedule = await ok(clients[0].rpc('save_schedule', { p_payload: {
    user_id: users[0], record_date: day, raw_text: 'SYNTHETIC TEST ONLY', exercise_intent: 'unknown', is_shared: false
  } }).single())
  await ok(clients[0].rpc('save_weight', { p_payload: {
    user_id: users[0], record_date: day, weight_kg: 70, is_shared: false
  } }).single())
  for (const table of ['health_profiles', 'schedules', 'weights']) {
    assert.equal((await ok(clients[1].from(table).select('id'))).length, 0)
    assert.equal((await ok(clients[2].from(table).select('id'))).length, 0)
  }
  count++
  await shouldFail(clients[1].from('schedules').update({ raw_text: 'forbidden' }).eq('id', schedule.id).select())

  const settings = { share_profile: true, share_schedule: true, share_weight: true, allow_partner_edit: false }
  await ok(clients[0].rpc('save_settings', { p_settings: settings }))
  assert.equal((await ok(clients[1].from('schedules').select('id'))).length, 0)
  count++
  await ok(clients[0].rpc('save_profile', { p_payload: {
    age: 30, health_notes: 'SYNTHETIC TEST ONLY', is_shared: true, expected_updated_at: profile.updated_at
  } }).single())
  const shared = await ok(clients[0].rpc('save_schedule', { p_payload: {
    user_id: users[0], record_date: day, raw_text: 'SYNTHETIC SHARED', exercise_intent: 'unknown',
    is_shared: true, expected_updated_at: schedule.updated_at
  }, p_id: schedule.id }).single())
  assert.equal((await ok(clients[1].from('schedules').select('id'))).length, 1)
  assert.equal((await ok(clients[1].from('health_profiles').select('id'))).length, 1)
  count++
  await shouldFail(clients[1].rpc('save_schedule', { p_payload: {
    user_id: users[0], record_date: day, raw_text: 'SYNTHETIC PARTNER', exercise_intent: 'unknown',
    is_shared: true, expected_updated_at: shared.updated_at
  }, p_id: schedule.id }).single())
  await ok(clients[0].rpc('save_settings', { p_settings: { ...settings, allow_partner_edit: true } }))
  const edited = await ok(clients[1].rpc('save_schedule', { p_payload: {
    user_id: users[0], record_date: day, raw_text: 'SYNTHETIC PARTNER', exercise_intent: 'unknown',
    is_shared: true, expected_updated_at: shared.updated_at
  }, p_id: schedule.id }).single())
  assert.equal(edited.updated_by, users[1])
  count++
  await shouldFail(clients[0].rpc('save_schedule', { p_payload: {
    user_id: users[0], record_date: day, raw_text: 'STALE SYNTHETIC', exercise_intent: 'unknown',
    is_shared: true, expected_updated_at: shared.updated_at
  }, p_id: schedule.id }).single())
  console.log(`真实云端核验通过：${count} 项；仅使用合成数据。`)
} catch (error) {
  console.error(`真实云端核验失败：${error.message}`)
  process.exitCode = 1
} finally {
  for (let i = 0; i < 3; i++) {
    if (made[i]) {
      try { await ok(clients[i].rpc('leave_space')) }
      catch (error) { console.error(`测试账号 ${'ABC'[i]} 清理失败：${error.message}`); process.exitCode = 1 }
    }
    try { await clients[i].auth.signOut() } catch { /* session already gone */ }
  }
}

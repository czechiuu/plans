import { createClient } from '@supabase/supabase-js'
import { shanghaiDate, validateConfig } from './domain.js'
import { emails, verifiedUser as verifyFixedUser } from './fixed-account.js'
import { updatePasswordWithToken } from './auth-password.js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const validation = validateConfig(url, key)
export const configured = validation.configured
export const configurationError = validation.error
const client = configured ? createClient(url, key, { auth: { detectSessionInUrl: false } }) : null
let mutationToken = null

function bound() {
  if (!mutationToken) throw Object.assign(new Error('会话已变化'),{code:'ACCOUNT_CHANGED'})
  const token=mutationToken
  return createClient(url,key,{accessToken:async()=>token,auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
}

function ready() {
  if (!client) throw new Error(configurationError || '尚未配置 Supabase')
  return client
}

async function result(promise) {
  const { data, error } = await promise
  if (error) throw error
  return data
}

async function edgeResult(promise) {
  const { data, error } = await promise
  if (error) {
    const response = error.context
    if (response instanceof Response) {
      const body = await response.clone().json().catch(() => null)
      if (typeof body?.error === 'string' && /^[A-Z0-9_]{1,80}$/.test(body.error)) error.code = body.error
    }
    throw error
  }
  return data
}

const verifiedUser = expectedSlot => verifyFixedUser(ready(), expectedSlot)
const healthTables = ['health_rules', 'daily_plans', 'generation_jobs', 'training_sessions', 'meals', 'photo_assets', 'ai_consents']

async function allPages(table, column, value) {
  const rows = []
  for (let offset = 0;; offset += 500) {
    const page = await result(ready().from(table).select('*').eq(column, value).order('created_at', { ascending: true }).order('id').range(offset, offset + 499))
    rows.push(...page)
    if (page.length < 500) return rows
  }
}

export const api = {
  async withAuthToken(token, action) {
    if (!token) return action()
    if (mutationToken) throw new Error('已有操作进行中')
    mutationToken=token
    try { return await action() } finally { mutationToken=null }
  },
  async session() {
    const { data: { session }, error } = await ready().auth.getSession()
    if (error) throw error
    return session
  },
  onAuthChange(callback) {
    const { data: { subscription } } = ready().auth.onAuthStateChange((event, session) => callback(session, event))
    return () => subscription.unsubscribe()
  },
  async currentAccount() { return (await verifiedUser()).account },
  async signIn(slot, password) {
    if (!emails[slot]) throw Object.assign(new Error('请选择固定账号'), { code: 'ACCOUNT_DENIED' })
    await result(ready().auth.signInWithPassword({ email: emails[slot], password }))
    await verifiedUser(slot)
  },
  async signOut() {
    const { error } = await ready().auth.signOut({ scope: 'local' })
    const { data, error: sessionError } = await ready().auth.getSession()
    if (sessionError || data?.session) throw Object.assign(new Error('本机退出未完成'), { code: 'SIGNOUT_INCOMPLETE' })
    if (error) throw Object.assign(new Error('服务器退出请求未确认'), { code: 'SIGNOUT_UNCONFIRMED' })
  },
  async updatePassword(currentPassword, newPassword) {
    const token = mutationToken
    if (!token) throw Object.assign(new Error('会话已变化'), { code: 'ACCOUNT_CHANGED' })
    const { user } = await verifiedUser()
    if ((await this.session())?.access_token !== token) throw Object.assign(new Error('会话已变化'), { code: 'ACCOUNT_CHANGED' })
    const updatedId = await updatePasswordWithToken(fetch, url, key, token, currentPassword, newPassword)
    if (updatedId !== user.id) throw Object.assign(new Error('账号已变化'), { code: 'ACCOUNT_CHANGED' })
  },
  async load() {
    const { user, account } = await verifiedUser()
    const member = await result(ready().from('members').select('space_id').eq('user_id', user.id).maybeSingle())
    const today = shanghaiDate()
    if (!member) return { user, account, space: null, members: [], profile: null, profiles: [], schedules: [], weights: [], audit: [], healthAvailable: false, range: { from: today, to: today } }
    const spaceId = member.space_id
    const schema = await ready().rpc('health_schema_version')
    if (schema.error && schema.error.code !== 'PGRST202') throw schema.error
    const healthAvailable = !schema.error && schema.data === 4
    if (!schema.error && !healthAvailable) throw new Error('健康功能版本不匹配')
    const [space, members, profiles, schedules, weights, audit, ...healthRows] = await Promise.all([
      result(ready().from('spaces').select('id,name').eq('id', spaceId).single()),
      result(ready().from('members').select(healthAvailable ? 'space_id,user_id,display_name,share_profile,share_schedule,share_weight,share_plan,share_training,share_meal,share_photo,allow_partner_edit' : 'space_id,user_id,display_name,share_profile,share_schedule,share_weight,allow_partner_edit').eq('space_id', spaceId)),
      result(ready().from('health_profiles').select('*').eq('space_id', spaceId)),
      allPages('schedules', 'space_id', spaceId),
      allPages('weights', 'space_id', spaceId),
      result(ready().from('audit_events').select('*').eq('space_id', spaceId).order('created_at', { ascending: false }).limit(100)),
      ...(healthAvailable ? healthTables.map(table => allPages(table, 'space_id', spaceId)) : [])
    ])
    const health = Object.fromEntries(healthTables.map((table, index) => [table, healthRows[index] ?? []]))
    const dates = [...schedules, ...weights].map(row => row.record_date).sort()
    const range = { from: dates[0] ?? today, to: dates.at(-1) ?? today }
    return { user, account, space, members, profile: profiles.find(row => row.user_id === user.id) ?? null, profiles, schedules, weights, audit, healthAvailable, ...health, range }
  },
  async saveSettings(settings) { await result(bound().rpc('save_settings', { p_settings: settings })) },
  async saveProfile(payload) { return result(bound().rpc('save_profile', { p_payload: payload }).single()) },
  async saveSchedule(payload, id = null) { return result(bound().rpc('save_schedule', { p_payload: payload, p_id: id }).single()) },
  async saveConfirmedSchedule(payload, id = null) { return result(bound().rpc('save_confirmed_schedule', { p_payload: payload, p_id: id }).single()) },
  async deleteSchedule(id) { await result(bound().rpc('delete_schedule', { p_id: id })) },
  async saveWeight(payload, id = null) { return result(bound().rpc('save_weight', { p_payload: payload, p_id: id }).single()) },
  async deleteWeight(id) { await result(bound().rpc('delete_weight', { p_id: id })) },
  async saveHealthRules(rules, isShared, expectedUpdatedAt = null) { return result(bound().rpc('save_health_rules', { p_rules: rules, p_is_shared: isShared, p_expected_updated_at: expectedUpdatedAt }).single()) },
  async confirmTrainingHistory(expectedUpdatedAt) { return result(bound().rpc('confirm_training_history', { p_expected_updated_at: expectedUpdatedAt }).single()) },
  async saveHealthSharing(settings) { await result(bound().rpc('save_health_sharing', { p_settings: settings })) },
  async saveDailyPlan(targetDate, content, expectedVersion = null, isShared = false) { return result(bound().rpc('save_daily_plan', { p_target_date: targetDate, p_content: content, p_expected_version: expectedVersion, p_is_shared: isShared }).single()) },
  async setPlanLock(id, locked, expectedUpdatedAt) { return result(bound().rpc('set_plan_lock', { p_id: id, p_locked: locked, p_expected_updated_at: expectedUpdatedAt }).single()) },
  async requestPlanGeneration(targetDate) { return result(bound().rpc('request_plan_generation', { p_target_date: targetDate }).single()) },
  async retryGenerationJob(id) { return result(bound().rpc('retry_generation_job', { p_id: id }).single()) },
  async generatePlan(jobId) { return edgeResult(bound().functions.invoke('health-ai', { body: { action: 'generate-plan', job_id: jobId } })) },
  async saveTrainingSession(payload, id = null) { return result(bound().rpc('save_training_session', { p_payload: payload, p_id: id }).single()) },
  async saveMeal(payload, id = null) { return result(bound().rpc('save_meal', { p_payload: payload, p_id: id }).single()) },
  async deleteMeal(id) { await result(bound().rpc('delete_meal', { p_id: id })) },
  async setAiConsent(kind, enabled, monthlyLimitCents, policyVersion) { return result(bound().rpc('set_ai_consent', { p_kind: kind, p_enabled: enabled, p_monthly_limit_cents: monthlyLimitCents, p_policy_version: policyVersion })) },
  async parseSchedule(rawText, submittedAt) { return edgeResult(bound().functions.invoke('health-ai', { body: { action: 'parse-schedule', raw_text: rawText, submitted_at: submittedAt } })) },
  async estimateMeal(mealId) { return edgeResult(bound().functions.invoke('health-ai', { body: { action: 'estimate-meal', meal_id: mealId } })) },
  async aiStatus() { return edgeResult(bound().functions.invoke('health-ai', { body: { action: 'status' } })) },
  async uploadPhoto(file, mealId = null, isShared = false) {
    const body = new FormData()
    body.append('file', file, 'meal.png')
    if (mealId) body.append('meal_id', mealId)
    body.append('is_shared', String(isShared))
    return result(bound().functions.invoke('health-photo?action=upload', { body }))
  },
  async downloadPhoto(id) { return result(bound().functions.invoke(`health-photo?action=download&photo_id=${encodeURIComponent(id)}`, { method: 'GET' })) },
  async deletePhoto(id) { await result(bound().functions.invoke(`health-photo?action=delete&photo_id=${encodeURIComponent(id)}`, { method: 'DELETE' })) },
  async exportOwnData() {
    const { user } = await verifiedUser()
    const member = await result(ready().from('members').select('display_name,share_profile,share_schedule,share_weight,allow_partner_edit').eq('user_id', user.id).maybeSingle())
    const schema = await ready().rpc('health_schema_version')
    if (schema.error && schema.error.code !== 'PGRST202') throw schema.error
    const hasHealth = !schema.error && schema.data === 4
    if (!schema.error && !hasHealth) throw new Error('健康功能版本不匹配')
    const [profiles, schedules, weights, ...healthRows] = await Promise.all([
      allPages('health_profiles', 'user_id', user.id), allPages('schedules', 'user_id', user.id), allPages('weights', 'user_id', user.id),
      ...(hasHealth ? healthTables.map(table => allPages(table, 'user_id', user.id)) : [])
    ])
    return { exported_at: new Date().toISOString(), profile: profiles[0] ?? null, schedules, weights, settings: member, ...Object.fromEntries(healthTables.map((table,index) => [table,healthRows[index] ?? []])) }
  },
  async eraseOwnHealthData() { await result(bound().rpc('erase_own_health_data')) },
  async leaveSpace() { await result(bound().rpc('leave_space')) }
}

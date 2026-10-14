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
const aiProviders = ['openai', 'deepseek']
const aiPurposes = ['parse_schedule', 'estimate_meal_text', 'estimate_meal_photo', 'generate_plan', 'adjust_plan']
function provider(value, allowRules = false) {
  if (!aiProviders.includes(value) && !(allowRules && value === 'rules')) throw Object.assign(new Error('请选择 AI 供应商'), { code: 'AI_PROVIDER_REQUIRED' })
  return value
}

async function allPages(table, column, value, orderColumns = ['created_at', 'id']) {
  const rows = []
  for (let offset = 0;; offset += 500) {
    let query = ready().from(table).select('*').eq(column, value)
    for (const name of orderColumns) query = query.order(name, { ascending: true })
    const page = await result(query.range(offset, offset + 499))
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
    if (!member) return { user, account, space: null, members: [], profile: null, profiles: [], schedules: [], weights: [], audit: [], healthAvailable: false, providerAiAvailable: false, activityAvailable: false, range: { from: today, to: today } }
    const spaceId = member.space_id
    const schema = await ready().rpc('health_schema_version')
    if (schema.error && schema.error.code !== 'PGRST202') throw schema.error
    const healthAvailable = !schema.error && schema.data === 4
    if (!schema.error && !healthAvailable) throw new Error('健康功能版本不匹配')
    const providerSchema = healthAvailable ? await ready().rpc('health_provider_schema_version') : { error: { code: 'PGRST202' } }
    if (providerSchema.error && providerSchema.error.code !== 'PGRST202') throw providerSchema.error
    const providerAiAvailable = !providerSchema.error && providerSchema.data === 5
    if (!providerSchema.error && !providerAiAvailable) throw new Error('AI 授权版本不匹配')
    const dailyFlow = providerAiAvailable ? await ready().rpc('health_daily_flow_version') : { error: { code: 'PGRST202' } }
    if (dailyFlow.error && dailyFlow.error.code !== 'PGRST202') throw dailyFlow.error
    const dailyFlowAvailable = !dailyFlow.error && dailyFlow.data === 7
    if (!dailyFlow.error && !dailyFlowAvailable) throw new Error('餐后调整版本不匹配')
    const activitySchema = healthAvailable ? await ready().rpc('health_activity_schema_version') : { error: { code: 'PGRST202' } }
    if (activitySchema.error && activitySchema.error.code !== 'PGRST202') throw activitySchema.error
    const activityAvailable = !activitySchema.error && activitySchema.data === 8
    if (!activitySchema.error && !activityAvailable) throw new Error('运动记录版本不匹配')
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
    health.meal_adjustments = dailyFlowAvailable ? await allPages('meal_adjustments', 'space_id', spaceId) : []
    const dates = [...schedules, ...weights].map(row => row.record_date).sort()
    const range = { from: dates[0] ?? today, to: dates.at(-1) ?? today }
    return { user, account, space, members, profile: profiles.find(row => row.user_id === user.id) ?? null, profiles, schedules, weights, audit, healthAvailable, providerAiAvailable, dailyFlowAvailable, activityAvailable, ...health, range }
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
  async requestPlanGeneration(targetDate, selectedProvider) { return result(bound().rpc('request_plan_generation', { p_target_date: targetDate, p_provider: provider(selectedProvider, true) }).single()) },
  async retryGenerationJob(id) { return result(bound().rpc('retry_generation_job', { p_id: id }).single()) },
  async generatePlan(jobId, selectedProvider) { return edgeResult(bound().functions.invoke('health-ai', { body: { action: 'generate-plan', job_id: jobId, provider: provider(selectedProvider, true) } })) },
  async saveTrainingSession(payload, id = null) { return result(bound().rpc('save_training_session', { p_payload: payload, p_id: id }).single()) },
  async deleteTrainingSession(id) { await result(bound().rpc('delete_training_session', { p_id: id })) },
  async saveMeal(payload, id = null) { return result(bound().rpc('save_meal', { p_payload: payload, p_id: id }).single()) },
  async deleteMeal(id) { await result(bound().rpc('delete_meal', { p_id: id })) },
  async setAiProviderConsent(selectedProvider, purpose, enabled, monthlyLimitCents, policyVersion) {
    if (!aiPurposes.includes(purpose)) throw Object.assign(new Error('AI 用途无效'), { code: 'AI_PURPOSE_INVALID' })
    return result(bound().rpc('set_ai_provider_consent', { p_provider: provider(selectedProvider), p_purpose: purpose, p_enabled: enabled, p_monthly_limit_cents: monthlyLimitCents, p_policy_version: policyVersion }).single())
  },
  async setAiPlanProvider(selectedProvider) { return result(bound().rpc('set_ai_plan_provider', { p_provider: provider(selectedProvider, true) })) },
  async parseSchedule(rawText, submittedAt, selectedProvider) { return edgeResult(bound().functions.invoke('health-ai', { body: { action: 'parse-schedule', raw_text: rawText, submitted_at: submittedAt, provider: provider(selectedProvider) } })) },
  async estimateMeal(mealId, selectedProvider) { return edgeResult(bound().functions.invoke('health-ai', { body: { action: 'estimate-meal', meal_id: mealId, provider: provider(selectedProvider) } })) },
  async requestMealAdjustment(recordDate, selectedProvider) { return edgeResult(bound().functions.invoke('health-ai', { body: { action: 'adjust-plan', record_date: recordDate, provider: provider(selectedProvider) } })) },
  async applyMealAdjustment(id, expectedUpdatedAt) { return result(bound().rpc('apply_meal_adjustment', { p_id: id, p_expected_updated_at: expectedUpdatedAt }).single()) },
  async undoMealAdjustment(id, expectedUpdatedAt) { return result(bound().rpc('undo_meal_adjustment', { p_id: id, p_expected_updated_at: expectedUpdatedAt }).single()) },
  async aiStatus() {
    const status = await edgeResult(bound().functions.invoke('health-ai', { body: { action: 'status' } }))
    if (![5,7].includes(status?.schema_version) || !status.providers || !status.plan_provider) throw Object.assign(new Error('AI 服务版本不匹配'), { code: 'AI_SERVICE_VERSION_MISMATCH' })
    return status
  },
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
    const flowSchema = hasHealth ? await ready().rpc('health_daily_flow_version') : { error: { code: 'PGRST202' } }
    if (flowSchema.error && flowSchema.error.code !== 'PGRST202') throw flowSchema.error
    if (!flowSchema.error && flowSchema.data !== 7) throw new Error('餐后调整版本不匹配')
    const mealAdjustments = !flowSchema.error ? await allPages('meal_adjustments', 'user_id', user.id) : []
    const snapshotSchema = await ready().rpc('health_input_snapshot_schema_version')
    if (snapshotSchema.error?.code === 'PGRST202') throw new Error('完整导出需要输入快照版本 9，请在后台更新后重试')
    if (snapshotSchema.error) throw snapshotSchema.error
    if (snapshotSchema.data !== 9) throw new Error('输入快照版本不匹配')
    const snapshots = await allPages('generation_input_snapshots', 'user_id', user.id, ['captured_at', 'job_id', 'input_version'])
    return { exported_at: new Date().toISOString(), profile: profiles[0] ?? null, schedules, weights, settings: member, ...Object.fromEntries(healthTables.map((table,index) => [table,healthRows[index] ?? []])), meal_adjustments: mealAdjustments, generation_input_snapshots: snapshots }
  },
  async eraseOwnHealthData() { await result(bound().rpc('erase_own_health_data')) },
  async leaveSpace() { await result(bound().rpc('leave_space')) }
}

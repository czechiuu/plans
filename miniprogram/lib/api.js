const { createClient, one, fail, wxCall, requestJson } = require('./client.js')
const { createSession } = require('./session.js')
const { assertPngFile } = require('./photo.js')

const healthTables = ['health_rules', 'daily_plans', 'generation_jobs', 'training_sessions', 'meals', 'photo_assets', 'ai_consents']
const aiPurposes = ['parse_schedule', 'estimate_meal_text', 'estimate_meal_photo', 'generate_plan', 'adjust_plan']
const providers = ['openai', 'deepseek']
const provider = (value, rules = false) => {
  if (!providers.includes(value) && !(rules && value === 'rules')) throw fail('AI_PROVIDER_REQUIRED')
  return value
}
const todayShanghai = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)

function createApi(wx, input) {
  const url = input?.url || input?.supabaseUrl
  const key = input?.key || input?.publishableKey
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url || '') ||
    typeof key !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]{15,}$/.test(key)) throw fail('PUBLIC_CONFIG_INVALID')
  const config = { url, key }
  const downloads = new Set()
  async function clearDownloads() {
    const fs = wx.getFileSystemManager()
    const paths = [...downloads]
    await Promise.allSettled(paths.map(path => wxCall(fs.unlink.bind(fs), { filePath: path })))
    for (const path of paths) downloads.delete(path)
  }
  const auth = createSession(wx, config, clearDownloads)
  const client = createClient(wx, config, auth)
  async function rpcVersion(name, version, epoch = null) {
    if (await client.rpc(name, {}, epoch) !== version) throw fail('SCHEMA_VERSION_MISMATCH')
  }
  async function load() {
    const { epoch } = await auth.capture()
    const current = auth.session()
    if (!current) throw fail('AUTH_REQUIRED')
    await rpcVersion('health_schema_version', 4, epoch)
    await rpcVersion('health_provider_schema_version', 5, epoch)
    await rpcVersion('health_daily_flow_version', 7, epoch)
    await rpcVersion('health_activity_schema_version', 8, epoch)
    const spaceId = current.spaceId
    const [spaceRows, members, profiles, schedules, weights, audit, ...healthRows] = await Promise.all([
      client.rows('spaces', { id: spaceId }, { select: 'id,name', limit: 2, epoch }),
      client.rows('members', { space_id: spaceId }, { select: 'space_id,user_id,display_name,share_profile,share_schedule,share_weight,share_plan,share_training,share_meal,share_photo,allow_partner_edit', epoch }),
      client.rows('health_profiles', { space_id: spaceId }, { epoch }),
      client.allRows('schedules', { space_id: spaceId }, undefined, epoch),
      client.allRows('weights', { space_id: spaceId }, undefined, epoch),
      client.rows('audit_events', { space_id: spaceId }, { order: 'created_at.desc', limit: 100, epoch }),
      ...healthTables.map(table => client.allRows(table, { space_id: spaceId }, undefined, epoch))
    ])
    const health = Object.fromEntries(healthTables.map((table, index) => [table, healthRows[index]]))
    const adjustments = await client.allRows('meal_adjustments', { space_id: spaceId }, undefined, epoch)
    auth.assert(epoch)
    const dates = [...schedules, ...weights].map(row => row.record_date).sort()
    const today = todayShanghai()
    return { user: current.user, account: current.account, space: one(spaceRows), members,
      profile: profiles.find(row => row.user_id === current.user.id) || null, profiles, schedules, weights, audit,
      healthAvailable: true, providerAiAvailable: true, dailyFlowAvailable: true, activityAvailable: true,
      ...health, meal_adjustments: adjustments, range: { from: dates[0] || today, to: dates[dates.length - 1] || today } }
  }
  const edge = (action, payload = {}) => client.authorized('POST', '/functions/v1/health-ai', { action, ...payload })
  const api = {
    session: auth.session,
    restore: auth.restore,
    async signIn(slot, password) { await clearDownloads(); return auth.signIn(slot, password) },
    async signOut() {
      const token = auth.signOut()
      await clearDownloads()
      if (!token) return
      try {
        await requestJson(wx, { url: `${url.replace(/\/$/, '')}/auth/v1/logout?scope=local`, method: 'POST',
          data: {}, header: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
      } catch { throw fail('SIGNOUT_UNCONFIRMED') }
    },
    currentAccount() { return auth.session()?.account || null },
    load,
    saveSettings: settings => client.rpcVoid('save_settings', { p_settings: settings }),
    saveProfile: payload => client.rpcOne('save_profile', { p_payload: payload }),
    saveSchedule: (payload, id = null) => client.rpcOne('save_schedule', { p_payload: payload, p_id: id }),
    saveConfirmedSchedule: (payload, id = null) => client.rpcOne('save_confirmed_schedule', { p_payload: payload, p_id: id }),
    deleteSchedule: id => client.rpcVoid('delete_schedule', { p_id: id }),
    saveWeight: (payload, id = null) => client.rpcOne('save_weight', { p_payload: payload, p_id: id }),
    deleteWeight: id => client.rpcVoid('delete_weight', { p_id: id }),
    saveHealthRules: (rules, isShared, expectedUpdatedAt = null) => client.rpcOne('save_health_rules',
      { p_rules: rules, p_is_shared: isShared, p_expected_updated_at: expectedUpdatedAt }),
    confirmTrainingHistory: expectedUpdatedAt => client.rpcOne('confirm_training_history', { p_expected_updated_at: expectedUpdatedAt }),
    saveHealthSharing: settings => client.rpcVoid('save_health_sharing', { p_settings: settings }),
    saveDailyPlan: (targetDate, content, expectedVersion = null, isShared = false) => client.rpcOne('save_daily_plan',
      { p_target_date: targetDate, p_content: content, p_expected_version: expectedVersion, p_is_shared: isShared }),
    setPlanLock: (id, locked, expectedUpdatedAt) => client.rpcOne('set_plan_lock',
      { p_id: id, p_locked: locked, p_expected_updated_at: expectedUpdatedAt }),
    requestPlanGeneration: (targetDate, selectedProvider) => client.rpcOne('request_plan_generation',
      { p_target_date: targetDate, p_provider: provider(selectedProvider, true) }),
    retryGenerationJob: id => client.rpcOne('retry_generation_job', { p_id: id }),
    generatePlan: (jobId, selectedProvider) => edge('generate-plan', { job_id: jobId, provider: provider(selectedProvider, true) }),
    saveTrainingSession: (payload, id = null) => client.rpcOne('save_training_session', { p_payload: payload, p_id: id }),
    deleteTrainingSession: id => client.rpcVoid('delete_training_session', { p_id: id }),
    saveMeal: (payload, id = null) => client.rpcOne('save_meal', { p_payload: payload, p_id: id }),
    deleteMeal: id => client.rpcVoid('delete_meal', { p_id: id }),
    setAiProviderConsent: (selectedProvider, purpose, enabled, monthlyLimitCents, policyVersion) => {
      if (!aiPurposes.includes(purpose)) throw fail('AI_PURPOSE_INVALID')
      return client.rpcOne('set_ai_provider_consent', { p_provider: provider(selectedProvider), p_purpose: purpose,
        p_enabled: enabled, p_monthly_limit_cents: monthlyLimitCents, p_policy_version: policyVersion })
    },
    setAiPlanProvider: selectedProvider => client.rpc('set_ai_plan_provider', { p_provider: provider(selectedProvider, true) }),
    parseSchedule: (rawText, submittedAt, selectedProvider) => edge('parse-schedule',
      { raw_text: rawText, submitted_at: submittedAt, provider: provider(selectedProvider) }),
    estimateMeal: (mealId, selectedProvider) => edge('estimate-meal', { meal_id: mealId, provider: provider(selectedProvider) }),
    requestMealAdjustment: (recordDate, selectedProvider) => edge('adjust-plan',
      { record_date: recordDate, provider: provider(selectedProvider) }),
    applyMealAdjustment: (id, expectedUpdatedAt) => client.rpcOne('apply_meal_adjustment', { p_id: id, p_expected_updated_at: expectedUpdatedAt }),
    undoMealAdjustment: (id, expectedUpdatedAt) => client.rpcOne('undo_meal_adjustment', { p_id: id, p_expected_updated_at: expectedUpdatedAt }),
    async aiStatus() {
      const status = await edge('status')
      if (![5, 7].includes(status?.schema_version) || !status.providers || !status.plan_provider) throw fail('AI_SERVICE_VERSION_MISMATCH')
      return status
    },
    async uploadPhoto(path, mealId = null, isShared = false) {
      const { epoch } = await auth.capture()
      await assertPngFile(wx, path)
      auth.assert(epoch)
      const current = auth.session()
      if (!current) throw fail('AUTH_REQUIRED')
      if (mealId) {
        const existing = await client.rows('photo_assets',
          { user_id: current.user.id, meal_id: mealId, deleting: false, uploading: false }, { limit: 2, epoch })
        if (existing.length) throw Object.assign(fail('PHOTO_UPLOAD_REVIEW_REQUIRED'), { existingPhotoIds: existing.map(row => row.id) })
      }
      const result = await client.upload(path, mealId, isShared, epoch)
      auth.assert(epoch)
      if (!result?.photo_id || result.mime !== 'image/png') throw fail('PHOTO_INVALID_RESPONSE')
      return result
    },
    async downloadPhoto(id) {
      const { epoch } = await auth.capture()
      const path = await client.download(id, epoch)
      try { await assertPngFile(wx, path); auth.assert(epoch); downloads.add(path); return path }
      catch (error) {
        const fs = wx.getFileSystemManager()
        await wxCall(fs.unlink.bind(fs), { filePath: path }).catch(() => {})
        throw error
      }
    },
    deletePhoto: id => client.authorized('DELETE', `/functions/v1/health-photo?action=delete&photo_id=${encodeURIComponent(id)}`),
    async updatePassword(currentPassword, newPassword) {
      const { epoch } = await auth.capture()
      const current = auth.session()
      if (!current) throw fail('AUTH_REQUIRED')
      const result = await client.authorized('PUT', '/auth/v1/user', { current_password: currentPassword, password: newPassword }, {}, epoch)
      if (result?.id !== current.user.id) throw fail('ACCOUNT_CHANGED')
    },
    async exportOwnData() {
      const { epoch } = await auth.capture()
      const current = auth.session()
      if (!current) throw fail('AUTH_REQUIRED')
      const owner = current.user.id
      const [profiles, schedules, weights, settings, ...healthRows] = await Promise.all([
        client.allRows('health_profiles', { user_id: owner }, undefined, epoch), client.allRows('schedules', { user_id: owner }, undefined, epoch),
        client.allRows('weights', { user_id: owner }, undefined, epoch), client.rows('members', { user_id: owner }, { limit: 2, epoch }),
        ...healthTables.map(table => client.allRows(table, { user_id: owner }, undefined, epoch))
      ])
      await rpcVersion('health_input_snapshot_schema_version', 9, epoch)
      const [mealAdjustments, snapshots] = await Promise.all([
        client.allRows('meal_adjustments', { user_id: owner }, undefined, epoch),
        client.allRows('generation_input_snapshots', { user_id: owner }, 'captured_at.asc,job_id.asc,input_version.asc', epoch)
      ])
      auth.assert(epoch)
      return { exported_at: new Date().toISOString(), profile: profiles[0] || null, schedules, weights,
        settings: one(settings, true), ...Object.fromEntries(healthTables.map((table, index) => [table, healthRows[index]])),
        meal_adjustments: mealAdjustments, generation_input_snapshots: snapshots }
    },
    eraseOwnHealthData: () => client.rpcVoid('erase_own_health_data'),
    leaveSpace: () => client.rpcVoid('leave_space')
  }
  return api
}

module.exports = { createApi }

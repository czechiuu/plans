const { baseData, refresh, perform, api, openSettings } = require('../../lib/page')
const { today, addDays, validDate } = require('../../lib/dates')
const { exerciseById } = require('../../lib/shared')

const types = ['未确定', '力量训练', '羽毛球', '其他']
const intents = ['未确定', '愿意运动', '不安排运动']
const providers = ['rules', 'deepseek', 'openai'], parseProviders = ['请选择服务', 'deepseek', 'openai']
function blank() { return { record_date: addDays(today(), 1), raw_text: '', start_time: '', end_time: '', exercise_intent: 'unknown', exercise_type: '', duration_minutes: '', location: '', equipment: '', fixed_arrangements: '', meal_conditions: '', meal: '', constraints: '', fatigue: '', pain: '', sleep: '', is_shared: false } }
function fromRow(row) {
  const c = row.confirmed_data || {}, exercise = c.exercise || {}, meal = c.meal || {}
  return { record_date: row.record_date, raw_text: row.raw_text || '', start_time: row.start_time?.slice(0, 5) || '', end_time: row.end_time?.slice(0, 5) || '', exercise_intent: row.exercise_intent || 'unknown', exercise_type: exercise.type || '', duration_minutes: exercise.duration_minutes == null ? '' : String(exercise.duration_minutes), location: exercise.location || '', equipment: exercise.equipment || '', fixed_arrangements: row.fixed_arrangements || '', meal_conditions: row.meal_conditions || '', meal: meal.arrangements || '', constraints: row.constraints || '', fatigue: c.fatigue || '', pain: c.pain || '', sleep: c.sleep || '', is_shared: !!row.is_shared }
}
function fromDraft(form, draft) {
  const exercise = draft.exercise || {}, meal = draft.meal || {}
  return { ...form, exercise_intent: exercise.intent || form.exercise_intent, exercise_type: types.includes(exercise.type) ? exercise.type : '', duration_minutes: exercise.duration_minutes == null ? '' : String(exercise.duration_minutes), location: exercise.location || '', equipment: exercise.equipment || '', start_time: exercise.explicit_start_time || '', end_time: exercise.explicit_end_time || '', meal_conditions: meal.conditions || '', meal: meal.arrangements || '', constraints: Array.isArray(draft.constraints) ? draft.constraints.join('\n') : form.constraints, fatigue: draft.fatigue || '', pain: draft.pain || '', sleep: draft.sleep || '', fixed_arrangements: draft.fixed_arrangements || form.fixed_arrangements }
}
function schedulePayload(form, row, data, parsed) {
  const day = form.record_date, minutes = form.duration_minutes === '' ? null : Number(form.duration_minutes)
  if (!validDate(day) || day !== addDays(today(), 1)) throw new Error('本页只能确认当前的明日日期，请刷新核对')
  if (form.end_time && (!form.start_time || form.end_time <= form.start_time)) throw new Error('结束时间须晚于同日开始时间')
  if (!['unknown', 'yes', 'no'].includes(form.exercise_intent) || !['', ...types.slice(1)].includes(form.exercise_type)) throw new Error('请选择明确的运动选项')
  if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440)) throw new Error('运动时长须为有效分钟数')
  if (![form.raw_text, form.fixed_arrangements, form.meal_conditions, form.constraints].some(value => value.trim()) && form.exercise_intent === 'unknown' && !form.exercise_type && !form.start_time && !form.end_time) throw new Error('请至少填写一项真实安排')
  const constraints = form.constraints.split(/\r?\n/).map(value => value.trim()).filter(Boolean)
  return { user_id: data.user.id, record_date: day, raw_text: form.raw_text.trim() || null, start_time: form.start_time || null, end_time: form.end_time || null, exercise_intent: form.exercise_intent, fixed_arrangements: form.fixed_arrangements.trim() || null, meal_conditions: form.meal_conditions.trim() || null, constraints: form.constraints.trim() || null, is_shared: !!form.is_shared, ...(row ? { expected_updated_at: row.updated_at } : {}), confirmed_data: { user_slot: data.account, record_date: day, exercise: { intent: form.exercise_intent, type: form.exercise_type || null, duration_minutes: minutes, location: form.location.trim() || null, equipment: form.equipment.trim() || null, explicit_start_time: form.start_time || null, explicit_end_time: form.end_time || null }, meal: { conditions: form.meal_conditions.trim() || null, arrangements: form.meal.trim() || null }, constraints, fatigue: form.fatigue.trim() || null, pain: form.pain.trim() || null, sleep: form.sleep.trim() || null, ambiguous_fields: [] }, submitted_at: parsed?.submitted_at || new Date().toISOString(), parse_version: parsed?.parse_version || 'manual-schedule-v1' }
}
function planView(plan) {
  const content = plan?.content || {}, training = content.training || {}
  return { id: plan?.id || '', version: plan?.version || 0, is_locked: !!plan?.is_locked, is_stale: !!plan?.is_stale, updated_at: plan?.updated_at || '', summary: content.summary || '', warnings: content.warnings || [], meals: (content.meals || []).map((meal, index) => ({ key: index, name: meal.title || meal.name || meal.kind || `第 ${index + 1} 餐`, time: meal.time || '', text: meal.notes || meal.description || '', prep: meal.prep_method || '', purchase: meal.purchase_or_prep || '', alternative: meal.alternative || '', snackReason: meal.snack_reason || '', foods: (meal.items || meal.foods || []).map(food => typeof food === 'string' ? food : `${food.name || ''} ${food.portion || ''}${food.unit || ''}`) })), training: { mode: training.mode || 'rest', purpose: training.purpose || '', time: training.time || '', warmup: (training.warmup || []).map(step => step.description || step.name || ''), items: (training.items || []).map(item => ({ ...item, name: exerciseById.get(item.exercise_id)?.name || item.exercise_id })), cooldown: (training.cooldown || []).map(step => step.description || step.name || ''), warnings: training.warnings || [] } }
}

Page({
  data: { ...baseData, form: blank(), day: addDays(today(), 1), types, intents, providers, parseProviders, parseProvider: '', parseProviderIndex: 0, generateProvider: 'rules', generateProviderIndex: 0, typeIndex: 0, intentIndex: 0, rows: [], plans: [], pastPlans: [], jobs: [], plan: null, job: null, dirty: false, parsed: null, aiReady: false },
  syncDay() { const day = addDays(today(), 1); if (day !== this.data.day) this.setData({ day, staleDraft: !!this.data.dirty, ...(!this.data.dirty ? { parsed: null } : {}), ...(this.data.dirty ? { notice: '日期已切换，旧草稿未丢弃；请主动重新加载新的明日安排' } : {}) }) },
  onShow() { this.syncDay(); refresh(this) },
  onPullDownRefresh() { this.syncDay(); refresh(this).finally(() => wx.stopPullDownRefresh()) },
  receive(data) {
    this._source = data
    const day = this.data.day, rows = (data.schedules || []).filter(row => row.user_id === data.user.id && row.record_date === day)
    const plans = (data.daily_plans || []).filter(row => row.user_id === data.user.id && row.target_date === day).sort((a, b) => b.version - a.version)
    const jobs = (data.generation_jobs || []).filter(row => row.user_id === data.user.id && row.target_date === day).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    const form = rows[0] ? fromRow(rows[0]) : { ...blank(), record_date: day }
    const rulesReady = (data.health_rules || []).some(row => row.user_id === data.user.id && row.rules?.confirmed)
    this.setData({ rows, plans: plans.map(planView), pastPlans: plans.slice(1).map(planView), plan: plans[0] ? planView(plans[0]) : null, jobs, job: jobs[0] || null, aiReady: !!data.providerAiAvailable, healthReady: !!data.healthAvailable, rulesReady, account: data.account, ...(!this.data.dirty ? { form, typeIndex: Math.max(0, types.indexOf(form.exercise_type)), intentIndex: ['unknown', 'yes', 'no'].indexOf(form.exercise_intent) } : {}) })
  },
  settings: openSettings,
  copyWebRules() { wx.setClipboardData({ data: 'https://czechiuu.github.io/plans/', success: () => this.setData({ notice: '网页版地址已复制；请在网页“设置”中核对并确认本人规则' }), fail: () => this.setData({ error: '复制失败，请从项目说明打开网页' }) }) },
  retryRefresh() { refresh(this) },
  resetDay() { this.setData({ dirty: false, parsed: null, staleDraft: false, form: blank(), day: addDays(today(), 1) }); refresh(this) },
  change(event) { const field = event.currentTarget.dataset.field; this.setData({ [`form.${field}`]: event.detail.value, ...(field === 'raw_text' ? { parsed: null } : {}), dirty: true }) },
  clearTime(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: '', dirty: true }) },
  share(event) { this.setData({ 'form.is_shared': !!event.detail.value, dirty: true }) },
  typeChange(event) { const index = Number(event.detail.value); this.setData({ 'form.exercise_type': index ? types[index] : '', typeIndex: index, dirty: true }) },
  intentChange(event) { const index = Number(event.detail.value); this.setData({ 'form.exercise_intent': ['unknown', 'yes', 'no'][index], intentIndex: index, dirty: true }) },
  providerChange(event) { const field = event.currentTarget.dataset.field, index = Number(event.detail.value); this.setData({ [field]: field === 'parseProvider' ? parseProviders[index] : providers[index], [`${field}Index`]: index }) },
  async parse() {
    if (this.data.staleDraft) { this.setData({ error: '日期已切换，请先重新加载明日安排' }); return }
    if (!this.data.form.raw_text.trim()) { this.setData({ error: '先填写明日安排原文' }); return }
    if (!['deepseek', 'openai'].includes(this.data.parseProvider)) { this.setData({ error: '先明确选择已授权的解析服务' }); return }
    const submittedAt = new Date().toISOString(), raw = this.data.form.raw_text
    const result = await perform(this, () => api().parseSchedule(raw, submittedAt, this.data.parseProvider), '解析草稿已载入，请逐项核对', { reload: false })
    if (!result.ok) return
    const value = result.value
    if (value?.needs_confirmation !== true || !value.draft || value.submitted_at !== submittedAt || !value.parse_version || (value.draft.record_date && value.draft.record_date !== this.data.day)) { this.setData({ error: '解析日期与当前明日不一致或结果不完整，未填入表单' }); return }
    const form = fromDraft(this.data.form, value.draft)
    this.setData({ form, typeIndex: Math.max(0, types.indexOf(form.exercise_type)), intentIndex: ['unknown', 'yes', 'no'].indexOf(form.exercise_intent), parsed: { submitted_at: value.submitted_at, parse_version: value.parse_version, ambiguous_fields: value.draft.ambiguous_fields || [] }, dirty: true })
  },
  async save() {
    if (this.data.staleDraft) { this.setData({ error: '日期已切换，请先重新加载并核对明日日程' }); return }
    const row = this.data.rows[0], source = this._source
    let value
    try { value = schedulePayload(this.data.form, row, source, this.data.parsed) } catch (error) { this.setData({ error: error.message }); return }
    const result = await perform(this, () => api().saveConfirmedSchedule(value, row?.id || null), '已保存本人核对的日程', { reload: false })
    if (result.ok) { this.setData({ parsed: null, dirty: false, day: value.record_date }); await refresh(this) }
  },
  async generate() {
    if (this.data.staleDraft) { this.setData({ error: '日期已切换，请先重新加载明日安排' }); return }
    const provider = this.data.generateProvider
    if (!this.data.healthReady || !this.data.rulesReady) { this.setData({ error: '请先到网页版设置核对并确认本人训练、饮食规则' }); return }
    const result = await perform(this, async () => { const job = await api().requestPlanGeneration(this.data.day, provider); const outcome = await api().generatePlan(job.id, provider); if (outcome?.status !== 'succeeded') throw new Error(outcome?.error_code || '生成未完成'); return outcome }, '计划已生成，请核对三餐与训练')
    return result
  },
  async retry() {
    const job = this.data.job
    if (!job || !['failed', 'exhausted'].includes(job.status)) return
    await perform(this, async () => { const next = await api().retryGenerationJob(job.id); const outcome = await api().generatePlan(next.id, next.provider); if (outcome?.status !== 'succeeded') throw new Error(outcome?.error_code || '重试未完成'); return outcome }, '计划已更新，请核对')
  },
  async toggleLock() {
    const plan = this.data.plan
    if (plan) await perform(this, () => api().setPlanLock(plan.id, !plan.is_locked, plan.updated_at), plan.is_locked ? '计划已解锁' : '计划已锁定')
  },
  training() { wx.switchTab({ url: '/pages/training/index' }) }
})

module.exports = { blank, fromRow, fromDraft, schedulePayload, planView }

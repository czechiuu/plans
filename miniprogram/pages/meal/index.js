const { baseData, refresh, perform, api, openSettings } = require('../../lib/page')
const { today, instantToLocalDateTime, localDateTimeToInstant } = require('../../lib/dates')
const { calculateMealNutrition } = require('../../lib/shared')
const pending = require('../../lib/pending')
const { choosePhoto, sanitizePhoto } = require('../../lib/photo')

const kinds = ['breakfast', 'lunch', 'dinner', 'snack', 'other'], kindLabels = ['早餐', '午餐', '晚餐', '加餐', '其他']
const methods = ['none', 'manual', 'confirmed_nutrition', 'existing'], methodLabels = ['暂无可靠估算', '本人按来源填写区间', '按营养标签计算', '沿用已核对区间']
const additions = ['unmeasured', 'none', 'included'], additionLabels = ['油酱未计量', '没有额外油酱', '油酱已作为食物计入']
const providers = ['请选择', 'deepseek', 'openai']
const emptyItem = () => ({ name: '', portion: '', unit: '', grams_min: '', grams_max: '', kcal_per_100g: '', nutrition_source: '' })
function comparableItem(item) { const value = { name: String(item.name || '').trim(), portion: String(item.portion || '').trim(), unit: String(item.unit || '').trim() }; for (const key of ['grams_min', 'grams_max', 'kcal_per_100g']) if (item[key] !== '' && item[key] != null) value[key] = Number(item[key]); if (String(item.nutrition_source || '').trim()) value.nutrition_source = item.nutrition_source.trim(); return value }
function emptyForm() { return { recorded_at: instantToLocalDateTime(new Date().toISOString()).slice(0, 16), kind: 'other', eaten_fraction: '1', items: [emptyItem()], cooking: '', oil: '', leftover: '', estimate_method: 'none', additions_status: 'unmeasured', energy_min_kcal: '', energy_max_kcal: '', estimate_source: '', uncertainty: '', status: 'draft', is_shared: false } }
function fromRow(row) {
  const d = row.data || {}, estimate = d.estimate || {}, method = estimate.method === 'confirmed_nutrition' ? 'confirmed_nutrition' : d.estimate ? 'existing' : 'none'
  return { recorded_at: instantToLocalDateTime(d.recorded_at).slice(0, 16), kind: d.kind || 'other', eaten_fraction: String(d.eaten_fraction ?? 1), items: (d.items?.length ? d.items : [emptyItem()]).map(item => ({ ...emptyItem(), ...item, grams_min: item.grams_min ?? '', grams_max: item.grams_max ?? '', kcal_per_100g: item.kcal_per_100g ?? '' })), cooking: d.cooking || '', oil: d.oil || '', leftover: d.leftover || '', estimate_method: method, additions_status: estimate.nutrition_additions_status || 'unmeasured', energy_min_kcal: estimate.energy_min_kcal ?? '', energy_max_kcal: estimate.energy_max_kcal ?? '', estimate_source: estimate.source || '', uncertainty: estimate.uncertainty || '', status: row.status, is_shared: !!row.is_shared }
}
function mealPayload(form, row, photos, estimateBasis, allowEmptyDraft = false) {
  const fraction = Number(form.eaten_fraction)
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1 || !/^(0(\.\d{1,3})?|1(\.0{1,3})?)$/.test(String(form.eaten_fraction))) throw new Error('实际吃掉比例须在 0 到 1 之间，最多三位小数')
  if (!kinds.includes(form.kind) || !['draft', 'confirmed'].includes(form.status)) throw new Error('餐别或状态无效')
  const recordedAt = localDateTimeToInstant(form.recorded_at)
  if (!recordedAt || Date.parse(recordedAt) > Date.now()) throw new Error('请选择已发生的实际用餐时间')
  const blankItems = form.items.every(item => !String(item.name || '').trim() && !String(item.portion || '').trim() && !String(item.unit || '').trim())
  const items = blankItems && form.status === 'draft' && allowEmptyDraft ? [] : form.items.map(item => {
    const next = comparableItem(item)
    if (!next.name || !next.portion || !next.unit) throw new Error('每项食物需填写名称、份量和单位')
    for (const key of ['grams_min', 'grams_max', 'kcal_per_100g']) if (next[key] !== undefined && (!Number.isFinite(next[key]) || next[key] < 0)) throw new Error('营养标签数字须非负')
    return next
  })
  if (!items.length && !(form.status === 'draft' && allowEmptyDraft)) throw new Error('确认摄入前请填写实际食物')
  const method = form.estimate_method
  let estimate = null, gap = ''
  if (method === 'manual') {
    const low = Number(form.energy_min_kcal), high = Number(form.energy_max_kcal), source = form.estimate_source.trim()
    if (form.energy_min_kcal === '' || form.energy_max_kcal === '' || !Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low || !source) throw new Error('请填写整份热量上下限和本人核对的来源')
    estimate = { recognition_status: 'recognized', items, energy_min_kcal: low, energy_max_kcal: high, uncertainty: form.uncertainty.trim(), assumptions: [source], method: 'manual_source', source, nutrition_additions_status: form.additions_status }
  } else if (method === 'confirmed_nutrition') {
    const result = calculateMealNutrition(items, { eaten_fraction: fraction, additions_status: form.additions_status })
    if (result.complete) estimate = { recognition_status: 'recognized', items, energy_min_kcal: result.energy_min_kcal, energy_max_kcal: result.energy_max_kcal, uncertainty: '按本人核对的营养标签与克重计算', assumptions: items.map(item => `${item.name}：${item.nutrition_source}`), method: 'confirmed_nutrition', nutrition_additions_status: form.additions_status }
    else gap = `有 ${result.gaps.length} 项缺少营养数据，热量不计入已知区间`
  } else if (method === 'existing' && row?.data?.estimate) {
    const sameFood = JSON.stringify(items) === JSON.stringify((estimateBasis?.items || []).map(comparableItem))
    const sameOther = ['cooking', 'oil', 'leftover'].every(key => (form[key].trim() || null) === (estimateBasis?.[key] || null))
    const original = row.data.estimate
    const sameEnergy = Number(form.energy_min_kcal) === original.energy_min_kcal && Number(form.energy_max_kcal) === original.energy_max_kcal
    if (!sameEnergy) throw new Error('要修改热量区间，请选择“本人按来源填写区间”并注明来源')
    if (sameFood && sameOther) estimate = { ...original, uncertainty: form.uncertainty.trim() }
    else gap = '食物、油酱、剩余或热量已变，旧估算已清除；可重新估算或填写明确来源'
  } else if (method === 'existing') throw new Error('这餐没有可沿用的已核对区间')
  return { payload: { data: { recorded_at: recordedAt, kind: form.kind, items, eaten_fraction: fraction, shared_meal_id: null, photo_ids: photos.filter(photo => !photo.deleting && !photo.uploading).map(photo => photo.id), cooking: form.cooking.trim() || null, oil: form.oil.trim() || null, leftover: form.leftover.trim() || null, estimate }, status: form.status, is_shared: !!form.is_shared, ...(row ? { expected_updated_at: row.updated_at } : {}) }, gap }
}

Page({
  data: { ...baseData, id: '', row: null, form: emptyForm(), recordDate: today(), recordTime: instantToLocalDateTime(new Date().toISOString()).slice(11, 16), dirty: false, photos: [], photoPath: '', photoVisible: '', photoPending: false, pendingCreate: false, nutritionOpen: false, nutritionPreview: '', adjustments: [], planLocked: false, estimateProviderIndex: 0, adjustProviderIndex: 0, kinds, kindLabels, methods, methodLabels, additions, additionLabels, providers, kindIndex: 4, methodIndex: 0, additionIndex: 0 },
  onLoad(options) { this.setData({ id: options.id || '' }) },
  onShow() { refresh(this) },
  onPullDownRefresh() { refresh(this).finally(() => wx.stopPullDownRefresh()) },
  receive(data) {
    this._source = data
    const row = (data.meals || []).find(item => item.id === this.data.id && item.user_id === data.user.id) || null
    const photos = (data.photo_assets || []).filter(photo => photo.meal_id === row?.id && photo.user_id === data.user.id)
    const day = row?.data?.recorded_at ? instantToLocalDateTime(row.data.recorded_at).slice(0, 10) : today()
    const adjustments = (data.meal_adjustments || []).filter(item => item.user_id === data.user.id && item.record_date === day).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).map(item => ({ ...item, changeViews: (item.content?.meal_changes || []).map((change, index) => ({ key: index, index: change.meal_index, reason: change.reason || '', title: change.meal?.title || '', time: change.meal?.time || '', foods: (change.meal?.foods || []).map(food => `${food.name || ''} ${food.portion || ''}${food.unit || ''}`).join('、'), prep: change.meal?.prep_method || '', purchase: change.meal?.purchase_or_prep || '', alternative: change.meal?.alternative || '', notes: change.meal?.notes || '', snackReason: change.meal?.snack_reason || '' })) }))
    const plan = (data.daily_plans || []).filter(item => item.user_id === data.user.id && item.target_date === day).sort((a, b) => b.version - a.version)[0]
    const form = row ? fromRow(row) : emptyForm()
    this.setData({ row, photos, adjustments, planLocked: !!plan?.is_locked, dailyFlowReady: !!data.dailyFlowAvailable, aiReady: !!data.providerAiAvailable, pendingCreate: !!pending.get('meal'), ...(!this.data.dirty ? { form, recordDate: form.recorded_at.slice(0, 10), recordTime: form.recorded_at.slice(11, 16), kindIndex: kinds.indexOf(form.kind), methodIndex: methods.indexOf(form.estimate_method), additionIndex: additions.indexOf(form.additions_status) } : {}) })
    if (!this.data.dirty) this._estimateBasis = row?.data ? { items: row.data.items || [], cooking: row.data.cooking, oil: row.data.oil, leftover: row.data.leftover } : null
  },
  settings: openSettings,
  retryRefresh() { refresh(this) },
  clearAiDraft(patch) { return this.data.aiDraft ? { ...patch, 'form.estimate_method': 'none', 'form.energy_min_kcal': '', 'form.energy_max_kcal': '', methodIndex: 0, aiDraft: null, notice: '食物或油酱已修改，AI 旧区间已清除，请重新估算或填写明确来源' } : patch },
  change(event) { const field = event.currentTarget.dataset.field, patch = { [`form.${field}`]: event.detail.value, dirty: true }; this.setData(['cooking', 'oil', 'leftover'].includes(field) ? this.clearAiDraft(patch) : patch) },
  changeDate(event) { this.setData({ 'form.recorded_at': `${event.detail.value}T${this.data.recordTime}`, recordDate: event.detail.value, dirty: true }) },
  changeTime(event) { this.setData({ 'form.recorded_at': `${this.data.recordDate}T${event.detail.value}`, recordTime: event.detail.value, dirty: true }) },
  itemChange(event) { this.setData(this.clearAiDraft({ [`form.items[${event.currentTarget.dataset.index}].${event.currentTarget.dataset.field}`]: event.detail.value, dirty: true })) },
  select(event) {
    const field = event.currentTarget.dataset.field, index = Number(event.detail.value)
    const values = { kind: kinds, estimate_method: methods, additions_status: additions, estimateProvider: providers, adjustProvider: providers }[field]
    if (!values) return
    const data = field.endsWith('Provider') ? { [field + 'Index']: index } : { [`form.${field}`]: values[index], [field === 'kind' ? 'kindIndex' : field === 'estimate_method' ? 'methodIndex' : 'additionIndex']: index, dirty: true }
    this.setData(data)
  },
  status(event) { this.setData({ 'form.status': event.detail.value ? 'confirmed' : 'draft', dirty: true }) },
  share(event) { this.setData({ 'form.is_shared': !!event.detail.value, dirty: true }) },
  addItem() { this.setData(this.clearAiDraft({ 'form.items': [...this.data.form.items, emptyItem()], dirty: true })) },
  removeItem(event) { if (this.data.form.items.length > 1) this.setData(this.clearAiDraft({ 'form.items': this.data.form.items.filter((_, index) => index !== Number(event.currentTarget.dataset.index)), dirty: true })) },
  nutritionToggle() { this.setData({ nutritionOpen: !this.data.nutritionOpen }) },
  previewNutrition() {
    let value
    try { value = mealPayload({ ...this.data.form, estimate_method: 'confirmed_nutrition' }, this.data.row, this.data.photos, this._estimateBasis) } catch (error) { this.setData({ nutritionPreview: error.message }); return }
    const e = value.payload.data.estimate
    this.setData({ nutritionPreview: e ? `整份 ${e.energy_min_kcal}–${e.energy_max_kcal} kcal；实际吃掉比例仅乘一次` : value.gap })
  },
  async save() {
    if (this._saving || this.data.busy) return
    this._saving = true
    try {
    let value
    try { value = mealPayload(this.data.form, this.data.row, this.data.photos, this._estimateBasis, !!this._photoPath || this.data.photos.length > 0) } catch (error) { this.setData({ error: error.message }); return }
    if (value.gap) this.setData({ notice: value.gap })
    let created = false
    const result = await perform(this, async () => { const request = this.data.row ? value.payload : await pending.reserve('meal', value.payload); created = !this.data.row; return api().saveMeal(request, this.data.row?.id || null) }, '餐食已保存', { reload: false })
    if (!result.ok) { if (created) this.setData({ pendingCreate: true }); return }
    if (!this.data.row) pending.clear('meal')
    this.setData({ id: result.value.id, pendingCreate: false, dirty: false, aiDraft: null })
    if (this._photoPath) await this.uploadPending(result.value.id)
    await refresh(this)
    } finally { this._saving = false }
  },
  savePhotoDraft() { this.setData({ 'form.status': 'draft', dirty: true }); this.save() },
  async retryPending() {
    const result = await perform(this, async () => { const request = pending.get('meal'); if (!request) throw new Error('没有可重试的原请求'); return api().saveMeal(request) }, '餐食已保存', { reload: false })
    if (result.ok) { pending.clear('meal'); this.setData({ id: result.value.id, pendingCreate: false, dirty: false }); if (this._photoPath) await this.uploadPending(result.value.id); await refresh(this) }
  },
  async choose() {
    try { const path = await choosePhoto(wx, this); this._photoPath = await sanitizePhoto(wx, this, path); this.setData({ photoPending: true, notice: '照片已在本机净化；保存草稿或点击上传后才会发送', error: '' }) }
    catch (error) { this.setData({ error: error.message || '照片处理失败' }) }
  },
  async uploadPending(mealId) {
    const path = this._photoPath
    if (!path || !mealId) return
    const result = await perform(this, () => api().uploadPhoto(path, mealId, false), '照片已上传，未自动交给 AI', { reload: false })
    if (result.ok) { this._photoPath = null; this.setData({ photoPending: false }); await refresh(this) }
    else this.setData({ photoPending: true, notice: '餐食已保存，照片未上传；可重试或取消本机照片' })
  },
  uploadPhoto() { if (this.data.id) this.uploadPending(this.data.id); else this.setData({ error: '请先保存这餐草稿' }) },
  cancelPhoto() { this._photoPath = null; this.setData({ photoPending: false, notice: '未上传的本机照片已取消' }) },
  async viewPhoto(event) {
    const photo = this.data.photos.find(item => item.id === event.currentTarget.dataset.id)
    if (!photo || photo.deleting || photo.uploading) return
    const result = await perform(this, () => api().downloadPhoto(photo.id), '', { reload: false })
    if (result.ok) wx.previewImage({ urls: [result.value] })
  },
  async deletePhoto(event) {
    const photo = this.data.photos.find(item => item.id === event.currentTarget.dataset.id)
    if (!photo) return
    await perform(this, () => api().deletePhoto(photo.id), '照片已删除；若待清理可重试')
  },
  async estimate() {
    if (!this.data.id) { this.setData({ error: '请先保存这餐草稿' }); return }
    const provider = providers[this.data.estimateProviderIndex]
    if (!['deepseek', 'openai'].includes(provider)) { this.setData({ error: '请选择已授权的估算服务' }); return }
    const result = await perform(this, () => api().estimateMeal(this.data.id, provider), '估算草稿已载入；请核对后保存', { reload: false })
    if (!result.ok) return
    const draft = result.value?.draft
    if (result.value?.needs_confirmation !== true || !draft) { this.setData({ error: '估算草稿不完整' }); return }
    const usable = draft.recognition_status !== 'unrecognized' && Number.isFinite(draft.energy_min_kcal) && Number.isFinite(draft.energy_max_kcal)
    const form = { ...this.data.form, items: (draft.items?.length ? draft.items : this.data.form.items).map(item => ({ ...emptyItem(), ...item })), cooking: draft.cooking ?? this.data.form.cooking, oil: draft.oil ?? this.data.form.oil, leftover: draft.leftover ?? this.data.form.leftover, estimate_method: usable ? 'manual' : 'none', energy_min_kcal: usable ? draft.energy_min_kcal : '', energy_max_kcal: usable ? draft.energy_max_kcal : '', estimate_source: usable ? `${provider} AI 估算草稿（保存前请本人核对）` : '', uncertainty: draft.uncertainty || '' }
    this.setData({ form, methodIndex: usable ? 1 : 0, dirty: true, aiDraft: { status: draft.recognition_status || '未知', uncertainty: draft.uncertainty || '', assumptions: (draft.assumptions || []).join('；'), usable } })
  },
  async adjust() {
    if (this.data.row?.status !== 'confirmed') { this.setData({ error: '请先确认实际摄入' }); return }
    if (this.data.planLocked) { this.setData({ error: '当前计划已锁定，请先到明日安排核对锁定状态' }); return }
    const day = instantToLocalDateTime(this.data.row.data.recorded_at).slice(0, 10)
    if (day !== today()) { this.setData({ error: '后续餐食调整只支持今天' }); return }
    const provider = providers[this.data.adjustProviderIndex]
    if (!['deepseek', 'openai'].includes(provider)) { this.setData({ error: '请选择已授权的调整服务' }); return }
    await perform(this, () => api().requestMealAdjustment(day, provider), '建议已生成，须本人确认才采用')
  },
  apply(event) {
    const item = this.data.adjustments.find(row => row.id === event.currentTarget.dataset.id)
    if (item && !this.data.planLocked) perform(this, () => api().applyMealAdjustment(item.id, item.updated_at), '已采用建议；原计划与历史仍可查')
  },
  undo(event) {
    const item = this.data.adjustments.find(row => row.id === event.currentTarget.dataset.id)
    if (item) perform(this, () => api().undoMealAdjustment(item.id, item.updated_at), '已撤销建议')
  },
  remove() {
    if (!this.data.row) return
    wx.showModal({ title: '删除这餐？', content: '已确认摄入也会从汇总移除。', success: async ({ confirm }) => { if (!confirm) return; const result = await perform(this, () => api().deleteMeal(this.data.row.id), '餐食已删除'); if (result.ok) wx.navigateBack() } })
  }
})

module.exports = { emptyForm, fromRow, mealPayload }

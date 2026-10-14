const { baseData, refresh, perform, api, openSettings, openWeight } = require('../../lib/page')
const { today, validDate, instantToLocalDateTime } = require('../../lib/dates')
const pending = require('../../lib/pending')

const kinds = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐', other: '其他' }
const activityTypes = ['badminton', 'other'], activityLabels = ['羽毛球', '其他运动']
const intensities = ['light', 'moderate', 'vigorous'], intensityLabels = ['轻', '中等', '较高']
const pains = ['none', 'mild', 'moderate', 'severe'], painLabels = ['无', '轻微', '中等', '严重']
function blankActivity() { return { record_date: today(), activity_type: 'badminton', duration_minutes: '', intensity: 'moderate', pain: 'none', notes: '', is_shared: false } }
function activityFromRow(row) { const d = row.data; return { record_date: row.record_date, activity_type: d.activity_type, duration_minutes: String(d.duration_seconds / 60), intensity: d.intensity, pain: d.pain, notes: d.notes || '', is_shared: !!row.is_shared } }
function activityPayload(form, row = null) {
  const minutes = Number(form.duration_minutes), day = form.record_date
  if (!validDate(day) || day < '1900-01-01' || day > today()) throw new Error('完成日期须是今天或过去的有效日期')
  if (!activityTypes.includes(form.activity_type) || !intensities.includes(form.intensity) || !pains.includes(form.pain)) throw new Error('请选择有效的运动类型、强度和不适程度')
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error('实际运动时长须为 1–1440 分钟')
  const notes = form.notes.trim()
  if (notes.length > 1000) throw new Error('备注最多 1000 字')
  const duration = minutes * 60, status = row?.data?.status || 'completed'
  if (row?.data?.started_at && row?.data?.ended_at && (day !== row.record_date || duration > (Date.parse(row.data.ended_at) - Date.parse(row.data.started_at)) / 1000)) throw new Error('原记录有实际时刻；完成日期须保持原值，时长不能超过原时段')
  return { data: { plan_id: null, status, record_date: day, started_at: row?.data?.started_at ?? null, ended_at: row?.data?.ended_at ?? null, active_since: null, rest_until: null, rest_remaining_seconds: 0, elapsed_seconds: duration, stop_reason: row?.data?.stop_reason || null, sets: [], activity_type: form.activity_type, duration_seconds: duration, intensity: form.intensity, pain: form.pain, notes }, status, is_shared: !!form.is_shared, ...(row ? { expected_updated_at: row.updated_at } : {}) }
}
function recordsView(data) {
  const own = row => row.user_id === data.user.id
  return { meals: (data.meals || []).filter(own).map(row => ({ id: row.id, day: instantToLocalDateTime(row.data.recorded_at).slice(0, 10), kind: kinds[row.data.kind] || '餐食', status: row.status === 'confirmed' ? '已确认' : '草稿未计入', foods: (row.data.items || []).map(item => item.name).join('、'), is_shared: !!row.is_shared })).sort((a, b) => b.day.localeCompare(a.day)), weights: (data.weights || []).filter(own).map(row => ({ id: row.id, day: row.record_date, kg: row.weight_kg, is_shared: !!row.is_shared })).sort((a, b) => b.day.localeCompare(a.day)), activities: (data.training_sessions || []).filter(own).map(row => ({ id: row.id, day: row.record_date || (row.data.started_at ? instantToLocalDateTime(row.data.started_at).slice(0, 10) : ''), type: row.data.activity_type === 'badminton' ? '羽毛球' : row.data.activity_type === 'other' ? '其他运动' : '力量训练', status: row.data.status, duration: row.data.duration_seconds ? Math.round(row.data.duration_seconds / 60) : null, intensity: row.data.intensity ? intensityLabels[intensities.indexOf(row.data.intensity)] : '', pain: row.data.pain ? painLabels[pains.indexOf(row.data.pain)] : '', notes: row.data.notes || '', editable: activityTypes.includes(row.data.activity_type) })).sort((a, b) => b.day.localeCompare(a.day)) }
}
Page({
  data: { ...baseData, meals: [], weights: [], activities: [], activity: blankActivity(), activityTypes, activityLabels, intensities, intensityLabels, pains, painLabels, activityTypeIndex: 0, intensityIndex: 1, painIndex: 0, editingActivityId: '', activityDirty: false, pendingActivity: false, today: today() },
  onShow() { refresh(this) },
  onPullDownRefresh() { refresh(this).finally(() => wx.stopPullDownRefresh()) },
  receive(data) {
    this._activityRows = (data.training_sessions || []).filter(row => row.user_id === data.user.id && activityTypes.includes(row.data?.activity_type))
    const row = this._activityRows.find(item => item.id === this.data.editingActivityId)
    const activity = row ? activityFromRow(row) : blankActivity()
    this.setData({ ...recordsView(data), today: today(), pendingActivity: !!pending.get('activity'), ...(!this.data.activityDirty ? { activity, activityTypeIndex: activityTypes.indexOf(activity.activity_type), intensityIndex: intensities.indexOf(activity.intensity), painIndex: pains.indexOf(activity.pain) } : {}) })
  },
  retryRefresh() { refresh(this) },
  settings: openSettings,
  activityChange(event) { this.setData({ [`activity.${event.currentTarget.dataset.field}`]: event.detail.value, activityDirty: true }) },
  activitySelect(event) { const field = event.currentTarget.dataset.field, index = Number(event.detail.value), values = { activity_type: activityTypes, intensity: intensities, pain: pains }[field]; if (values) this.setData({ [`activity.${field}`]: values[index], [field === 'activity_type' ? 'activityTypeIndex' : field === 'intensity' ? 'intensityIndex' : 'painIndex']: index, activityDirty: true }) },
  activityShare(event) { this.setData({ 'activity.is_shared': !!event.detail.value, activityDirty: true }) },
  editActivity(event) {
    const row = this._activityRows.find(item => item.id === event.currentTarget.dataset.id)
    if (!row) return
    const activity = activityFromRow(row)
    this.setData({ editingActivityId: row.id, activity, editingTimes: row.data.started_at && row.data.ended_at ? `${instantToLocalDateTime(row.data.started_at)} 至 ${instantToLocalDateTime(row.data.ended_at)}` : '', activityTypeIndex: activityTypes.indexOf(activity.activity_type), intensityIndex: intensities.indexOf(activity.intensity), painIndex: pains.indexOf(activity.pain), activityDirty: false, error: '' })
  },
  newActivity() { this.setData({ editingActivityId: '', editingTimes: '', activity: blankActivity(), activityTypeIndex: 0, intensityIndex: 1, painIndex: 0, activityDirty: false, error: '' }) },
  async saveActivity() {
    if (this._savingActivity || this.data.busy) return
    this._savingActivity = true
    try {
      const row = this._activityRows.find(item => item.id === this.data.editingActivityId)
      let payload
      try { payload = activityPayload(this.data.activity, row) } catch (error) { this.setData({ error: error.message }); return }
      let created = false
      const result = await perform(this, async () => { const request = row ? payload : await pending.reserve('activity', payload); created = !row; return api().saveTrainingSession(request, row?.id || null) }, '实际运动已保存', { reload: false })
      if (!result.ok) { if (created) this.setData({ pendingActivity: true }); return }
      if (!row) pending.clear('activity')
      this.newActivity(); this.setData({ pendingActivity: false }); await refresh(this)
    } finally { this._savingActivity = false }
  },
  async retryActivity() {
    const result = await perform(this, () => { const payload = pending.get('activity'); if (!payload) throw new Error('没有可重试的原请求'); return api().saveTrainingSession(payload) }, '实际运动已保存', { reload: false })
    if (result.ok) { pending.clear('activity'); this.newActivity(); this.setData({ pendingActivity: false }); await refresh(this) }
  },
  removeActivity() {
    const row = this._activityRows.find(item => item.id === this.data.editingActivityId)
    if (!row) return
    wx.showModal({ title: '删除这条实际运动？', content: '删除后无法恢复。', success: async ({ confirm }) => { if (!confirm) return; const result = await perform(this, () => api().deleteTrainingSession(row.id), '实际运动已删除'); if (result.ok) this.newActivity() } })
  },
  meal() { wx.navigateTo({ url: '/pages/meal/index' }) },
  editMeal(event) { wx.navigateTo({ url: `/pages/meal/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}` }) },
  weight: openWeight,
  training() { wx.switchTab({ url: '/pages/training/index' }) },
  trends() { wx.switchTab({ url: '/pages/trends/index' }) }
})
module.exports = { recordsView, blankActivity, activityFromRow, activityPayload }

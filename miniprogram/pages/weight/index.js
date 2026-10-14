const { baseData, refresh, perform, api, openSettings } = require('../../lib/page')
const { today, validDate, localDateTimeToInstant, instantToLocalDateTime } = require('../../lib/dates')

function emptyForm() { return { record_date: today(), weight_kg: '', measured_time: '', waist_cm: '', notes: '', is_shared: false } }
function formFrom(row) {
  const time = row.measured_at ? instantToLocalDateTime(row.measured_at).slice(11, 16) : ''
  return { record_date: row.record_date, weight_kg: String(row.weight_kg), measured_time: time, waist_cm: row.waist_cm == null ? '' : String(row.waist_cm), notes: row.notes || '', is_shared: !!row.is_shared }
}
function payload(form, row, userId) {
  const weight = Number(form.weight_kg), waist = form.waist_cm === '' ? null : Number(form.waist_cm)
  if (!validDate(form.record_date) || form.record_date > today()) throw new Error('测量日期不能晚于今天')
  if (!Number.isFinite(weight) || weight < 20 || weight > 500) throw new Error('请填写有效体重（20–500 kg）')
  if (waist !== null && (!Number.isFinite(waist) || waist < 20 || waist > 300)) throw new Error('请填写有效腰围（20–300 cm）')
  const measuredAt = form.measured_time ? localDateTimeToInstant(`${form.record_date}T${form.measured_time}`) : null
  if (measuredAt && Date.parse(measuredAt) > Date.now()) throw new Error('测量时刻不能晚于现在')
  return { user_id: userId, record_date: form.record_date, measured_at: measuredAt, weight_kg: weight, waist_cm: waist, notes: form.notes.trim() || null, is_shared: !!form.is_shared, ...(row ? { expected_updated_at: row.updated_at } : {}) }
}

Page({
  data: { ...baseData, today: today(), form: emptyForm(), rows: [], editingId: '', dirty: false },
  onShow() { refresh(this) },
  onPullDownRefresh() { refresh(this).finally(() => wx.stopPullDownRefresh()) },
  receive(data) {
    const rows = (data.weights || []).filter(row => row.user_id === data.user.id).sort((a, b) => b.record_date.localeCompare(a.record_date))
    const row = rows.find(item => item.id === this.data.editingId)
    this.setData({ rows, userId: data.user.id, today: today(), ...(!this.data.dirty ? { form: row ? formFrom(row) : emptyForm() } : {}) })
  },
  settings: openSettings,
  retryRefresh() { refresh(this) },
  change(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value, dirty: true }) },
  share(event) { this.setData({ 'form.is_shared': !!event.detail.value, dirty: true }) },
  clearTime() { this.setData({ 'form.measured_time': '', dirty: true }) },
  edit(event) {
    const row = this.data.rows.find(item => item.id === event.currentTarget.dataset.id)
    if (row) this.setData({ editingId: row.id, form: formFrom(row), dirty: false, error: '' })
  },
  newRecord() { this.setData({ editingId: '', form: emptyForm(), dirty: false, error: '' }) },
  async save() {
    const row = this.data.rows.find(item => item.id === this.data.editingId)
    let value
    try { value = payload(this.data.form, row, this.data.userId) } catch (error) { this.setData({ error: error.message }); return }
    const result = await perform(this, () => api().saveWeight(value, row?.id || null), '体重已保存')
    if (result.ok) this.setData({ editingId: '', form: emptyForm(), dirty: false })
  },
  remove() {
    const row = this.data.rows.find(item => item.id === this.data.editingId)
    if (!row) return
    wx.showModal({ title: '删除这条体重记录？', content: '删除后无法恢复。', success: async ({ confirm }) => {
      if (!confirm) return
      const result = await perform(this, () => api().deleteWeight(row.id), '体重已删除')
      if (result.ok) this.newRecord()
    } })
  },
  trends() { wx.switchTab({ url: '/pages/trends/index' }) }
})

module.exports = { emptyForm, formFrom, payload }

const { baseData, refresh, openSettings, openWeight } = require('../../lib/page')
const { today, addDays, instantToLocalDateTime } = require('../../lib/dates')
const { exerciseById } = require('../../lib/shared')

const kinds = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐', other: '其他' }
function mealSummary(meal, index) { return { key: index, name: meal.title || meal.name || kinds[meal.kind] || `第 ${index + 1} 餐`, time: meal.time || '', foods: (meal.foods || meal.items || []).map(food => typeof food === 'string' ? food : `${food.name || ''} ${food.portion || ''}${food.unit || ''}`), prep: meal.prep_method || '', purchase: meal.purchase_or_prep || '', alternative: meal.alternative || '', notes: meal.notes || meal.description || '', snackReason: meal.snack_reason || '' } }
function todayView(data, day = today()) {
  const own = row => row.user_id === data.user.id
  const planVersions = (data.daily_plans || []).filter(row => own(row) && row.target_date === day).sort((a, b) => b.version - a.version)
  const plan = planVersions[0]
  const content = plan?.content || {}, training = content.training || {}
  const meals = (data.meals || []).filter(row => own(row) && instantToLocalDateTime(row.data.recorded_at).slice(0, 10) === day).sort((a, b) => b.data.recorded_at.localeCompare(a.data.recorded_at))
  const confirmed = meals.filter(row => row.status === 'confirmed')
  const known = confirmed.filter(row => { const e = row.data.estimate; return e?.recognition_status !== 'unrecognized' && typeof e?.energy_min_kcal === 'number' && typeof e?.energy_max_kcal === 'number' && e.energy_max_kcal >= e.energy_min_kcal })
  const intake = known.reduce((sum, row) => { const f = Number(row.data.eaten_fraction); return [sum[0] + row.data.estimate.energy_min_kcal * f, sum[1] + row.data.estimate.energy_max_kcal * f] }, [0, 0])
  const weights = (data.weights || []).filter(own).sort((a, b) => b.record_date.localeCompare(a.record_date))
  const sessions = (data.training_sessions || []).filter(own).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  return { day, tomorrow: addDays(day, 1), planId: plan?.id || '', planVersion: plan?.version || 0, planLocked: !!plan?.is_locked, planStale: !!plan?.is_stale, planSummary: content.summary || '', planMeals: (content.meals || []).map(mealSummary), planHistory: planVersions.slice(1).map(row => ({ id: row.id, version: row.version, summary: row.content?.summary || '', meals: (row.content?.meals || []).map(mealSummary), trainingMode: row.content?.training?.mode === 'workout' ? '训练' : '休息' })), training: { mode: training.mode || 'rest', purpose: training.purpose || '', time: training.time || '', warmup: (training.warmup || []).map(step => step.description || step.name || ''), items: (training.items || []).map(item => ({ ...item, name: exerciseById.get(item.exercise_id)?.name || item.exercise_id })), cooldown: (training.cooldown || []).map(step => step.description || step.name || '') }, confirmed: confirmed.map(row => ({ id: row.id, name: kinds[row.data.kind] || '餐食', food: (row.data.items || []).map(item => `${item.name} ${item.portion}${item.unit}`).join('、'), fraction: Math.round(Number(row.data.eaten_fraction) * 100) })), draftCount: meals.length - confirmed.length, knownCount: known.length, missingCount: confirmed.length - known.length, intakeText: known.length ? `${Math.round(intake[0])}–${Math.round(intake[1])} kcal` : '暂无可靠估算', latestWeight: weights[0] ? `${weights[0].weight_kg} kg · ${weights[0].record_date}` : '尚无实际体重', liveTraining: sessions.some(row => ['active', 'paused'].includes(row.data?.status)), scheduleCount: (data.schedules || []).filter(row => own(row) && row.record_date === day).length }
}

Page({
  data: { ...baseData, day: today(), tomorrow: addDays(today(), 1), planMeals: [], planHistory: [], confirmed: [], training: { mode: 'rest', warmup: [], items: [], cooldown: [] }, intakeText: '暂无可靠估算', latestWeight: '尚无实际体重' },
  onShow() { this.setData({ day: today(), tomorrow: addDays(today(), 1) }); refresh(this) },
  onPullDownRefresh() { refresh(this).finally(() => wx.stopPullDownRefresh()) },
  receive(data) { this.setData(todayView(data)) },
  retryRefresh() { refresh(this) },
  settings: openSettings,
  meal() { wx.navigateTo({ url: '/pages/meal/index' }) },
  weight: openWeight,
  tomorrowPage() { wx.switchTab({ url: '/pages/tomorrow/index' }) },
  trainingPage() { wx.switchTab({ url: '/pages/training/index' }) },
  trendsPage() { wx.switchTab({ url: '/pages/trends/index' }) },
  recordsPage() { wx.switchTab({ url: '/pages/records/index' }) },
  editMeal(event) { wx.navigateTo({ url: `/pages/meal/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}` }) }
})

module.exports = { todayView }

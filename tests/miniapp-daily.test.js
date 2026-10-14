import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const configs = {}
const storage = new Map()
let source, calls, failMealOnce = false, failActivityOnce = false
globalThis.wx = {
  getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key),
  getRandomValues: ({ length, success }) => success({ randomValues: Uint8Array.from({ length }, (_, index) => index + 1) }),
  stopPullDownRefresh() {}, navigateTo() {}, switchTab() {}, previewImage() {}, showModal() {}
}
globalThis.getApp = () => ({
  api: { session: () => ({ user: { id: 'owner' } }),
    saveMeal: async (payload, id) => { calls.push(['meal', payload, id]); if (failMealOnce) { failMealOnce = false; throw new Error('网络结果未知') } return { id: id || 'meal-new' } },
    saveTrainingSession: async (payload, id) => { calls.push(['activity', payload, id]); if (failActivityOnce) { failActivityOnce = false; throw new Error('网络结果未知') } return { id: id || 'activity-new' } },
    deleteTrainingSession: async id => { calls.push(['delete-activity', id]) },
    saveWeight: async (payload, id) => { calls.push(['weight', payload, id]); return { id: id || 'weight-new' } },
    saveConfirmedSchedule: async (payload, id) => { calls.push(['schedule', payload, id]); return { id: id || 'schedule-new' } } },
  globalData: { offline: false }, loadData: async () => source
})
for (const name of ['today', 'tomorrow', 'records', 'weight', 'meal']) {
  globalThis.Page = config => { configs[name] = config }
  require(`../miniprogram/pages/${name}/index.js`)
}
const { today, addDays, instantToLocalDateTime } = require('../miniprogram/lib/dates.js')
const { mealPayload, emptyForm } = require('../miniprogram/pages/meal/index.js')
const { schedulePayload } = require('../miniprogram/pages/tomorrow/index.js')
const { payload: weightPayload } = require('../miniprogram/pages/weight/index.js')
const { todayView } = require('../miniprogram/pages/today/index.js')
const { recordsView, activityPayload, blankActivity } = require('../miniprogram/pages/records/index.js')
function page(name) {
  const config = configs[name], instance = { ...config, data: structuredClone(config.data) }
  instance.setData = patch => { for (const [path, value] of Object.entries(patch)) {
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.'); let target = instance.data
    for (const part of parts.slice(0, -1)) target = target[part]
    target[parts.at(-1)] = value
  } }
  return instance
}
const own = { user: { id: 'owner' }, account: 'me', schedules: [], daily_plans: [], generation_jobs: [], weights: [], meals: [], photo_assets: [], meal_adjustments: [], training_sessions: [], healthAvailable: true, providerAiAvailable: true, dailyFlowAvailable: true }

test('明日手动日程保留原文与结构，拒绝结束早于开始', () => {
  const form = { ...configs.tomorrow.data.form, raw_text: '合成原文', exercise_intent: 'yes', exercise_type: '力量训练', start_time: '19:00', end_time: '20:00', duration_minutes: '40', meal_conditions: '合成条件' }
  const value = schedulePayload(form, null, own, null)
  assert.equal(value.raw_text, '合成原文'); assert.equal(value.confirmed_data.exercise.type, '力量训练')
  assert.equal(value.confirmed_data.exercise.explicit_end_time, '20:00'); assert.equal(value.parse_version, 'manual-schedule-v1')
  assert.throws(() => schedulePayload({ ...form, end_time: '18:59' }, null, own, null), /结束时间/)
  assert.throws(() => schedulePayload({ ...form, record_date: addDays(today(), 2) }, null, own, null), /明日日期/)
})

test('体重默认今日私有，可补录且编辑带版本', () => {
  const value = weightPayload({ record_date: today(), weight_kg: '68.4', measured_time: '', waist_cm: '', notes: '', is_shared: false }, null, 'owner')
  assert.equal(value.is_shared, false); assert.equal(value.measured_at, null); assert.equal(value.weight_kg, 68.4)
  const edit = weightPayload({ record_date: addDays(today(), -1), weight_kg: '68.1', measured_time: '', waist_cm: '', notes: '', is_shared: false }, { updated_at: 'rev1' }, 'owner')
  assert.equal(edit.expected_updated_at, 'rev1')
})

test('餐食草稿与营养标签按整份计算，未知项不作零', () => {
  const form = emptyForm(); form.items = [{ name: '合成食物', portion: '1', unit: '份', grams_min: '90', grams_max: '110', kcal_per_100g: '100', nutrition_source: '合成标签' }]; form.additions_status = 'none'; form.estimate_method = 'confirmed_nutrition'; form.eaten_fraction = '0.5'
  const value = mealPayload(form, null, [], null)
  assert.equal(value.payload.status, 'draft'); assert.equal(value.payload.is_shared, false)
  assert.equal(value.payload.data.estimate.energy_min_kcal, 90); assert.ok(Math.abs(value.payload.data.estimate.energy_max_kcal - 110) < 1e-9)
  assert.equal(value.payload.data.eaten_fraction, 0.5)
  form.items[0].kcal_per_100g = ''
  assert.equal(mealPayload(form, null, [], null).payload.data.estimate, null)
})

test('纯照片可先建空食物草稿，不能空食物确认摄入', () => {
  const form = emptyForm()
  const draft = mealPayload(form, null, [], null, true)
  assert.deepEqual(draft.payload.data.items, []); assert.equal(draft.payload.status, 'draft')
  assert.throws(() => mealPayload({ ...form, status: 'confirmed' }, null, [], null, true), /食物/)
})

test('更正食物或油酱会清除旧区间，新建保存使用稳定请求编号', async () => {
  calls = []; source = { ...own }
  const row = { id: 'old', updated_at: 'rev1', data: { recorded_at: new Date().toISOString(), kind: 'lunch', items: [{ name: '合成饭', portion: '1', unit: '碗' }], eaten_fraction: 1, cooking: null, oil: null, leftover: null, estimate: { energy_min_kcal: 200, energy_max_kcal: 300 } }, status: 'confirmed', is_shared: false }
  const form = { ...emptyForm(), ...require('../miniprogram/pages/meal/index.js').fromRow(row), oil: '加了油' }
  const value = mealPayload(form, row, [], { items: row.data.items, cooking: null, oil: null, leftover: null })
  assert.equal(value.payload.data.estimate, null); assert.equal(value.payload.expected_updated_at, 'rev1')
  const p = page('meal'); p.receive(source); p.data.form.items = [{ name: '合成饭', portion: '1', unit: '碗' }]
  await p.save()
  assert.equal(calls.length, 1); assert.match(calls[0][1].client_request_id, /^[0-9a-f-]{36}$/)
  assert.equal(storage.size, 0)
})

test('今日只汇总本人已确认餐食并只乘一次吃掉比例', () => {
  const instant = `${today()}T12:00:00+08:00`
  const record = (id, user_id, status, estimate) => ({ id, user_id, status, data: { recorded_at: instant, kind: 'lunch', items: [], eaten_fraction: 0.5, estimate } })
  const data = { ...own, meals: [record('a', 'owner', 'confirmed', { energy_min_kcal: 100, energy_max_kcal: 200 }), record('b', 'owner', 'draft', { energy_min_kcal: 100, energy_max_kcal: 200 }), record('c', 'partner', 'confirmed', { energy_min_kcal: 1000, energy_max_kcal: 2000 }), record('d', 'owner', 'confirmed', null)] }
  const view = todayView(data)
  assert.equal(view.intakeText, '50–100 kcal'); assert.equal(view.missingCount, 1); assert.equal(view.draftCount, 1)
  assert.equal(recordsView(data).meals.length, 3)
})

test('今日完整计划保留采购、做法和替代项', () => {
  const meal = { title: '早餐', time: '08:00', foods: [{ name: '合成食物', portion: '1', unit: '份' }], prep_method: '蒸', purchase_or_prep: '提前备好', alternative: '等份替换', notes: '合成说明', snack_reason: null }
  const plan = { id: 'p', user_id: 'owner', target_date: today(), version: 1, content: { summary: '合成计划', meals: [meal], training: { mode: 'rest', warmup: [], items: [], cooldown: [] } } }
  const view = todayView({ ...own, daily_plans: [plan] })
  assert.equal(view.planMeals[0].prep, '蒸'); assert.equal(view.planMeals[0].purchase, '提前备好'); assert.equal(view.planMeals[0].alternative, '等份替换')
})

test('新餐网络结果未知时保持同一请求编号与原 payload 重试', async () => {
  calls = []; source = { ...own }; failMealOnce = true
  const p = page('meal'); p.receive(source); p.data.form.items = [{ name: '合成饭', portion: '1', unit: '碗' }]
  await p.save()
  assert.equal(calls.length, 1); assert.equal(storage.size, 1); assert.equal(p.data.pendingCreate, true)
  await p.retryPending()
  assert.equal(calls.length, 2); assert.deepEqual(calls[1][1], calls[0][1]); assert.equal(storage.size, 0)
})

test('羽毛球只存实际日期与时长，不编造时刻或热量；编辑带版本', () => {
  const form = { ...blankActivity(), duration_minutes: '90', intensity: 'vigorous', pain: 'mild', notes: '合成备注' }
  const value = activityPayload(form)
  assert.equal(value.data.activity_type, 'badminton'); assert.equal(value.data.duration_seconds, 5400)
  assert.equal(value.data.elapsed_seconds, 5400); assert.equal(value.data.started_at, null); assert.equal(value.data.ended_at, null)
  assert.equal(value.data.plan_id, null); assert.equal(value.is_shared, false); assert.equal(value.data.kcal, undefined)
  const edited = activityPayload(form, { updated_at: 'rev1', data: { status: 'completed' } })
  assert.equal(edited.expected_updated_at, 'rev1')
  assert.throws(() => activityPayload({ ...form, duration_minutes: '0' }), /实际运动时长/)
})

test('羽毛球新建未知结果复用稳定请求编号，再可按版本修改', async () => {
  calls = []; source = { ...own }; failActivityOnce = true
  const p = page('records'); p.receive(source); p.data.activity.duration_minutes = '45'
  await p.saveActivity()
  assert.equal(calls.length, 1); assert.equal(p.data.pendingActivity, true); assert.equal(storage.size, 1)
  await p.retryActivity()
  assert.equal(calls.length, 2); assert.deepEqual(calls[1][1], calls[0][1]); assert.equal(storage.size, 0)
  const row = { id: 'activity-old', user_id: 'owner', updated_at: 'rev1', record_date: today(), status: 'completed', data: calls[1][1].data, is_shared: false }
  source = { ...own, training_sessions: [row] }; p.receive(source); p.editActivity({ currentTarget: { dataset: { id: row.id } } })
  p.data.activity.notes = '修正备注'; await p.saveActivity()
  assert.equal(calls[2][2], row.id); assert.equal(calls[2][1].expected_updated_at, 'rev1')
})

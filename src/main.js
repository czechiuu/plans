import './style.css'
import { api, configured, configurationError } from './api.js'
import { shanghaiDate, addDays, sevenDayAverage, escapeHtml, instantToLocalDateTime, localDateTimeToInstant, validDate } from './domain.js'
import { exercises, exerciseById } from '../shared/exercises.js'

const root = document.querySelector('#app')
const safe = (value) => escapeHtml(value ?? '')
const date = () => shanghaiDate()
const state = {
  session: null, data: null, page: 'today',
  scheduleDate: date(), mealDate: date(), scope: 'mine', edit: null, notice: '', error: false, busy: false,
  danger: null, loading: true, profileDraft: null, loginSlot: 'me',
  exiting: false, planDraft: null, parsedSchedule: null, mealEdit: null, mealEstimateDraft: null, photoUrl: null, rulesDraft: null, aiStatus: null,
}
let generation = 0
let pendingWork = null

function clearSensitive(session = null) {
  generation++
  if (state.photoUrl) URL.revokeObjectURL(state.photoUrl)
  Object.assign(state, { session, data: null, page: 'today', scheduleDate: date(), mealDate: date(), scope: 'mine', edit: null, notice: '', error: false, busy: false, exiting: false, danger: null, profileDraft: null, loginSlot: 'me', loading: false, planDraft: null, parsedSchedule: null, mealEdit: null, mealEstimateDraft: null, photoUrl: null, rulesDraft: null, aiStatus: null })
  root.replaceChildren()
}
const accountLabel = account => ({ me: '我', w: 'W' })[account] || ''

function setNotice(message, error = false) { state.notice = message; state.error = error; render() }
function message() { return state.notice ? `<div class="notice ${state.error ? 'error' : ''}" role="${state.error ? 'alert' : 'status'}">${safe(state.notice)}</div>` : '' }
function errorText(error) {
  const code = String(error?.code || '')
  if (code === 'CONFLICT' || /conflict|stale|version/i.test(error?.message || '')) return '这条记录已在其他设备更新。请刷新后再编辑。'
  if (code === '23505') return '这一天已有记录。请刷新后编辑已有记录。'
  if (error?.message === 'invalid-time') return '结束时间需要晚于开始时间。'
  if (error?.message === 'invalid-date') return '代改伴侣记录时不能修改原日期。'
  if (error?.message === 'measured-date') return '测量时间的日期需要与测量日期一致。'
  if (error?.message === 'empty-schedule') return '请填写至少一项实际日程内容。'
  if (error?.message === 'rest-plan-has-exercises') return '选择休息日时请移除热身、动作和放松步骤，或将训练安排改为“训练”。'
  if (error?.message === 'invalid-exercise') return '请选择动作库中存在的动作。'
  if (error?.message === 'training-plan-limit') return '初学训练最多 3 个动作，每个动作 1–2 组、每组 1–120 秒；做 2 组时组间休息至少 30 秒。'
  if (error?.message === 'meal-template-incomplete') return '三餐模板需完整填写早餐、午餐、晚餐及每餐食物，或全部留空。'
  if (error?.message === 'empty-meal') return '至少填写一种实际食物。'
  if (error?.message === 'wrong-slot') return '只能为当前登录的本人创建日程。伴侣请用自己的账号确认。'
  if (error?.message === 'ai-budget') return '要启用 AI，请先填写大于 0 的月度上限；当前不会发起付费调用。'
  if (error?.message === 'ai-not-enabled') return '文字 AI 尚未授权或服务未配置，请继续手动填写。'
  if (error?.message === 'invalid-ai-draft') return '解析结果不完整，未写入日程。请手动填写或稍后重试。'
  if (code === 'SERVER_NOT_CONFIGURED' || code === 'AI_DISABLED') return 'AI 服务端尚未配置，当前无法使用。'
  if (code === 'AI_CONSENT_REQUIRED') return '本人尚未授权此项 AI 使用，当前不会发送健康内容。'
  if (code === 'AI_BUDGET_EXCEEDED') return '本人或空间的 AI 预算不足，当前不会调用付费服务。'
  if (code === 'MEAL_TEMPLATE_UNCONFIRMED') return '三餐模板尚未由本人完整确认，计划没有生成。'
  if (code === 'AI_PROVIDER_FAILED') return 'AI 服务请求失败，计划没有生成；请稍后查看任务状态。'
  if (code === 'AI_PROVIDER_REQUIRED') return '请先明确选择本次使用的服务。'
  if (code === 'AI_PROVIDER_UNAVAILABLE') return 'DeepSeek 本轮仅验证合成样例，尚未开放个人健康资料处理。'
  if (code === 'AI_EXTENSION_UNAVAILABLE') return '新版 AI 授权尚未部署；手动记录与计划仍可使用。'
  if (code === 'AI_STATUS_REQUIRED') return '请先检查后台服务状态，再设置夜间计划方式。'
  if (code === 'AI_SERVICE_VERSION_MISMATCH') return 'AI 服务版本尚未与授权功能匹配，当前不会发送健康内容。'
  if (code === 'AI_SERVICE_NOT_READY') return '所选 AI 服务或预算尚未准备好，当前不会发送健康内容。'
  if (code === 'AI_SERVICE_UNAVAILABLE') return '生成任务已登记，但无法确认 AI 服务调用；请刷新查看任务状态。'
  if (error?.name === 'FunctionsFetchError' || error?.name === 'FunctionsHttpError') return '无法连接功能服务或服务尚未部署，请稍后查看真实状态。'
  if (error?.message === 'photo-required') return '请先选择本人照片。'
  if (error?.message === 'photo-too-large') return '净化后的图片超过 4 MiB，请选较小的照片。'
  if (error?.message === 'photo-needs-meal') return '请先保存本人餐食，再把照片关联到这餐。'
  if (code === 'ACCOUNT_DENIED') return '这个账号没有使用权限，本机登录已清除。请联系管理员。'
  if (code === 'ACCOUNT_CHECK_FAILED') return '无法核对固定账号，本机登录已清除。请检查网络后重试。'
  if (code === 'ACCOUNT_CHANGED') return '账号在其他页面发生变化，旧页面资料已清空。请重新登录。'
  if (code === 'SIGNOUT_INCOMPLETE') return '退出未完成。页面资料已清空，请重试退出。'
  if (code === 'SIGNOUT_UNCONFIRMED') return '此设备会话已清除，但服务器退出请求未确认。'
  if (code === 'INVALID_CURRENT_PASSWORD' || code === 'reauthentication_not_valid') return '当前密码不正确，密码未修改。'
  if (code === 'invalid_credentials') return '账号或密码不正确。'
  if (code === 'reauthentication_needed' || code === 'reauth_nonce_missing') return '后台要求额外验证，密码未修改。请联系管理员。'
  if (code === 'same_password') return '新密码不能与当前密码相同。'
  return '操作未完成。请检查输入和网络连接后重试；如仍失败，请刷新查看最新数据。'
}
async function work(action, success = '') {
  if (state.busy) return
  const started = generation
  state.busy = true; state.notice = ''; render()
  const run=(async()=>{
    try { await api.withAuthToken(state.session?.access_token,action); if (generation !== started) return; if (success) state.notice = success; state.error = false }
    catch (error) { if (generation !== started) return; console.error('操作失败', error?.code || error?.name || 'unknown'); state.notice = errorText(error); state.error = true }
    finally { if (generation === started) { state.busy = false; render() } }
  })()
  pendingWork=run
  try { await run } finally { if (pendingWork===run) pendingWork=null }
}
async function reload(expectedGeneration = generation) {
  if (expectedGeneration !== generation) return
  const started = generation
  const session = state.session
  let data
  try { data = await api.load() }
  catch (error) {
    if (started === generation && ['ACCOUNT_DENIED','ACCOUNT_CHECK_FAILED','ACCOUNT_CHANGED'].includes(error?.code)) { clearSensitive(); state.notice = errorText(error); state.error = true; render() }
    throw error
  }
  const current = await api.session()
  if (started !== generation || state.session?.access_token !== session?.access_token || current?.access_token !== session?.access_token) return
  state.data = data
  if (!state.data.space) { state.profileDraft = null; state.page = 'today' }
  state.edit = null
}
function brand() { return `<div class="brand"><span class="brand-mark" aria-hidden="true">✳</span><span>两个人的日常</span></div>` }
function header() {
  const name = accountLabel(state.data?.account)
  return `<header class="site-header">${brand()}<div class="header-side">${name ? `<span class="pill">${safe(name)}</span>` : ''}${state.data?.space ? `<span class="pill"><span class="status-dot"></span>${safe(state.data.space.name)}</span>` : ''}</div></header>`
}
function layout(content, aside = '') {
  return `<div class="shell">${header()}${message()}<div class="layout"><main class="main-column stack">${content}</main>${aside ? `<aside class="side-column stack">${aside}</aside>` : ''}</div></div>`
}
function button(text, action, cls = 'secondary', attrs = '') { return `<button type="button" class="btn ${cls}" data-action="${action}" ${attrs}>${text}</button>` }
function field(label, name, value = '', type = 'text', attrs = '', full = false) {
  return `<label class="field ${full ? 'full' : ''}"><span>${label}</span><input name="${name}" type="${type}" value="${safe(value)}" ${attrs}></label>`
}
function textArea(label, name, value = '', attrs = '') { return `<label class="field full"><span>${label}</span><textarea name="${name}" ${attrs}>${safe(value)}</textarea></label>` }
function check(label, name, value = false, desc = '') { return `<label class="check"><input type="checkbox" name="${name}" ${value ? 'checked' : ''}><span>${label}${desc ? `<small class="hint" style="display:block">${desc}</small>` : ''}</span></label>` }
function select(label, name, value, options) { return `<label class="field"><span>${label}</span><select name="${name}">${options.map(([v,t]) => `<option value="${safe(v)}" ${value === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` }
function mine() { return state.data?.members?.find(m => m.user_id === state.data?.user?.id) }
function partner() { return state.data?.members?.find(m => m.user_id !== state.data?.user?.id) }
function partnerProfile() { return state.data?.profiles?.find(p => p.user_id === partner()?.user_id) }
function person(id) { return id === state.data?.user?.id ? '我' : partner()?.display_name || '伴侣' }
function visibleByScope(row) { return state.scope === 'all' || (state.scope === 'mine' ? row.user_id === state.data.user.id : row.user_id !== state.data.user.id) }
function ownRows(key) { return (state.data?.[key] || []).filter(row => row.user_id === state.data.user.id) }
function currentRules() { return ownRows('health_rules')[0] || null }
function providerConsent(provider,purpose) { return ownRows('ai_consents').find(row=>row.provider===provider && row.purpose===purpose) || null }
async function requireProviderReady(provider,purpose) {
  const started=generation, token=state.session?.access_token
  if (!state.data?.providerAiAvailable) throw Object.assign(new Error('新版 AI 授权尚未部署'),{code:'AI_EXTENSION_UNAVAILABLE'})
  if (!provider) throw Object.assign(new Error('未选择服务'),{code:'AI_PROVIDER_REQUIRED'})
  if (provider === 'deepseek') throw Object.assign(new Error('DeepSeek 尚未开放'),{code:'AI_PROVIDER_UNAVAILABLE'})
  const status=await api.aiStatus()
  if (started !== generation || token !== state.session?.access_token) throw Object.assign(new Error('账号已变化'),{code:'ACCOUNT_CHANGED'})
  state.aiStatus=status
  if (provider === 'rules') return status
  const choice=status.providers?.[provider]
  if (!choice?.configured || !choice.budget_configured || !status.global_budget_configured) throw Object.assign(new Error('服务或预算未就绪'),{code:'AI_SERVICE_NOT_READY'})
  if (!choice.consents?.[purpose]?.enabled) throw Object.assign(new Error('本人未授权该用途'),{code:'AI_CONSENT_REQUIRED'})
  return status
}
function currentPlan(day, userId = state.data.user.id) { return (state.data.daily_plans || []).filter(row => row.user_id === userId && row.target_date === day).sort((a,b) => b.version - a.version)[0] || null }
function healthStatus() { return `<div class="card warn"><h2>新功能尚未连接</h2><p class="hint">这个后台尚未部署训练、饮食和计划所需的数据库更新。现有手动日程、体重与隐私功能仍可使用；这里不会显示虚构数据。</p></div>` }
function canEdit(row, type) {
  if (row.user_id === state.data.user.id) return true
  return Boolean(partner()?.allow_partner_edit && partner()?.[`share_${type}`] && row.is_shared)
}
function updateMeta(row) { return `<span class="fine">${row.updated_at ? `更新 ${safe(instantToLocalDateTime(row.updated_at).replace('T', ' '))}（上海）` : ''}${row.updated_by ? ` · 修改者：${safe(person(row.updated_by))}` : ''}</span>` }
function nav() { return `<nav class="nav" aria-label="主导航"><div class="nav-inner">${[['today','今日','◉'],['tomorrow','明日安排','▦'],['training','训练','◇'],['food','饮食','◈'],['trends','趋势','◌'],['settings','设置','⚙']].map(([p,t,i]) => `<button type="button" data-action="page" data-page="${p}" class="${state.page === p ? 'active' : ''}" ${state.page === p ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${i}</span>${t}</button>`).join('')}</div></nav>` }
function renderUnconfigured() {
  root.innerHTML = `<div class="shell">${header()}<div class="auth-wrap"><div class="card soft"><p class="eyebrow">私人健康空间 · 第一阶段</p><h1>先连接私人后台</h1><p>当前尚未连接后台，因此不能登录或保存健康资料。请由部署人员配置 Supabase 地址与公开密钥，再完成数据库和权限部署。</p><p class="callout">配置完成后才能使用固定账号和真实数据；云端权限与跨设备功能仍需在真实环境验收。</p>${configurationError ? `<p class="hint">配置状态：${safe(configurationError)}</p>` : ''}<div class="divider"></div><p class="hint">本阶段支持手动日程、体重、共享设置与私人空间。自动计划、照片和 AI 尚未启用；资料不会发送给外部 AI。</p></div></div></div>`
}
function auth() {
  root.innerHTML = `<div class="shell">${header()}${message()}<div class="auth-wrap"><div class="card"><p class="eyebrow">给两个人的安静空间</p><h1>欢迎回来</h1><p class="muted">请选择你自己的账号并输入密码。登录后会保留此设备的会话，主动退出才会清除。</p><form data-form="signin" class="stack"><fieldset class="account-choice"><legend>账号</legend><label><input type="radio" name="slot" value="me" ${state.loginSlot === 'me' ? 'checked' : ''}> 我</label><label><input type="radio" name="slot" value="w" ${state.loginSlot === 'w' ? 'checked' : ''}> W</label></fieldset>${field('密码','password','','password','required autocomplete="current-password"')}<button class="btn" ${state.busy ? 'disabled' : ''}>登录</button></form><p class="hint" style="margin-top:18px">此页面不开放注册、邮件找回或邀请。无法登录请联系管理员。</p></div></div></div>`
}
function space() {
  root.innerHTML = layout(`<section class="card"><p class="eyebrow">私人空间</p><h1>空间尚未准备好</h1><p class="muted">已登录账号 ${accountLabel(state.data.account)}，但没有关联到预先建立的私人空间。请联系管理员处理，不需要自行创建或使用邀请。</p><div class="actions">${button('刷新状态','refresh','secondary')}${button('退出此设备／切换账号','signout','ghost')}</div></section>${passwordForm()}`)
}
function scopeSwitch() { return `<div class="segmented" role="group" aria-label="查看范围">${[['mine','我'],['partner','伴侣'],['all','共同']].map(([v,t]) => `<button type="button" data-action="scope" data-scope="${v}" class="${state.scope === v ? 'active' : ''}" aria-pressed="${state.scope === v}">${t}</button>`).join('')}</div>` }
function dashboard() {
  const schedules = state.data.schedules.filter(r => r.record_date === date() && visibleByScope(r))
  const weightRows = state.data.weights.filter(r => r.user_id === (state.scope === 'partner' ? partner()?.user_id : state.data.user.id))
  const latest = [...weightRows].sort((a,b) => b.record_date.localeCompare(a.record_date))[0]
  const avg = sevenDayAverage(weightRows, date())
  const plan = state.data.healthAvailable ? currentPlan(date(),state.scope === 'partner' ? partner()?.user_id : state.data.user.id) : null
  return `<div class="card soft"><p class="eyebrow">今天 · ${safe(date())}</p><h2>照顾自己，也看见彼此</h2><p class="muted">这里展示真实记录。没有填写的内容会保持空白。</p>${scopeSwitch()}</div><div class="stat-grid"><div class="stat"><span>今日可见日程</span><b>${schedules.length}</b><span>条记录</span></div><div class="stat"><span>${state.scope === 'partner' ? '伴侣' : '我的'}最近体重</span><b>${latest ? `${safe(latest.weight_kg)} kg` : '—'}</b><span>${latest ? safe(latest.record_date) : '尚无记录'}</span></div><div class="stat"><span>${state.scope === 'partner' ? '伴侣' : '我的'}近7日平均</span><b>${avg.count ? `${safe(avg.average.toFixed(1))} kg` : '—'}</b><span>真实记录 ${avg.count} 条</span></div></div>${plan ? planCard(plan) : '<div class="card empty"><strong>今天没有已确认计划</strong>可查看已填写的日程；这里不会生成假安排。</div>'}<div class="card"><div class="card-header"><div><h2>今天的日程</h2><span class="hint">只显示你有权查看的内容</span></div>${button('查看安排','page','secondary','data-page="tomorrow"')}</div>${scheduleList(schedules)}</div><div class="card"><h2>明天 · ${safe(addDays(date(),1))}</h2>${scheduleList(state.data.schedules.filter(r => r.record_date === addDays(date(),1) && visibleByScope(r)))}</div>${!state.data.healthAvailable ? healthStatus() : ''}`
}
function scheduleList(rows) {
  if (!rows.length) return `<div class="empty"><strong>这一天还没有记录</strong>可以到“明日安排”手动添加。</div>`
  return `<div class="list">${rows.sort((a,b) => (a.start_time || '').localeCompare(b.start_time || '')).map(r => `<article class="list-item"><div class="row-between"><strong>${safe(person(r.user_id))} · ${safe(r.record_date)}</strong><span class="tag ${r.is_shared ? 'shared' : 'private'}">${r.is_shared ? '共享' : '私有'}</span></div><div class="meta">${r.start_time ? `<span>${safe(r.start_time.slice(0,5))}${r.end_time ? `–${safe(r.end_time.slice(0,5))}` : ''}</span>` : '<span>未指定时段</span>'}<span>运动：${({yes:'愿意',no:'不安排',unknown:'未确定'})[r.exercise_intent] || '未确定'}</span></div>${r.raw_text ? `<p>${safe(r.raw_text)}</p>` : ''}${r.fixed_arrangements ? `<p><b>固定安排：</b>${safe(r.fixed_arrangements)}</p>` : ''}${r.meal_conditions ? `<p><b>用餐条件：</b>${safe(r.meal_conditions)}</p>` : ''}${r.constraints ? `<p><b>限制：</b>${safe(r.constraints)}</p>` : ''}<div class="row-between" style="margin-top:10px">${updateMeta(r)}${canEdit(r,'schedule') ? `<div class="item-actions">${button('编辑','edit-schedule','ghost small',`data-id="${safe(r.id)}"`)}${button('删除','delete-schedule','danger secondary small',`data-id="${safe(r.id)}"`)}</div>` : ''}</div></article>`).join('')}</div>`
}
function scheduleForm() {
  const r = state.edit?.type === 'schedule' ? state.edit.row : null
  const partnerEdit = r && r.user_id !== state.data.user.id
  const draft=state.parsedSchedule
  const d = draft ? { ...draft, exercise_intent:draft.exercise?.intent, exercise_type:draft.exercise?.type, duration_minutes:draft.exercise?.duration_minutes, location:draft.exercise?.location, equipment:draft.exercise?.equipment, explicit_start_time:draft.exercise?.explicit_start_time, explicit_end_time:draft.exercise?.explicit_end_time, meal_conditions:draft.meal?.conditions, meal:draft.meal?.arrangements, constraints:(draft.constraints || []).join('\n') } : (partnerEdit ? { user_slot: state.data.account === 'me' ? 'w' : 'me' } : {})
  return `<div class="card"><div class="card-header"><div><h2>${r ? '编辑日程' : '新增日程'}</h2><span class="hint">请本人逐项核对日期、人员与内容，点击保存后才写入。</span></div>${r ? button('取消编辑','cancel-edit','ghost') : ''}</div><form data-form="schedule"><div class="form-grid">${select('这是谁的日程','user_slot',d.user_slot || state.data.account,[['me','我'],['w','W']])}${field('日期','record_date',r?.record_date || d.record_date || state.scheduleDate,'date',`required ${partnerEdit ? 'readonly' : ''}`)}${field('开始时间','start_time',r?.start_time?.slice(0,5) || d.explicit_start_time || '','time')}${field('结束时间','end_time',r?.end_time?.slice(0,5) || d.explicit_end_time || '','time')}${select('运动意愿','exercise_intent',r?.exercise_intent || d.exercise_intent || 'unknown',[['unknown','未确定'],['yes','愿意运动'],['no','不安排运动']])}${textArea('当天原文或备注','raw_text',r?.raw_text || d.raw_text || '')}${textArea('固定安排','fixed_arrangements',r?.fixed_arrangements || d.fixed_arrangements || '')}${textArea('用餐条件','meal_conditions',r?.meal_conditions || d.meal_conditions || '')}${textArea('限制、注意事项','constraints',r?.constraints || d.constraints || '')}${d.raw_text ? `<div class="field full"><b>解析草稿的结构化确认</b><p class="hint">以下内容来自草稿，仍需你逐项检查；未确认前不进入计划。</p>${draft?.ambiguous_fields?.length ? `<p class="callout">仍有疑点：${draft.ambiguous_fields.map(safe).join('；')}。请核对后填写明确值。</p>` : ''}</div>${field('运动类型','exercise_type',d.exercise_type || '')}${field('运动时长分钟','duration_minutes',d.duration_minutes ?? '','number','min="0" max="1440"')}${field('地点','location',d.location || '')}${field('器械','equipment',d.equipment || '')}${field('饮食安排','meal',d.meal || '')}${field('疲劳情况','fatigue',d.fatigue || '')}${field('疼痛情况','pain',d.pain || '')}${field('睡眠情况','sleep',d.sleep || '')}` : ''}<div class="field full">${check('允许伴侣查看这条日程','is_shared',r?.is_shared || false,'同时需要在设置中打开“共享日程”；新记录默认私有。')}</div></div><div class="actions"><button class="btn" ${state.busy ? 'disabled' : ''}>${r ? '保存修改' : '保存日程'}</button></div></form></div>`
}
function schedulePage() {
  const rows = state.data.schedules.filter(r => r.record_date === state.scheduleDate && visibleByScope(r))
  return `<div class="card soft"><p class="eyebrow">手动记录</p><h2>日程</h2><p class="hint">一个人每天一条。伴侣可见范围由两级共享设置决定；“共同”只是查看视图。已加载全部可见记录。</p><div class="actions">${scopeSwitch()}${button('刷新数据','refresh','secondary')}</div><div class="actions"><label class="field"><span>查看日期</span><input id="schedule-date" type="date" value="${safe(state.scheduleDate)}"></label></div></div><div class="card"><div class="card-header"><h2>${safe(state.scheduleDate)} 的记录</h2></div>${scheduleList(rows)}</div>${scheduleForm()}`
}
function weightList(rows) {
  if (!rows.length) return `<div class="empty"><strong>还没有体重记录</strong>补录时请选择实际测量日期。</div>`
  return `<div class="list">${rows.sort((a,b) => b.record_date.localeCompare(a.record_date)).map(r => `<article class="list-item"><div class="row-between"><strong>${safe(r.weight_kg)} kg <span class="fine">${safe(person(r.user_id))} · ${safe(r.record_date)}${r.measured_at ? ` ${safe(instantToLocalDateTime(r.measured_at).slice(11))}（上海）` : ''}</span></strong><span class="tag ${r.is_shared ? 'shared' : 'private'}">${r.is_shared ? '共享' : '私有'}</span></div>${r.waist_cm != null ? `<p>腰围 ${safe(r.waist_cm)} cm</p>` : ''}${r.notes ? `<p>${safe(r.notes)}</p>` : ''}<div class="row-between" style="margin-top:10px">${updateMeta(r)}${canEdit(r,'weight') ? `<div class="item-actions">${button('编辑','edit-weight','ghost small',`data-id="${safe(r.id)}"`)}${button('删除','delete-weight','danger secondary small',`data-id="${safe(r.id)}"`)}</div>` : ''}</div></article>`).join('')}</div>`
}
function trend(rows) {
  const points = [...rows].sort((a,b) => a.record_date.localeCompare(b.record_date)).filter(r => Number.isFinite(Number(r.weight_kg))).slice(-12)
  if (!points.length) return '<div class="empty">有真实测量记录后，这里显示趋势。</div>'
  const values = points.map(p => Number(p.weight_kg)), min = Math.min(...values), max = Math.max(...values), range = max - min || 1
  const xy = points.map((p,i) => [20 + i * (300 / Math.max(1,points.length - 1)), 112 - (Number(p.weight_kg) - min) / range * 88])
  return `<svg class="trend" viewBox="0 0 340 142" role="img" aria-label="${points.length}条真实体重记录的趋势"><line x1="20" y1="112" x2="320" y2="112"/>${points.length > 1 ? `<polyline points="${xy.map(([x,y]) => `${x},${y}`).join(' ')}"/>` : ''}${xy.map(([x,y]) => `<circle cx="${x}" cy="${y}" r="4"/>`).join('')}</svg><p class="fine">${safe(points[0].record_date)} 至 ${safe(points.at(-1).record_date)} · ${points.length} 条实际记录；没有补齐缺失日期。</p>`
}
function weightForm() {
  const r = state.edit?.type === 'weight' ? state.edit.row : null
  const partnerEdit = r && r.user_id !== state.data.user.id
  return `<div class="card"><div class="card-header"><div><h2>${r ? '编辑测量' : '记录体重'}</h2><span class="hint">每天一条，可补录过去的实际测量。</span></div>${r ? button('取消编辑','cancel-edit','ghost') : ''}</div><form data-form="weight"><div class="form-grid">${field('测量日期','record_date',r?.record_date || date(),'date',`required ${partnerEdit ? 'readonly' : ''} max="${safe(date())}"`)}${field('测量时间（可选）','measured_at',r?.measured_at ? instantToLocalDateTime(r.measured_at) : '','datetime-local')}${field('体重（kg）','weight_kg',r?.weight_kg ?? '','number','required min="20" max="500" step="0.1"')}${field('腰围（cm，可选）','waist_cm',r?.waist_cm ?? '','number','min="20" max="300" step="0.1"')}${textArea('备注','notes',r?.notes || '')}<div class="field full">${check('允许伴侣查看这条体重','is_shared',r?.is_shared || false,'同时需要在设置中打开“共享体重”；新记录默认私有。')}</div></div><div class="actions"><button class="btn" ${state.busy ? 'disabled' : ''}>${r ? '保存修改' : '保存体重'}</button></div></form></div>`
}
function weightPage() {
  const rows = state.data.weights.filter(visibleByScope)
  const groups = state.scope === 'all' ? [['我',state.data.user.id],...(partner() ? [[partner().display_name,partner().user_id]] : [])] : [[state.scope === 'mine' ? '我' : partner()?.display_name || '伴侣', state.scope === 'mine' ? state.data.user.id : partner()?.user_id]]
  const charts = groups.map(([name,id]) => { const own = rows.filter(r => r.user_id === id), avg = sevenDayAverage(own,date()); return `<div class="card"><div class="row-between"><div><h2>${safe(name)} · 近 7 日平均</h2><strong style="font-size:1.55rem">${avg.count ? `${safe(avg.average.toFixed(1))} kg` : '暂无数据'}</strong></div><span class="pill">${avg.count} 条真实记录</span></div>${trend(own)}</div>` }).join('')
  return `<div class="card soft"><p class="eyebrow">真实测量</p><h2>体重记录</h2><p class="hint">趋势只连接已有数据；近 7 日平均按真实记录计算，并标出样本数。已加载全部可见记录。</p><div class="actions">${scopeSwitch()}${button('刷新数据','refresh','secondary')}</div></div>${charts}${weightForm()}<div class="card"><h2>历史记录</h2>${weightList(rows)}</div>`
}
function planSource(source) { return ({ manual:'本人手动', rules:'规则生成', ai:'AI 生成' })[source] || '未知来源' }
function planCard(plan) {
  const content = plan.content || {}
  const training = content.training || {}
  const own = plan.user_id === state.data.user.id
  return `<article class="card"><div class="row-between"><div><p class="eyebrow">${safe(plan.target_date)} · 版本 ${safe(plan.version)}</p><h2>${safe(content.summary || '尚无摘要')}</h2></div><span class="tag ${plan.is_shared ? 'shared' : 'private'}">${plan.is_shared ? '共享' : '私有'}</span></div><div class="meta"><span>${safe(planSource(plan.source))}</span><span>${safe(plan.status === 'published' ? '已发布' : '草稿')}</span><span>${plan.is_stale ? '输入已变化，请重新核对' : '输入版本仍匹配'}</span><span>${plan.is_locked ? '已锁定' : '未锁定'}</span></div><p class="hint">生成输入版本：${safe(plan.input_version || '未提供')} · ${plan.generated_at ? `生成于 ${safe(instantToLocalDateTime(plan.generated_at).replace('T',' '))}（上海）` : '手动确认'}。${training.mode === 'workout' ? `训练 ${safe(training.items?.length || 0)} 个动作` : '当天休息或未安排训练'}，餐食 ${safe(content.meals?.length || 0)} 项。</p>${content.warnings?.length ? `<p class="callout">${content.warnings.map(safe).join('；')}</p>` : ''}${own ? `<div class="actions">${button(plan.is_locked ? '解锁计划' : '锁定计划','plan-lock','secondary',`data-id="${safe(plan.id)}"`)}</div>` : ''}${updateMeta(plan)}</article>`
}
function mealPlanRow(meal = {}, fixed = false, label = '') {
  const food = meal.foods?.[0] || {}
  const required = fixed ? '' : 'required'
  return `<div class="repeat-row" data-plan-meal ${fixed ? 'data-rule-meal' : ''}>${label ? `<h3>${safe(label)}</h3>` : ''}<div class="form-grid">${field('用餐时间','meal_time',meal.time || '','time')}${field('这餐名称','meal_title',meal.title || '','text',required)}${field('食物','food_name',food.name || '','text',required)}${field('份量','food_portion',food.portion ?? '','text',required)}${field('单位','food_unit',food.unit || '','text',required)}${textArea('备餐方法','prep_method',meal.prep_method || '')}${textArea('购买或备餐','purchase_or_prep',meal.purchase_or_prep || '')}${textArea('替代选择','alternative',meal.alternative || '')}${textArea('备注','meal_notes',meal.notes || '')}${textArea('加餐原因（如适用）','snack_reason',meal.snack_reason || '')}</div><div data-food-extra>${(meal.foods || []).slice(1).map(foodPlanRow).join('')}</div><div class="actions">${button('再加一种食物','add-plan-food','secondary small')}${fixed ? '' : button('移除这餐','remove-row','ghost small')}</div></div>`
}
function foodPlanRow(food = {}) { return `<div class="form-grid repeat-row" data-plan-food>${field('食物','food_name',food.name || '','text','required')}${field('份量','food_portion',food.portion ?? '','text','required')}${field('单位','food_unit',food.unit || '','text','required')}${button('移除食物','remove-row','ghost small')}</div>` }
function stepRow(step = {}, part = 'warmup') { return `<div class="form-grid repeat-row" data-step="${part}">${field('步骤说明','description',step.description || '','text','required')}${field('秒数','seconds',step.seconds ?? '','number','required min="0" max="3600" step="1"')}${button('移除步骤','remove-row','ghost small')}</div>` }
function trainingItemRow(item = {}) { return `<div class="repeat-row form-grid" data-plan-item>${select('动作','exercise_id',item.exercise_id || '',[['','请选择'],...exercises.map(exercise => [exercise.id,exercise.name])])}${field('组数','sets',item.sets ?? 1,'number','required min="1" max="2" step="1"')}${field('每组次数','reps',item.reps ?? 8,'number','required min="1" max="100" step="1"')}${field('每组动作秒数','work_seconds',item.work_seconds ?? 40,'number','required min="1" max="120" step="1"')}${field('组间休息秒数','rest_seconds',item.rest_seconds ?? 60,'number','required min="0" max="3600" step="1"')}${field('换器械秒数','transition_seconds',item.transition_seconds ?? 0,'number','required min="0" max="3600" step="1"')}${field('首次使用检查','first_use_check',item.first_use_check || '')}${field('时间紧时的简化选择','short_option',item.short_option || '')}${button('移除动作','remove-row','ghost small')}</div>` }
function planEditor(day, plan) {
  const c = plan?.content || {}, t = c.training || {}
  return `<div class="card"><div class="card-header"><div><h2>手动确认 ${safe(day)} 的计划</h2><p class="hint">只保存你亲自核对的内容；旧版本保留，未完成的训练不会被当作已完成。</p></div></div>${plan?.is_locked ? '<p class="callout">当前版本已锁定。先解锁再修改。</p>' : `<form data-form="plan"><div class="form-grid">${textArea('当天安排摘要','summary',c.summary || '','required')}${select('训练安排','training_mode',t.mode || 'rest',[['rest','休息／不安排训练'],['workout','训练']])}${field('训练目的','purpose',t.purpose || '')}${field('训练时间','training_time',t.time || '','time')}${field('强度说明','intensity',t.intensity || '')}${field('器械说明','equipment',t.equipment || '')}${field('主要肌群（逗号分隔）','muscles',(t.muscles || []).join('，'))}${textArea('其他注意事项（每行一项）','warnings',(c.warnings || []).join('\n'))}</div><h3>热身步骤</h3><div data-plan-steps="warmup">${(t.warmup || []).map(step => stepRow(step,'warmup')).join('')}</div>${button('添加热身步骤','add-warmup','secondary small')}<h3>正式动作</h3><div data-plan-items>${(t.items || []).map(trainingItemRow).join('')}</div>${button('添加动作','add-plan-item','secondary small')}<h3>放松步骤</h3><div data-plan-steps="cooldown">${(t.cooldown || []).map(step => stepRow(step,'cooldown')).join('')}</div>${button('添加放松步骤','add-cooldown','secondary small')}<h3>餐食安排</h3><div data-plan-meals>${(c.meals || []).map(mealPlanRow).join('')}</div>${button('添加一餐','add-plan-meal','secondary small')}<div class="actions">${check('允许伴侣查看此计划','is_shared',plan?.is_shared || false)}<button class="btn">保存手动计划新版本</button></div></form>`}</div>`
}
function generationPanel(day, job) {
  const r=currentRules()?.rules
  const ready=Boolean(r?.confirmed && r?.meal_template?.length===3)
  const selected=state.data.providerAiAvailable ? select('本次生成方式','ai_provider','',[['','请明确选择'],['rules','确定性规则（不发送给 AI）'],['openai','OpenAI']]) : '<p class="hint">新版生成服务尚未部署，请继续手动计划。</p>'
  return `<div class="card"><h3>生成明日安排</h3><p class="hint">点击后会登记任务并请求所选服务；只有任务显示成功且出现真实计划时才算完成。DeepSeek 本轮仅供合成验证，不处理个人健康资料。</p>${selected}${ready && state.data.providerAiAvailable ? button('请求生成明日计划','request-plan','secondary',`data-day="${safe(day)}"`) : '<p class="hint">请先确认本人规则与三餐模板，并等待新版服务部署。</p>'}${job && ['failed','exhausted'].includes(job.status) && state.data.providerAiAvailable ? button('重试这次生成','retry-job','secondary',`data-id="${safe(job.id)}"`) : ''}</div>`
}
function parseSchedulePanel() {
  if (!state.data.providerAiAvailable) return '<div class="card warn"><h2>原文整理</h2><p class="hint">新版逐用途授权尚未部署；请在下方手动填写日程。</p></div>'
  return `<div class="card"><h2>原文整理</h2><p class="hint">先明确选择服务；只有点击解析且本人已授权此用途、服务与预算可用时，才发送当次原文。DeepSeek 本轮不处理个人健康资料。</p><form data-form="parse-schedule">${select('本次服务','ai_provider','',[['','请明确选择'],['openai','OpenAI']])}${textArea('明日原文','raw_text','')}<div class="actions"><button class="btn secondary">解析为可编辑草稿</button></div></form>${state.parsedSchedule ? '<p class="notice">解析内容已填入日程表单。请逐项核对后手动保存。</p>' : ''}</div>`
}
function tomorrowPage() {
  const day = addDays(date(),1)
  const plan = state.data.healthAvailable ? currentPlan(day) : null
  const history = state.data.healthAvailable ? ownRows('daily_plans').filter(row => row.target_date === day).sort((a,b) => b.version-a.version) : []
  const job = state.data.healthAvailable ? ownRows('generation_jobs').find(row => row.target_date === day) : null
  return `<div class="card soft"><p class="eyebrow">明日安排 · ${safe(day)}</p><h2>先确认真实日程，再决定明天怎么过</h2><p class="hint">日程、个人规则和档案变化会标记旧计划待更新。系统不会替你补写未知安排。</p></div>${state.data.healthAvailable ? `${parseSchedulePanel()}${plan ? planCard(plan) : '<div class="card empty"><strong>明天还没有计划</strong>可手动创建；自动生成尚未配置时不会出现假结果。</div>'}${job ? `<div class="card"><h3>生成任务</h3><p>${safe(job.status)} · 目标日 ${safe(job.target_date)} · 尝试 ${safe(job.attempts)}/${safe(job.max_attempts)}</p>${job.error_code ? `<p class="hint">错误代码：${safe(job.error_code)}</p>` : ''}</div>` : ''}${generationPanel(day,job)}${planEditor(day,plan)}${history.length>1 ? `<div class="card"><h2>历史版本</h2>${history.slice(1).map(planCard).join('')}</div>` : ''}` : healthStatus()}${schedulePage()}`
}
function exerciseCard(exercise) {
  const demo = exercise.demo || {}
  const verified = demo.verificationStatus === 'verified' && /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]+$/.test(demo.embed || '')
  return `<article class="list-item exercise-card"><div class="exercise-head">${muscleIllustration(exercise.muscles)}<div><h3>${safe(exercise.name)}</h3><p class="fine">${safe(exercise.equipment)}</p><p class="fine">肌群：${safe((exercise.muscles || []).join('、'))}</p><span class="tag">${verified ? '示范已核验' : '文字指导'}</span></div></div><details class="exercise-steps"><summary>查看动作说明与注意事项</summary><p><b>开始：</b>${safe(exercise.start)}</p><p><b>动作：</b>${safe(exercise.movement)}</p><p><b>要点：</b>${safe((exercise.cues || []).join('；'))}</p><p><b>常见错误：</b>${safe((exercise.errors || []).join('；'))}</p><p><b>停止信号：</b>${safe((exercise.stopSignals || []).join('；'))}</p>${exercise.firstUseReminder ? `<p><b>首次使用：</b>${safe(exercise.firstUseReminder)}</p>` : ''}<p>${safe(exercise.textFallback || '')}</p></details>${verified ? `<div class="demo-slot" data-demo-slot="${safe(exercise.id)}">${button('加载示范','demo-load','secondary small',`data-id="${safe(exercise.id)}"`)}</div><p class="fine">点击后才会连接 ${safe(demo.provider)} 的播放器，再点“播放”。</p>` : `<p class="hint">视频尚未完成准确性和授权核验，暂不提供播放。${demo.source ? `<a href="${safe(demo.source)}" target="_blank" rel="noopener noreferrer">查看原始来源</a>` : ''}</p>`}</article>`
}
function muscleIllustration(muscles = []) {
  const names=muscles.join('')
  const active={legs:/股|腘|腿/.test(names),hips:/臀|髋/.test(names),back:/背|菱/.test(names),chest:/胸|三角/.test(names),arms:/肱/.test(names),core:/腹/.test(names)}
  const color=key=>active[key]?'#9073ca':'#ded9eb'
  return `<svg class="muscle-art" viewBox="0 0 72 100" role="img" aria-label="肌群位置示意，非动作演示"><circle cx="36" cy="14" r="8" fill="#ded9eb"/><path d="M28 27H44L48 55H24Z" fill="${color('back')}"/><ellipse cx="36" cy="41" rx="10" ry="11" fill="${color('chest')}"/><ellipse cx="36" cy="52" rx="7" ry="7" fill="${color('core')}"/><ellipse cx="17" cy="42" rx="5" ry="18" fill="${color('arms')}"/><ellipse cx="55" cy="42" rx="5" ry="18" fill="${color('arms')}"/><ellipse cx="30" cy="65" rx="8" ry="7" fill="${color('hips')}"/><ellipse cx="42" cy="65" rx="8" ry="7" fill="${color('hips')}"/><path d="M24 71h12l-4 25h-9ZM36 71h12l1 25h-9Z" fill="${color('legs')}"/></svg>`
}
function elapsedSeconds(session) {
  const data = session.data || {}
  return Math.max(0, Math.floor(Number(data.elapsed_seconds || 0) + (data.status === 'active' && data.active_since ? Math.max(0, Date.now() - Date.parse(data.active_since)) / 1000 : 0)))
}
function liveTrainingSession() { return ownRows('training_sessions').filter(row => ['active','paused'].includes(row.data?.status)).sort((a,b) => b.created_at.localeCompare(a.created_at))[0] || null }
function trainingSessionCard(session) {
  const d = session.data || {}, plan = (state.data.daily_plans || []).find(row => row.id === d.plan_id)
  const items = plan?.content?.training?.items || []
  const rest = d.rest_until ? Math.max(0, Math.ceil((Date.parse(d.rest_until) - Date.now()) / 1000)) : 0
  return `<div class="card training-session"><div class="row-between"><div><p class="eyebrow">本次训练 · ${safe(d.status === 'paused' ? '已暂停' : '进行中')}</p><h2 id="training-elapsed" data-started="${safe(d.active_since || '')}" data-base="${safe(d.elapsed_seconds || 0)}">已进行 ${safe(elapsedSeconds(session))} 秒</h2></div><span class="pill" id="training-rest" data-until="${safe(d.rest_until || '')}" data-remaining="${safe(d.rest_remaining_seconds || 0)}">${rest ? `休息还剩 ${rest} 秒` : d.rest_remaining_seconds ? `休息暂停，剩余 ${safe(d.rest_remaining_seconds)} 秒` : '无休息倒计时'}</span></div><p class="hint">已记录 ${safe(d.sets?.length || 0)} 组实际完成或跳过的动作。刷新后仍从已保存的计时状态继续。</p><div class="actions">${d.status === 'active' ? button('暂停训练','training-pause','secondary') : button('继续训练','training-resume','secondary')}${button('完成训练','training-finish','secondary')}${button('因不适停止','training-stop','danger secondary')}</div>${field('不适时停止原因','stop_reason','')}${d.status === 'active' ? `<form data-form="training-set" class="stack"><div class="form-grid">${select('动作','exercise_id','', [['','请选择动作'],...items.map(item => [item.exercise_id,exerciseById.get(item.exercise_id)?.name || item.exercise_id])])}${field('组序号','set_index',(d.sets?.length || 0)+1,'number','required min="1" max="100" step="1"')}${field('实际次数','reps','','number','required min="0" max="1000" step="1"')}${field('实际重量 kg（可空）','load_kg','','number','min="0" max="1000" step="0.1"')}${field('主观用力 RPE（可空）','rpe','','number','min="0" max="10" step="0.5"')}${textArea('疼痛或不适（可空）','pain_note','')}${check('跳过这一组','skipped',false)}</div><div class="actions"><button class="btn">保存这一组</button></div></form>` : ''}<div class="list">${(d.sets || []).map(set => `<div class="list-item">${safe(exerciseById.get(set.exercise_id)?.name || set.exercise_id)} · 第 ${safe(set.set_index)} 组 · ${set.skipped ? '跳过' : `${safe(set.reps)} 次${set.load_kg != null ? ` · ${safe(set.load_kg)} kg` : ''}`}${set.pain_note ? `<p>${safe(set.pain_note)}</p>` : ''}</div>`).join('')}</div>${updateMeta(session)}${trainingPlanDetails(plan?.content?.training)}</div>`
}
function trainingPlanDetails(training) {
  if (!training || training.mode !== 'workout') return ''
  const steps=(title,rows)=>`<section class="training-phase"><h3>${title}</h3>${rows.length ? `<ol>${rows.map(step=>`<li>${safe(step.description)} · ${safe(step.seconds)} 秒</li>`).join('')}</ol>` : '<p class="hint">未填写步骤。</p>'}</section>`
  return `<div class="training-plan"><div class="training-overview">${muscleIllustration(training.muscles)}<div><p class="hint">${safe(training.purpose || '训练目的未填写')} · ${safe(training.time || '时间未定')} · ${safe(training.intensity || '强度未定')}</p><p class="fine">${safe(training.equipment || '器械未定')} · 主要肌群：${safe(training.muscles?.join('、') || '未填写')} · 预计 ${safe(training.total_seconds || 0)} 秒</p><p class="fine">肌群位置示意，不是动作演示。</p></div></div>${steps('热身',training.warmup || [])}<section class="training-phase"><h3>正式训练</h3>${(training.items || []).map(item=>`<div class="list-item"><strong>${safe(exerciseById.get(item.exercise_id)?.name || item.exercise_id)}</strong><p>${safe(item.sets)} 组 × ${safe(item.reps)} 次；每组动作 ${safe(item.work_seconds)} 秒，组间休息 ${safe(item.rest_seconds)} 秒，换器械 ${safe(item.transition_seconds)} 秒。</p>${item.first_use_check ? `<p class="fine">首次检查：${safe(item.first_use_check)}</p>` : ''}${item.short_option ? `<p class="fine">时间不足时：${safe(item.short_option)}</p>` : ''}</div>`).join('') || '<p class="hint">尚未填写动作。</p>'}</section>${steps('放松',training.cooldown || [])}</div>`
}
function trainingPage() {
  if (!state.data.healthAvailable) return healthStatus()
  const plan = currentPlan(date()), training = plan?.content?.training, session = liveTrainingSession()
  const completed = ownRows('training_sessions').filter(row => ['completed','stopped'].includes(row.data?.status)).sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0,8)
  const selected = [...new Set((training?.items || []).map(item => item.exercise_id))].map(id => exerciseById.get(id)).filter(Boolean)
  return `<div class="card soft"><p class="eyebrow">按真实完成记录</p><h2>训练</h2><p class="hint">计划不是完成记录。每组次数、重量、不适和休息都由本人保存；不确定的动作先看文字步骤，出现停止信号及时停下。</p><div class="actions">${button('刷新数据','refresh','secondary')}</div></div>${session ? trainingSessionCard(session) : `<div class="card"><h2>今天的训练安排</h2>${plan ? `<p>${safe(plan.content?.summary || '')}</p><p class="hint">${plan.is_stale ? '输入已变化，请先核对计划。' : ''}${training?.mode === 'workout' ? `${safe(training.items?.length || 0)} 个动作 · 计划总时长 ${safe(training.total_seconds || 0)} 秒` : '今天安排休息。'}</p>${trainingPlanDetails(training)}${training?.mode === 'workout' && !plan.is_stale ? button('开始本次训练','training-start') : ''}` : '<p class="hint">今天没有已确认计划。可到“明日安排”手动编排后再开始。</p>'}</div>`}${selected.length ? `<div class="card"><h2>动作说明</h2><div class="exercise-grid">${selected.map(exerciseCard).join('')}</div></div>` : `<div class="card"><h2>动作库</h2><p class="hint">下面是可选动作的文字说明，不代表今天需要全部完成。</p><div class="exercise-grid">${exercises.map(exerciseCard).join('')}</div></div>`}<div class="card"><h2>已保存的训练</h2>${completed.length ? `<div class="list">${completed.map(row => `<article class="list-item"><strong>${safe(shanghaiDate(row.data.started_at))} · ${safe(row.data.status === 'completed' ? '已完成' : '因不适停止')}</strong><p class="hint">${safe(row.data.sets?.length || 0)} 组实际记录 · ${safe(row.data.elapsed_seconds || 0)} 秒</p>${updateMeta(row)}</article>`).join('')}</div>` : '<p class="empty">还没有真实完成记录。</p>'}</div>`
}
function mealItemRow(item = {}) { return `<div class="form-grid repeat-row" data-meal-item>${field('食物名称','name',item.name || '','text','required')}${field('份量','portion',item.portion ?? '','text','required')}${field('单位','unit',item.unit || '','text','required')}${button('移除食物','remove-row','ghost small')}</div>` }
function estimateDraftNotice() {
  const draft=state.mealEstimateDraft
  if (!draft) return ''
  return `<div class="callout"><strong>AI 识别草稿，尚未保存</strong><p>识别状态：${safe(draft.recognition_status || '未知')}；请核对下方每种食物、份量、烹调和估算区间，确认后才会写入。</p>${draft.items.map(item=>`<p class="fine">${safe(item.name || '未识别')} · ${safe(item.portion || '份量未知')} ${safe(item.unit || '')} · 可信程度 ${safe(({high:'高',medium:'中',low:'低'})[item.confidence] || '未提供')}</p>`).join('')}</div>`
}
function mealForm() {
  const row = state.mealEdit, d = row?.data || {}
  const partnerEdit = row && row.user_id !== state.data.user.id
  const sharedMeals = (state.data.meals || []).filter(item => item.user_id !== state.data.user.id && item.status === 'confirmed')
  return `<div class="card"><div class="card-header"><div><h2>${row ? '修正这餐' : '记录一餐'}</h2><p class="hint">草稿不计入摄入；确认后更正仍修改同一条记录。新记录默认私有。</p></div>${row ? button('取消编辑','cancel-meal','ghost') : ''}</div>${estimateDraftNotice()}<form data-form="meal"><div class="form-grid">${field('实际用餐时间','recorded_at',d.recorded_at ? instantToLocalDateTime(d.recorded_at) : instantToLocalDateTime(new Date().toISOString()),'datetime-local',`required ${partnerEdit ? 'readonly' : ''}`)}${select('餐别','kind',d.kind || 'other',[['breakfast','早餐'],['lunch','午餐'],['dinner','晚餐'],['snack','加餐'],['other','其他']])}${field('实际吃掉比例（0–1）','eaten_fraction',d.eaten_fraction ?? 1,'number','required min="0" max="1" step="0.05"')}${partnerEdit ? '' : select('与伴侣同一餐（可空）','shared_meal_id',d.shared_meal_id || '',[['','不关联'],...sharedMeals.map(item => [item.id,`${shanghaiDate(item.data.recorded_at)} · ${item.data.kind}`])])}${textArea('烹调方式','cooking',d.cooking || '')}${textArea('油和酱汁','oil',d.oil || '')}${textArea('剩余食物','leftover',d.leftover || '')}${d.estimate ? `${field('估算最低 kcal','energy_min_kcal',d.estimate.energy_min_kcal ?? '','number','min="0" max="10000"')}${field('估算最高 kcal','energy_max_kcal',d.estimate.energy_max_kcal ?? '','number','min="0" max="10000"')}${textArea('估算不确定性','uncertainty',d.estimate.uncertainty || '')}${textArea('估算假设（每行一项）','assumptions',(d.estimate.assumptions || []).join('\n'))}` : ''}</div><h3>实际食物</h3><div data-meal-items>${(d.items?.length ? d.items : [{}]).map(mealItemRow).join('')}</div>${button('添加食物','add-meal-item','secondary small')}<div class="actions">${partnerEdit ? '<span class="hint">代改不能改变共享或确认状态。</span>' : `${check('允许伴侣查看这一餐','is_shared',row?.is_shared || false)}${select('保存状态','status',row?.status || 'draft',[['draft','先存草稿'],['confirmed','确认实际摄入']])}`}<button class="btn">${row ? '保存这餐修改' : '保存餐食'}</button></div></form></div>`
}
function estimateNotice(estimate) {
  const range=estimate.energy_min_kcal == null || estimate.energy_max_kcal == null
    ? '尚无法可靠估算能量'
    : `估算区间 ${safe(estimate.energy_min_kcal)}–${safe(estimate.energy_max_kcal)} kcal`
  return `<p class="callout">${range}；${safe(estimate.uncertainty || '存在不确定性')}。${safe((estimate.assumptions || []).join('；'))}</p>`
}
function mealCard(row) {
  const d = row.data || {}, own = row.user_id === state.data.user.id
  const photos = (state.data.photo_assets || []).filter(photo => photo.meal_id === row.id)
  const estimate = d.estimate
  return `<article class="list-item"><div class="row-between"><div><strong>${safe(shanghaiDate(d.recorded_at))} · ${safe(({breakfast:'早餐',lunch:'午餐',dinner:'晚餐',snack:'加餐',other:'其他'})[d.kind] || '餐食')}</strong><p class="fine">${safe(person(row.user_id))} · ${safe(row.status === 'confirmed' ? '已确认实际摄入' : '草稿未计入')}</p></div><span class="tag ${row.is_shared ? 'shared' : 'private'}">${row.is_shared ? '共享' : '私有'}</span></div><p>${(d.items || []).map(item => `${safe(item.name)} ${safe(item.portion)} ${safe(item.unit)}`).join('、') || '尚未填写食物'}</p><p class="hint">实际吃掉 ${safe(Math.round(Number(d.eaten_fraction || 0)*100))}%${d.cooking ? ` · ${safe(d.cooking)}` : ''}${d.oil ? ` · 油/酱汁：${safe(d.oil)}` : ''}${d.leftover ? ` · 剩余：${safe(d.leftover)}` : ''}</p>${estimate ? estimateNotice(estimate) : ''}${photos.length ? `<div class="actions">${photos.map(photo => button('查看私人照片','view-photo','secondary small',`data-id="${safe(photo.id)}"`)).join('')}</div>` : ''}${own && state.data.providerAiAvailable ? `<div class="actions">${select('本次估算服务','ai_provider','',[['','请明确选择'],['openai','OpenAI']])}${button(photos.length ? '请求图片估算草稿' : '请求文字估算草稿','estimate-meal','secondary small',`data-id="${safe(row.id)}"`)}</div>` : ''}<div class="actions">${own ? `${button('编辑','edit-meal','ghost small',`data-id="${safe(row.id)}"`)}${button('删除','delete-meal','danger secondary small',`data-id="${safe(row.id)}"`)}` : canEdit(row,'meal') ? button('代改正文','edit-meal','ghost small',`data-id="${safe(row.id)}"`) : ''}</div>${updateMeta(row)}</article>`
}
function mealPrepCard() {
  const rules=currentRules()?.rules
  const lunch=rules?.confirmed && rules.meal_template?.length===3 ? rules.meal_template[1] : null
  if (!lunch) return '<div class="card"><h2>周日午餐备餐 · 5 份</h2><p class="hint">本人确认三餐模板后，才会从午餐列出五份采购草案；目前没有可用模板。</p></div>'
  const shopping=new Map()
  for (const food of lunch.foods || []) {
    const key=`${food.name}\u0000${food.portion}\u0000${food.unit}`
    shopping.set(key,(shopping.get(key)||0)+5)
  }
  return `<div class="card"><p class="eyebrow">根据本人确认的午餐模板</p><h2>周日备好 5 份午餐</h2><p class="hint">${safe(lunch.title)}；采购草案没有扣减家中库存，购买前请本人核对。备餐尚未被记录为完成。</p><h3>合并采购清单</h3><ul class="prep-list">${[...shopping].map(([key,count])=>{const [name,portion,unit]=key.split('\u0000');return `<li>${safe(name)}：${safe(count)} × ${safe(portion)} ${safe(unit)}</li>`}).join('')}</ul><p class="hint">周一、周二份及时冷藏；周三至周五份在备好后及时冷冻。分浅盒尽快冷却，2 小时内放入冰箱或冷冻；冷藏不高于 4°C，冷冻不高于 −18°C。运输保持低温，复热均匀且彻底。按食材和包装要求进一步核对。</p><a href="https://www.fda.gov/media/101389/download?attachment=" target="_blank" rel="noopener noreferrer">FDA 食品储存指引</a></div>`
}
function dailyIntakeCard(rows, day) {
  const confirmed=rows.filter(row=>row.status==='confirmed' && shanghaiDate(row.data.recorded_at)===day)
  const known=confirmed.filter(row=>{const e=row.data.estimate;return e?.recognition_status!=='unrecognized' && typeof e?.energy_min_kcal==='number' && typeof e?.energy_max_kcal==='number' && e.energy_min_kcal<=e.energy_max_kcal})
  const total=known.reduce((sum,row)=>{const fraction=Number(row.data.eaten_fraction);return [sum[0]+row.data.estimate.energy_min_kcal*fraction,sum[1]+row.data.estimate.energy_max_kcal*fraction]},[0,0])
  return `<div class="card"><div class="row-between"><div><h2>当天已确认摄入估算</h2><p class="hint">只合计本人 ${safe(day)} 已确认且有完整估算区间的餐食，每条按实际吃掉比例计算一次。</p></div><label class="field"><span>查看日期</span><input id="meal-date" type="date" value="${safe(day)}"></label></div><strong class="intake-total">${known.length ? `${safe(Math.round(total[0]))}–${safe(Math.round(total[1]))} kcal` : '暂无可合计估算'}</strong><p class="fine">${known.length} 餐有可用估算；${confirmed.length-known.length} 餐缺少可靠估算，不按 0 计算。此区间不是完整摄入量或医疗建议。</p></div>`
}
function foodPage() {
  if (!state.data.healthAvailable) return healthStatus()
  const visible = (state.data.meals || []).filter(visibleByScope).sort((a,b) => b.data.recorded_at.localeCompare(a.data.recorded_at))
  const ownMeals = ownRows('meals').sort((a,b) => b.data.recorded_at.localeCompare(a.data.recorded_at))
  const confirmed = ownMeals.filter(row => row.status === 'confirmed')
  const photoConsent = providerConsent('openai','estimate_meal_photo')
  return `<div class="card soft"><p class="eyebrow">真实记录 · 不作评价</p><h2>饮食</h2><p class="hint">未记录不等于未吃。份量和吃掉比例由本人确认；照片默认私有。AI 估算在服务与明确授权都准备好之前不可用。</p><div class="actions">${scopeSwitch()}${button('刷新数据','refresh','secondary')}</div></div><div class="stat-grid"><div class="stat"><span>我的已确认餐食</span><b>${confirmed.length}</b><span>条真实记录</span></div><div class="stat"><span>草稿</span><b>${ownMeals.length-confirmed.length}</b><span>未计入摄入</span></div><div class="stat"><span>图片估算授权</span><b>${photoConsent?.enabled ? '已授权' : '未启用'}</b><span>服务状态另行核对</span></div></div>${dailyIntakeCard(ownMeals,state.mealDate)}${mealPrepCard()}${mealForm()}<div class="card"><h2>私人照片</h2><p class="hint">只选择本人照片；浏览器会重新绘制为 PNG 去除原文件元数据，服务器仍会再次检查。上传后也不会自动交给 AI。</p><form data-form="photo"><div class="form-grid">${select('关联本人餐食','meal_id','',[['','暂不关联'],...ownMeals.map(row => [row.id,`${shanghaiDate(row.data.recorded_at)} · ${row.data.kind}`])])}<label class="field"><span>选择图片</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required></label><div class="field full">${check('允许伴侣查看这张照片','is_shared',false,'还需要设置里的“共享照片”开关。')}</div></div><div class="actions"><button class="btn secondary">上传私有照片</button></div></form>${state.photoUrl ? `<div class="photo-preview"><img src="${safe(state.photoUrl)}" alt="按当前权限读取的私人照片">${button('关闭照片','close-photo','ghost small')}</div>` : ''}</div><div class="card"><h2>餐食记录</h2>${visible.length ? `<div class="list">${visible.map(mealCard).join('')}</div>` : '<p class="empty">还没有实际餐食记录。</p>'}</div>`
}
function trendsPage() {
  const rows = ownRows('weights'), days = new Set(rows.filter(row => row.record_date >= addDays(date(),-6) && row.record_date <= date()).map(row => row.record_date))
  const waist = [...rows].filter(row => row.waist_cm != null).sort((a,b) => b.record_date.localeCompare(a.record_date))[0]
  const completed = ownRows('training_sessions').filter(row => row.data?.status === 'completed')
  const realSets = completed.flatMap(row => row.data?.sets || []).filter(set => !set.skipped && set.completed_at)
  return `<div class="card soft"><p class="eyebrow">只看实际记录</p><h2>趋势</h2><p class="hint">过去 7 天体重有记录 ${days.size}/7 天；缺失保持空白。训练表现只统计已保存的完成组，计划次数不算完成。</p></div><div class="stat-grid"><div class="stat"><span>最近腰围</span><b>${waist ? `${safe(waist.waist_cm)} cm` : '—'}</b><span>${waist ? safe(waist.record_date) : '无记录'}</span></div><div class="stat"><span>已完成训练</span><b>${completed.length}</b><span>真实会话</span></div><div class="stat"><span>完成组数</span><b>${realSets.length}</b><span>含实际次数与重量</span></div></div>${weightPage()}${state.data.healthAvailable ? `<div class="card"><h2>最近完成的动作</h2>${realSets.length ? `<div class="list">${realSets.slice(-12).reverse().map(set => `<div class="list-item">${safe(exerciseById.get(set.exercise_id)?.name || set.exercise_id)} · ${safe(set.reps)} 次${set.load_kg != null ? ` · ${safe(set.load_kg)} kg` : ''}${set.rpe != null ? ` · RPE ${safe(set.rpe)}` : ''}</div>`).join('')}</div>` : '<p class="empty">暂无实际完成组。</p>'}</div>` : healthStatus()}`
}
function photoManager() {
  const photos = ownRows('photo_assets')
  return `<div class="card"><h3>我的私人照片</h3><p class="hint">共 ${photos.length} 张，只有按当前权限点开时才临时下载。</p>${photos.map(photo => `<div class="list-item"><span>${safe(shanghaiDate(photo.created_at))} · ${safe(photo.width)}×${safe(photo.height)}</span><div class="actions">${button('查看','view-photo','secondary small',`data-id="${safe(photo.id)}"`)}${button('删除','delete-photo','danger secondary small',`data-id="${safe(photo.id)}"`)}</div></div>`).join('')}</div>`
}
function settingsChecks(m) { return `<div class="stack">${check('共享个人档案','share_profile',m.share_profile)}${check('共享日程','share_schedule',m.share_schedule)}${check('共享体重','share_weight',m.share_weight)}${check('允许伴侣修改已共享记录','allow_partner_edit',m.allow_partner_edit,'需同时满足类别共享和该条记录共享。')}</div>` }
function healthSharingForm(m) { return `<div class="card"><h2>新记录的共享类别</h2><p class="hint">每一类和每一条都需本人分别开启。代改仍使用上面的独立许可。</p><form data-form="health-sharing" class="stack">${check('共享每日计划','share_plan',m.share_plan)}${check('共享训练记录','share_training',m.share_training)}${check('共享餐食','share_meal',m.share_meal)}${check('共享照片','share_photo',m.share_photo)}<div class="actions"><button class="btn">保存新类别共享</button></div></form></div>` }
function rulesForm() {
  const row = currentRules(), r = state.rulesDraft || row?.rules || {}
  const weekdays = ['周一','周二','周三','周四','周五','周六','周日']
  return `<div class="card"><h2>本人训练与饮食约束</h2><p class="hint">首次使用请从“未知”开始，只填写你本人确认的情况；规则未确认或关键项未知时，不生成有约束力的训练。变化后旧计划会标记待更新。</p><form data-form="rules"><div class="form-grid">${select('可用器械','equipment',r.equipment || 'unknown',[['unknown','未知'],['machines_only','仅固定器械'],['dorm','寝室器械'],['mixed','两种环境均可']])}${select('踝部状态','ankle_status',r.ankle_status || 'unknown',[['unknown','未知'],['recovery_unknown','旧伤恢复情况不明'],['limited','存在限制'],['cleared','本人已确认可正常训练'],['no_issue','本人无踝部问题']])}${field('希望运动分钟数','exercise_minutes',r.exercise_minutes ?? '','number','min="0" max="600"')}${field('单次最长分钟数','max_session_minutes',r.max_session_minutes ?? '','number','min="0" max="600"')}${field('每周最多去健身房次数','max_gym_visits',r.max_gym_visits ?? '','number','min="0" max="7"')}${field('每周力量训练上限','weekly_strength_limit',r.weekly_strength_limit ?? '','number','min="0" max="7"')}${textArea('习惯的饭量','meal_portions',r.meal_portions || '')}${textArea('备餐方式','prep_method',r.prep_method || '')}${textArea('其他饮食条件','meal_notes',r.meal_notes || '')}${textArea('运动限制与伤情','limitations',r.limitations || '')}${textArea('睡眠与恢复情况','sleep_condition',r.sleep_condition || '')}<fieldset class="field full"><legend>本人自由日（可多选）</legend><div class="weekday-grid">${weekdays.map((day,index) => check(day,`weekday_${index+1}`,(r.free_weekdays || []).includes(index+1))).join('')}</div></fieldset><div class="field full">${check('自由日不安排正式训练','free_day_training_forbidden',r.free_day_training_forbidden || false)}</div><div class="field full">${check('自由日不提供饮食菜单','free_day_meal_unrestricted',r.free_day_meal_unrestricted || false)}</div><div class="field full">${check('近 48 小时含外部训练已完整记录','training_history_complete',r.training_history_complete || false)}</div><div class="field full">${check('已逐项确认上述本人约束','confirmed',r.confirmed || false)}</div></div><details class="field full"><summary>本人三餐模板（可选；要生成完整次日饮食计划需确认三餐）</summary><p class="hint">只写你本人确认的三餐，不填写则只保存其他约束。</p>${['早餐','午餐','晚餐'].map((name,index)=>mealPlanRow(r.meal_template?.[index] || {},true,name)).join('')}</details><div class="actions"><button class="btn">保存本人规则</button></div></form>${row?.rules?.training_history_complete ? `<div class="callout"><p>近 48 小时训练史上次确认：${row.training_history_confirmed_at ? `${safe(instantToLocalDateTime(row.training_history_confirmed_at).replace('T',' '))}（上海）` : '尚未确认'}。超过 48 小时需再次确认，生成器会安排休息。</p>${button('重新确认近 48 小时训练史','confirm-training-history','secondary')}</div>` : ''}${row ? updateMeta(row) : ''}</div>`
}
function aiServiceStatus() {
  const s=state.aiStatus
  const openai=s?.providers?.openai
  return `<div class="callout"><div class="row-between"><strong>服务实际状态</strong>${state.data.providerAiAvailable ? button('检查 AI 服务状态','ai-status','secondary small') : ''}</div>${s ? `<p>OpenAI：${openai?.configured && openai?.budget_configured && s.global_budget_configured ? `服务端已配置 ${safe(openai.model || '模型')}；调用仍受逐用途授权和额度限制。` : '密钥或预算未就绪，无法发送健康资料。'}</p><p class="fine">下方费用是按用量估算，不是供应商账单。已选择的夜间计划方式：${safe(({rules:'确定性规则',openai:'OpenAI',deepseek:'DeepSeek（本轮禁用）'})[s.plan_provider] || '未知')}。</p>` : '<p class="fine">尚未从服务端核对；保存授权不会立即调用。</p>'}</div>`
}
function aiConsentPanel() {
  if (!state.data.providerAiAvailable) return '<div class="card warn"><h2>逐用途 AI 授权尚未部署</h2><p class="hint">现有手动功能可继续使用；不会把旧版的笼统授权自动转为新版授权。</p></div>'
  const purposes=[['parse_schedule','日程文字解析'],['generate_plan','AI 生成计划'],['estimate_meal_text','文字餐食估算'],['estimate_meal_photo','图片餐食估算']]
  return `<div class="card"><h2>AI 服务与逐用途授权</h2><p class="hint">四种用途分别确认，默认不新增授权。每次调用还需明确选择服务；照片上传和手动记录无需 AI。月上限以美元美分计，系统按用量估算费用，不等于供应商账单。</p><p class="hint">OpenAI 的 <a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noopener noreferrer">数据政策</a>；服务端请求不保存响应，但不能据此推断零保留。</p>${aiServiceStatus()}<div class="consent-grid">${purposes.map(([purpose,title])=>{const row=providerConsent('openai',purpose),usage=state.aiStatus?.providers?.openai?.usage?.[purpose];return `<form data-form="ai-consent" data-purpose="${purpose}" class="consent-card"><h3>OpenAI · ${title}</h3>${check('允许此次用途发送给 OpenAI','enabled',row?.enabled || false)}${field('每月上限（美元美分）','monthly_limit_cents',row?.monthly_limit_cents ?? 0,'number','required min="0" max="100000" step="1"')}<p class="fine">当前：${row?.enabled ? '已授权' : '未授权'}${usage ? ` · 本月估算已用 ${safe(usage.charged_cents)}、预留 ${safe(usage.reserved_cents)} 美分` : ''}</p><button class="btn secondary">保存此项授权</button></form>`}).join('')}</div><form data-form="plan-provider" class="stack"><h3>夜间计划方式</h3><p class="hint">默认使用确定性规则，不发送给 AI；选择 OpenAI 前需先检查服务并单独授权“AI 生成计划”。</p>${select('由本人选择','plan_provider',state.aiStatus?.plan_provider || 'rules',[['rules','确定性规则'],['openai','OpenAI']])}<button class="btn secondary">保存夜间计划方式</button></form><div class="callout"><h3>DeepSeek 候选</h3><p>本轮仅验证合成样例，尚未开放个人健康资料处理；需核实适用 API 条款并重新确认授权。不会自动切换到 DeepSeek。</p><p class="fine"><a href="https://cdn.deepseek.com/policies/zh-CN/deepseek-privacy-policy.html" target="_blank" rel="noopener noreferrer">DeepSeek 隐私政策</a> · <a href="https://api-docs.deepseek.com/guides/responses_api/" target="_blank" rel="noopener noreferrer">API 说明</a></p></div></div>`
}
function profileForm() {
  const p = state.profileDraft || state.data.profile || {}
  const expired = p.target_date && p.target_date < date()
  return `<div class="card"><div class="card-header"><div><h2>我的档案</h2><span class="hint">空白表示未知，只填写你愿意确认的真实资料。</span></div></div><label class="field"><span>导入本人档案与规则 JSON</span><input id="profile-import" type="file" accept="application/json,.json"><small class="hint">只选择你自己的文件。读取后先检查表单，点击保存才会写入当前账号；不会发给 AI。</small></label>${state.profileDraft ? `<div class="notice" role="status" style="margin-top:14px">已填入导入内容，请逐项确认后保存。</div>` : ''}${expired ? `<div class="notice error" role="status">目标日期已过，请重新确认目标和日期。</div>` : ''}<form data-form="profile" style="margin-top:18px"><div class="form-grid">${select('生理性别（可留空）','sex',p.sex || '',[['','未填写'],['female','女'],['male','男'],['other','其他']])}${field('年龄','age',p.age ?? '','number','min="1" max="120"')}${field('身高（cm）','height_cm',p.height_cm ?? '','number','min="50" max="250" step="0.1"')}${field('基线体重（kg）','baseline_weight_kg',p.baseline_weight_kg ?? '','number','min="20" max="500" step="0.1"')}${field('基线日期','baseline_date',p.baseline_date || '','date')}${field('目标体重（kg）','target_weight_kg',p.target_weight_kg ?? '','number','min="20" max="500" step="0.1"')}${field('目标日期','target_date',p.target_date || '','date')}${textArea('饮食与运动偏好','preferences',p.preferences || '')}${textArea('健康情况、伤情或其他注意事项','health_notes',p.health_notes || '')}<div class="field full">${check('允许伴侣查看这份档案','is_shared',p.is_shared || false,'同时需要开启下方“共享个人档案”。')}</div></div><div class="actions"><button class="btn" ${state.busy ? 'disabled' : ''}>保存档案</button></div></form></div>`
}
function sharedPartnerProfile() {
  const p = partnerProfile()
  if (!partner()) return ''
  if (!p) return `<div class="card"><h2>伴侣档案</h2><p class="hint">对方尚未共享档案，或尚未填写。</p></div>`
  const facts = [['生理性别',({female:'女',male:'男',other:'其他'})[p.sex], ''],['年龄',p.age,'岁'],['身高',p.height_cm,'cm'],['基线体重',p.baseline_weight_kg,'kg'],['基线日期',p.baseline_date,''],['目标体重',p.target_weight_kg,'kg'],['目标日期',p.target_date,'']].filter(([,v]) => v !== null && v !== undefined && v !== '')
  return `<div class="card"><h2>${safe(partner().display_name)}的共享档案</h2><div class="list">${facts.map(([k,v,u]) => `<div class="row-between"><span class="muted">${k}</span><strong>${safe(v)} ${u}</strong></div>`).join('')}${p.preferences ? `<p><b>偏好：</b>${safe(p.preferences)}</p>` : ''}${p.health_notes ? `<p><b>注意事项：</b>${safe(p.health_notes)}</p>` : ''}</div>${updateMeta(p)}</div>`
}
function dangerPanel() {
  if (!state.danger) return ''
  const leaving = state.danger === 'leave'
  return `<div class="card danger-zone"><h3>${leaving ? '确认退出空间' : '确认删除健康数据'}</h3><p class="hint">${leaving ? '退出会删除你在这个空间中的健康记录并撤销共享。建议先导出自己的数据。' : '这会删除你自己的档案、日程和体重记录，无法在应用中恢复。建议先导出。'}</p><form data-form="danger">${field('输入“确认”继续','confirmation','','text','required autocomplete="off"')}<div class="actions"><button class="btn danger" ${state.busy ? 'disabled' : ''}>${leaving ? '确认退出' : '确认删除'}</button>${button('取消','cancel-danger','secondary')}</div></form></div>`
}
function passwordForm() {
  return `<div class="card"><h2>修改密码</h2><p class="hint">先验证当前密码。保存成功后此设备将退出，请用新密码重新登录。</p><form data-form="password" class="stack">${field('当前密码','current_password','','password','required autocomplete="current-password"')}${field('新密码','new_password','','password','required minlength="8" autocomplete="new-password"')}${field('确认新密码','confirm_password','','password','required minlength="8" autocomplete="new-password"')}<button class="btn" ${state.busy ? 'disabled' : ''}>保存新密码并退出此设备</button></form></div>`
}
function settingsPage() {
  const m = mine() || {}
  return `<div class="card soft"><p class="eyebrow">由你掌控</p><h2>设置与隐私</h2><p class="hint">当前固定账号：${accountLabel(state.data.account)}。“我 / 伴侣 / 共同”只是查看范围，不会切换账号。</p><div class="actions">${button('刷新跨设备数据','refresh','secondary')}${button('退出此设备／切换账号','signout','ghost')}</div></div>${profileForm()}${sharedPartnerProfile()}<div class="card"><h2>共享范围</h2><p class="hint">类别开关与每条记录的共享确认缺一不可。代改还需要单独授权；改动会留下修改者和更新时间。</p><form data-form="settings">${settingsChecks(m)}<div class="actions"><button class="btn">保存共享设置</button></div></form></div>${state.data.healthAvailable ? `${healthSharingForm(m)}${rulesForm()}${aiConsentPanel()}` : healthStatus()}${passwordForm()}<div class="card danger-zone"><h2>数据与空间</h2><p class="hint">导出只包含你自己的资料。删除健康数据或退出空间前，建议先导出。</p><div class="actions">${button('导出我的 JSON','export','secondary')}${button('删除我的健康数据','danger-erase','danger secondary')}${button('退出空间','danger-leave','danger secondary')}</div><p class="fine">退出空间会删除本人在空间中的健康数据，但不会删除登录账号；管理员需重新关联空间。</p></div>${dangerPanel()}<div class="card"><h3>自动服务状态</h3><p class="hint">手动记录可用；服务器定时生成、AI 调用和手机推送尚未完成实际配置与验收；动作示范由你点击后才加载第三方播放器。资料不会在未经本人授权时发送给 AI。</p></div>`
}
function app() {
  const content = ({today:dashboard,tomorrow:tomorrowPage,training:trainingPage,food:foodPage,trends:trendsPage,settings:settingsPage})[state.page]()
  root.innerHTML = `${layout(content, `<div class="card soft"><p class="eyebrow">温柔提醒</p><h3>慢慢记录就好</h3><p class="hint">这里不评价或比较两个人的数据。每一项内容都来自你们真实填写。</p><div class="divider"></div><p class="fine">数据需要主动刷新才能看到其他设备的最新修改。</p></div>${state.page === 'food' && state.data.healthAvailable ? photoManager() : ''}`)}${nav()}`
}
function render() {
  if (!configured) renderUnconfigured()
  else if (state.exiting) root.innerHTML = `<div class="shell">${header()}<div class="auth-wrap"><div class="card" role="status">正在安全退出此设备，请稍候…</div></div></div>`
  else if (state.loading) root.innerHTML = `<div class="shell">${header()}<div class="auth-wrap"><div class="card" role="status">正在连接私人后台…</div></div></div>`
  else if (!state.session) auth()
  else if (!state.data) root.innerHTML = `<div class="shell">${header()}${message()}<div class="card"><p>资料尚未读到。</p>${button('重试读取','refresh','secondary')}${button('退出登录','signout','ghost')}</div></div>`
  else if (!state.data.space) space()
  else app()
  if (state.busy) root.querySelectorAll('form input,form textarea,form select,form button').forEach(control => { control.disabled = true })
}

function values(form) { const d = new FormData(form); return Object.fromEntries(d.entries()) }
function nullable(value) { return value === '' || value == null ? null : value }
function numberOrNull(value) { return value === '' || value == null ? null : Number(value) }
function checked(form,name) { return Boolean(form.elements[name]?.checked) }
function settingsFrom(form) { return Object.fromEntries(['share_profile','share_schedule','share_weight','allow_partner_edit'].map(k => [k,checked(form,k)])) }
function rowValue(row, name) { return row.querySelector(`[name="${name}"]`)?.value || '' }
function readPlanMeal(row) {
  const foods = [{ name:rowValue(row,'food_name').trim(), portion:rowValue(row,'food_portion').trim(), unit:rowValue(row,'food_unit').trim() }, ...[...row.querySelectorAll('[data-plan-food]')].map(food => ({ name:rowValue(food,'food_name').trim(), portion:rowValue(food,'food_portion').trim(), unit:rowValue(food,'food_unit').trim() }))]
  return { time:nullable(rowValue(row,'meal_time')), title:rowValue(row,'meal_title').trim(), foods, prep_method:rowValue(row,'prep_method').trim(), purchase_or_prep:rowValue(row,'purchase_or_prep').trim(), alternative:rowValue(row,'alternative').trim(), notes:rowValue(row,'meal_notes').trim(), snack_reason:nullable(rowValue(row,'snack_reason').trim()) }
}
function readRuleMealTemplate(form) {
  const meals=[...form.querySelectorAll('[data-rule-meal]')].map(readPlanMeal)
  const empty=meal=>!meal.time && !meal.title && meal.foods.every(food=>!food.name && !food.portion && !food.unit) && !['prep_method','purchase_or_prep','alternative','notes','snack_reason'].some(key=>meal[key])
  if (meals.every(empty)) return null
  if (meals.length !== 3 || meals.some(meal=>!meal.title || meal.foods.some(food=>!food.name || !food.portion || !food.unit))) throw new Error('meal-template-incomplete')
  return meals
}
function planContent(form) {
  const meals = [...form.querySelectorAll('[data-plan-meal]')].map(readPlanMeal)
  const steps = part => [...form.querySelectorAll(`[data-step="${part}"]`)].map(row => ({ description:rowValue(row,'description').trim(), seconds:Number(rowValue(row,'seconds')) }))
  const mode = rowValue(form,'training_mode')
  const items = [...form.querySelectorAll('[data-plan-item]')].map(row => ({ exercise_id:rowValue(row,'exercise_id'), sets:Number(rowValue(row,'sets')), reps:Number(rowValue(row,'reps')), work_seconds:Number(rowValue(row,'work_seconds')), rest_seconds:Number(rowValue(row,'rest_seconds')), transition_seconds:Number(rowValue(row,'transition_seconds')), first_use_check:rowValue(row,'first_use_check').trim(), short_option:rowValue(row,'short_option').trim() }))
  if (mode === 'rest' && (items.length || steps('warmup').length || steps('cooldown').length)) throw new Error('rest-plan-has-exercises')
  if (items.some(item => !exerciseById.has(item.exercise_id))) throw new Error('invalid-exercise')
  if (mode === 'workout' && (items.length > 3 || items.some(item => item.sets < 1 || item.sets > 2 || item.work_seconds < 1 || item.work_seconds > 120 || (item.sets > 1 && item.rest_seconds < 30)))) throw new Error('training-plan-limit')
  const warmup = mode === 'workout' ? steps('warmup') : [], cooldown = mode === 'workout' ? steps('cooldown') : []
  const total_seconds = [...warmup,...cooldown].reduce((sum,step) => sum + step.seconds,0) + items.reduce((sum,item) => sum + item.sets*item.work_seconds + Math.max(0,item.sets-1)*item.rest_seconds + item.transition_seconds,0)
  return { summary:rowValue(form,'summary').trim(), meals, training:{ mode, purpose:rowValue(form,'purpose').trim(), time:nullable(rowValue(form,'training_time')), intensity:rowValue(form,'intensity').trim(), equipment:rowValue(form,'equipment').trim(), muscles:rowValue(form,'muscles').split(/[，,]/).map(text => text.trim()).filter(Boolean), warmup, items:mode === 'workout' ? items : [], cooldown, total_seconds }, warnings:rowValue(form,'warnings').split(/\r?\n/).map(text => text.trim()).filter(Boolean) }
}
function mealPayload(form, previous = null) {
  const d = previous?.data || {}
  const items = [...form.querySelectorAll('[data-meal-item]')].map(row => ({ name:rowValue(row,'name').trim(), portion:rowValue(row,'portion').trim(), unit:rowValue(row,'unit').trim() }))
  if (!items.length) throw new Error('empty-meal')
  const partnerEdit = previous && previous.user_id !== state.data.user.id
  const estimate = d.estimate ? { ...d.estimate, energy_min_kcal:numberOrNull(rowValue(form,'energy_min_kcal')), energy_max_kcal:numberOrNull(rowValue(form,'energy_max_kcal')), uncertainty:rowValue(form,'uncertainty').trim(), assumptions:rowValue(form,'assumptions').split(/\r?\n/).map(value=>value.trim()).filter(Boolean) } : null
  const photoIds=partnerEdit ? (d.photo_ids || []) : previous ? (state.data.photo_assets || []).filter(photo=>photo.meal_id===previous.id).map(photo=>photo.id) : []
  return { data:{ recorded_at:partnerEdit ? d.recorded_at : localDateTimeToInstant(rowValue(form,'recorded_at')), kind:rowValue(form,'kind'), items, eaten_fraction:Number(rowValue(form,'eaten_fraction')), shared_meal_id:partnerEdit ? d.shared_meal_id : nullable(rowValue(form,'shared_meal_id')), photo_ids:photoIds, cooking:nullable(rowValue(form,'cooking').trim()), oil:nullable(rowValue(form,'oil').trim()), leftover:nullable(rowValue(form,'leftover').trim()), estimate }, status: partnerEdit ? previous.status : rowValue(form,'status'), is_shared: partnerEdit ? previous.is_shared : checked(form,'is_shared'), ...(previous ? {expected_updated_at:previous.updated_at} : {}) }
}
async function exitDevice(success = '已退出此设备，可以选择另一个账号登录。', waitForWork = true, expectedToken = state.session?.access_token) {
  if (state.exiting) return
  const previous = state.session
  const inFlight = waitForWork ? pendingWork : null
  clearSensitive(); state.exiting = true; render()
  try {
    if (inFlight) await inFlight
    if ((await api.session())?.access_token !== expectedToken) throw Object.assign(new Error('账号已变化'), { code: 'ACCOUNT_CHANGED' })
    await api.signOut(); state.notice = success; state.error = false
  }
  catch (error) {
    console.error('退出失败', error?.code || error?.name || 'unknown')
    if (error?.code === 'SIGNOUT_INCOMPLETE') state.session = await api.session().catch(() => previous)
    state.notice = success.startsWith('密码已保存') ? `密码已保存，但${errorText(error)}` : errorText(error); state.error = true
  }
  state.exiting = false
  render()
}
async function submit(form) {
  const v = values(form), kind = form.dataset.form
  const started = generation
  const sessionToken = state.session?.access_token
  if (kind === 'signin') state.loginSlot = v.slot
  if (kind === 'password' && v.new_password !== v.confirm_password) return setNotice('两次输入的新密码不一致。',true)
  if (kind === 'danger' && v.confirmation.trim() !== '确认') return setNotice('请准确输入“确认”。',true)
  await work(async () => {
    if (kind === 'signin') { await api.signIn(v.slot,v.password); if (started !== generation) return; state.session = await api.session(); await reload(started); return }
    if (kind === 'password') {
      try { await api.updatePassword(v.current_password,v.new_password) }
      catch (error) { if (error?.code === 'invalid_credentials') throw Object.assign(new Error('当前密码错误'), { code: 'INVALID_CURRENT_PASSWORD' }); throw error }
      if (started === generation) await exitDevice('密码已保存。此设备已退出，请用新密码重新登录。',false,sessionToken)
      return
    }
    if (kind === 'settings') { await api.saveSettings(settingsFrom(form)); await reload(started); return }
    if (kind === 'health-sharing') { await api.saveHealthSharing(Object.fromEntries(['share_plan','share_training','share_meal','share_photo'].map(key => [key,checked(form,key)]))); await reload(started); return }
    if (kind === 'rules') {
      const row = currentRules()
      const rules = { confirmed:checked(form,'confirmed'), equipment:v.equipment, ankle_status:v.ankle_status, free_weekdays:[1,2,3,4,5,6,7].filter(day => checked(form,`weekday_${day}`)), exercise_minutes:numberOrNull(v.exercise_minutes), max_session_minutes:numberOrNull(v.max_session_minutes), max_gym_visits:numberOrNull(v.max_gym_visits), weekly_strength_limit:numberOrNull(v.weekly_strength_limit), free_day_training_forbidden:checked(form,'free_day_training_forbidden'), free_day_meal_unrestricted:checked(form,'free_day_meal_unrestricted'), training_history_complete:checked(form,'training_history_complete'), meal_portions:nullable(v.meal_portions), prep_method:nullable(v.prep_method), meal_notes:nullable(v.meal_notes), limitations:nullable(v.limitations), sleep_condition:nullable(v.sleep_condition), meal_template:readRuleMealTemplate(form) }
      await api.saveHealthRules(rules,false,row?.updated_at || null); if (started !== generation) return; state.rulesDraft = null; await reload(started); return
    }
    if (kind === 'ai-consent') {
      const limit = Number(v.monthly_limit_cents)
      if (checked(form,'enabled') && limit <= 0) throw new Error('ai-budget')
      if (!state.data.providerAiAvailable) throw Object.assign(new Error('新版授权尚未部署'),{code:'AI_EXTENSION_UNAVAILABLE'})
      await api.setAiProviderConsent('openai',form.dataset.purpose,checked(form,'enabled'),limit,'2026-10-13-openai-health-v1'); state.aiStatus=null; await reload(started); return
    }
    if (kind === 'plan-provider') {
      if (!state.aiStatus) throw Object.assign(new Error('请先检查服务状态'),{code:'AI_STATUS_REQUIRED'})
      await requireProviderReady(v.plan_provider,v.plan_provider === 'openai' ? 'generate_plan' : null)
      if (started !== generation) return
      await api.setAiPlanProvider(v.plan_provider); state.aiStatus=null; await reload(started); return
    }
    if (kind === 'profile') {
      const current = state.data.profile
      await api.saveProfile({ sex:nullable(v.sex), age:numberOrNull(v.age), height_cm:numberOrNull(v.height_cm), baseline_weight_kg:numberOrNull(v.baseline_weight_kg), baseline_date:nullable(v.baseline_date), target_weight_kg:numberOrNull(v.target_weight_kg), target_date:nullable(v.target_date), preferences:nullable(v.preferences), health_notes:nullable(v.health_notes), is_shared:checked(form,'is_shared'), ...(current ? {expected_updated_at:current.updated_at} : {}) })
      if (started !== generation) return
      state.profileDraft = null; await reload(started); return
    }
    if (kind === 'schedule') {
      const r = state.edit?.type === 'schedule' ? state.edit.row : null
      if (!r && v.user_slot !== state.data.account) throw new Error('wrong-slot')
      if (r && v.user_slot !== (r.user_id === state.data.user.id ? state.data.account : state.data.account === 'me' ? 'w' : 'me')) throw new Error('wrong-slot')
      if (![v.raw_text,v.fixed_arrangements,v.meal_conditions,v.constraints].some(value => value?.trim()) && v.exercise_intent === 'unknown' && !v.start_time && !v.end_time) throw new Error('empty-schedule')
      if (v.start_time && v.end_time && v.end_time <= v.start_time) throw new Error('invalid-time')
      if (r && r.user_id !== state.data.user.id && v.record_date !== r.record_date) throw new Error('invalid-date')
      const payload = {user_id:r?.user_id || state.data.user.id,record_date:v.record_date,raw_text:nullable(v.raw_text),start_time:nullable(v.start_time),end_time:nullable(v.end_time),exercise_intent:v.exercise_intent,fixed_arrangements:nullable(v.fixed_arrangements),meal_conditions:nullable(v.meal_conditions),constraints:nullable(v.constraints),is_shared:checked(form,'is_shared'),...(r ? {expected_updated_at:r.updated_at} : {})}
      if (state.parsedSchedule && !r) {
        const confirmed_data = {user_slot:v.user_slot, record_date:v.record_date, exercise:{intent:v.exercise_intent,type:nullable(v.exercise_type),duration_minutes:numberOrNull(v.duration_minutes),location:nullable(v.location),equipment:nullable(v.equipment),explicit_start_time:nullable(v.start_time),explicit_end_time:nullable(v.end_time)}, meal:{conditions:nullable(v.meal_conditions),arrangements:nullable(v.meal)}, constraints:v.constraints.split(/\r?\n/).map(value=>value.trim()).filter(Boolean), fatigue:nullable(v.fatigue), pain:nullable(v.pain), sleep:nullable(v.sleep), ambiguous_fields:[]}
        await api.saveConfirmedSchedule({...payload,confirmed_data,submitted_at:state.parsedSchedule.submitted_at,parse_version:state.parsedSchedule.parse_version})
      } else await api.saveSchedule(payload,r?.id || null)
      if (started !== generation) return
      state.parsedSchedule = null; state.scheduleDate = v.record_date; await reload(started); return
    }
    if (kind === 'parse-schedule') {
      await requireProviderReady(v.ai_provider,'parse_schedule')
      if (started !== generation) return
      const submittedAt = new Date().toISOString()
      const response = await api.parseSchedule(v.raw_text,submittedAt,v.ai_provider)
      if (started !== generation) return
      if (response?.needs_confirmation !== true || !response.draft || typeof response.draft !== 'object' || !response.parse_version || response.submitted_at !== submittedAt) throw new Error('invalid-ai-draft')
      state.parsedSchedule = {...response.draft,raw_text:v.raw_text,parse_version:response.parse_version,submitted_at:response.submitted_at}
      if (validDate(response.draft.record_date)) state.scheduleDate = response.draft.record_date
      render(); return
    }
    if (kind === 'plan') { const plan = currentPlan(addDays(date(),1)); await api.saveDailyPlan(addDays(date(),1),planContent(form),plan?.version || null,checked(form,'is_shared')); await reload(started); return }
    if (kind === 'meal') { const previous = state.mealEdit; await api.saveMeal(mealPayload(form,previous),previous?.id || null); if (started !== generation) return; state.mealEdit = null; state.mealEstimateDraft=null; await reload(started); return }
    if (kind === 'training-set') {
      const session = liveTrainingSession(), d = session?.data
      if (!session || d.status !== 'active' || !exerciseById.has(v.exercise_id)) throw new Error('invalid-exercise')
      const plan = (state.data.daily_plans || []).find(row => row.id === d.plan_id)
      const item = plan?.content?.training?.items?.find(row => row.exercise_id === v.exercise_id)
      if (!item) throw new Error('invalid-exercise')
      const done=(d.sets || []).filter(set=>set.exercise_id===v.exercise_id).length+1
      const nextItem=plan.content.training.items[plan.content.training.items.indexOf(item)+1]
      const now = new Date().toISOString(), rest = Number(done < item.sets ? item.rest_seconds : nextItem ? item.transition_seconds : 0)
      const skipped=checked(form,'skipped')
      const next = {...d,elapsed_seconds:elapsedSeconds(session),active_since:now,rest_until:rest ? new Date(Date.now()+rest*1000).toISOString() : null,rest_remaining_seconds:0,sets:[...(d.sets || []),{exercise_id:v.exercise_id,set_index:Number(v.set_index),reps:skipped ? 0 : Number(v.reps),load_kg:skipped ? null : numberOrNull(v.load_kg),rpe:skipped ? null : numberOrNull(v.rpe),pain_note:nullable(v.pain_note),stop_reason:null,skipped,completed_at:now}]}
      await api.saveTrainingSession({data:next,status:'active',is_shared:session.is_shared,expected_updated_at:session.updated_at},session.id); await reload(started); return
    }
    if (kind === 'photo') {
      if (!v.meal_id) throw new Error('photo-needs-meal')
      const original = form.elements.photo.files?.[0]
      if (!original) throw new Error('photo-required')
      const cleaned = await cleanPhoto(original)
      if (started !== generation || state.session?.access_token !== sessionToken) return
      await api.uploadPhoto(cleaned,nullable(v.meal_id),checked(form,'is_shared')); await reload(started); return
    }
    if (kind === 'weight') {
      const r = state.edit?.type === 'weight' ? state.edit.row : null
      if (r && r.user_id !== state.data.user.id && v.record_date !== r.record_date) throw new Error('invalid-date')
      if (v.measured_at && v.measured_at.slice(0,10) !== v.record_date) throw new Error('measured-date')
      await api.saveWeight({user_id:r?.user_id || state.data.user.id,record_date:v.record_date,measured_at:v.measured_at ? localDateTimeToInstant(v.measured_at) : null,weight_kg:Number(v.weight_kg),waist_cm:numberOrNull(v.waist_cm),notes:nullable(v.notes),is_shared:checked(form,'is_shared'),...(r ? {expected_updated_at:r.updated_at} : {})},r?.id || null)
      await reload(started); return
    }
    if (kind === 'danger') {
      const photos=ownRows('photo_assets').map(row=>row.id)
      for (const id of photos) {
        if (started !== generation || state.session?.access_token !== sessionToken) return
        await api.deletePhoto(id)
      }
      if (started !== generation || state.session?.access_token !== sessionToken) return
      if (state.danger === 'leave') await api.leaveSpace(); else await api.eraseOwnHealthData()
      if (started !== generation) return
      state.danger = null; state.profileDraft = null; await reload(started); return
    }
  }, ({signin:'登录成功',settings:'共享设置已保存','health-sharing':'新类别共享已保存',rules:'本人规则已保存','ai-consent':'授权设置已保存','plan-provider':'夜间计划方式已保存',profile:'档案已保存',schedule:'日程已保存','parse-schedule':'解析草稿已载入，请确认后保存',plan:'手动计划新版本已保存',meal:'餐食已保存','training-set':'实际训练组已保存',photo:'照片已上传',weight:'体重已保存',danger:'操作已完成'})[kind] || '')
}
function exportJson(data) {
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'})
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = `我的健康数据-${date()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000)
}
async function cleanPhoto(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 12*1024*1024) throw new Error('photo-invalid')
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1,1600/Math.max(bitmap.width,bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1,Math.round(bitmap.width*scale)); canvas.height = Math.max(1,Math.round(bitmap.height*scale))
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/png'))
    if (!blob || blob.size > 4*1024*1024) throw new Error('photo-too-large')
    return new File([blob],'meal.png',{type:'image/png'})
  } finally { bitmap.close() }
}
async function act(el) {
  const action = el.dataset.action
  if (action === 'remove-row') { el.closest('.repeat-row')?.remove(); return }
  if (action === 'add-plan-meal') { root.querySelector('[data-plan-meals]')?.insertAdjacentHTML('beforeend',mealPlanRow()); return }
  if (action === 'add-plan-food') { el.closest('[data-plan-meal]')?.querySelector('[data-food-extra]')?.insertAdjacentHTML('beforeend',foodPlanRow()); return }
  if (action === 'add-plan-item') { root.querySelector('[data-plan-items]')?.insertAdjacentHTML('beforeend',trainingItemRow()); root.querySelector('[data-form="plan"] [name="training_mode"]').value='workout'; return }
  if (action === 'add-warmup' || action === 'add-cooldown') { const part=action.slice(4); root.querySelector(`[data-plan-steps="${part}"]`)?.insertAdjacentHTML('beforeend',stepRow({},part)); root.querySelector('[data-form="plan"] [name="training_mode"]').value='workout'; return }
  if (action === 'add-meal-item') { root.querySelector('[data-meal-items]')?.insertAdjacentHTML('beforeend',mealItemRow()); return }
  if (action === 'cancel-meal') { state.mealEdit=null; state.mealEstimateDraft=null; render(); return }
  if (action === 'close-photo') { if (state.photoUrl) URL.revokeObjectURL(state.photoUrl); state.photoUrl=null; render(); return }
  if (action.startsWith('demo-')) {
    const exercise=exerciseById.get(el.dataset.id), embed=exercise?.demo?.embed
    if (exercise?.demo?.verificationStatus !== 'verified' || !/^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]+$/.test(embed || '')) return
    if (action === 'demo-load') {
      const slot=el.closest('[data-demo-slot]'), frame=document.createElement('iframe'), url=new URL(embed)
      if (!slot || slot.querySelector('iframe')) return
      url.searchParams.set('enablejsapi','1'); url.searchParams.set('origin',location.origin)
      frame.id=`demo-${exercise.id}`; frame.className='demo-frame'; frame.title=`${exercise.name}示范`
      frame.allow='autoplay; encrypted-media; picture-in-picture'
      frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation')
      frame.src=url.href
      slot.replaceChildren(frame)
      const controls=document.createElement('div'); controls.className='actions'
      for (const [label,kind] of [['播放','demo-play'],['暂停','demo-pause'],['重播','demo-replay']]) {
        const control=document.createElement('button'); control.type='button'; control.className='btn secondary small'
        control.textContent=label; control.dataset.action=kind; control.dataset.id=exercise.id; controls.append(control)
      }
      slot.append(controls)
      return
    }
    const frame=document.getElementById(`demo-${exercise.id}`), origin=new URL(embed).origin
    const command=action === 'demo-play' ? 'playVideo' : action === 'demo-pause' ? 'pauseVideo' : 'seekTo'
    frame?.contentWindow?.postMessage(JSON.stringify({event:'command',func:command,args:action === 'demo-replay' ? [0,true] : []}),origin)
    if (action === 'demo-replay') frame?.contentWindow?.postMessage(JSON.stringify({event:'command',func:'playVideo',args:[]}),origin)
    return
  }
  if (action === 'plan-lock') { const plan=(state.data.daily_plans || []).find(row => row.id === el.dataset.id); if (!plan || plan.user_id !== state.data.user.id) return; const started=generation; await work(async()=>{await api.setPlanLock(plan.id,!plan.is_locked,plan.updated_at);await reload(started)},'计划锁定状态已保存'); return }
  if (action === 'request-plan' || action === 'retry-job') {
    const started=generation
    await work(async()=>{
      const selectedProvider=el.closest('.card')?.querySelector('[name="ai_provider"]')?.value
      await requireProviderReady(selectedProvider,selectedProvider === 'openai' ? 'generate_plan' : null)
      if (started !== generation) return
      const job=action === 'request-plan' ? await api.requestPlanGeneration(el.dataset.day) : await api.retryGenerationJob(el.dataset.id)
      if (started !== generation) return
      try {
        const outcome=await api.generatePlan(job.id,selectedProvider)
        if (outcome?.status !== 'succeeded') throw Object.assign(new Error('生成未完成'),{code:outcome?.error_code || 'AI_SERVICE_UNAVAILABLE'})
      } finally { await reload(started) }
    },'计划已由服务端生成；请核对内容后使用。')
    return
  }
  if (action === 'ai-status') { const started=generation; await work(async()=>{const status=await api.aiStatus(); if(started!==generation)return; state.aiStatus=status},'服务状态已从后台读取'); return }
  if (action === 'confirm-training-history') { const row=currentRules(); if(!row?.rules?.training_history_complete)return; const started=generation; await work(async()=>{await api.confirmTrainingHistory(row.updated_at);await reload(started)},'近 48 小时训练史已再次由本人确认。'); return }
  if (action === 'training-start') {
    const plan=currentPlan(date())
    if (!plan || plan.is_stale || plan.content?.training?.mode !== 'workout' || liveTrainingSession()) return setNotice('请先核对今天的训练计划与现有会话。',true)
    const started=generation, now=new Date().toISOString()
    await work(async()=>{await api.saveTrainingSession({data:{plan_id:plan.id,status:'active',started_at:now,active_since:now,rest_until:null,rest_remaining_seconds:0,ended_at:null,elapsed_seconds:0,stop_reason:null,sets:[]},status:'active',is_shared:false});await reload(started)},'训练已开始；请记录实际完成的每一组'); return
  }
  if (['training-pause','training-resume','training-finish','training-stop'].includes(action)) {
    const session=liveTrainingSession(); if (!session) return
    const stopReason=action === 'training-stop' ? root.querySelector('[name="stop_reason"]')?.value.trim() : ''
    if (action === 'training-stop' && !stopReason) return setNotice('请填写停止原因，出现疼痛请及时停止并求助专业人员。',true)
    const now=new Date().toISOString(), d=session.data, elapsed=elapsedSeconds(session)
    const remaining=d.rest_until ? Math.max(0,Math.ceil((Date.parse(d.rest_until)-Date.now())/1000)) : Number(d.rest_remaining_seconds || 0)
    const status=({ 'training-pause':'paused','training-resume':'active','training-finish':'completed','training-stop':'stopped' })[action]
    const next={...d,status,elapsed_seconds:elapsed,active_since:status === 'active' ? now : null,rest_until:status === 'active' && remaining ? new Date(Date.now()+remaining*1000).toISOString() : null,rest_remaining_seconds:status === 'paused' ? remaining : 0,ended_at:['completed','stopped'].includes(status) ? now : null}
    if (status === 'stopped') next.stop_reason=stopReason
    const started=generation
    await work(async()=>{await api.saveTrainingSession({data:next,status,is_shared:session.is_shared,expected_updated_at:session.updated_at},session.id);await reload(started)},status === 'completed' ? '本次训练已按实际记录完成' : status === 'stopped' ? '本次训练已停止并记录原因' : '计时状态已保存'); return
  }
  if (action === 'edit-meal') { const row=(state.data.meals || []).find(item => item.id === el.dataset.id); if (!row || !canEdit(row,'meal')) return; state.mealEdit=row; state.mealEstimateDraft=null; state.page='food'; render(); root.querySelector('[data-form="meal"]')?.scrollIntoView(); return }
  if (action === 'delete-meal') { const row=ownRows('meals').find(item => item.id === el.dataset.id); if (!row || !confirm('确认删除这条本人餐食记录？')) return; const started=generation; await work(async()=>{await api.deleteMeal(row.id);await reload(started)},'餐食记录已删除'); return }
  if (action === 'delete-photo') { const row=ownRows('photo_assets').find(item => item.id === el.dataset.id); if (!row || !confirm('确认删除这张本人照片？')) return; const started=generation; await work(async()=>{await api.deletePhoto(row.id);if(state.photoUrl){URL.revokeObjectURL(state.photoUrl);state.photoUrl=null}await reload(started)},'照片已删除'); return }
  if (action === 'view-photo') { const started=generation; await work(async()=>{const blob=await api.downloadPhoto(el.dataset.id);if(started!==generation)return;if(!(blob instanceof Blob))throw new Error('photo-invalid');if(state.photoUrl)URL.revokeObjectURL(state.photoUrl);state.photoUrl=URL.createObjectURL(blob)},'照片已按当前权限读取'); return }
  if (action === 'estimate-meal') { const row=ownRows('meals').find(item => item.id === el.dataset.id); if (!row) return; const started=generation; await work(async()=>{const selectedProvider=el.closest('article')?.querySelector('[name="ai_provider"]')?.value;const hasPhotos=(state.data.photo_assets||[]).some(photo=>photo.meal_id===row.id);await requireProviderReady(selectedProvider,hasPhotos?'estimate_meal_photo':'estimate_meal_text');if(started!==generation)return;const response=await api.estimateMeal(row.id,selectedProvider);if(started!==generation)return;const draft=response?.draft;if(response?.needs_confirmation!==true || !draft || typeof draft!=='object' || !Array.isArray(draft.items)) throw new Error('invalid-ai-draft');state.mealEstimateDraft=draft;state.mealEdit={...row,data:{...row.data,items:draft.items.map(item=>({name:item.name || '',portion:item.portion || '',unit:item.unit || ''})),cooking:draft.cooking ?? row.data.cooking,oil:draft.oil ?? row.data.oil,leftover:draft.leftover ?? row.data.leftover,estimate:draft}};state.page='food'},'识别草稿已填入，请逐项核对后保存'); return }
  if (action === 'page') { state.page = el.dataset.page; state.edit = null; state.mealEdit = null; state.mealEstimateDraft=null; state.notice = ''; render(); scrollTo(0,0); return }
  if (action === 'scope') { state.scope = el.dataset.scope; render(); return }
  if (action === 'cancel-edit') { state.edit = null; render(); return }
  if (action === 'cancel-danger') { state.danger = null; render(); return }
  if (action.startsWith('danger-')) { state.danger = action.slice(7); render(); return }
  if (action === 'edit-schedule' || action === 'edit-weight') {
    const type = action.slice(5), row = state.data[type === 'schedule' ? 'schedules' : 'weights'].find(r => r.id === el.dataset.id)
    if (!row || !canEdit(row,type)) return setNotice('你没有修改这条记录的权限。',true)
    state.edit = {type,row}; state.parsedSchedule = null; if (type === 'schedule') state.scheduleDate = row.record_date; state.page = type === 'schedule' ? 'tomorrow' : 'trends'; render(); document.querySelector(`[data-form="${type}"]`)?.scrollIntoView(); return
  }
  if (action === 'delete-schedule' || action === 'delete-weight') {
    const type = action.slice(7), row = state.data[type === 'schedule' ? 'schedules' : 'weights'].find(r => r.id === el.dataset.id)
    if (!row || !canEdit(row,type)) return setNotice('你没有删除这条记录的权限。',true)
    if (!confirm(`确认删除 ${person(row.user_id)} 在 ${row.record_date} 的${type === 'schedule' ? '日程' : '体重'}记录？`)) return
    const started = generation
    await work(async () => { if (type === 'schedule') await api.deleteSchedule(row.id); else await api.deleteWeight(row.id); await reload(started) },'记录已删除'); return
  }
  if (action === 'refresh') { await work(reload,'数据已刷新'); return }
  if (action === 'signout') { await exitDevice(); return }
  if (action === 'export') { const started = generation; await work(async () => { const data = await api.exportOwnData(); if (started === generation) exportJson(data) },'导出文件已开始下载。') }
}

root.addEventListener('click', event => { const el = event.target.closest('[data-action]'); if (el) act(el) })
root.addEventListener('submit', event => { const form = event.target.closest('[data-form]'); if (form) { event.preventDefault(); submit(form) } })
root.addEventListener('change', async event => {
  if (event.target.name === 'skipped' && event.target.closest('[data-form="training-set"]')) { event.target.form.elements.reps.value = event.target.checked ? '0' : ''; return }
  if (event.target.id === 'schedule-date') { state.scheduleDate = event.target.value; state.edit = null; render(); return }
  if (event.target.id === 'meal-date') { state.mealDate = event.target.value; render(); return }
  if (event.target.id !== 'profile-import' || !event.target.files?.[0]) return
  const file = event.target.files[0]
  const started = generation
  try {
    if (file.size > 1024 * 1024) throw new Error('large-file')
    const parsed = JSON.parse(await file.text())
    if (started !== generation) return
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid-file')
    const profileSource = Object.hasOwn(parsed,'profile') ? parsed.profile : parsed
    if (!profileSource || typeof profileSource !== 'object' || Array.isArray(profileSource)) throw new Error('invalid-file')
    const keys = ['sex','age','height_cm','baseline_weight_kg','baseline_date','target_weight_kg','target_date','preferences','health_notes']
    const picked = Object.fromEntries(keys.filter(key => Object.hasOwn(profileSource,key)).map(key => [key,profileSource[key]]))
    for (const key of ['age','height_cm','baseline_weight_kg','target_weight_kg']) if (picked[key] != null && (typeof picked[key] !== 'number' || !Number.isFinite(picked[key]))) throw new Error('invalid-file')
    for (const key of ['sex','baseline_date','target_date','preferences','health_notes']) if (picked[key] != null && typeof picked[key] !== 'string') throw new Error('invalid-file')
    if (picked.sex != null && !['female','male','other',''].includes(picked.sex)) throw new Error('invalid-file')
    for (const key of ['baseline_date','target_date']) if (picked[key] && !validDate(picked[key])) throw new Error('invalid-file')
    let rulesPicked = null
    if (Object.hasOwn(parsed,'rules')) {
      if (!state.data.healthAvailable) throw new Error('health-not-ready')
      const source = parsed.rules
      if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('invalid-file')
      const ruleKeys = ['equipment','ankle_status','free_weekdays','exercise_minutes','max_session_minutes','max_gym_visits','weekly_strength_limit','free_day_training_forbidden','free_day_meal_unrestricted','training_history_complete','meal_portions','prep_method','meal_notes','limitations','sleep_condition','meal_template']
      rulesPicked = Object.fromEntries(ruleKeys.filter(key => Object.hasOwn(source,key)).map(key => [key,source[key]]))
      if (!Object.keys(rulesPicked).length) throw new Error('invalid-file')
      if (rulesPicked.equipment != null && !['unknown','machines_only','dorm','mixed'].includes(rulesPicked.equipment)) throw new Error('invalid-file')
      if (rulesPicked.ankle_status != null && !['unknown','recovery_unknown','limited','cleared','no_issue'].includes(rulesPicked.ankle_status)) throw new Error('invalid-file')
      if (rulesPicked.free_weekdays != null && (!Array.isArray(rulesPicked.free_weekdays) || rulesPicked.free_weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7))) throw new Error('invalid-file')
      for (const key of ['exercise_minutes','max_session_minutes','max_gym_visits','weekly_strength_limit']) if (rulesPicked[key] != null && (!Number.isInteger(rulesPicked[key]) || rulesPicked[key] < 0)) throw new Error('invalid-file')
      for (const key of ['free_day_training_forbidden','free_day_meal_unrestricted','training_history_complete']) if (rulesPicked[key] != null && typeof rulesPicked[key] !== 'boolean') throw new Error('invalid-file')
      for (const key of ['meal_portions','prep_method','meal_notes','limitations','sleep_condition']) if (rulesPicked[key] != null && (typeof rulesPicked[key] !== 'string' || rulesPicked[key].length > 2000)) throw new Error('invalid-file')
      if (rulesPicked.meal_template != null && (!Array.isArray(rulesPicked.meal_template) || rulesPicked.meal_template.length !== 3 || rulesPicked.meal_template.some(meal => !meal || typeof meal !== 'object' || typeof meal.title !== 'string' || !Array.isArray(meal.foods) || meal.foods.length === 0 || meal.foods.some(food => !food || typeof food.name !== 'string' || typeof food.portion !== 'string' || typeof food.unit !== 'string')))) throw new Error('invalid-file')
    }
    if (!Object.keys(picked).length && !rulesPicked) throw new Error('invalid-file')
    if (Object.keys(picked).length) state.profileDraft = {...state.data.profile,...picked,is_shared:state.data.profile?.is_shared || false}
    if (rulesPicked) state.rulesDraft = {...currentRules()?.rules,...rulesPicked,confirmed:false}
    state.notice = '本人档案与规则已填入相应表单；请分别核对并点击保存。导入不会自动共享或授权 AI。'; state.error = false; render()
  } catch { if (started !== generation) return; state.notice = '无法读取该档案文件。请选择本人档案 JSON，并检查字段格式。'; state.error = true; render() }
})

setInterval(() => {
  const elapsed = root.querySelector('#training-elapsed')
  if (elapsed) {
    const base = Number(elapsed.dataset.base || 0), started = Date.parse(elapsed.dataset.started || '')
    elapsed.textContent = `已进行 ${Math.max(0,Math.floor(base + (Number.isFinite(started) ? (Date.now()-started)/1000 : 0)))} 秒`
  }
  const rest = root.querySelector('#training-rest')
  if (rest?.dataset.until) rest.textContent = `休息还剩 ${Math.max(0,Math.ceil((Date.parse(rest.dataset.until)-Date.now())/1000))} 秒`
}, 1000)

async function initialize() {
  if (location.hash || new URLSearchParams(location.search).has('code')) history.replaceState(null, '', location.pathname)
  if (!configured) { state.loading = false; render(); return }
  api.onAuthChange((session,event) => {
    setTimeout(async () => {
      let current
      try { current = await api.session() }
      catch (error) { clearSensitive(); state.notice = errorText(error); state.error = true; render(); return }
      if (current?.access_token !== session?.access_token) return
      if (state.exiting) return
      if (!session) { if (state.session) { clearSensitive(); render() } return }
      if (state.busy && !state.session) return
      if (state.session?.user?.id === session.user?.id && state.data) { state.session = session; return }
      clearSensitive(session); state.loading = true; render()
      const started = generation
      try { await reload(started); if (started === generation) { state.notice = ''; state.error = false } }
      catch (error) { if (started === generation) { state.notice = errorText(error); state.error = true } }
      finally { if (started === generation) { state.loading = false; render() } }
    }, 0)
  })
  try { state.session = await api.session(); if (state.session) await reload() }
  catch (error) { console.error('读取失败',error?.code || error?.name || 'unknown'); if (!state.notice) { state.notice = errorText(error); state.error = true } }
  finally { state.loading = false; render() }
}
initialize()

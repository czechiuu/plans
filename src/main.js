import './style.css'
import { api, configured, configurationError } from './api.js'
import { shanghaiDate, addDays, sevenDayAverage, escapeHtml, instantToLocalDateTime, localDateTimeToInstant, validDate } from './domain.js'

const root = document.querySelector('#app')
const safe = (value) => escapeHtml(value ?? '')
const date = () => shanghaiDate()
const state = {
  session: null, data: null, page: 'today',
  scheduleDate: date(), scope: 'mine', edit: null, notice: '', error: false, busy: false,
  danger: null, loading: true, profileDraft: null, loginSlot: 'me',
}
let generation = 0

function clearSensitive(session = null) {
  generation++
  Object.assign(state, { session, data: null, page: 'today', scheduleDate: date(), scope: 'mine', edit: null, notice: '', error: false, busy: false, danger: null, profileDraft: null, loginSlot: 'me', loading: false })
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
  try { await action(); if (generation !== started) return; if (success) state.notice = success; state.error = false }
  catch (error) { if (generation !== started) return; console.error('操作失败', error?.code || error?.name || 'unknown'); state.notice = errorText(error); state.error = true }
  finally { if (generation === started) { state.busy = false; render() } }
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
function canEdit(row, type) {
  if (row.user_id === state.data.user.id) return true
  return Boolean(partner()?.allow_partner_edit && partner()?.[`share_${type}`] && row.is_shared)
}
function updateMeta(row) { return `<span class="fine">${row.updated_at ? `更新 ${safe(instantToLocalDateTime(row.updated_at).replace('T', ' '))}（上海）` : ''}${row.updated_by ? ` · 修改者：${safe(person(row.updated_by))}` : ''}</span>` }
function nav() { return `<nav class="nav" aria-label="主导航"><div class="nav-inner">${[['today','今日','◉'],['schedule','日程','▦'],['weight','体重','◌'],['settings','设置','⚙']].map(([p,t,i]) => `<button type="button" data-action="page" data-page="${p}" class="${state.page === p ? 'active' : ''}" ${state.page === p ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${i}</span>${t}</button>`).join('')}</div></nav>` }
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
  return `<div class="card soft"><p class="eyebrow">今天 · ${safe(date())}</p><h2>照顾自己，也看见彼此</h2><p class="muted">这里展示真实记录。没有填写的内容会保持空白。</p>${scopeSwitch()}</div><div class="stat-grid"><div class="stat"><span>今日可见日程</span><b>${schedules.length}</b><span>条记录</span></div><div class="stat"><span>${state.scope === 'partner' ? '伴侣' : '我的'}最近体重</span><b>${latest ? `${safe(latest.weight_kg)} kg` : '—'}</b><span>${latest ? safe(latest.record_date) : '尚无记录'}</span></div><div class="stat"><span>${state.scope === 'partner' ? '伴侣' : '我的'}近7日平均</span><b>${avg.count ? `${safe(avg.average.toFixed(1))} kg` : '—'}</b><span>真实记录 ${avg.count} 条</span></div></div><div class="card"><div class="card-header"><div><h2>今天的日程</h2><span class="hint">只显示你有权查看的内容</span></div>${button('查看日程','page','secondary','data-page="schedule"')}</div>${scheduleList(schedules)}</div><div class="card"><h2>明天 · ${safe(addDays(date(),1))}</h2>${scheduleList(state.data.schedules.filter(r => r.record_date === addDays(date(),1) && visibleByScope(r)))}</div><div class="card warn"><h3>每日饮食运动计划</h3><p class="hint">自动生成计划属于第二阶段，目前尚未实现。这里不会把手动日程伪装成已生成计划，也不会向 AI 发送资料。</p></div>`
}
function scheduleList(rows) {
  if (!rows.length) return `<div class="empty"><strong>这一天还没有记录</strong>可以到“日程”手动添加。</div>`
  return `<div class="list">${rows.sort((a,b) => (a.start_time || '').localeCompare(b.start_time || '')).map(r => `<article class="list-item"><div class="row-between"><strong>${safe(person(r.user_id))} · ${safe(r.record_date)}</strong><span class="tag ${r.is_shared ? 'shared' : 'private'}">${r.is_shared ? '共享' : '私有'}</span></div><div class="meta">${r.start_time ? `<span>${safe(r.start_time.slice(0,5))}${r.end_time ? `–${safe(r.end_time.slice(0,5))}` : ''}</span>` : '<span>未指定时段</span>'}<span>运动：${({yes:'愿意',no:'不安排',unknown:'未确定'})[r.exercise_intent] || '未确定'}</span></div>${r.raw_text ? `<p>${safe(r.raw_text)}</p>` : ''}${r.fixed_arrangements ? `<p><b>固定安排：</b>${safe(r.fixed_arrangements)}</p>` : ''}${r.meal_conditions ? `<p><b>用餐条件：</b>${safe(r.meal_conditions)}</p>` : ''}${r.constraints ? `<p><b>限制：</b>${safe(r.constraints)}</p>` : ''}<div class="row-between" style="margin-top:10px">${updateMeta(r)}${canEdit(r,'schedule') ? `<div class="item-actions">${button('编辑','edit-schedule','ghost small',`data-id="${safe(r.id)}"`)}${button('删除','delete-schedule','danger secondary small',`data-id="${safe(r.id)}"`)}</div>` : ''}</div></article>`).join('')}</div>`
}
function scheduleForm() {
  const r = state.edit?.type === 'schedule' ? state.edit.row : null
  const partnerEdit = r && r.user_id !== state.data.user.id
  return `<div class="card"><div class="card-header"><div><h2>${r ? '编辑日程' : '新增日程'}</h2><span class="hint">请手动核对日期和内容。系统暂不自动解析。</span></div>${r ? button('取消编辑','cancel-edit','ghost') : ''}</div><form data-form="schedule"><div class="form-grid">${field('日期','record_date',r?.record_date || state.scheduleDate,'date',`required ${partnerEdit ? 'readonly' : ''}`)}${field('开始时间','start_time',r?.start_time?.slice(0,5) || '','time')}${field('结束时间','end_time',r?.end_time?.slice(0,5) || '','time')}${select('运动意愿','exercise_intent',r?.exercise_intent || 'unknown',[['unknown','未确定'],['yes','愿意运动'],['no','不安排运动']])}${textArea('当天原文或备注','raw_text',r?.raw_text || '')}${textArea('固定安排','fixed_arrangements',r?.fixed_arrangements || '')}${textArea('用餐条件','meal_conditions',r?.meal_conditions || '')}${textArea('限制、注意事项','constraints',r?.constraints || '')}<div class="field full">${check('允许伴侣查看这条日程','is_shared',r?.is_shared || false,'同时需要在设置中打开“共享日程”；新记录默认私有。')}</div></div><div class="actions"><button class="btn" ${state.busy ? 'disabled' : ''}>${r ? '保存修改' : '保存日程'}</button></div></form></div>`
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
function settingsChecks(m) { return `<div class="stack">${check('共享个人档案','share_profile',m.share_profile)}${check('共享日程','share_schedule',m.share_schedule)}${check('共享体重','share_weight',m.share_weight)}${check('允许伴侣修改已共享记录','allow_partner_edit',m.allow_partner_edit,'需同时满足类别共享和该条记录共享。')}</div>` }
function profileForm() {
  const p = state.profileDraft || state.data.profile || {}
  const expired = p.target_date && p.target_date < date()
  return `<div class="card"><div class="card-header"><div><h2>我的档案</h2><span class="hint">空白表示未知，只填写你愿意确认的真实资料。</span></div></div><label class="field"><span>导入已有的本人档案 JSON</span><input id="profile-import" type="file" accept="application/json,.json"><small class="hint">只选择你自己的文件。读取后先检查表单，点击保存才会写入当前账号；不会发给 AI。</small></label>${state.profileDraft ? `<div class="notice" role="status" style="margin-top:14px">已填入导入内容，请逐项确认后保存。</div>` : ''}${expired ? `<div class="notice error" role="status">目标日期已过，请重新确认目标和日期。</div>` : ''}<form data-form="profile" style="margin-top:18px"><div class="form-grid">${select('生理性别（可留空）','sex',p.sex || '',[['','未填写'],['female','女'],['male','男'],['other','其他']])}${field('年龄','age',p.age ?? '','number','min="1" max="120"')}${field('身高（cm）','height_cm',p.height_cm ?? '','number','min="50" max="250" step="0.1"')}${field('基线体重（kg）','baseline_weight_kg',p.baseline_weight_kg ?? '','number','min="20" max="500" step="0.1"')}${field('基线日期','baseline_date',p.baseline_date || '','date')}${field('目标体重（kg）','target_weight_kg',p.target_weight_kg ?? '','number','min="20" max="500" step="0.1"')}${field('目标日期','target_date',p.target_date || '','date')}${textArea('饮食与运动偏好','preferences',p.preferences || '')}${textArea('健康情况、伤情或其他注意事项','health_notes',p.health_notes || '')}<div class="field full">${check('允许伴侣查看这份档案','is_shared',p.is_shared || false,'同时需要开启下方“共享个人档案”。')}</div></div><div class="actions"><button class="btn" ${state.busy ? 'disabled' : ''}>保存档案</button></div></form></div>`
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
  return `<div class="card soft"><p class="eyebrow">由你掌控</p><h2>设置与隐私</h2><p class="hint">当前固定账号：${accountLabel(state.data.account)}。日程中的“我 / 伴侣 / 共同”只是查看范围，不会切换账号。</p><div class="actions">${button('刷新跨设备数据','refresh','secondary')}${button('退出此设备／切换账号','signout','ghost')}</div></div>${profileForm()}${sharedPartnerProfile()}<div class="card"><h2>共享范围</h2><p class="hint">类别开关与每条记录的共享确认缺一不可。代改还需要单独授权；改动会留下修改者和更新时间。</p><form data-form="settings">${settingsChecks(m)}<div class="actions"><button class="btn" ${state.busy ? 'disabled' : ''}>保存共享设置</button></div></form></div>${passwordForm()}<div class="card danger-zone"><h2>数据与空间</h2><p class="hint">导出只包含你自己的资料。删除健康数据或退出空间前，建议先导出。</p><div class="actions">${button('导出我的 JSON','export','secondary')}${button('删除我的健康数据','danger-erase','danger secondary')}${button('退出空间','danger-leave','danger secondary')}</div><p class="fine">退出空间会删除本人在空间中的健康数据，但不会删除登录账号；管理员需重新关联空间。</p></div>${dangerPanel()}<div class="card"><h3>尚未启用</h3><p class="hint">自动饮食运动计划、照片识别、AI 处理和自动通知属于后续阶段。当前资料不会发送给外部 AI。</p></div>`
}
function app() {
  const content = ({today:dashboard,schedule:schedulePage,weight:weightPage,settings:settingsPage})[state.page]()
  root.innerHTML = `${layout(content, `<div class="card soft"><p class="eyebrow">温柔提醒</p><h3>慢慢记录就好</h3><p class="hint">这里不评价或比较两个人的数据。每一项内容都来自你们真实填写。</p><div class="divider"></div><p class="fine">数据需要主动刷新才能看到其他设备的最新修改。</p></div>`)}${nav()}`
}
function render() {
  if (!configured) return renderUnconfigured()
  if (state.loading) { root.innerHTML = `<div class="shell">${header()}<div class="auth-wrap"><div class="card" role="status">正在连接私人后台…</div></div></div>`; return }
  if (!state.session) return auth()
  if (!state.data) { root.innerHTML = `<div class="shell">${header()}${message()}<div class="card"><p>资料尚未读到。</p>${button('重试读取','refresh','secondary')}${button('退出登录','signout','ghost')}</div></div>`; return }
  if (!state.data.space) return space()
  app()
}

function values(form) { const d = new FormData(form); return Object.fromEntries(d.entries()) }
function nullable(value) { return value === '' || value == null ? null : value }
function numberOrNull(value) { return value === '' || value == null ? null : Number(value) }
function checked(form,name) { return Boolean(form.elements[name]?.checked) }
function settingsFrom(form) { return Object.fromEntries(['share_profile','share_schedule','share_weight','allow_partner_edit'].map(k => [k,checked(form,k)])) }
async function exitDevice(success = '已退出此设备，可以选择另一个账号登录。') {
  const previous = state.session
  clearSensitive(); state.busy = true; render()
  try { await api.signOut(); state.notice = success; state.error = false }
  catch (error) {
    console.error('退出失败', error?.code || error?.name || 'unknown')
    if (error?.code === 'SIGNOUT_INCOMPLETE') state.session = await api.session().catch(() => previous)
    state.notice = success.startsWith('密码已保存') ? `密码已保存，但${errorText(error)}` : errorText(error); state.error = true
  }
  state.busy = false
  render()
}
async function submit(form) {
  const v = values(form), kind = form.dataset.form
  const started = generation
  if (kind === 'signin') state.loginSlot = v.slot
  if (kind === 'password' && v.new_password !== v.confirm_password) return setNotice('两次输入的新密码不一致。',true)
  if (kind === 'danger' && v.confirmation.trim() !== '确认') return setNotice('请准确输入“确认”。',true)
  await work(async () => {
    if (kind === 'signin') { await api.signIn(v.slot,v.password); if (started !== generation) return; state.session = await api.session(); await reload(started); return }
    if (kind === 'password') {
      try { await api.updatePassword(v.current_password,v.new_password) }
      catch (error) { if (error?.code === 'invalid_credentials') throw Object.assign(new Error('当前密码错误'), { code: 'INVALID_CURRENT_PASSWORD' }); throw error }
      if (started === generation) await exitDevice('密码已保存。此设备已退出，请用新密码重新登录。')
      return
    }
    if (kind === 'settings') { await api.saveSettings(settingsFrom(form)); await reload(started); return }
    if (kind === 'profile') {
      const current = state.data.profile
      await api.saveProfile({ sex:nullable(v.sex), age:numberOrNull(v.age), height_cm:numberOrNull(v.height_cm), baseline_weight_kg:numberOrNull(v.baseline_weight_kg), baseline_date:nullable(v.baseline_date), target_weight_kg:numberOrNull(v.target_weight_kg), target_date:nullable(v.target_date), preferences:nullable(v.preferences), health_notes:nullable(v.health_notes), is_shared:checked(form,'is_shared'), ...(current ? {expected_updated_at:current.updated_at} : {}) })
      if (started !== generation) return
      state.profileDraft = null; await reload(started); return
    }
    if (kind === 'schedule') {
      const r = state.edit?.type === 'schedule' ? state.edit.row : null
      if (![v.raw_text,v.fixed_arrangements,v.meal_conditions,v.constraints].some(value => value?.trim()) && v.exercise_intent === 'unknown' && !v.start_time && !v.end_time) throw new Error('empty-schedule')
      if (v.start_time && v.end_time && v.end_time <= v.start_time) throw new Error('invalid-time')
      if (r && r.user_id !== state.data.user.id && v.record_date !== r.record_date) throw new Error('invalid-date')
      await api.saveSchedule({user_id:r?.user_id || state.data.user.id,record_date:v.record_date,raw_text:nullable(v.raw_text),start_time:nullable(v.start_time),end_time:nullable(v.end_time),exercise_intent:v.exercise_intent,fixed_arrangements:nullable(v.fixed_arrangements),meal_conditions:nullable(v.meal_conditions),constraints:nullable(v.constraints),is_shared:checked(form,'is_shared'),...(r ? {expected_updated_at:r.updated_at} : {})},r?.id || null)
      if (started !== generation) return
      state.scheduleDate = v.record_date; await reload(started); return
    }
    if (kind === 'weight') {
      const r = state.edit?.type === 'weight' ? state.edit.row : null
      if (r && r.user_id !== state.data.user.id && v.record_date !== r.record_date) throw new Error('invalid-date')
      if (v.measured_at && v.measured_at.slice(0,10) !== v.record_date) throw new Error('measured-date')
      await api.saveWeight({user_id:r?.user_id || state.data.user.id,record_date:v.record_date,measured_at:v.measured_at ? localDateTimeToInstant(v.measured_at) : null,weight_kg:Number(v.weight_kg),waist_cm:numberOrNull(v.waist_cm),notes:nullable(v.notes),is_shared:checked(form,'is_shared'),...(r ? {expected_updated_at:r.updated_at} : {})},r?.id || null)
      await reload(started); return
    }
    if (kind === 'danger') { if (state.danger === 'leave') await api.leaveSpace(); else await api.eraseOwnHealthData(); if (started !== generation) return; state.danger = null; state.profileDraft = null; await reload(started); return }
  }, ({signin:'登录成功',settings:'共享设置已保存',profile:'档案已保存',schedule:'日程已保存',weight:'体重已保存',danger:'操作已完成'})[kind] || '')
}
function exportJson(data) {
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'})
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = `我的健康数据-${date()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000)
}
async function act(el) {
  const action = el.dataset.action
  if (action === 'page') { state.page = el.dataset.page; state.edit = null; state.notice = ''; render(); scrollTo(0,0); return }
  if (action === 'scope') { state.scope = el.dataset.scope; render(); return }
  if (action === 'cancel-edit') { state.edit = null; render(); return }
  if (action === 'cancel-danger') { state.danger = null; render(); return }
  if (action.startsWith('danger-')) { state.danger = action.slice(7); render(); return }
  if (action === 'edit-schedule' || action === 'edit-weight') {
    const type = action.slice(5), row = state.data[type === 'schedule' ? 'schedules' : 'weights'].find(r => r.id === el.dataset.id)
    if (!row || !canEdit(row,type)) return setNotice('你没有修改这条记录的权限。',true)
    state.edit = {type,row}; state.page = type; render(); document.querySelector(`[data-form="${type}"]`)?.scrollIntoView(); return
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
  if (event.target.id === 'schedule-date') { state.scheduleDate = event.target.value; state.edit = null; render(); return }
  if (event.target.id !== 'profile-import' || !event.target.files?.[0]) return
  const file = event.target.files[0]
  const started = generation
  try {
    if (file.size > 1024 * 1024) throw new Error('large-file')
    const parsed = JSON.parse(await file.text())
    if (started !== generation) return
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid-file')
    const keys = ['sex','age','height_cm','baseline_weight_kg','baseline_date','target_weight_kg','target_date','preferences','health_notes']
    const picked = Object.fromEntries(keys.filter(key => Object.hasOwn(parsed,key)).map(key => [key,parsed[key]]))
    if (!Object.keys(picked).length) throw new Error('invalid-file')
    for (const key of ['age','height_cm','baseline_weight_kg','target_weight_kg']) if (picked[key] != null && (typeof picked[key] !== 'number' || !Number.isFinite(picked[key]))) throw new Error('invalid-file')
    for (const key of ['sex','baseline_date','target_date','preferences','health_notes']) if (picked[key] != null && typeof picked[key] !== 'string') throw new Error('invalid-file')
    if (picked.sex != null && !['female','male','other',''].includes(picked.sex)) throw new Error('invalid-file')
    for (const key of ['baseline_date','target_date']) if (picked[key] && !validDate(picked[key])) throw new Error('invalid-file')
    state.profileDraft = {...state.data.profile,...picked,is_shared:state.data.profile?.is_shared || false}
    state.notice = '档案内容已填入表单。请逐项核对，点击“保存档案”后才会写入当前账号。'; state.error = false; render()
  } catch { if (started !== generation) return; state.notice = '无法读取该档案文件。请选择本人档案 JSON，并检查字段格式。'; state.error = true; render() }
})

async function initialize() {
  if (location.hash || new URLSearchParams(location.search).has('code')) history.replaceState(null, '', location.pathname)
  if (!configured) { state.loading = false; render(); return }
  api.onAuthChange((session,event) => {
    setTimeout(async () => {
      let current
      try { current = await api.session() }
      catch (error) { clearSensitive(); state.notice = errorText(error); state.error = true; render(); return }
      if (current?.access_token !== session?.access_token) return
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

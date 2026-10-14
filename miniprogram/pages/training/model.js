const atMs = value => {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (!Number.isFinite(time)) throw new Error('时间无效')
  return time
}
const iso = value => new Date(atMs(value)).toISOString()
const fail = message => { throw new Error(message) }

function elapsedSeconds(session, now = Date.now()) {
  const data = session.data || session
  const base = Number(data.elapsed_seconds || 0)
  const extra = data.status === 'active' && data.active_since
    ? Math.max(0, atMs(now) - atMs(data.active_since)) / 1000 : 0
  return Math.max(0, Math.floor(base + extra))
}

function restSeconds(session, now = Date.now()) {
  const data = session.data || session
  if (data.status === 'paused') return Math.max(0, Number(data.rest_remaining_seconds || 0))
  return data.rest_until ? Math.max(0, Math.ceil((atMs(data.rest_until) - atMs(now)) / 1000)) : 0
}

function startPayload(plan, now = Date.now()) {
  if (!plan || plan.is_stale || plan.content?.training?.mode !== 'workout' || !plan.is_current)
    fail('请先核对今天的训练计划')
  const started = iso(now)
  return {data:{plan_id:plan.id,status:'active',started_at:started,active_since:started,
    rest_until:null,rest_remaining_seconds:0,ended_at:null,elapsed_seconds:0,stop_reason:null,sets:[]},
    status:'active',is_shared:false}
}

function transitionPayload(session, action, now = Date.now(), stopReason = '') {
  const data = session?.data
  if (!data || !['active','paused'].includes(data.status)) fail('训练状态已变化，请刷新')
  const status = {pause:'paused',resume:'active',finish:'completed',stop:'stopped'}[action]
  if (!status || action === 'pause' && data.status !== 'active' || action === 'resume' && data.status !== 'paused')
    fail('训练状态已变化，请刷新')
  if (status === 'stopped' && !String(stopReason).trim()) fail('请填写停止原因')
  const time = atMs(now), remaining = restSeconds(session,time)
  const next = {...data,status,elapsed_seconds:elapsedSeconds(session,time),
    active_since:status === 'active' ? iso(time) : null,
    rest_until:status === 'active' && remaining ? iso(time+remaining*1000) : null,
    rest_remaining_seconds:status === 'paused' ? remaining : 0,
    ended_at:['completed','stopped'].includes(status) ? iso(time) : null}
  if (status === 'stopped') next.stop_reason=String(stopReason).trim()
  return {data:next,status,is_shared:session.is_shared,expected_updated_at:session.updated_at}
}

const optionalNumber = (value,min,max) => {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) fail('训练数值无效')
  return number
}

function setPayload(session, plan, input, now = Date.now()) {
  const data = session?.data
  if (!data || data.status !== 'active' || !plan || plan.id !== data.plan_id)
    fail('训练或计划已变化，请刷新')
  const items = plan.content?.training?.items || []
  const index = items.findIndex(item => item.exercise_id === input.exercise_id)
  if (index < 0) fail('动作不在本次计划内')
  const item = items[index]
  const setIndex = (data.sets || []).filter(set => set.exercise_id === item.exercise_id).length+1
  if (setIndex > item.sets) fail('这个动作的计划组数已记录完')
  const skipped = input.skipped === true
  if (!skipped && (input.reps === '' || input.reps === null || input.reps === undefined)) fail('请填写实际次数')
  const reps = skipped ? 0 : Number(input.reps)
  if (!Number.isInteger(reps) || reps < 0 || reps > 999) fail('实际次数无效')
  const time = atMs(now)
  const rest = Number(setIndex < item.sets ? item.rest_seconds : items[index+1] ? item.transition_seconds : 0)
  const next = {...data,elapsed_seconds:elapsedSeconds(session,time),active_since:iso(time),
    rest_until:rest>0 ? iso(time+rest*1000) : null,rest_remaining_seconds:0,
    sets:[...(data.sets || []),{exercise_id:item.exercise_id,set_index:setIndex,reps,
      load_kg:skipped ? null : optionalNumber(input.load_kg,0,1000),
      rpe:skipped ? null : optionalNumber(input.rpe,0,10),
      pain_note:String(input.pain_note || '').trim() || null,stop_reason:null,skipped,completed_at:iso(time)}]}
  return {data:next,status:'active',is_shared:session.is_shared,expected_updated_at:session.updated_at}
}

module.exports={elapsedSeconds,restSeconds,startPayload,transitionPayload,setPayload}

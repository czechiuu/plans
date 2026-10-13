import { exerciseById, exercises } from './exercises.js'

const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max
const text = (value, max) => typeof value === 'string' && value.length <= max
const time = (value) => value === null || (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value))
const keys = (value, allowed) => Object.keys(value).every(key => allowed.includes(key))
const planItemKeys = ['exercise_id','sets','reps','work_seconds','rest_seconds','transition_seconds','first_use_check','short_option']

export function validatePlan(content, { automatic = false } = {}) {
  if (!content || typeof content !== 'object' || Array.isArray(content) ||
    !keys(content, ['summary','meals','training','warnings']) || !text(content.summary, 1000) ||
    !Array.isArray(content.meals) || content.meals.length > 8 ||
    !Array.isArray(content.warnings) || content.warnings.length > 20 ||
    !content.warnings.every(item => text(item, 300))) return false
  for (const meal of content.meals) {
    if (!meal || typeof meal !== 'object' || Array.isArray(meal) ||
      !keys(meal, ['time','title','foods','prep_method','purchase_or_prep','alternative','notes','snack_reason']) ||
      !time(meal.time) || !text(meal.title, 200) || !Array.isArray(meal.foods) || meal.foods.length > 15 ||
      !meal.foods.every(food => food && text(food.name, 200) && text(food.portion, 100) && text(food.unit, 60)) ||
      !['prep_method','purchase_or_prep','alternative','notes'].every(k => text(meal[k], 500)) ||
      !(meal.snack_reason === null || text(meal.snack_reason, 300))) return false
  }
  const t = content.training
  if (!t || typeof t !== 'object' || Array.isArray(t) ||
    !keys(t, ['mode','purpose','time','intensity','equipment','muscles','warmup','items','cooldown','total_seconds']) ||
    !['rest','workout'].includes(t.mode) || !text(t.purpose, 300) || !time(t.time) ||
    !text(t.intensity, 100) || !text(t.equipment, 150) || !Array.isArray(t.muscles) ||
    !t.muscles.every(x => text(x, 80)) || !Array.isArray(t.items) || t.items.length > 3 ||
    !Array.isArray(t.warmup) || t.warmup.length > 8 || !Array.isArray(t.cooldown) || t.cooldown.length > 8 ||
    !integer(t.total_seconds, 0, 999999)) return false
  let seconds = 0
  for (const step of [...t.warmup, ...t.cooldown]) {
    if (!step || !text(step.description, 300) || !integer(step.seconds, 0, 9999)) return false
    seconds += step.seconds
  }
  for (const item of t.items) {
    if (!item || typeof item !== 'object' || !keys(item, planItemKeys) ||
      !exerciseById.has(item.exercise_id) ||
      (automatic && exerciseById.get(item.exercise_id)?.demo?.verificationStatus !== 'verified') ||
      !integer(item.sets, 1, 2) || !integer(item.reps, 0, 999) ||
      !integer(item.work_seconds, 1, 120) || !integer(item.rest_seconds, item.sets>1?30:0, 9999) ||
      !integer(item.transition_seconds, 0, 9999) || !text(item.first_use_check, 300) ||
      !text(item.short_option, 300)) return false
    seconds += item.sets * item.work_seconds + (item.sets - 1) * item.rest_seconds + item.transition_seconds
  }
  return (t.mode !== 'rest' || (t.items.length === 0 && seconds===0)) &&
    (t.mode !== 'workout' || (t.items.length>=1 && seconds<=3600)) && seconds === t.total_seconds
}

export function buildRulePlan({ date, rules, schedule, recentTraining = [], existingPlans = [],
  historyComplete = false, trainingHistoryConfirmedAt = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('INVALID_DATE')
  const day = new Date(`${date}T12:00:00Z`).getUTCDay() || 7
  const freeDay=rules?.confirmed && rules.free_weekdays?.includes(day)
  const menuFree=freeDay && rules.free_day_meal_unrestricted
  if (!menuFree && (!Array.isArray(rules?.meal_template) || rules.meal_template.length !== 3))
    throw new Error('MEAL_TEMPLATE_UNCONFIRMED')
  const meals=menuFree?[]:structuredClone(rules.meal_template)
  const warnings = []
  const rest = (reason,summary='休息与记录日') => ({
    summary, meals, warnings: [reason, menuFree?'此自由日不提供菜单。':'餐食沿用本人确认的模板，食用情况仍需记录。'],
    training: { mode: 'rest', purpose: reason, time: null, intensity: '无训练', equipment: '无', muscles: [],
      warmup: [], items: [], cooldown: [], total_seconds: 0 },
  })
  if (freeDay && rules.free_day_training_forbidden)
    return { content: rest('本人设定此日不训练。'), reason: 'FREE_DAY' }
  if (!rules?.confirmed || rules.equipment === 'unknown' ||
    ['unknown','recovery_unknown'].includes(rules.ankle_status))
    return { content: rest('训练条件尚未由本人确认。'), reason: 'RULES_UNCONFIRMED' }
  const targetEnd=Date.parse(`${date}T16:00:00Z`)
  if (!historyComplete || !rules.training_history_complete || !trainingHistoryConfirmedAt ||
    targetEnd-Date.parse(trainingHistoryConfirmedAt)>48*3600_000)
    return { content: rest('近 48 小时训练史不完整，先休息并确认。'), reason: 'HISTORY_INCOMPLETE' }
  if (schedule?.exercise_intent === 'no' || schedule?.confirmed_data?.exercise?.intent === 'no')
    return { content: rest('本人日程明确不训练。'), reason: 'SCHEDULE_NO_TRAINING' }
  if (schedule?.confirmed_data?.exercise?.intent === 'yes' && schedule?.confirmed_data?.exercise?.duration_minutes)
    return { content: rest('日程已有固定运动安排，避免重复训练。','按已确认固定运动安排，不追加力量训练。'), reason: 'FIXED_EXERCISE' }
  if (schedule?.confirmed_data?.pain || schedule?.confirmed_data?.fatigue === 'high' || schedule?.confirmed_data?.sleep === 'poor')
    return { content: rest('当日疼痛、疲劳或睡眠需要先核对。'), reason: 'CONDITION_REVIEW' }
  const start = Date.parse(`${date}T00:00:00+08:00`)
  if (recentTraining.some(x => x.status === 'completed' && Date.parse(x.data?.ended_at) >= start - 48*3600_000))
    return { content: rest('近 48 小时已有训练完成记录。'), reason: 'RECENT_TRAINING' }
  const monday=new Date(`${date}T00:00:00Z`);monday.setUTCDate(monday.getUTCDate()-(day-1))
  const sunday=new Date(monday);sunday.setUTCDate(sunday.getUTCDate()+6)
  const first=monday.toISOString().slice(0,10),last=sunday.toISOString().slice(0,10)
  const trainingDays=new Set([
    ...existingPlans.filter(x=>x.target_date>=first&&x.target_date<=last&&x.target_date!==date&&x.is_current&&x.content?.training?.mode==='workout').map(x=>x.target_date),
    ...recentTraining.filter(x=>x.record_date>=first&&x.record_date<=last&&x.record_date!==date&&x.status==='completed').map(x=>x.record_date),
  ])
  if (Number.isInteger(rules.weekly_strength_limit) && trainingDays.size>=rules.weekly_strength_limit)
    return { content: rest('本周力量训练次数已达到本人确认的上限。'), reason: 'WEEKLY_LIMIT' }
  const gymDays=new Set([
    ...existingPlans.filter(x=>x.target_date>=first&&x.target_date<=last&&x.target_date!==date&&x.is_current&&
      x.content?.training?.items?.some(i=>i.exercise_id?.startsWith('machine_'))).map(x=>x.target_date),
    ...recentTraining.filter(x=>x.record_date>=first&&x.record_date<=last&&x.record_date!==date&&x.status==='completed'&&
      x.data?.sets?.some(i=>i.exercise_id?.startsWith('machine_'))).map(x=>x.record_date),
  ])
  if (rules.equipment==='machines_only' && Number.isInteger(rules.max_gym_visits) && gymDays.size>=rules.max_gym_visits)
    return { content: rest('本周到馆次数已达到本人确认的上限。'), reason: 'GYM_LIMIT' }
  const avoidForLimited = new Set(['machine_leg_press','machine_seated_leg_curl','machine_hip_abduction','dorm_sit_to_stand'])
  const available = exercises.filter(x => x.demo?.verificationStatus === 'verified' &&
    (rules.ankle_status !== 'limited' || !avoidForLimited.has(x.id)) &&
    (rules.equipment === 'machines_only' ? x.id.startsWith('machine_') :
      rules.equipment === 'dorm' ? x.id.startsWith('dorm_') : true))
  if (available.length === 0) throw new Error('NO_VERIFIED_EXERCISE')
  const selected = available.slice(0, 3)
  const items = selected.map(x => ({ exercise_id: x.id, sets: 2, reps: 8, work_seconds: 40,
    rest_seconds: 60, transition_seconds: 90, first_use_check: x.firstUseReminder,
    short_option: '时间不足时做 1 组，并记录实际完成情况。' }))
  const warmup = [{ description: '低强度活动并检查当日状态', seconds: 300 }]
  const cooldown = [{ description: '放慢动作，记录感受', seconds: 180 }]
  const total_seconds = 480 + items.reduce((n,x)=>n+x.sets*x.work_seconds+(x.sets-1)*x.rest_seconds+x.transition_seconds,0)
  if (rules.max_session_minutes && total_seconds > rules.max_session_minutes*60)
    return { content: rest('本人确认的单次时长上限不足以安排此训练。'), reason: 'SESSION_LIMIT' }
  if (rules.exercise_minutes && total_seconds > rules.exercise_minutes*60)
    return { content: rest('本人确认的训练时长不足以安排此训练。'), reason: 'DURATION_LIMIT' }
  const content = { summary: '按本人已确认的训练规则与餐食模板安排。', meals, warnings,
    training: { mode:'workout', purpose:'基础力量练习', time:null, intensity:'轻至中等，每组约保留 3 次余力；不适即停止',
      equipment:rules.equipment, muscles:[...new Set(selected.flatMap(x=>x.muscles))], warmup,items,cooldown,total_seconds } }
  if (!validatePlan(content, {automatic:true})) throw new Error('INVALID_GENERATED_PLAN')
  return { content, reason: null }
}

export function maxCostCents({inputTokens,outputTokens,inputUsdPerMillion,outputUsdPerMillion}) {
  for (const value of [inputTokens,outputTokens,inputUsdPerMillion,outputUsdPerMillion])
    if (!Number.isFinite(value) || value < 0) throw new Error('INVALID_PRICE')
  return Math.ceil((inputTokens*inputUsdPerMillion+outputTokens*outputUsdPerMillion)/10000)
}

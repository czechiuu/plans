import { exerciseById, exercises } from './exercises.js'

const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max
const text = (value, max) => typeof value === 'string' && value.length <= max
const time = (value) => value === null || (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value))
const keys = (value, allowed) => Object.keys(value).every(key => allowed.includes(key))
const planItemKeys = ['exercise_id','sets','reps','work_seconds','rest_seconds','transition_seconds','first_use_check','short_option']
export const strengthScheduleTypes=['力量训练','健身','器械力量训练','器械训练','strength','strength_training','gym']
const sundayPrep='周日准备工作日5份午餐：采购主食约5–10拳、鱼禽瘦肉或豆制品约5掌、蔬菜约5–10拳；库存未知，先核对再购买。按5个单餐盒分装；周一、周二份冷藏，周三至周五份备好后及时冷冻。'

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
  historyComplete = false, trainingHistoryConfirmedAt = null, slot = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('INVALID_DATE')
  const day = new Date(`${date}T12:00:00Z`).getUTCDay() || 7
  const freeDay=(slot==='w' && day===2) || (rules?.confirmed && rules.free_weekdays?.includes(day))
  const menuFree=rules?.confirmed && rules.free_weekdays?.includes(day) && rules.free_day_meal_unrestricted
  const hasTemplate=Array.isArray(rules?.meal_template) && rules.meal_template.length===3
  const meals=menuFree?[]:hasTemplate?structuredClone(rules.meal_template):suggestedMeals()
  const warnings = hasTemplate?[]:['未确认个人餐食模板：以下是一般成人均衡饮食示例，份量为待核对建议；过敏、疾病、食量与库存均未知，不代表个人处方。']
  if(slot==='me'&&day===7&&!menuFree){
    const lunch=meals.find(x=>x.title==='午餐')??meals[1]
    lunch.purchase_or_prep=sundayPrep
    lunch.prep_method='熟食用浅盒分装，做好后2小时内冷藏或冷冻；冷藏不高于4°C、冷冻不高于−18°C。运输保冷，每次只取一盒，复热中心至少74°C；不让5份全放冷藏5天。'
    warnings.push('五份备餐是待执行建议，未记为完成；如有已确认的过敏或饮食限制，应替换相应食材。')
  }
  const rest = (reason,summary='休息与记录日') => ({
    summary, meals, warnings: [...warnings,reason, menuFree?'此自由日自由选择餐食，次日正常饮食，不补偿。':'保持规律三餐；漏记不等于没吃，饿时可按需要加餐。'],
    training: { mode: 'rest', purpose: reason, time: null, intensity: '无训练', equipment: '无', muscles: [],
      warmup: [], items: [], cooldown: [], total_seconds: 0 },
  })
  if (freeDay && (slot==='w' || rules?.free_day_training_forbidden))
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
  const plannedExercise=schedule?.confirmed_data?.exercise
  const exerciseRequested=plannedExercise?.intent==='yes'||schedule?.exercise_intent==='yes'
  if(exerciseRequested&&!strengthScheduleTypes.includes(plannedExercise?.type))
    return { content: rest(plannedExercise?.type==='羽毛球'?'按已确认的羽毛球安排，不叠加力量训练。':'已确认运动类型不是明确力量训练，先核对类型，不自动叠加。'), reason:'FIXED_EXERCISE' }
  const plannedStart=plannedExercise?.explicit_start_time??null,plannedEnd=plannedExercise?.explicit_end_time??null
  const timeSeconds=x=>Number(x.slice(0,2))*3600+Number(x.slice(3))*60
  if((plannedStart!==null&&!time(plannedStart))||(plannedEnd!==null&&!time(plannedEnd))||
    (plannedEnd!==null&&(plannedStart===null||timeSeconds(plannedEnd)<=timeSeconds(plannedStart))))
    return {content:rest('已确认时段不完整或跨日，需要本人核对。'),reason:'SCHEDULE_TIME_UNCLEAR'}
  const limits=[3600,...[rules.max_session_minutes,rules.exercise_minutes,plannedExercise?.duration_minutes]
    .filter(x=>Number.isInteger(x)&&x>=0).map(x=>x*60)]
  if(plannedEnd!==null) limits.push(timeSeconds(plannedEnd)-timeSeconds(plannedStart))
  const durationLimit=Math.min(...limits)
  if (schedule?.confirmed_data?.pain || schedule?.confirmed_data?.fatigue === 'high' || schedule?.confirmed_data?.sleep === 'poor')
    return { content: rest('当日疼痛、疲劳或睡眠需要先核对。'), reason: 'CONDITION_REVIEW' }
  const start = Date.parse(`${date}T00:00:00+08:00`)
  const performed=x=>x.status==='completed'||x.status==='stopped'&&
    (x.data?.duration_seconds>0||x.data?.elapsed_seconds>0||x.data?.sets?.some(s=>s.completed_at))
  const strength=x=>!x.data?.activity_type||x.data.activity_type==='strength'
    const recoveryEnd=x=>{
      if(x.data?.ended_at)return Date.parse(x.data.ended_at)
      // A confirmed date gives an upper bound, not an invented actual end time.
      if(x.data?.activity_type&&/^\d{4}-\d{2}-\d{2}$/.test(x.data?.record_date??''))
        return Date.parse(`${x.data.record_date}T00:00:00+08:00`)+24*3600_000
      return NaN
    }
    if(recentTraining.some(x=>performed(x)&&!Number.isFinite(recoveryEnd(x))))
    return {content:rest('已发生的运动缺少结束时刻，先核对恢复间隔。'),reason:'HISTORY_INCOMPLETE'}
    if (recentTraining.some(x => performed(x) && recoveryEnd(x) >= start - 48*3600_000))
    return { content: rest('近 48 小时已有训练完成记录。'), reason: 'RECENT_TRAINING' }
  const monday=new Date(`${date}T00:00:00Z`);monday.setUTCDate(monday.getUTCDate()-(day-1))
  const sunday=new Date(monday);sunday.setUTCDate(sunday.getUTCDate()+6)
  const first=monday.toISOString().slice(0,10),last=sunday.toISOString().slice(0,10)
  const trainingDays=new Set([
    ...existingPlans.filter(x=>x.target_date>=first&&x.target_date<=last&&x.target_date!==date&&x.is_current&&x.content?.training?.mode==='workout').map(x=>x.target_date),
    ...recentTraining.filter(x=>x.record_date>=first&&x.record_date<=last&&x.record_date!==date&&performed(x)&&strength(x)).map(x=>x.record_date),
  ])
  if (trainingDays.size>=Math.min(rules.weekly_strength_limit??2,2))
    return { content: rest('本周力量训练次数已达到本人确认的上限。'), reason: 'WEEKLY_LIMIT' }
  const gymDays=new Set([
    ...existingPlans.filter(x=>x.target_date>=first&&x.target_date<=last&&x.target_date!==date&&x.is_current&&
      x.content?.training?.items?.some(i=>i.exercise_id?.startsWith('machine_'))).map(x=>x.target_date),
    ...recentTraining.filter(x=>x.record_date>=first&&x.record_date<=last&&x.record_date!==date&&performed(x)&&strength(x)&&
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
  const shortSession=durationLimit<1200
  const selected = available.slice(0,shortSession?2:3)
  const items = selected.map(x => ({ exercise_id: x.id, sets:shortSession?1:2, reps: 8, work_seconds: 40,
    rest_seconds:60,transition_seconds:shortSession?60:90,first_use_check: x.firstUseReminder,
    short_option: '时间不足时做 1 组，并记录实际完成情况。' }))
  const warmupSeconds=shortSession?180:300,cooldownSeconds=shortSession?120:180
  const warmup = [{ description: `${selected[0].name}：1组8次，最低可控阻力，轻松强度；动作40秒、休息60秒，其余${warmupSeconds-100}秒核对器械和状态。`, seconds:warmupSeconds }]
  const cooldown = [{ description:`坐姿安静恢复1组${cooldownSeconds}秒，自然呼吸、无负重；无重复次数、无额外组间休息；记录疼痛与疲劳。`,seconds:cooldownSeconds }]
  const total_seconds = warmupSeconds+cooldownSeconds+items.reduce((n,x)=>n+x.sets*x.work_seconds+(x.sets-1)*x.rest_seconds+x.transition_seconds,0)
  if(total_seconds>durationLimit)
    return {content:rest('已确认时段或时长不足以完成保守短版力量练习；不延长本人安排。'),reason:'DURATION_LIMIT'}
  const content = { summary: '按已确认的训练条件安排；饮食未确认部分明确标为建议。', meals, warnings,
    training: { mode:'workout', purpose:'基础力量练习', time:plannedStart, intensity:'轻至中等，每组约保留 3 次余力；不适即停止',
      equipment:rules.equipment, muscles:[...new Set(selected.flatMap(x=>x.muscles))], warmup,items,cooldown,total_seconds } }
  if (!validatePlan(content, {automatic:true})) throw new Error('INVALID_GENERATED_PLAN')
  return { content, reason: null }
}

export function suggestedMeals(){
  return ['早餐','午餐','晚餐'].map((title,index)=>({time:null,title,foods:index===0?[
    {name:'燕麦或全麦面包',portion:'1–2拳（按饥饿程度核对）',unit:'建议份量'},
    {name:'鸡蛋与牛奶或无糖豆浆',portion:'鸡蛋1个、饮品1杯（约250毫升）',unit:'建议份量'},
    {name:'水果',portion:'1拳',unit:'建议份量'}]:[
    {name:'米饭或其他主食',portion:'1–2拳',unit:'建议份量'},
    {name:'鱼、禽、瘦肉或豆制品',portion:'1掌',unit:'建议份量'},
    {name:'蔬菜',portion:'1–2拳',unit:'建议份量'}],
    prep_method:'食堂选主食、蛋白质和蔬菜；外卖酱汁单放，保留正常主食；也可自行备餐。',
    purchase_or_prep:'库存与食物可用性未知，按实际购买；熟食及时冷藏、运输保冷、食用前彻底加热。',
    alternative:'同类主食、蛋白质和蔬果替换；乳制品不耐受时选本人耐受的无糖豆浆。',
    notes:'一般均衡示例，按饥饿、饱腹及已确认限制核对份量；正常用油，不跳餐、不以运动抵消饮食。两餐间饿或运动后可加无糖酸奶约150克或水果1份。',
    snack_reason:null}))
}

export function validateGeneratedPlan(content,baseline){
  const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x
  if(!validatePlan(content,{automatic:true}) || JSON.stringify(canonical(content.training))!==JSON.stringify(canonical(baseline.training))) return false
  if(baseline.meals.length===0) return content.meals.length===0
  if(baseline.meals.some(m=>m.time!==null&&!content.meals.some(x=>x.title===m.title&&x.time===m.time))) return false
  if(baseline.meals.some(m=>m.purchase_or_prep===sundayPrep&&!content.meals.some(x=>x.title===m.title&&x.purchase_or_prep===m.purchase_or_prep&&x.prep_method===m.prep_method))) return false
  return ['早餐','午餐','晚餐'].every(title=>content.meals.filter(x=>x.title===title&&x.foods.length>0).length===1) &&
    content.meals.every(x=>x.foods.length>0&&x.foods.every(f=>f.name.trim()&&f.portion.trim())&&
      (['早餐','午餐','晚餐'].includes(x.title)||!!x.snack_reason?.trim()))
}

export function maxCostCents({inputTokens,outputTokens,inputUsdPerMillion,outputUsdPerMillion}) {
  for (const value of [inputTokens,outputTokens,inputUsdPerMillion,outputUsdPerMillion])
    if (!Number.isFinite(value) || value < 0) throw new Error('INVALID_PRICE')
  return Math.ceil((inputTokens*inputUsdPerMillion+outputTokens*outputUsdPerMillion)/10000)
}

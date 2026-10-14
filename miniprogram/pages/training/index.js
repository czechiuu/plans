const {baseData,refresh,perform,api,openSettings,errorText} = require('../../lib/page')
const {exercises,exerciseById} = require('../../lib/shared')
const {today} = require('../../lib/dates')
const pending = require('../../lib/pending')
const {elapsedSeconds,restSeconds,startPayload,transitionPayload,setPayload} = require('./model')

const own = (rows,userId) => (rows || []).filter(row => row.user_id === userId)
const currentPlan = (rows,day) => [...rows].filter(row => row.target_date === day && row.is_current)
  .sort((a,b) => b.version-a.version)[0] || null
const activeSession = rows => [...rows].filter(row => ['active','paused'].includes(row.data?.status))
  .sort((a,b) => b.created_at.localeCompare(a.created_at))[0] || null
const secondsText = seconds => `${Math.floor(seconds/60)}分${seconds%60}秒`

Page({
  data:{...baseData,plan:null,sessionPlan:null,training:null,items:[],recommendedItems:[],warmup:[],cooldown:[],catalog:[],session:null,savedSets:[],
    recent:[],elapsed:'0分0秒',rest:'',pendingStart:false,formExercise:0,form:{reps:'',load_kg:'',rpe:'',pain_note:'',skipped:false},stopReason:''},
  onShow(){ refresh(this); this.startClock() },
  onHide(){ this.stopClock() },
  onUnload(){ this.stopClock() },
  receive(data){
    const userId=data.user?.id
    const plans=own(data.daily_plans,userId)
    const plan=currentPlan(plans,today())
    const sessions=own(data.training_sessions,userId).filter(row => !row.data?.activity_type)
    const session=activeSession(sessions)
    const sessionPlan=session ? plans.find(row => row.id === session.data.plan_id) || null : null
    const training=plan?.content?.training || null
    const decorate=item => ({...item,
      name:exerciseById.get(item.exercise_id)?.name || item.exercise_id,
      done:(session?.data?.sets || []).filter(set => set.exercise_id === item.exercise_id).length})
    const recommendedItems=(training?.items || []).map(decorate)
    const items=(sessionPlan?.content?.training?.items || []).map(decorate)
    const savedSets=(session?.data?.sets || []).map(set=>({
      key:`${set.exercise_id}-${set.set_index}`,name:exerciseById.get(set.exercise_id)?.name || set.exercise_id,
      set_index:set.set_index,skipped:set.skipped,reps:set.reps,
      load:set.load_kg == null ? '' : `${set.load_kg} kg`,rpe:set.rpe == null ? '' : `RPE ${set.rpe}`,
      pain:set.pain_note || ''}))
    const selected=new Set(recommendedItems.map(item => item.exercise_id))
    const catalog=exercises.filter(exercise => !selected.has(exercise.id)).map(exercise => ({id:exercise.id,name:exercise.name}))
    const recent=sessions.filter(row => ['completed','stopped'].includes(row.data?.status))
      .sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0,8)
      .map(row => ({id:row.id,date:row.record_date,sets:row.data.sets?.length || 0,
        outcome:row.data.status === 'stopped' ? '因不适停止' : this.outcome(row,plans)}))
    this.setData({plan,sessionPlan,training,items,recommendedItems,catalog,savedSets,warmup:training?.warmup || [],cooldown:training?.cooldown || [],
      session,recent,pendingStart:Boolean(pending.get('training')),
      formExercise:Math.min(this.data.formExercise,Math.max(0,items.length-1))})
    this.tick()
  },
  outcome(row,plans){
    const plan=plans.find(item => item.id === row.data?.plan_id)
    const expected=(plan?.content?.training?.items || []).reduce((sum,item) => sum+Number(item.sets || 0),0)
    const actual=(row.data?.sets || []).filter(set => !set.skipped).length
    return expected && actual<expected ? '部分完成' : '已完成'
  },
  startClock(){ this.stopClock(); this.clock=setInterval(() => this.tick(),1000) },
  stopClock(){ if(this.clock) clearInterval(this.clock); this.clock=null },
  tick(){
    const session=this.data.session
    if (!session) return
    const remaining=restSeconds(session)
    this.setData({elapsed:secondsText(elapsedSeconds(session)),
      rest:remaining ? `休息${session.data.status === 'paused' ? '暂停，剩余' : '还剩'}${remaining}秒` : '无休息倒计时'})
  },
  settings:openSettings,
  exercise(event){ wx.navigateTo({url:`/pages/exercise/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}`}) },
  selectExercise(event){ this.setData({formExercise:Number(event.detail.value)}) },
  formInput(event){ this.setData({[`form.${event.currentTarget.dataset.key}`]:event.detail.value}) },
  skipChange(event){ this.setData({'form.skipped':event.detail.value}) },
  stopInput(event){ this.setData({stopReason:event.detail.value}) },
  async start(){
    const result=await perform(this,async () => {
      const payload=pending.get('training') || await pending.reserve('training',startPayload(this.data.plan))
      return api().saveTrainingSession(payload)
    },'训练已开始')
    if(result.ok) pending.clear('training')
    this.setData({pendingStart:Boolean(pending.get('training'))})
  },
  async saveSet(){
    const item=this.data.items[this.data.formExercise]
    if (!item) { this.setData({error:'请先选动作'}); return }
    const result=await perform(this,() => api().saveTrainingSession(
      setPayload(this.data.session,this.data.sessionPlan,{...this.data.form,exercise_id:item.exercise_id}),
      this.data.session.id),'这一组已保存')
    if(result.ok) this.setData({form:{reps:'',load_kg:'',rpe:'',pain_note:'',skipped:false}})
  },
  async change(event){
    const action=event.currentTarget.dataset.action
    await perform(this,() => api().saveTrainingSession(
      transitionPayload(this.data.session,action,Date.now(),this.data.stopReason),this.data.session.id),
      action === 'pause' ? '训练已暂停' : action === 'resume' ? '训练已继续' : action === 'stop' ? '已记录因不适停止' : '训练已保存')
  },
  async refreshPage(){ await refresh(this) },
  errorText
})

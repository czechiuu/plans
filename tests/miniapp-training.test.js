import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'

const require=createRequire(import.meta.url)
const {startPayload,transitionPayload,setPayload,elapsedSeconds,restSeconds}=require('../miniprogram/pages/training/model.js')
const {today,addDays}=require('../miniprogram/lib/dates.js')
const {exercises}=require('../miniprogram/lib/shared.js')
const baseTime='2026-10-14T10:00:00.000Z'
const plan={id:'plan-1',is_current:true,is_stale:false,content:{training:{mode:'workout',items:[
  {exercise_id:'machine_seated_row',sets:2,reps:8,rest_seconds:60,transition_seconds:20},
  {exercise_id:'machine_chest_press',sets:1,reps:8,rest_seconds:0,transition_seconds:0}]}}}
const session=(data,updated_at='2026-10-14T10:00:00.000Z')=>({id:'session-1',data,is_shared:false,updated_at})

test('训练开始只接受当前且未过期的今日正式计划',()=>{
  const payload=startPayload(plan,baseTime)
  assert.equal(payload.data.active_since,baseTime)
  assert.deepEqual(payload.data.sets,[])
  assert.throws(()=>startPayload({...plan,is_stale:true},baseTime))
  assert.throws(()=>startPayload({...plan,is_current:false},baseTime))
})

test('实际一组记录、组间休息和换动作休息按计划保存',()=>{
  const first=session(startPayload(plan,baseTime).data)
  const one=setPayload(first,plan,{exercise_id:'machine_seated_row',reps:7,load_kg:'20',rpe:'6'},'2026-10-14T10:00:30.000Z')
  assert.equal(one.data.elapsed_seconds,30)
  assert.equal(one.data.sets[0].reps,7)
  assert.equal(one.data.sets[0].load_kg,20)
  assert.equal(one.data.rest_until,'2026-10-14T10:01:30.000Z')
  assert.equal(one.expected_updated_at,first.updated_at)
  assert.throws(()=>setPayload(first,plan,{exercise_id:'machine_seated_row',reps:''},'2026-10-14T10:00:30.000Z'))
  const two=setPayload(session(one.data),plan,{exercise_id:'machine_seated_row',skipped:true},'2026-10-14T10:01:30.000Z')
  assert.equal(two.data.sets[1].skipped,true)
  assert.equal(two.data.sets[1].reps,0)
  assert.equal(two.data.rest_until,'2026-10-14T10:01:50.000Z')
  assert.throws(()=>setPayload(session(two.data),plan,{exercise_id:'machine_seated_row',reps:8},'2026-10-14T10:02:00.000Z'))
})

test('暂停保存剩余休息，过了前台时间仍不消耗；继续后恢复倒计时',()=>{
  const active=session({...startPayload(plan,baseTime).data,elapsed_seconds:10,
    rest_until:'2026-10-14T10:01:00.000Z'})
  const paused=transitionPayload(active,'pause','2026-10-14T10:00:20.000Z')
  assert.equal(paused.data.elapsed_seconds,30)
  assert.equal(paused.data.rest_remaining_seconds,40)
  assert.equal(restSeconds(paused.data,'2026-10-14T12:00:00.000Z'),40)
  const resumed=transitionPayload(session(paused.data),'resume','2026-10-14T12:00:00.000Z')
  assert.equal(resumed.data.rest_until,'2026-10-14T12:00:40.000Z')
  assert.equal(elapsedSeconds(resumed.data,'2026-10-14T12:00:10.000Z'),40)
})

test('部分完成和因不适停止都保留实际组，停止原因必填',()=>{
  const started=startPayload(plan,baseTime).data
  const logged=setPayload(session(started),plan,{exercise_id:'machine_seated_row',reps:6,pain_note:'不适'},'2026-10-14T10:00:25.000Z').data
  const finished=transitionPayload(session(logged),'finish','2026-10-14T10:00:30.000Z')
  assert.equal(finished.data.status,'completed')
  assert.equal(finished.data.sets.length,1)
  assert.throws(()=>transitionPayload(session(logged),'stop','2026-10-14T10:00:30.000Z',''))
  const stopped=transitionPayload(session(logged),'stop','2026-10-14T10:00:30.000Z','肩部不适')
  assert.equal(stopped.data.status,'stopped')
  assert.equal(stopped.data.stop_reason,'肩部不适')
  assert.equal(stopped.data.sets[0].pain_note,'不适')
})

test('训练页只取本人当前计划，并按会话原计划记录组数',()=>{
  const oldPage=globalThis.Page, oldWx=globalThis.wx, oldApp=globalThis.getApp
  let definition
  try {
    globalThis.Page=value=>{definition=value}
    globalThis.wx={getStorageSync:()=>null}
    globalThis.getApp=()=>({api:{session:()=>({user:{id:'mine'}})}})
    require('../miniprogram/pages/training/index.js')
    const page={...definition,data:{...definition.data},setData(change){Object.assign(this.data,change)}}
    const prior={...plan,id:'prior',user_id:'mine',target_date:today(),version:1,is_current:false}
    const latest={...plan,id:'latest',user_id:'mine',target_date:today(),version:2,is_current:true}
    const foreign={...plan,id:'foreign',user_id:'other',target_date:today(),version:99,is_current:true}
    const run=session({...startPayload(plan,baseTime).data,plan_id:'prior'})
    Object.assign(run,{user_id:'mine',created_at:baseTime})
    page.receive({user:{id:'mine'},daily_plans:[foreign,prior,latest],training_sessions:[run]})
    assert.equal(page.data.plan.id,'latest')
    assert.equal(page.data.sessionPlan.id,'prior')
    assert.equal(page.data.items[0].exercise_id,'machine_seated_row')
    assert.equal(page.data.recommendedItems[0].exercise_id,'machine_seated_row')
  } finally {
    globalThis.Page=oldPage; globalThis.wx=oldWx; globalThis.getApp=oldApp
  }
})

test('趋势缺失日期不补零，本人训练按两段七天区间统计并保留停止前完成组',()=>{
  const oldPage=globalThis.Page
  let definition
  try {
    globalThis.Page=value=>{definition=value}
    require('../miniprogram/pages/trends/index.js')
    const page={...definition,data:{...definition.data},setData(change){Object.assign(this.data,change)}}
    const day=today()
    page.receive({user:{id:'mine'},weights:[
      {id:'w1',user_id:'mine',record_date:day,weight_kg:70},
      {id:'w2',user_id:'other',record_date:day,weight_kg:90}],training_sessions:[
      {user_id:'mine',record_date:day,data:{status:'completed',sets:[{exercise_id:'machine_seated_row',skipped:false,reps:8,completed_at:baseTime}]}},
      {user_id:'mine',record_date:day,data:{status:'stopped',sets:[{exercise_id:'machine_seated_row',skipped:false,reps:5,completed_at:baseTime},{skipped:true,completed_at:baseTime}]}},
      {user_id:'mine',record_date:day,data:{status:'completed',activity_type:'badminton',duration_seconds:1800}},
      {user_id:'mine',record_date:addDays(day,-7),data:{status:'completed',activity_type:'badminton',duration_seconds:1200}},
      {user_id:'mine',record_date:addDays(day,-14),data:{status:'completed',activity_type:'badminton',duration_seconds:600}},
      {user_id:'other',record_date:day,data:{status:'completed',activity_type:'badminton',duration_seconds:9000}}]})
    assert.equal(page.data.weightDays,1)
    assert.equal(page.data.average,'70.0 kg（1 条）')
    assert.equal(page.data.previousAverage,'暂无数据')
    assert.equal(page.data.strengthCount,1)
    assert.equal(page.data.badmintonCount,3)
    assert.equal(page.data.badmintonMinutes,60)
    assert.equal(page.data.setsCount,2)
    assert.deepEqual(page.data.trainingWeeks,[
      {label:'最近 7 天',from:addDays(day,-6),to:day,strengthCount:1,badmintonCount:1,badmintonMinutes:30,otherCount:0,stoppedCount:1,setsCount:2},
      {label:'前 7 天',from:addDays(day,-13),to:addDays(day,-7),strengthCount:0,badmintonCount:1,badmintonMinutes:20,otherCount:0,stoppedCount:0,setsCount:0}])
  } finally {globalThis.Page=oldPage}
})

test('动作页三项 GIF 按需加载，八项仅保留原视频来源',()=>{
  assert.equal(exercises.filter(item=>item.demo.mediaType==='external_gif').length,3)
  assert.equal(exercises.filter(item=>item.demo.mediaType==='source_video').length,8)
  const oldPage=globalThis.Page
  const oldApp=globalThis.getApp
  let definition
  try {
    globalThis.Page=value=>{definition=value}
    globalThis.getApp=()=>({globalData:{offline:false}})
    require('../miniprogram/pages/exercise/index.js')
    const page={...definition,data:{...definition.data},setData(change){Object.assign(this.data,change)}}
    page.onLoad({id:'machine_seated_row'})
    assert.equal(page.data.mediaState,'closed')
    assert.match(page.data.exercise.demo.gifUrl,/7I6LNUG\.gif$/)
    page.showMedia(); assert.equal(page.data.mediaState,'loading')
    const event=()=>({currentTarget:{dataset:{attempt:page.data.mediaAttempt}},detail:{width:360,height:360}})
    page.mediaFailed(event()); assert.equal(page.data.mediaState,'error')
    page.showMedia(); page.mediaLoaded(event()); assert.equal(page.data.mediaState,'loaded')
    page.showMedia();const late=event()
    page.closeMedia(); assert.equal(page.data.mediaState,'closed')
    page.mediaLoaded(late); assert.equal(page.data.mediaState,'closed')
    page.showMedia(); const empty=event();empty.detail.width=0
    page.mediaLoaded(empty);assert.equal(page.data.mediaState,'error')
    assert.equal(page.data.exercise.demo.gifSource,'https://ascendapi.com/')
  } finally {globalThis.Page=oldPage;globalThis.getApp=oldApp}
})

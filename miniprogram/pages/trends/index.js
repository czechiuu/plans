const {baseData,refresh,openSettings,openWeight} = require('../../lib/page')
const {exerciseById} = require('../../lib/shared')
const {today,addDays,sevenDayAverage} = require('../../lib/dates')

Page({
  data:{...baseData,weightDays:0,average:'—',previousAverage:'—',waist:'—',waistDate:'',
    weights:[],strengthCount:0,badmintonCount:0,badmintonMinutes:0,otherCount:0,setsCount:0,sets:[],trainingWeeks:[]},
  onShow(){refresh(this)},
  receive(data){
    const owner=data.user?.id, now=today(), start=addDays(now,-6)
    const weights=(data.weights || []).filter(row => row.user_id === owner).sort((a,b) => b.record_date.localeCompare(a.record_date))
    const current=sevenDayAverage(weights,now), previous=sevenDayAverage(weights,addDays(now,-7))
    const weightDays=new Set(weights.filter(row => row.record_date>=start && row.record_date<=now).map(row=>row.record_date)).size
    const latestWaist=weights.find(row=>row.waist_cm!=null)
    const sessions=(data.training_sessions || []).filter(row => row.user_id === owner)
    const completed=sessions.filter(row => row.data?.status === 'completed')
    const strength=completed.filter(row=>!row.data.activity_type || row.data.activity_type==='strength')
    const badminton=completed.filter(row=>row.data.activity_type==='badminton')
    const other=completed.filter(row=>row.data.activity_type==='other')
    const actualStrength=sessions.filter(row=>['completed','stopped'].includes(row.data?.status) && (!row.data.activity_type || row.data.activity_type==='strength'))
    const realSets=actualStrength.flatMap(row=>row.data.sets || []).filter(set=>!set.skipped && set.completed_at)
    const trainingWeeks=[['最近 7 天',now],['前 7 天',addDays(now,-7)]].map(([label,end])=>{
      const from=addDays(end,-6), rows=sessions.filter(row=>row.record_date>=from && row.record_date<=end)
      const finished=rows.filter(row=>row.data?.status==='completed')
      const badmintonRows=finished.filter(row=>row.data.activity_type==='badminton')
      return {label,from,to:end,
        strengthCount:finished.filter(row=>!row.data.activity_type || row.data.activity_type==='strength').length,
        badmintonCount:badmintonRows.length,badmintonMinutes:badmintonRows.reduce((sum,row)=>sum+Number(row.data.duration_seconds || 0),0)/60,
        otherCount:finished.filter(row=>row.data.activity_type==='other').length,
        stoppedCount:rows.filter(row=>row.data?.status==='stopped').length,
        setsCount:actualStrength.filter(row=>row.record_date>=from && row.record_date<=end)
          .flatMap(row=>row.data.sets || []).filter(set=>!set.skipped && set.completed_at).length}
    })
    this.setData({weightDays,average:current.count ? `${current.average.toFixed(1)} kg（${current.count} 条）` : '暂无数据',
      previousAverage:previous.count ? `${previous.average.toFixed(1)} kg（${previous.count} 条）` : '暂无数据',
      waist:latestWaist ? `${latestWaist.waist_cm} cm` : '—',waistDate:latestWaist?.record_date || '',
      weights:weights.slice(0,14),strengthCount:strength.length,badmintonCount:badminton.length,
      badmintonMinutes:badminton.reduce((sum,row)=>sum+Number(row.data.duration_seconds || 0),0)/60,
      otherCount:other.length,setsCount:realSets.length,trainingWeeks,
      sets:realSets.slice(-12).reverse().map(set=>({name:exerciseById.get(set.exercise_id)?.name || set.exercise_id,
        reps:set.reps,load:set.load_kg == null ? '' : `${set.load_kg} kg`,rpe:set.rpe == null ? '' : `RPE ${set.rpe}`}))})
  },
  settings:openSettings,
  weight:openWeight,
  refreshPage(){refresh(this)}
})

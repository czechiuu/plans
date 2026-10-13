import assert from 'node:assert/strict'
import { shanghaiDate } from '../src/domain.js'
import { report, blocked, runCase } from './test-helpers/report.mjs'
import { cloudSetup, client, ok, denied } from './test-helpers/cloud.mjs'

const ids = ['API_ANON','API_ACCOUNTS','API_INVITES','API_ISOLATION','API_PRIVATE','API_SHARE_REVOKE','API_ROW_REVOKE','API_PARTNER_EDIT','API_CRUD_READBACK','API_ERASE','API_LEAVE_REJOIN']
const cases = [], details = []
let setup
try { setup = cloudSetup() } catch (error) { setup = { blocked:true, reason:String(error) } }
if (setup.blocked) {
  process.stderr.write(`云端 API 未运行：${setup.reason}\n`)
  await report('cloud-api', 'real-supabase-api', blocked(ids), [{ id:'CONFIG', error:setup.reason }])
} else {
  const clients = 'ABC'.split('').map(() => client(setup.url, setup.key))
  const users = []
  let cleanAccountsVerified = false
  const day = shanghaiDate()
  const settings = (share, edit=false) => ({ share_profile:share, share_schedule:share, share_weight:share, allow_partner_edit:edit })
  const select = (i,table,columns='*') => ok(clients[i].from(table).select(columns))
  const rpc = (i,name,args={}) => ok(clients[i].rpc(name,args))
  const save = (i,name,payload,id=null) => ok(clients[i].rpc(name,{ p_payload:payload, ...(name==='save_profile' ? {} : {p_id:id}) }).single())
  const scheduleData = (value,shared,stamp) => ({user_id:users[0],record_date:day,raw_text:value,exercise_intent:'unknown',is_shared:shared,...(stamp ? {expected_updated_at:stamp}:{})})
  const weightData = (value,shared,stamp) => ({user_id:users[0],record_date:day,weight_kg:value,is_shared:shared,...(stamp ? {expected_updated_at:stamp}:{})})
  let space, spareInvite, profile, schedule, weight, sharedSchedule
  try {
    await runCase(cases,details,'API_ANON',async()=>{
      const anon=client(setup.url,setup.key)
      await denied(anon.from('members').select('user_id'))
      for(const table of ['health_profiles','schedules','weights']) await denied(anon.from(table).select('id'))
      await denied(anon.rpc('create_space',{p_name:'SYNTHETIC',p_display_name:'SYNTHETIC'}))
    })
    await runCase(cases,details,'API_ACCOUNTS',async()=>{
      for(let i=0;i<3;i++){
        const data=await ok(clients[i].auth.signInWithPassword({email:setup.emails[i],password:setup.passwords[i]}))
        assert.ok(data.user?.id); users.push(data.user.id)
      }
      assert.equal(new Set(users).size,3)
      for(let i=0;i<3;i++) assert.equal((await ok(clients[i].from('members').select('space_id').eq('user_id',users[i]))).length,0,'Use empty dedicated accounts')
      cleanAccountsVerified = true
    })
    await runCase(cases,details,'API_INVITES',async()=>{
      space=await rpc(0,'create_space',{p_name:`SYNTHETIC-${Date.now()}`,p_display_name:'Synthetic A'})
      const invite=(await rpc(0,'create_invite'))[0].token
      spareInvite=(await rpc(0,'create_invite'))[0].token
      assert.equal(invite.length,72)
      await rpc(1,'join_space',{p_token:invite,p_display_name:'Synthetic B',p_settings:settings(false)})
      await denied(clients[2].rpc('join_space',{p_token:invite,p_display_name:'Synthetic C',p_settings:settings(false)}))
      await denied(clients[2].rpc('join_space',{p_token:spareInvite,p_display_name:'Synthetic C',p_settings:settings(false)}))
      await denied(clients[0].rpc('create_invite'))
    })
    await runCase(cases,details,'API_ISOLATION',async()=>{
      const other=await rpc(2,'create_space',{p_name:'SYNTHETIC OTHER',p_display_name:'Synthetic C'})
      assert.notEqual(other,space)
      assert.equal((await select(2,'spaces')).some(row=>row.id===space),false)
      assert.equal((await select(2,'members')).some(row=>row.space_id===space),false)
    })
    await runCase(cases,details,'API_PRIVATE',async()=>{
      profile=await save(0,'save_profile',{age:30,health_notes:'SYNTHETIC ONLY',is_shared:false})
      schedule=await save(0,'save_schedule',scheduleData('SYNTHETIC PRIVATE',false))
      weight=await save(0,'save_weight',weightData(70.1,false))
      for(const [table,row] of [['health_profiles',profile],['schedules',schedule],['weights',weight]]){
        assert.equal((await select(1,table)).length,0); assert.equal((await select(2,table)).length,0)
        await denied(clients[1].from(table).update({is_shared:true}).eq('id',row.id).select())
        assert.equal((await ok(clients[2].from(table).select('id').eq('id',row.id))).length,0)
        await denied(clients[2].from(table).update({is_shared:true}).eq('id',row.id).select())
      }
    })
    await runCase(cases,details,'API_SHARE_REVOKE',async()=>{
      await rpc(0,'save_settings',{p_settings:settings(true)})
      assert.equal((await select(1,'schedules')).length,0)
      profile=await save(0,'save_profile',{age:30,health_notes:'SYNTHETIC SHARED',is_shared:true,expected_updated_at:profile.updated_at})
      sharedSchedule=await save(0,'save_schedule',scheduleData('SYNTHETIC SHARED',true,schedule.updated_at),schedule.id)
      weight=await save(0,'save_weight',weightData(70.2,true,weight.updated_at),weight.id)
      for(const table of ['health_profiles','schedules','weights']) assert.equal((await select(1,table)).length,1)
      for(const [table,row] of [['health_profiles',profile],['schedules',sharedSchedule],['weights',weight]]) assert.equal((await ok(clients[2].from(table).select('id').eq('id',row.id))).length,0)
      await denied(clients[2].rpc('save_schedule',{p_payload:scheduleData('SYNTHETIC C GUESS',true,sharedSchedule.updated_at),p_id:schedule.id}).single())
      await rpc(0,'save_settings',{p_settings:settings(false)})
      for(const table of ['health_profiles','schedules','weights']) assert.equal((await select(1,table)).length,0)
      await rpc(0,'save_settings',{p_settings:settings(true)})
    })
    await runCase(cases,details,'API_ROW_REVOKE',async()=>{
      profile=await save(0,'save_profile',{age:30,health_notes:'SYNTHETIC ROW REVOKED',is_shared:false,expected_updated_at:profile.updated_at})
      sharedSchedule=await save(0,'save_schedule',scheduleData('SYNTHETIC ROW REVOKED',false,sharedSchedule.updated_at),schedule.id)
      weight=await save(0,'save_weight',weightData(70.2,false,weight.updated_at),weight.id)
      for(const table of ['health_profiles','schedules','weights']) assert.equal((await select(1,table)).length,0)
      profile=await save(0,'save_profile',{age:30,health_notes:'SYNTHETIC SHARED',is_shared:true,expected_updated_at:profile.updated_at})
      sharedSchedule=await save(0,'save_schedule',scheduleData('SYNTHETIC SHARED',true,sharedSchedule.updated_at),schedule.id)
      weight=await save(0,'save_weight',weightData(70.2,true,weight.updated_at),weight.id)
      for(const table of ['health_profiles','schedules','weights']) assert.equal((await select(1,table)).length,1)
    })
    await runCase(cases,details,'API_PARTNER_EDIT',async()=>{
      await denied(clients[1].rpc('save_schedule',{p_payload:scheduleData('SYNTHETIC PARTNER',true,sharedSchedule.updated_at),p_id:schedule.id}).single())
      await denied(clients[1].rpc('save_weight',{p_payload:weightData(70.4,true,weight.updated_at),p_id:weight.id}).single())
      await rpc(0,'save_settings',{p_settings:settings(true,true)})
      const edited=await save(1,'save_schedule',scheduleData('SYNTHETIC PARTNER',true,sharedSchedule.updated_at),schedule.id)
      const editedWeight=await save(1,'save_weight',weightData(70.4,true,weight.updated_at),weight.id)
      assert.equal(edited.updated_by,users[1])
      assert.equal(editedWeight.updated_by,users[1])
      await denied(clients[0].rpc('save_schedule',{p_payload:scheduleData('STALE',true,sharedSchedule.updated_at),p_id:schedule.id}).single())
      await denied(clients[0].rpc('save_weight',{p_payload:weightData(70.5,true,weight.updated_at),p_id:weight.id}).single())
      await rpc(0,'save_settings',{p_settings:settings(true,false)})
      await denied(clients[1].rpc('save_schedule',{p_payload:scheduleData('REVOKED',true,edited.updated_at),p_id:schedule.id}).single())
      await denied(clients[1].rpc('save_weight',{p_payload:weightData(70.6,true,editedWeight.updated_at),p_id:weight.id}).single())
    })
    await runCase(cases,details,'API_CRUD_READBACK',async()=>{
      assert.equal((await select(0,'health_profiles','health_notes'))[0].health_notes,'SYNTHETIC SHARED')
      assert.equal((await select(0,'schedules','raw_text'))[0].raw_text,'SYNTHETIC PARTNER')
      assert.equal(Number((await select(0,'weights','weight_kg'))[0].weight_kg),70.4)
      await rpc(0,'delete_schedule',{p_id:schedule.id}); await rpc(0,'delete_weight',{p_id:weight.id})
      assert.equal((await select(0,'schedules')).length,0); assert.equal((await select(0,'weights')).length,0)
      schedule=await save(0,'save_schedule',scheduleData('SYNTHETIC ERASE',false))
      weight=await save(0,'save_weight',weightData(70.3,false))
    })
    await runCase(cases,details,'API_ERASE',async()=>{
      await rpc(0,'erase_own_health_data')
      for(const table of ['health_profiles','schedules','weights']){
        assert.equal((await select(0,table)).length,0); assert.equal((await select(1,table)).length,0)
      }
      assert.equal((await select(0,'members')).length,2)
    })
    await runCase(cases,details,'API_LEAVE_REJOIN',async()=>{
      await save(0,'save_profile',{age:31,health_notes:'SYNTHETIC OLD CONSENT',is_shared:true})
      schedule=await save(0,'save_schedule',scheduleData('SYNTHETIC OLD RECORD',true))
      weight=await save(0,'save_weight',weightData(70.7,true))
      await rpc(0,'save_settings',{p_settings:settings(true,true)})
      await rpc(1,'leave_space')
      assert.equal((await select(1,'members')).length,0); assert.equal((await select(1,'health_profiles')).length,0)
      assert.equal((await ok(clients[1].from('schedules').select('id').eq('id',schedule.id))).length,0)
      assert.equal((await ok(clients[1].from('weights').select('id').eq('id',weight.id))).length,0)
      await denied(clients[1].rpc('save_schedule',{p_payload:scheduleData('SYNTHETIC OLD WRITE',true,schedule.updated_at),p_id:schedule.id}).single())
      await denied(clients[1].rpc('save_weight',{p_payload:weightData(70.8,true,weight.updated_at),p_id:weight.id}).single())
      await denied(clients[1].rpc('save_profile',{p_payload:{age:32}}))
      const remaining=(await select(0,'members','user_id,share_profile,share_schedule,share_weight,allow_partner_edit'))[0]
      assert.equal(remaining.share_profile||remaining.share_schedule||remaining.share_weight||remaining.allow_partner_edit,false)
      await denied(clients[2].rpc('join_space',{p_token:spareInvite,p_display_name:'Synthetic C',p_settings:settings(false)}))
      await rpc(2,'leave_space')
      const fresh=(await rpc(0,'create_invite'))[0].token
      await rpc(2,'join_space',{p_token:fresh,p_display_name:'Synthetic C',p_settings:settings(false)})
      assert.equal((await select(2,'health_profiles')).length,0)
      assert.equal((await select(2,'schedules')).length,0)
      assert.equal((await select(2,'weights')).length,0)
    })
  } catch {
    for(const id of ids) if(!cases.some(item=>item.id===id)) cases.push({id,status:'notrun'})
  } finally {
    for(let i=0;i<3;i++){
      if(cleanAccountsVerified) try {
        if((await ok(clients[i].from('members').select('space_id').eq('user_id',users[i]))).length) await rpc(i,'leave_space')
      } catch(error) { cases.push({id:`API_CLEANUP_${i}`,status:'failed'}); details.push({id:`API_CLEANUP_${i}`,error}) }
      try { await clients[i].auth.signOut() } catch { /* session may be absent */ }
    }
    await report('cloud-api','real-supabase-api',cases,details)
  }
}

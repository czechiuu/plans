import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { addDays, shanghaiDate } from '../src/domain.js'
import { report, blocked, runCase } from './test-helpers/report.mjs'
import { cloudSetup, client, ok, denied } from './test-helpers/cloud.mjs'

const ids = ['API_AUTH_SETTINGS','API_PASSWORDS','API_FIXED_ACCOUNTS','API_DATA_SAFETY','API_ANON','API_SIGNUP_CLOSED','API_PRIVATE','API_SHARE_REVOKE','API_PARTNER_EDIT','API_CRUD_READBACK','API_CLEANUP']
const cases = [], details = []
const check = (id, fn) => runCase(cases, details, id, fn)
const fields = ['share_profile','share_schedule','share_weight','allow_partner_edit']
let setup
try { setup = cloudSetup() } catch { setup = { blocked:true, reason:'Invalid cloud configuration' } }
if (setup.blocked) {
  process.stderr.write(`云端 API 未运行：${setup.reason}\n`)
  await report('cloud-api','two-fixed-accounts-real-supabase',blocked(ids))
} else {
  const api = [client(setup.url,setup.key),client(setup.url,setup.key)]
  const users = [], original = [], created = []
  const marker = `SYNTHETIC-TEST-${randomUUID()}`
  const day = addDays(shanghaiDate(),-30)
  const own = (i, table) => ok(api[i].from(table).select('*').eq('user_id',users[i]))
  const byId = (i, table, id) => ok(api[i].from(table).select('*').eq('id',id))
  const rpc = (i, name, args={}) => ok(api[i].rpc(name,args))
  const save = (i, name, payload, id=null) => ok(api[i].rpc(name,{p_payload:payload,p_id:id}).single())
  const schedule = (shared, stamp, text=marker) => ({user_id:users[0],record_date:day,raw_text:text,exercise_intent:'unknown',is_shared:shared,...(stamp?{expected_updated_at:stamp}:{})})
  const weight = (shared, stamp, value=70.1) => ({user_id:users[0],record_date:day,weight_kg:value,notes:marker,is_shared:shared,...(stamp?{expected_updated_at:stamp}:{})})
  const consent = patch => ({...original[0],share_schedule:false,share_weight:false,allow_partner_edit:false,...patch})
  const setConsent = async patch => {settingsChanged=true;await rpc(0,'save_settings',{p_settings:consent(patch)})}
  let authSettings, scheduleRow, weightRow, safeToMutate=false, settingsChanged=false, existingShared=false
  try {
    await check('API_AUTH_SETTINGS',async()=>{
      const response = await fetch(new URL('/auth/v1/settings',setup.url),{headers:{apikey:setup.key}})
      assert.equal(response.ok,true,'Auth settings must be readable')
      authSettings = await response.json()
      assert.equal(authSettings.disable_signup,true,'Signup must be disabled before any signup probe')
    })
    await check('API_PASSWORDS',async()=>{
      const bad = client(setup.url,setup.key)
      const result = await bad.auth.signInWithPassword({email:setup.emails[0],password:`incorrect-${randomUUID()}`})
      assert.ok(result.error,'Wrong password must be rejected')
      assert.equal(result.data.session,null)
      for (let i=0;i<2;i++) {
        const data = await ok(api[i].auth.signInWithPassword({email:setup.emails[i],password:setup.passwords[i]}))
        assert.ok(data.user?.id)
        users.push(data.user.id)
      }
      assert.notEqual(users[0],users[1])
    })
    await check('API_FIXED_ACCOUNTS',async()=>{
      assert.equal(await rpc(0,'current_account'),'me')
      assert.equal(await rpc(1,'current_account'),'w')
      const members=[]
      for (let i=0;i<2;i++) {
        const rows = await ok(api[i].from('members').select('space_id,user_id,share_profile,share_schedule,share_weight,allow_partner_edit').eq('user_id',users[i]))
        assert.equal(rows.length,1,'Fixed account must have one membership')
        original.push(Object.fromEntries(fields.map(key=>[key,rows[0][key]])))
        members.push(rows[0])
      }
      assert.equal(members[0].space_id,members[1].space_id,'Fixed accounts must share one space')
    })
    await check('API_DATA_SAFETY',async()=>{
      for (let i=0;i<2;i++) for (const table of ['schedules','weights']) {
        const rows=await own(i,table)
        if (rows.some(row=>row.record_date===day)) throw Object.assign(new Error('Synthetic date occupied'),{code:'SYNTHETIC_DATE_OCCUPIED'})
        if (i===0 && rows.some(row=>row.is_shared)) existingShared=true
      }
      safeToMutate=true
    })
    await check('API_ANON',async()=>{
      const anon=client(setup.url,setup.key)
      await denied(anon.from('members').select('user_id'),['42501'])
      for (const table of ['health_profiles','schedules','weights']) await denied(anon.from(table).select('id'),['42501'])
      await denied(anon.rpc('create_space',{p_name:'SYNTHETIC',p_display_name:'SYNTHETIC'}),['42501'])
    })
    await check('API_SIGNUP_CLOSED',async()=>{
      assert.equal(authSettings.disable_signup,true)
      const probe=client(setup.url,setup.key)
      const result=await probe.auth.signUp({email:`signup-probe-${randomUUID()}@plans.invalid`,password:`Synthetic-${randomUUID()}`})
      assert.ok(result.error,'Backend signup must reject direct API calls')
      assert.equal(result.data.user,null)
      assert.match(`${result.error.code||''} ${result.error.message||''}`,/signup.{0,30}(disabled|not allowed)|signups? not allowed/i)
    })
    await check('API_PRIVATE',async()=>{
      scheduleRow=await save(0,'save_schedule',schedule(false))
      created.push(['schedules',scheduleRow.id])
      weightRow=await save(0,'save_weight',weight(false))
      created.push(['weights',weightRow.id])
      assert.equal((await byId(1,'schedules',scheduleRow.id)).length,0)
      assert.equal((await byId(1,'weights',weightRow.id)).length,0)
      await denied(api[1].rpc('save_schedule',{p_payload:schedule(false,scheduleRow.updated_at),p_id:scheduleRow.id}).single(),['P0001'])
      await denied(api[1].rpc('save_weight',{p_payload:weight(false,weightRow.updated_at),p_id:weightRow.id}).single(),['P0001'])
      await denied(api[1].rpc('create_invite'),['42501'])
      await denied(api[1].rpc('join_space',{p_token:'synthetic',p_display_name:'synthetic',p_settings:{}}),['42501'])
    })
    await check('API_SHARE_REVOKE',async()=>{
      if (existingShared) throw Object.assign(new Error('Category toggle could expose existing shared rows'),{code:'EXISTING_SHARED_ROWS'})
      await setConsent({share_schedule:true,share_weight:true})
      assert.equal((await byId(1,'schedules',scheduleRow.id)).length,0)
      scheduleRow=await save(0,'save_schedule',schedule(true,scheduleRow.updated_at),scheduleRow.id)
      weightRow=await save(0,'save_weight',weight(true,weightRow.updated_at),weightRow.id)
      assert.equal((await byId(1,'schedules',scheduleRow.id)).length,1)
      assert.equal((await byId(1,'weights',weightRow.id)).length,1)
      await setConsent({})
      assert.equal((await byId(1,'schedules',scheduleRow.id)).length,0)
      assert.equal((await byId(1,'weights',weightRow.id)).length,0)
      await setConsent({share_schedule:true,share_weight:true})
      scheduleRow=await save(0,'save_schedule',schedule(false,scheduleRow.updated_at),scheduleRow.id)
      weightRow=await save(0,'save_weight',weight(false,weightRow.updated_at),weightRow.id)
      assert.equal((await byId(1,'schedules',scheduleRow.id)).length,0)
      assert.equal((await byId(1,'weights',weightRow.id)).length,0)
      scheduleRow=await save(0,'save_schedule',schedule(true,scheduleRow.updated_at),scheduleRow.id)
      weightRow=await save(0,'save_weight',weight(true,weightRow.updated_at),weightRow.id)
    })
    await check('API_PARTNER_EDIT',async()=>{
      await denied(api[1].rpc('save_schedule',{p_payload:schedule(true,scheduleRow.updated_at),p_id:scheduleRow.id}).single(),['P0001'])
      await denied(api[1].rpc('save_weight',{p_payload:weight(true,weightRow.updated_at),p_id:weightRow.id}).single(),['P0001'])
      await setConsent({share_schedule:true,share_weight:true,allow_partner_edit:true})
      const staleSchedule=scheduleRow.updated_at, staleWeight=weightRow.updated_at
      scheduleRow=await save(1,'save_schedule',schedule(true,staleSchedule,`${marker}-PARTNER`),scheduleRow.id)
      weightRow=await save(1,'save_weight',weight(true,staleWeight,70.2),weightRow.id)
      assert.equal(scheduleRow.updated_by,users[1])
      assert.equal(weightRow.updated_by,users[1])
      await denied(api[0].rpc('save_schedule',{p_payload:schedule(true,staleSchedule),p_id:scheduleRow.id}).single(),['P0001'])
      await denied(api[0].rpc('save_weight',{p_payload:weight(true,staleWeight),p_id:weightRow.id}).single(),['P0001'])
      await setConsent({share_schedule:true,share_weight:true})
      await denied(api[1].rpc('save_schedule',{p_payload:schedule(true,scheduleRow.updated_at),p_id:scheduleRow.id}).single(),['P0001'])
      await denied(api[1].rpc('save_weight',{p_payload:weight(true,weightRow.updated_at),p_id:weightRow.id}).single(),['P0001'])
    })
    await check('API_CRUD_READBACK',async()=>{
      assert.equal((await byId(0,'schedules',scheduleRow.id))[0].raw_text,`${marker}-PARTNER`)
      assert.equal(Number((await byId(0,'weights',weightRow.id))[0].weight_kg),70.2)
      await rpc(0,'delete_schedule',{p_id:scheduleRow.id})
      await rpc(0,'delete_weight',{p_id:weightRow.id})
      assert.equal((await byId(0,'schedules',scheduleRow.id)).length,0)
      assert.equal((await byId(0,'weights',weightRow.id)).length,0)
      created.length=0
    })
  } catch (error) {
    if (['SYNTHETIC_DATE_OCCUPIED','EXISTING_SHARED_ROWS'].includes(error?.code)) cases.find(item=>item.status==='failed').status='blocked'
    if (!['SYNTHETIC_DATE_OCCUPIED','EXISTING_SHARED_ROWS'].includes(error?.code) && !cases.some(item=>item.status==='failed')) { cases.push({id:'API_SETUP',status:'failed'}); details.push({id:'API_SETUP',error}) }
  } finally {
    if (safeToMutate) {
      try {
        for (const [table,id] of created) {
          const rows=await byId(0,table,id)
          if (rows.length) {
            assert.equal(rows[0].user_id,users[0])
            assert.ok((rows[0].raw_text||rows[0].notes||'').includes(marker),'Cleanup may remove only this run records')
            await rpc(0,table==='schedules'?'delete_schedule':'delete_weight',{p_id:id})
          }
        }
        for (const table of ['schedules','weights']) {
          const rows = await own(0,table)
          for (const row of rows) if (row.record_date===day && (row.raw_text||row.notes||'').includes(marker))
            await rpc(0,table==='schedules'?'delete_schedule':'delete_weight',{p_id:row.id})
        }
        if(settingsChanged) await rpc(0,'save_settings',{p_settings:original[0]})
        cases.push({id:'API_CLEANUP',status:'passed'})
      } catch(error) {
        cases.push({id:'API_CLEANUP',status:'failed'}); details.push({id:'API_CLEANUP',error})
      }
    }
    for (const id of ids) if (!cases.some(item=>item.id===id)) cases.push({id,status:safeToMutate?'notrun':'blocked'})
    for (const c of api) try { await c.auth.signOut({scope:'local'}) } catch {}
    await report('cloud-api','two-fixed-accounts-real-supabase',cases,details)
  }
}

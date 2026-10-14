import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { buildRulePlan, validatePlan } from '../shared/health.js'
import { exercises } from '../shared/exercises.js'
import { validateSanitizedPng } from '../shared/png.js'
import { addDays, shanghaiDate } from '../src/domain.js'
import { cloudSetup, client, ok } from './test-helpers/cloud.mjs'
import { launchBrowser } from './test-helpers/browser.mjs'
import { login } from './test-helpers/browser-login.mjs'
import { report, blocked, runCase } from './test-helpers/report.mjs'

// No AI requests, consent changes, sharing changes, mocks, or existing private inputs.
const ids=['UI_CLOUD_PREFLIGHT','UI_CLOUD_PHOTO_CONFIRM','UI_CLOUD_WEIGHT_REFRESH',
  'UI_CLOUD_MEDIA','UI_CLOUD_TRAINING','UI_CLOUD_FREE','UI_CLOUD_CLEANUP']
const today=shanghaiDate(), marker=`SYNTHETIC-UI-${randomUUID()}`
const fixture=new URL('../tests/fixtures/food-example-compact.png',import.meta.url)
const manifestUrl=new URL('../test-results/private/daily-flow-ui-cleanup.json',import.meta.url)
const networkFetch=globalThis.fetch
globalThis.fetch=(input,init={})=>networkFetch(input,{...init,
  signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)})
const dependencyBlocked=code=>Object.assign(new Error(code),{code,verificationStatus:'blocked'})
const checkCase=async(cases,details,id,fn)=>{
  try{return await runCase(cases,details,id,fn)}
  catch(error){if(error?.verificationStatus==='blocked')cases.at(-1).status='blocked';throw error}
}
const requireFreshManifest=(info,day)=>{
  if(shanghaiDate(info.mtime)!==day)throw dependencyBlocked('PREFLIGHT_DAILY_MANIFEST_STALE')
}
const readPriorManifest=async(source,day)=>{
  try{
    requireFreshManifest(await stat(source),day)
    return JSON.parse(await readFile(source,'utf8'))
  }catch(error){if(error?.code==='ENOENT')throw dependencyBlocked('PREFLIGHT_DAILY_MANIFEST_MISSING');throw error}
}
const rules={confirmed:true,equipment:'machines_only',ankle_status:'no_issue',free_weekdays:[],
  exercise_minutes:10,max_session_minutes:10,max_gym_visits:2,weekly_strength_limit:2,
  training_history_complete:true,free_day_training_forbidden:false,free_day_meal_unrestricted:false,
  limitations:marker+'：仅界面测试合成条件，不是本人健康声明',meal_notes:marker}
const makePlan=()=>{
  const content=buildRulePlan({date:today,rules,slot:'me',historyComplete:true,
    trainingHistoryConfirmedAt:new Date().toISOString()}).content
  content.summary=marker+'：仅界面测试，不代表本人实际训练安排'
  assert.equal(content.training.mode,'workout');assert.ok(validatePlan(content))
  return content
}

if(process.argv.includes('--self-check')){
  assert.ok(makePlan().training.items.length>=2)
  assert.equal((await validateSanitizedPng(await readFile(fixture))).mime,'image/png')
  const cases=[],details=[]
  await checkCase(cases,details,'missing',()=>readPriorManifest(new URL(`../test-results/private/${randomUUID()}.json`,import.meta.url),today)).catch(()=>{})
  assert.equal(cases[0]?.status,'blocked');assert.equal(details[0]?.error?.code,'PREFLIGHT_DAILY_MANIFEST_MISSING')
  await checkCase(cases,details,'stale',()=>requireFreshManifest({mtime:new Date('2020-01-01')},today)).catch(()=>{})
  assert.equal(cases[1]?.status,'blocked');assert.equal(details[1]?.error?.code,'PREFLIGHT_DAILY_MANIFEST_STALE')
  await checkCase(cases,details,'assertion',()=>assert.fail('expected self-check failure')).catch(()=>{})
  assert.equal(cases[2]?.status,'failed')
  process.stdout.write('无需凭据的确定性检查：5 通过、0 失败。\n')
}else{
  let setup
  try{setup=cloudSetup(['E2E_BASE_URL'])}catch{setup={blocked:true}}
  if(setup.blocked||process.env.TEST_DAILY_FLOW_APPROVED!=='YES'){
    await report('cloud-health-ui','not-run-without-explicit-synthetic-approval',blocked(ids))
  }else{
    const cases=[],details=[],api=[client(setup.url,setup.key),client(setup.url,setup.key)],users=[]
    const created={meals:[],photos:[],weights:[],training:[],rules:[],plans:[],create_receipts:[]},deleted=[]
    const check=(id,fn)=>checkCase(cases,details,id,fn)
    const rpc=(name,args)=>ok(api[0].rpc(name,args))
    const status=i=>ok(api[i].functions.invoke('health-ai',{body:{action:'status'}}))
    const own=async(i,table,columns='id')=>ok(api[i].from(table).select(columns).eq('user_id',users[i]))
    const one=async(table,id)=>ok(api[0].from(table).select('*').eq('id',id).single())
    let manifestReady=false
    const manifest=async()=>{
      await mkdir(new URL('../test-results/private/',import.meta.url),{recursive:true})
      if(!manifestReady){
        let previous
        try{previous=await readFile(manifestUrl,'utf8')}catch(error){if(error?.code!=='ENOENT')throw error}
        if(previous){
          const old=JSON.parse(previous), match=/^SYNTHETIC-UI-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/iu.exec(old.marker)
          if(!match)throw new Error('Previous UI cleanup marker invalid; manifest preserved')
          if(old.marker!==marker){
            const archive=new URL(`../test-results/private/daily-flow-ui-cleanup-${match[1]}.json`,import.meta.url)
            try{await writeFile(archive,previous,{flag:'wx'})}
            catch(error){if(error?.code!=='EEXIST'||await readFile(archive,'utf8')!==previous)throw error}
            for(const [source,target] of [
              ['../test-results/cloud-health-ui-results.json',`../test-results/private/cloud-health-ui-results-${match[1]}.json`],
              ['../test-results/private/cloud-health-ui-details.json',`../test-results/private/cloud-health-ui-details-${match[1]}.json`]
            ]){
              let contents
              try{contents=await readFile(new URL(source,import.meta.url),'utf8')}
              catch(error){if(error?.code==='ENOENT')continue;throw error}
              const targetUrl=new URL(target,import.meta.url)
              try{await writeFile(targetUrl,contents,{flag:'wx'})}
              catch(error){if(error?.code!=='EEXIST'||await readFile(targetUrl,'utf8')!==contents)throw error}
            }
          }
        }
        manifestReady=true
      }
      await writeFile(manifestUrl,JSON.stringify({generated_at:new Date().toISOString(),marker,created,deleted,
        existing_synthetic_plan_ids_affected:allowedPlans.filter(p=>p.user_id===users[0]).map(p=>p.id),
        needs_administrator_exact_id_cleanup:['rules','plans','create_receipts'],
        uncertain_network_results_require_manual_audit:true},null,2)+'\n')
    }
    const remember=async(kind,row)=>{
      assert.ok(row?.id)
      if(kind==='rules')assert.ok(row.updated_at)
      if(!created[kind].some(x=>x.id===row.id))created[kind].push({id:row.id,user_id:users[0],...(kind==='rules'?{expected_updated_at:row.updated_at}:{})})
      await manifest();return row
    }
    const assertDate=()=>assert.equal(shanghaiDate(),today,'Shanghai date changed; stop synthetic run')
    let browser,pages=[],safe=false,baseline,allowedPlans=[],beforeUsage=[],unexpectedPaid=false,writeUncertain=false
    const errors=[]
    const gifUrls=new Set(exercises.filter(item=>item.demo.mediaType==='external_gif').map(item=>item.demo.gifUrl))
    const gifRequests=new Map()
    const gifFailures=[]
    // Capture only the exact mutation initiated by this UI test, never enumerate bodies.
    const uiWrite=async(page,rpcName,action,kind)=>{
      try{
        const response=page.waitForResponse(r=>new URL(r.url()).pathname===`/rest/v1/rpc/${rpcName}`&&r.request().method()==='POST')
        await action()
        const received=await response
        const request=received.request().postDataJSON(),receipt=request?.p_payload?.client_request_id
        if(receipt&&!created.create_receipts.some(x=>x.id===receipt)){
          created.create_receipts.push({id:receipt,user_id:users[0]});await manifest()
        }
        assert.ok(received.ok())
        const data=await received.json(),row=Array.isArray(data)?data[0]:data
        return kind?remember(kind,row):row
      }catch(error){
        writeUncertain=true
        throw error
      }
    }
    const nav=async(page,name)=>page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name,exact:true}).click()
    const refreshed=async(page,name)=>{
      await page.reload();await page.getByRole('navigation',{name:'主导航'}).waitFor();await nav(page,name)
    }
    const syntheticScreen=async(page,name,fullPage=false)=>{
      await mkdir(new URL('../test-results/private/',import.meta.url),{recursive:true})
      await page.screenshot({path:fileURLToPath(new URL(`../test-results/private/cloud-ui-${name}-synthetic.png`,import.meta.url)),fullPage})
    }
    const gifDiagnostic=async(exercise,stage)=>{
      gifFailures.push({exercise_id:exercise.id,gif_url:exercise.demo.gifUrl,stage,
        network:gifRequests.get(exercise.demo.gifUrl)||null})
      await writeFile(new URL('../test-results/private/cloud-health-ui-gif-diagnostic.json',import.meta.url),
        JSON.stringify({failures:gifFailures},null,2)+'\n')
    }
    try{
      await check('UI_CLOUD_PREFLIGHT',async()=>{
        let stage='SITE_URL',slot=null
        try{
        const site=new URL(process.env.E2E_BASE_URL)
        assert.equal(site.origin,'https://czechiuu.github.io');assert.equal(site.pathname,'/plans/')
        assert.equal(site.search,'');assert.equal(site.hash,'')
        stage='BASELINE_MANIFEST'
        const source=new URL('../test-results/private/daily-flow-cleanup.json',import.meta.url)
        baseline=await readPriorManifest(source,today)
        assert.match(baseline.marker,/^SYNTHETIC-DAILY-/);assert.ok(Array.isArray(baseline.created?.plans))
        for(let i=0;i<2;i++){
          slot=i?'w':'me'
          stage=`API_AUTH_${slot.toUpperCase()}`
          const auth=await ok(api[i].auth.signInWithPassword({email:setup.emails[i],password:setup.passwords[i]}));users.push(auth.user.id)
          stage=`API_ACCOUNT_${slot.toUpperCase()}`
          assert.equal(await ok(api[i].rpc('current_account')),i?'w':'me')
          stage=`API_SCHEMA_${slot.toUpperCase()}`
          assert.equal(await ok(api[i].rpc('health_activity_schema_version')),8)
          for(const table of ['health_profiles','health_rules','schedules','weights','meals','training_sessions','photo_assets']){
            stage=`API_EMPTY_${table.toUpperCase()}_${slot.toUpperCase()}`
            const result=await api[i].from(table).select('*',{head:true,count:'exact'}).eq('user_id',users[i])
            if(result.error)throw result.error
            assert.equal(result.count,0,`Existing data blocks synthetic UI: ${table}`)
          }
          stage=`API_PLANS_${slot.toUpperCase()}`
          const plans=await own(i,'daily_plans','id,user_id,target_date,version,is_current,is_locked')
          assert.ok(plans.every(p=>baseline.created.plans.some(x=>x.id===p.id&&x.user_id===p.user_id)))
          allowedPlans.push(...plans)
          stage=`API_STATUS_${slot.toUpperCase()}`
          const current=await status(i);assert.equal(current.schema_version,7)
          assert.equal(current.plan_provider,'rules','Synthetic inputs require zero-AI scheduled provider')
          beforeUsage.push(current.providers)
        }
        stage='MANIFEST'
        safe=true;await manifest()
        stage='BROWSER_LAUNCH'
        browser=await launchBrowser()
        for(let i=0;i<2;i++){
          slot=i?'w':'me'
          stage=`BROWSER_CONTEXT_${slot.toUpperCase()}`
          const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,
            timezoneId:'Asia/Shanghai',reducedMotion:'no-preference'})
          const page=await context.newPage();page.setDefaultTimeout(20000);pages.push(page)
          page.on('pageerror',()=>errors.push('pageerror'))
          page.on('request',request=>{
            if(gifUrls.has(request.url()))gifRequests.set(request.url(),{request_seen:true})
            if(new URL(request.url()).pathname==='/functions/v1/health-ai'&&request.method()==='POST'){
              try{if(request.postDataJSON()?.action!=='status')unexpectedPaid=true}catch{unexpectedPaid=true}
            }
          })
          page.on('response',response=>{
            if(gifUrls.has(response.url()))gifRequests.set(response.url(),{
              ...gifRequests.get(response.url()),status:response.status()})
          })
          page.on('requestfailed',request=>{
            if(gifUrls.has(request.url()))gifRequests.set(request.url(),{
              ...gifRequests.get(request.url()),errorText:/^[\w:.-]{1,120}$/.test(request.failure()?.errorText||'')
                ?request.failure().errorText:'unclassified_failure'})
          })
          stage=`BROWSER_GOTO_${slot.toUpperCase()}`
          await page.goto(site.href)
          stage=`LOGIN_FORM_${slot.toUpperCase()}`
          await page.locator('[data-form="signin"] button:not([disabled])').waitFor()
          stage=`LOGIN_SLOT_${slot.toUpperCase()}`
          await page.locator(`[data-form="signin"] [name="slot"][value="${slot}"]`).check()
          stage=`LOGIN_PASSWORD_${slot.toUpperCase()}`
          await page.getByLabel('密码',{exact:true}).fill(setup.passwords[i])
          stage=`LOGIN_CLICK_${slot.toUpperCase()}`
          await page.getByRole('button',{name:'登录',exact:true}).click()
          stage=`LOGIN_NAV_${slot.toUpperCase()}`
          await page.getByRole('navigation',{name:'主导航'}).waitFor()
        }
        }catch(error){
          if(error?.verificationStatus!=='blocked')error.code=`UI_PREFLIGHT_${stage}`
          const page=pages.at(-1)
          let ui={available:false}
          if(page)try{
            ui=await page.evaluate(()=>({available:true,ready_state:document.readyState,
              signin_form_present:!!document.querySelector('[data-form="signin"]'),
              signin_button_enabled:!!document.querySelector('[data-form="signin"] button:not([disabled])'),
              navigation_present:!!document.querySelector('nav[aria-label="主导航"]'),
              error_notice_present:!!document.querySelector('.notice.error')}))
          }catch{/* A closed or navigating page is recorded as unavailable. */}
          try{
            await mkdir(new URL('../test-results/private/',import.meta.url),{recursive:true})
            await writeFile(new URL('../test-results/private/cloud-health-ui-preflight-diagnostic.json',import.meta.url),
              JSON.stringify({stage,slot,error_kind:error?.name||'Error',ui},null,2)+'\n')
          }catch{/* Diagnostic output must not hide the original failure. */}
          throw error
        }
      })
      const [me,partner]=pages
      await check('UI_CLOUD_PHOTO_CONFIRM',async()=>{
        let stage='OPEN_FOOD'
        try {
        assertDate();await nav(me,'饮食')
        let form=me.locator('[data-form="meal"]')
        await form.locator('[data-meal-item] [name="name"]').fill(marker+' 合成水果')
        await form.locator('[data-meal-item] [name="portion"]').fill('1份（合成）')
        await form.locator('[data-meal-item] [name="unit"]').fill('份')
        await form.locator('[name="status"]').selectOption('draft')
        assert.equal(await form.locator('[name="is_shared"]').isChecked(),false)
        if(await form.locator('[name="adjust_provider"]').count())await form.locator('[name="adjust_provider"]').selectOption('')
        stage='CREATE_MEAL'
        const meal=await uiWrite(me,'save_meal',()=>form.getByRole('button',{name:'保存餐食',exact:true}).click(),'meals')
        stage='MEAL_SAVED_NOTICE'
        await me.getByText('餐食已保存',{exact:true}).waitFor()
        stage='SELECT_PHOTO'
        const photoForm=me.locator('[data-form="photo"]')
        await photoForm.locator('[name="meal_id"]').selectOption(meal.id)
        await photoForm.locator('[name="photo"]').setInputFiles(fileURLToPath(fixture))
        stage='UPLOAD_PHOTO'
        const uploaded=me.waitForResponse(r=>new URL(r.url()).pathname==='/functions/v1/health-photo'&&new URL(r.url()).searchParams.get('action')==='upload')
        await photoForm.getByRole('button',{name:'上传私有照片'}).click()
        const reply=await uploaded;assert.ok(reply.ok());await remember('photos',{id:(await reply.json()).photo_id})
        stage='PHOTO_SAVED_NOTICE'
        await me.getByText('照片已上传',{exact:true}).waitFor()
        stage='OPEN_CONFIRM_EDIT'
        await me.locator(`[data-action="edit-meal"][data-id="${meal.id}"]`).click()
        form=me.locator('[data-form="meal"]');await form.locator('[name="status"]').selectOption('confirmed')
        stage='SAVE_CONFIRMED'
        await uiWrite(me,'save_meal',()=>form.getByRole('button',{name:'保存这餐修改'}).click())
        stage='CONFIRMED_NOTICE'
        await me.getByText('餐食已保存',{exact:true}).waitFor()
        stage='OPEN_CORRECTION_EDIT'
        await me.locator(`[data-action="edit-meal"][data-id="${meal.id}"]`).click()
        form=me.locator('[data-form="meal"]')
        await form.locator('[data-meal-item] [name="portion"]').fill('本人确认半份（合成）')
        await form.locator('[name="eaten_fraction"]').fill('0.5')
        await form.locator('[name="leftover"]').fill(marker+' 剩余一半')
        stage='SAVE_CORRECTION'
        await uiWrite(me,'save_meal',()=>form.getByRole('button',{name:'保存这餐修改'}).click())
        stage='CORRECTION_NOTICE_REFRESH'
        await me.getByText('餐食已保存',{exact:true}).waitFor();await refreshed(me,'饮食')
        stage='VERIFY_CORRECTION'
        const saved=await one('meals',meal.id)
        assert.equal(saved.status,'confirmed');assert.equal(saved.data.eaten_fraction,0.5)
        assert.equal(saved.data.items[0].portion,'本人确认半份（合成）');assert.equal(saved.data.estimate,null)
        assert.deepEqual(saved.data.photo_ids,[created.photos[0].id])
        stage='VIEW_PHOTO'
        await me.locator(`article.list-item [data-action="view-photo"][data-id="${created.photos[0].id}"]`).click()
        stage='WAIT_IMAGE'
        await me.waitForFunction(()=>document.querySelector('.photo-preview img')?.naturalWidth>0)
        await syntheticScreen(me,'photo-confirm',true)
        stage='VERIFY_PRIVATE'
        await nav(partner,'饮食');assert.equal(await partner.getByText(marker,{exact:false}).count(),0)
        } catch(error) {
          if(stage==='UPLOAD_PHOTO')writeUncertain=true
          error.code=`UI_PHOTO_${stage}`
          try {
            await mkdir(new URL('../test-results/private/',import.meta.url),{recursive:true})
            const frame=/verify-cloud-health-ui\.mjs:(\d+):(\d+)/u.exec(String(error.stack || ''))
            const photoId=created.photos[0]?.id
            const buttonCount=stage==='VIEW_PHOTO'&&photoId ? await me.locator(`article.list-item [data-action="view-photo"][data-id="${photoId}"]`).count().catch(()=>null) : null
            const assetResult=stage==='VIEW_PHOTO'&&photoId ? await api[0].from('photo_assets').select('id,meal_id,deleting,uploading').eq('id',photoId).maybeSingle() : null
            const reason=/strict mode violation/u.test(String(error.message))?'strict':/Timeout.*exceeded/u.test(String(error.message))?'timeout':/not visible|intercepts|outside viewport|disabled/u.test(String(error.message))?'actionability':'other'
            await writeFile(new URL('../test-results/private/cloud-health-ui-photo-diagnostic.json',import.meta.url),
              JSON.stringify({code:error.code,script_line:frame?Number(frame[1]):null,kind:error.name || 'Error',reason,
                ...(stage==='VIEW_PHOTO'?{button_count:buttonCount,photo_asset:assetResult?.error?null:assetResult?.data}: {})},null,2)+'\n')
            if(stage==='VIEW_PHOTO')await me.locator('article.list-item').first().scrollIntoViewIfNeeded().catch(()=>{})
            await me.screenshot({path:fileURLToPath(new URL('../test-results/private/cloud-health-ui-photo-failure.png',import.meta.url))})
          } catch { /* An unavailable page must not hide the original failure stage. */ }
          throw error
        }
      }).catch(()=>{})
      await check('UI_CLOUD_WEIGHT_REFRESH',async()=>{
        let stage='OPEN_TRENDS'
        try{
        if(writeUncertain)throw dependencyBlocked('UI_WRITE_UNCERTAIN')
        await nav(me,'趋势')
        for(const [offset,value] of [[-2,'70'],[-1,'72']]){
          stage='SAVE_WEIGHT'
          const form=me.locator('[data-form="weight"]')
          await form.locator('[name="record_date"]').fill(addDays(today,offset))
          await form.locator('[name="weight_kg"]').fill(value);await form.locator('[name="notes"]').fill(marker)
          assert.equal(await form.locator('[name="is_shared"]').isChecked(),false)
          await uiWrite(me,'save_weight',()=>form.getByRole('button',{name:'保存体重',exact:true}).click(),'weights')
          await me.getByText('体重已保存',{exact:true}).waitFor()
        }
        stage='VERIFY_OWN_TRENDS'
        await refreshed(me,'趋势');await me.getByText('71.0 kg',{exact:true}).waitFor()
        await me.getByText('2 条真实记录',{exact:true}).waitFor()
        await me.getByText('71.0 kg',{exact:true}).scrollIntoViewIfNeeded()
        await syntheticScreen(me,'trends')
        stage='VERIFY_PARTNER_ISOLATION'
        await nav(partner,'趋势');assert.equal(await partner.getByText(marker,{exact:true}).count(),0)
        stage='SWITCH_SECOND_CONTEXT'
        await partner.locator('.header-settings').click();await partner.getByRole('button',{name:'退出此设备／切换账号',exact:true}).click()
        await partner.getByRole('heading',{name:'欢迎回来'}).waitFor();await login(partner,'me',setup.passwords[0])
        stage='VERIFY_SECOND_CONTEXT'
        await nav(partner,'趋势');await partner.getByText('71.0 kg',{exact:true}).waitFor()
        await partner.getByText('2 条真实记录',{exact:true}).waitFor()
        }catch(error){
          if(error?.verificationStatus!=='blocked')error.code=`UI_WEIGHT_${stage}`
          try{
            if(await partner.getByRole('navigation',{name:'主导航'}).count() && !await partner.locator('[data-form="signin"]').count())
              await partner.screenshot({path:fileURLToPath(new URL('../test-results/private/cloud-health-ui-weight-failure.png',import.meta.url))})
          }catch{/* The screenshot must not hide the original failure. */}
          throw error
        }
      }).catch(()=>{})
      await check('UI_CLOUD_MEDIA',async()=>{
        await nav(me,'训练')
        const others=me.locator('details.other-exercises')
        if(await others.count())await me.locator('details.other-exercises > summary').click()
        assert.equal(await me.locator('[data-demo-slot]').count(),exercises.length)
        for(const exercise of exercises.filter(item=>item.demo.mediaType==='external_gif')){
          const slot=me.locator(`[data-demo-slot="${exercise.id}"]`)
          assert.equal(await slot.locator('img').count(),0)
          await slot.getByRole('button',{name:'查看动作示范',exact:true}).click()
          try{
            await me.waitForFunction(id=>{
              const slot=document.querySelector(`[data-demo-slot="${id}"]`)
              const image=slot?.querySelector('img.exercise-gif')
              return (image?.complete && image.naturalWidth>0) || slot?.textContent?.includes('动作示范加载失败')
            },exercise.id)
          }catch{
            await gifDiagnostic(exercise,'wait_timeout')
            continue
          }
          const image=slot.locator('img.exercise-gif')
          if(!await image.count() || !await image.evaluate(node=>node.complete&&node.naturalWidth>0)){
            await gifDiagnostic(exercise,'image_error')
            continue
          }
          assert.equal(await image.getAttribute('src'),exercise.demo.gifUrl)
          assert.equal(await slot.getByRole('button',{name:'暂停',exact:true}).count(),0)
          assert.equal(await me.locator(`[data-demo-slot="${exercise.id}"]`).locator('..').getByRole('link',{name:'原视频备用入口'}).getAttribute('href'),exercise.demo.url)
          await slot.scrollIntoViewIfNeeded();await syntheticScreen(me,`gif-${exercise.id}`)
          await slot.getByRole('button',{name:'收起动作示范'}).click()
          assert.equal(await slot.locator('img').count(),0)
          await slot.getByRole('button',{name:'查看动作示范',exact:true}).waitFor()
        }
        for(const exercise of exercises.filter(item=>item.demo.mediaType==='source_video')){
          const slot=me.locator(`[data-demo-slot="${exercise.id}"]`)
          assert.equal(await slot.getByRole('link',{name:'查看原视频示范'}).getAttribute('href'),exercise.demo.url)
          assert.equal(await slot.locator('img,object').count(),0)
        }
        if(gifFailures.length)throw Object.assign(new Error(`GIF image failed to load: ${gifFailures.map(item=>item.exercise_id).join(', ')}`),
          {code:`GIF_${gifFailures[0].exercise_id.toUpperCase()}_LOAD_FAILED`})
      }).catch(()=>{})
      await check('UI_CLOUD_TRAINING',async()=>{
        if(writeUncertain)throw dependencyBlocked('UI_WRITE_UNCERTAIN')
        assertDate()
        // Only an empty rule slot can receive these explicitly synthetic conditions.
        assert.equal((await own(0,'health_rules')).length,0)
        const savedRules=await ok(api[0].rpc('save_health_rules',{p_rules:rules,p_is_shared:false,p_expected_updated_at:null}).single())
        await remember('rules',savedRules)
        const current=allowedPlans.find(p=>p.user_id===users[0]&&p.target_date===today&&p.is_current)
        assert.ok(!current?.is_locked)
        const content=makePlan()
        const plan=await ok(api[0].rpc('save_daily_plan',{p_target_date:today,p_content:content,p_expected_version:current?.version??null,p_is_shared:false}).single())
        await remember('plans',plan);await refreshed(me,'训练')
        const session=await uiWrite(me,'save_training_session',()=>me.getByRole('button',{name:'开始本次训练'}).click(),'training')
        await me.getByText('训练已开始；请记录实际完成的每一组',{exact:true}).waitFor()
        const initial=await me.locator('#training-elapsed').textContent()
        await me.waitForFunction(text=>document.querySelector('#training-elapsed')?.textContent!==text,initial)
        const form=me.locator('[data-form="training-set"]')
        await form.locator('[name="exercise_id"]').selectOption(content.training.items[0].exercise_id)
        await form.locator('[name="reps"]').fill('8')
        await uiWrite(me,'save_training_session',()=>form.getByRole('button',{name:'保存这一组'}).click())
        await me.getByText('实际训练组已保存',{exact:true}).waitFor()
        await uiWrite(me,'save_training_session',()=>me.getByRole('button',{name:'暂停训练'}).click())
        await me.getByRole('button',{name:'继续训练'}).waitFor()
        const paused=await one('training_sessions',session.id);assert.equal(paused.status,'paused');assert.equal(paused.data.sets.length,1)
        await refreshed(me,'训练');await me.getByRole('button',{name:'继续训练'}).waitFor()
        const pausedText=await me.locator('#training-elapsed').textContent();await me.waitForTimeout(1100)
        assert.equal(await me.locator('#training-elapsed').textContent(),pausedText)
        await uiWrite(me,'save_training_session',()=>me.getByRole('button',{name:'继续训练'}).click())
        await me.getByRole('button',{name:'暂停训练'}).waitFor()
        await uiWrite(me,'save_training_session',()=>me.getByRole('button',{name:'完成训练'}).click())
        await me.getByText('本次训练已按实际记录完成',{exact:true}).waitFor()
        await me.getByText('本次训练已按实际记录完成',{exact:true}).scrollIntoViewIfNeeded()
        await syntheticScreen(me,'training-complete')
        const stopped=await one('training_sessions',session.id)
        assert.equal(stopped.status,'completed');assert.equal(stopped.data.sets[0].reps,8)
        assert.ok(stopped.data.elapsed_seconds>=paused.data.elapsed_seconds);assert.ok(stopped.data.ended_at)
        const second=cases.some(c=>c.id==='UI_CLOUD_WEIGHT_REFRESH'&&c.status==='passed')?partner:me
        await refreshed(second,'训练');await second.getByText('部分完成',{exact:false}).waitFor()
        await second.getByText('1 组实际记录',{exact:false}).waitFor()
      }).catch(()=>{})
      await check('UI_CLOUD_FREE',async()=>{
        assert.equal(unexpectedPaid,false);assert.deepEqual(errors,[])
        for(let i=0;i<2;i++)assert.deepEqual((await status(i)).providers,beforeUsage[i])
      }).catch(()=>{})
    }catch(error){
      if(!cases.some(x=>x.status==='failed')){cases.push({id:'UI_CLOUD_SETUP',status:'failed'});details.push({id:'UI_CLOUD_SETUP',error})}
    }finally{
      await browser?.close()
      if(safe)await check('UI_CLOUD_CLEANUP',async()=>{
        for(const p of created.photos){await ok(api[0].functions.invoke(`health-photo?action=delete&photo_id=${p.id}`,{method:'DELETE'}));deleted.push({table:'photo_assets',id:p.id});await manifest()}
        for(const [kind,table,fn] of [['training','training_sessions','delete_training_session'],['meals','meals','delete_meal'],['weights','weights','delete_weight']]){
          for(const row of created[kind]){await rpc(fn,{p_id:row.id});deleted.push({table,id:row.id});await manifest()}
        }
        for(const row of deleted)assert.equal((await ok(api[0].from(row.table).select('id').eq('id',row.id))).length,0)
        // Rules, immutable plans and receipts have no safe owner-delete RPC.
        await manifest()
      }).catch(()=>{})
      for(const c of api)await c.auth.signOut({scope:'local'}).catch(()=>{})
      for(const id of ids)if(!cases.some(x=>x.id===id))cases.push({id,status:'blocked'})
      await report('cloud-health-ui','real-deployed-ui-two-isolated-browser-contexts-not-physical-devices',cases,details)
    }
  }
}

// Only imported by the Playwright UI suite. All identities and records are synthetic.
export function mockApiModule() {
  return `
export const configured = true;
export const configurationError = '';
const ids = {me:'11111111-1111-4111-8111-111111111111',w:'22222222-2222-4222-8222-222222222222'};
const emails = {me:'me@plans.invalid',w:'w@plans.invalid'};
const credentials = {me:'Synthetic-only-password',w:'Synthetic-only-password'};
const fresh = () => ({profile:null,schedules:[],weights:[],health_rules:[],daily_plans:[],generation_jobs:[],training_sessions:[],meals:[],photo_assets:[],ai_consents:[],meal_adjustments:[]});
const store = {me:fresh(),w:fresh()};
const members = Object.entries(ids).map(([slot,user_id])=>({user_id,space_id:'synthetic-space',display_name:slot==='me'?'合成甲':'合成 W',share_profile:false,share_schedule:false,share_weight:false,share_plan:false,share_training:false,share_meal:false,share_photo:false,allow_partner_edit:false}));
const space = {id:'synthetic-space',name:'合成测试空间'};
let slot=null, session=null, callback, seq=0, hold=false, release, holdSignOut=false, releaseSignOut, holdPassword=false, releasePassword, providerExtensionAvailable=true, deepSeekAvailable=false, planProvider='rules', loseActivityAck=false, loseMealAck=false;
const receipts=new Map();
const stamp = () => new Date(Date.now() + (++seq)*1000).toISOString();
const shanghaiDay = iso => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
const uid = () => ids[slot];
const mine = () => store[slot];
const row = p => ({...p,id:'synthetic-'+(++seq),space_id:space.id,created_at:stamp(),updated_at:stamp(),updated_by:uid()});
const save = (rows,p,id) => {
  if (p.notes === 'conflict-test') throw new Error('Update conflict');
  if (id) {
    const old=rows.find(r=>r.id===id);
    if (!old || old.updated_at!==p.expected_updated_at) throw new Error('Update conflict');
    Object.assign(old,p,{updated_at:stamp(),updated_by:uid()});
    return {...old};
  }
  if (p.record_date && !p.data && rows.some(r=>r.user_id===p.user_id&&r.record_date===p.record_date)) throw Object.assign(new Error('duplicate'),{code:'23505'});
  const item=row(p); rows.push(item); return {...item};
};
const saveCreate = (rows,p,id) => {
  if (id || !p.client_request_id) return save(rows,p,id)
  const key=uid()+':'+p.client_request_id, encoded=JSON.stringify(p), previous=receipts.get(key)
  if (previous) { if (previous.encoded!==encoded) throw Error('Create request payload conflict'); return {...previous.item} }
  const item=save(rows,p,id); receipts.set(key,{encoded,item}); return item
};
window.__synthetic = {
  holdNextLoad(){hold=true},
  isHeld(){return Boolean(release)},
  releaseLoad(){release?.();release=null},
  holdNextSignOut(){holdSignOut=true},
  isSignOutHeld(){return Boolean(releaseSignOut)},
  releaseSignOut(){releaseSignOut?.();releaseSignOut=null},
  holdNextPassword(){holdPassword=true},
  isPasswordHeld(){return Boolean(releasePassword)},
  releasePassword(){releasePassword?.();releasePassword=null},
  switchTo(next){slot=next;session={access_token:'synthetic-session-'+(++seq),user:{id:ids[slot],email:emails[slot]}};callback?.(session,'SIGNED_IN')},
  currentSlot(){return slot},
  passwordCalls:0,
  photoUploads:0
  ,generateCalls:0
  ,parseCalls:0
  ,estimateCalls:0
  ,setProviderExtension(value){providerExtensionAvailable=value}
  ,enableDeepSeek(){deepSeekAvailable=true}
  ,consentCalls:[]
  ,consentRows(){return mine().ai_consents.map(item=>({...item}))}
  ,failNextActivityAck(){loseActivityAck=true}
  ,failNextMealAck(){loseMealAck=true}
  ,trainingRows(){return mine().training_sessions.map(item=>({...item}))}
  ,mealRows(){return mine().meals.map(item=>({...item}))}
  ,photoRows(){return mine().photo_assets.map(item=>({...item}))}
  ,seedLinkedPhoto(mealId){const meal=mine().meals.find(item=>item.id===mealId);if(!meal)throw Error('Missing synthetic meal');const photo=row({user_id:uid(),meal_id:mealId,deleting:false,uploading:false,width:40,height:40,is_shared:false});mine().photo_assets.push(photo);meal.data.photo_ids=[photo.id];return photo.id}
  ,seedDeepSeekPhotoConsent(){mine().ai_consents.push(row({user_id:uid(),provider:'deepseek',purpose:'estimate_meal_photo',enabled:true,monthly_limit_cents:2,policy_version:'synthetic',is_shared:false}))}
  ,seedGenerationReady(){mine().health_rules=[row({user_id:uid(),rules:{confirmed:true,meal_template:[{title:'合成早餐',foods:[{name:'合成食物',portion:'1',unit:'份'}]},{title:'合成午餐',foods:[{name:'合成食物',portion:'1',unit:'份'}]},{title:'合成晚餐',foods:[{name:'合成食物',portion:'1',unit:'份'}]}]},is_shared:false})]}
  ,seedAdjustmentConsent(){mine().ai_consents.push(row({user_id:uid(),provider:'openai',purpose:'adjust_plan',enabled:true,monthly_limit_cents:100,policy_version:'synthetic',is_shared:false}))}
  ,seedFullPlan(targetDate){const today=targetDate || shanghaiDay(new Date().toISOString());for(const old of mine().daily_plans)if(old.target_date===today)old.is_current=false;const content={summary:'合成示例：完整三餐与力量训练',meals:[{title:'早餐',foods:[{name:'合成燕麦',portion:'1',unit:'份'}]},{title:'午餐',foods:[{name:'合成米饭与豆腐',portion:'1',unit:'份'}]},{title:'晚餐',foods:[{name:'合成蔬菜与鸡蛋',portion:'1',unit:'份'}]}],training:{mode:'workout',purpose:'合成界面检查',time:'19:00',intensity:'轻至中等',equipment:'固定器械',muscles:['腿'],warmup:[{description:'合成热身：慢走',seconds:120}],items:[{exercise_id:'machine_leg_press',sets:1,reps:8,work_seconds:40,rest_seconds:60,transition_seconds:30,first_use_check:'请现场教练核对器械',short_option:'减少重量'}],cooldown:[{description:'合成放松：缓步',seconds:120}],total_seconds:310},warnings:['界面测试数据，不代表真人建议']};const plan=row({user_id:uid(),target_date:today,version:99,source:'manual',status:'published',is_shared:false,is_stale:false,is_locked:false,is_current:true,input_version:'synthetic',content,generated_at:stamp()});mine().daily_plans.push(plan);return plan.id}
  ,setLatestMealEstimate(){mine().meals.at(-1).data.estimate={recognition_status:'recognized',items:[],energy_min_kcal:400,energy_max_kcal:600,uncertainty:'合成区间',assumptions:[],cooking:null,oil:null,leftover:null}}
  ,seedTodayPlan(){const now=new Date().toISOString();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const plan=row({user_id:uid(),target_date:today,version:1,source:'manual',status:'published',is_shared:false,is_stale:false,is_locked:false,input_version:'synthetic',content:{summary:'合成训练安排',meals:[],training:{mode:'workout',purpose:'合成检查',time:null,intensity:'轻',equipment:'固定器械',muscles:['腿'],warmup:[],items:[{exercise_id:'machine_leg_press',sets:1,reps:8,work_seconds:30,rest_seconds:10,transition_seconds:0,first_use_check:'',short_option:''}],cooldown:[],total_seconds:30},warnings:[]},generated_at:now});mine().daily_plans.push(plan);return plan.id}
  ,seedPartialTrainingPlan(){const id=window.__synthetic.seedTodayPlan();mine().daily_plans.find(plan=>plan.id===id).content.training.items[0].sets=2;return id}
};
export const api = {
  async withAuthToken(token,action){if(token && token!==session?.access_token)throw Object.assign(new Error('Session changed'),{code:'ACCOUNT_CHANGED'});return action()},
  async session(){return session},
  onAuthChange(cb){callback=cb;return()=>{}},
  async currentAccount(){return slot},
  async signIn(next,password){
    if (!ids[next] || credentials[next]!==password) throw Object.assign(new Error('Invalid login'),{code:'INVALID_CREDENTIALS'});
    slot=next;
    session={access_token:'synthetic-session-'+(++seq),user:{id:ids[slot],email:emails[slot]}};
    callback?.(session,'SIGNED_IN');
  },
  async signOut(){if(holdSignOut){holdSignOut=false;await new Promise(resolve=>{releaseSignOut=resolve})}session=null;slot=null;callback?.(null,'SIGNED_OUT')},
  async updatePassword(currentPassword,newPassword){
    window.__synthetic.passwordCalls++;
    const selected=slot;
    if(holdPassword){holdPassword=false;await new Promise(resolve=>{releasePassword=resolve})}
    if (credentials[selected]!==currentPassword) throw Object.assign(new Error('Wrong current password'),{code:'INVALID_CURRENT_PASSWORD'});
    credentials[selected]=newPassword;
  },
  async load(){
    const selected=slot;
    const own=store[selected], other=store[selected==='me'?'w':'me'];
    const visible=(rows,key)=>rows.filter(r=>r.is_shared&&members.find(m=>m.user_id===r.user_id)?.[key]);
    const snapshot={
      account:selected,user:{id:ids[selected],email:emails[selected]},space,members:members.map(m=>({...m})),
      profile:own.profile?{...own.profile}:null,
      profiles:[...(own.profile?[{...own.profile}]:[]),...(other.profile&&other.profile.is_shared&&members.find(m=>m.user_id===other.profile.user_id)?.share_profile?[{...other.profile}]:[])],
      schedules:[...own.schedules.map(r=>({...r})),...visible(other.schedules,'share_schedule').map(r=>({...r}))],
      weights:[...own.weights.map(r=>({...r})),...visible(other.weights,'share_weight').map(r=>({...r}))],
      audit:[],range:{from:'2026-01-01',to:'2027-01-01'}
      ,healthAvailable:true,providerAiAvailable:providerExtensionAvailable,dailyFlowAvailable:providerExtensionAvailable,activityAvailable:true,
      ...Object.fromEntries(['health_rules','daily_plans','generation_jobs','training_sessions','meals','photo_assets','ai_consents','meal_adjustments'].map(key=>[key,[...own[key].map(r=>({...r})),...visible(other[key],'share_'+({health_rules:'profile',daily_plans:'plan',generation_jobs:'plan',training_sessions:'training',meals:'meal',photo_assets:'photo',ai_consents:'profile',meal_adjustments:'meal'})[key]).map(r=>({...r}))]]))
    };
    if (hold) {hold=false;await new Promise(resolve=>{release=resolve})}
    return snapshot;
  },
  async saveSettings(p){Object.assign(members.find(m=>m.user_id===uid()),p)},
  async saveHealthSharing(p){Object.assign(members.find(m=>m.user_id===uid()),p)},
  async saveHealthRules(rules,isShared,expected){const old=mine().health_rules[0];if(old&&old.updated_at!==expected)throw new Error('Update conflict');mine().health_rules=[old?{...old,rules,is_shared:isShared,updated_at:stamp(),updated_by:uid()}:row({user_id:uid(),rules,is_shared:isShared})]},
  async saveDailyPlan(targetDate,content,expectedVersion,isShared){const old=mine().daily_plans.filter(r=>r.target_date===targetDate).sort((a,b)=>b.version-a.version)[0];if((old?.version||null)!==expectedVersion)throw new Error('Update conflict');const plan=row({user_id:uid(),target_date:targetDate,version:(old?.version||0)+1,source:'manual',status:'published',is_shared:isShared,is_stale:false,is_locked:false,input_version:'synthetic',content,generated_at:stamp()});mine().daily_plans.push(plan);return plan},
  async setPlanLock(id,locked,expected){const plan=mine().daily_plans.find(r=>r.id===id);if(!plan||plan.updated_at!==expected)throw new Error('Update conflict');plan.is_locked=locked;plan.updated_at=stamp();return {...plan}},
  async requestPlanGeneration(targetDate,provider){const job=row({user_id:uid(),target_date:targetDate,provider,kind:'manual',status:'queued',attempts:0,max_attempts:3,error_code:null});mine().generation_jobs.push(job);return {...job}},
  async retryGenerationJob(id){const job=mine().generation_jobs.find(r=>r.id===id);job.status='queued';return {...job}},
  async generatePlan(id,provider){if(provider!=='rules')throw new Error('Synthetic generator requires explicit rules');window.__synthetic.generateCalls++;const job=mine().generation_jobs.find(r=>r.id===id);if(!job)throw new Error('Missing synthetic job');const old=mine().daily_plans.filter(r=>r.target_date===job.target_date).sort((a,b)=>b.version-a.version)[0];const plan=row({user_id:uid(),target_date:job.target_date,version:(old?.version||0)+1,source:'rules',status:'published',is_shared:false,is_stale:false,is_locked:false,input_version:'synthetic',content:old?.content||{summary:'合成生成计划',meals:[],training:{mode:'rest',warmup:[],items:[],cooldown:[],total_seconds:0},warnings:[]},generated_at:stamp()});mine().daily_plans.push(plan);job.status='succeeded';job.attempts++;job.plan_id=plan.id;return {job_id:id,status:'succeeded',plan_id:plan.id,error_code:null}},
  async saveTrainingSession(payload,id){const item=saveCreate(mine().training_sessions,{...payload,user_id:uid(),record_date:payload.data.record_date || shanghaiDay(payload.data.started_at)},id);if(loseActivityAck && !id){loseActivityAck=false;throw Error('Synthetic response lost')}return item},
  async deleteTrainingSession(id){mine().training_sessions=mine().training_sessions.filter(item=>item.id!==id)},
  async saveMeal(payload,id){const item=saveCreate(mine().meals,{...payload,user_id:uid(),record_date:shanghaiDay(payload.data.recorded_at)},id);if(loseMealAck && !id){loseMealAck=false;throw Error('Synthetic response lost')}return item},
  async deleteMeal(id){mine().meals=mine().meals.filter(r=>r.id!==id)},
  async requestMealAdjustment(recordDate,provider){if(provider!=='openai')throw new Error('Synthetic provider unavailable');const adjustment=row({user_id:uid(),record_date:recordDate,status:'draft',content:{reason:'合成餐后建议',meal_changes:[{meal_index:2,meal:{title:'合成晚餐',foods:[{name:'合成食物',portion:'1',unit:'份'}]},reason:'合成理由'}],warnings:[]}});mine().meal_adjustments.push(adjustment);return {adjustment,needs_confirmation:true}},
  async applyMealAdjustment(id,expected){const row=mine().meal_adjustments.find(item=>item.id===id);if(!row||row.updated_at!==expected)throw new Error('Update conflict');row.status='applied';row.updated_at=stamp();return {...row}},
  async undoMealAdjustment(id,expected){const row=mine().meal_adjustments.find(item=>item.id===id);if(!row||row.updated_at!==expected)throw new Error('Update conflict');row.status='reverted';row.updated_at=stamp();return {...row}},
  async setAiProviderConsent(provider,purpose,enabled,limit,version){if(provider==='deepseek'&&!deepSeekAvailable)throw new Error('Synthetic DeepSeek disabled');window.__synthetic.consentCalls.push({provider,purpose,enabled,limit,version});mine().ai_consents=mine().ai_consents.filter(r=>r.provider!==provider||r.purpose!==purpose);mine().ai_consents.push(row({user_id:uid(),provider,purpose,enabled,monthly_limit_cents:limit,policy_version:version,is_shared:false}))},
  async setAiPlanProvider(provider){if(!['rules','openai'].includes(provider))throw new Error('Invalid provider');planProvider=provider;return provider},
  async aiStatus(){if(!providerExtensionAvailable)throw Object.assign(new Error('Missing extension'),{code:'PGRST202'});const consents=provider=>Object.fromEntries(mine().ai_consents.filter(r=>r.provider===provider).map(r=>[r.purpose,{enabled:r.enabled,monthly_limit_cents:r.monthly_limit_cents}]));return {schema_version:7,plan_provider:planProvider,global_budget_configured:true,providers:{openai:{configured:true,health_enabled:true,model:'synthetic-model',budget_configured:true,consents:consents('openai'),usage:{}},deepseek:{configured:deepSeekAvailable,health_enabled:deepSeekAvailable,model:deepSeekAvailable?'synthetic-deepseek':null,budget_configured:deepSeekAvailable,consents:consents('deepseek'),usage:{}}}}},
  async parseSchedule(rawText,submittedAt,provider){if(provider!=='openai')throw new Error('Missing explicit provider');window.__synthetic.parseCalls++;return {draft:{user_slot:'me',record_date:'2026-10-14',exercise:{intent:'unknown'},meal:{conditions:''},constraints:[],fatigue:'unknown',pain:null,sleep:'unknown'},needs_confirmation:true,parse_version:'health-schedule-v1',submitted_at:submittedAt}},
  async estimateMeal(mealId,provider){if(provider!=='openai')throw new Error('Missing explicit provider');window.__synthetic.estimateCalls++;return {draft:{recognition_status:'unrecognized',items:[],energy_min_kcal:null,energy_max_kcal:null,uncertainty:'合成未知',assumptions:[],cooking:null,oil:null,leftover:null},needs_confirmation:true}},
  async uploadPhoto(){window.__synthetic.photoUploads++;throw new Error('Synthetic photo service unavailable')},
  async downloadPhoto(){throw new Error('Synthetic photo service unavailable')},
  async deletePhoto(){throw new Error('Synthetic photo service unavailable')},
  async saveProfile(p){mine().profile={...row(p),user_id:uid()}},
  async saveSchedule(p,id){return save(mine().schedules,p,id)},
  async saveConfirmedSchedule(p,id){return save(mine().schedules,p,id)},
  async deleteSchedule(id){mine().schedules=mine().schedules.filter(r=>r.id!==id)},
  async saveWeight(p,id){return save(mine().weights,p,id)},
  async deleteWeight(id){mine().weights=mine().weights.filter(r=>r.id!==id)},
  async exportOwnData(){return {profile:mine().profile,schedules:mine().schedules,weights:mine().weights,settings:members.find(m=>m.user_id===uid())}},
  async eraseOwnHealthData(){mine().profile=null;mine().schedules=[];mine().weights=[]},
  async leaveSpace(){throw new Error('Not used by synthetic UI suite')}
};
`;
}

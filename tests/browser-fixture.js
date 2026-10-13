// Only imported by the Playwright UI suite. All identities and records are synthetic.
export function mockApiModule() {
  return `
export const configured = true;
export const configurationError = '';
const ids = {me:'11111111-1111-4111-8111-111111111111',w:'22222222-2222-4222-8222-222222222222'};
const emails = {me:'me@plans.invalid',w:'w@plans.invalid'};
const credentials = {me:'Synthetic-only-password',w:'Synthetic-only-password'};
const fresh = () => ({profile:null,schedules:[],weights:[],health_rules:[],daily_plans:[],generation_jobs:[],training_sessions:[],meals:[],photo_assets:[],ai_consents:[]});
const store = {me:fresh(),w:fresh()};
const members = Object.entries(ids).map(([slot,user_id])=>({user_id,space_id:'synthetic-space',display_name:slot==='me'?'合成甲':'合成 W',share_profile:false,share_schedule:false,share_weight:false,share_plan:false,share_training:false,share_meal:false,share_photo:false,allow_partner_edit:false}));
const space = {id:'synthetic-space',name:'合成测试空间'};
let slot=null, session=null, callback, seq=0, hold=false, release, holdSignOut=false, releaseSignOut, holdPassword=false, releasePassword;
const stamp = () => new Date(Date.now() + (++seq)*1000).toISOString();
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
  if (p.record_date && rows.some(r=>r.user_id===p.user_id&&r.record_date===p.record_date)) throw Object.assign(new Error('duplicate'),{code:'23505'});
  const item=row(p); rows.push(item); return {...item};
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
  ,seedGenerationReady(){mine().health_rules=[row({user_id:uid(),rules:{confirmed:true,meal_template:[{title:'合成早餐',foods:[{name:'合成食物',portion:'1',unit:'份'}]},{title:'合成午餐',foods:[{name:'合成食物',portion:'1',unit:'份'}]},{title:'合成晚餐',foods:[{name:'合成食物',portion:'1',unit:'份'}]}]},is_shared:false})]}
  ,setLatestMealEstimate(){mine().meals.at(-1).data.estimate={recognition_status:'recognized',items:[],energy_min_kcal:400,energy_max_kcal:600,uncertainty:'合成区间',assumptions:[],cooking:null,oil:null,leftover:null}}
  ,seedTodayPlan(){const now=new Date().toISOString();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const plan=row({user_id:uid(),target_date:today,version:1,source:'manual',status:'published',is_shared:false,is_stale:false,is_locked:false,input_version:'synthetic',content:{summary:'合成训练安排',meals:[],training:{mode:'workout',purpose:'合成检查',time:null,intensity:'轻',equipment:'固定器械',muscles:['腿'],warmup:[],items:[{exercise_id:'machine_leg_press',sets:1,reps:8,work_seconds:30,rest_seconds:10,transition_seconds:0,first_use_check:'',short_option:''}],cooldown:[],total_seconds:30},warnings:[]},generated_at:now});mine().daily_plans.push(plan);return plan.id}
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
      ,healthAvailable:true,
      ...Object.fromEntries(['health_rules','daily_plans','generation_jobs','training_sessions','meals','photo_assets','ai_consents'].map(key=>[key,[...own[key].map(r=>({...r})),...visible(other[key],'share_'+({health_rules:'profile',daily_plans:'plan',generation_jobs:'plan',training_sessions:'training',meals:'meal',photo_assets:'photo',ai_consents:'profile'})[key]).map(r=>({...r}))]]))
    };
    if (hold) {hold=false;await new Promise(resolve=>{release=resolve})}
    return snapshot;
  },
  async saveSettings(p){Object.assign(members.find(m=>m.user_id===uid()),p)},
  async saveHealthSharing(p){Object.assign(members.find(m=>m.user_id===uid()),p)},
  async saveHealthRules(rules,isShared,expected){const old=mine().health_rules[0];if(old&&old.updated_at!==expected)throw new Error('Update conflict');mine().health_rules=[old?{...old,rules,is_shared:isShared,updated_at:stamp(),updated_by:uid()}:row({user_id:uid(),rules,is_shared:isShared})]},
  async saveDailyPlan(targetDate,content,expectedVersion,isShared){const old=mine().daily_plans.filter(r=>r.target_date===targetDate).sort((a,b)=>b.version-a.version)[0];if((old?.version||null)!==expectedVersion)throw new Error('Update conflict');const plan=row({user_id:uid(),target_date:targetDate,version:(old?.version||0)+1,source:'manual',status:'published',is_shared:isShared,is_stale:false,is_locked:false,input_version:'synthetic',content,generated_at:stamp()});mine().daily_plans.push(plan);return plan},
  async setPlanLock(id,locked,expected){const plan=mine().daily_plans.find(r=>r.id===id);if(!plan||plan.updated_at!==expected)throw new Error('Update conflict');plan.is_locked=locked;plan.updated_at=stamp();return {...plan}},
  async requestPlanGeneration(targetDate){const job=row({user_id:uid(),target_date:targetDate,kind:'manual',status:'queued',attempts:0,max_attempts:3,error_code:null});mine().generation_jobs.push(job);return {...job}},
  async retryGenerationJob(id){const job=mine().generation_jobs.find(r=>r.id===id);job.status='queued';return {...job}},
  async generatePlan(id){window.__synthetic.generateCalls++;const job=mine().generation_jobs.find(r=>r.id===id);if(!job)throw new Error('Missing synthetic job');const old=mine().daily_plans.filter(r=>r.target_date===job.target_date).sort((a,b)=>b.version-a.version)[0];const plan=row({user_id:uid(),target_date:job.target_date,version:(old?.version||0)+1,source:'rules',status:'published',is_shared:false,is_stale:false,is_locked:false,input_version:'synthetic',content:old?.content||{summary:'合成生成计划',meals:[],training:{mode:'rest',warmup:[],items:[],cooldown:[],total_seconds:0},warnings:[]},generated_at:stamp()});mine().daily_plans.push(plan);job.status='succeeded';job.attempts++;job.plan_id=plan.id;return {job_id:id,status:'succeeded',plan_id:plan.id,error_code:null}},
  async saveTrainingSession(payload,id){return save(mine().training_sessions,{...payload,user_id:uid()},id)},
  async saveMeal(payload,id){return save(mine().meals,{...payload,user_id:uid()},id)},
  async deleteMeal(id){mine().meals=mine().meals.filter(r=>r.id!==id)},
  async setAiConsent(kind,enabled,limit,version){mine().ai_consents=mine().ai_consents.filter(r=>r.kind!==kind);mine().ai_consents.push(row({user_id:uid(),kind,enabled,monthly_limit_cents:limit,policy_version:version,is_shared:false}))},
  async parseSchedule(){throw new Error('Synthetic AI unavailable')},
  async estimateMeal(){throw new Error('Synthetic AI unavailable')},
  async uploadPhoto(){window.__synthetic.photoUploads++;throw new Error('Synthetic photo service unavailable')},
  async downloadPhoto(){throw new Error('Synthetic photo service unavailable')},
  async deletePhoto(){throw new Error('Synthetic photo service unavailable')},
  async saveProfile(p){mine().profile={...row(p),user_id:uid()}},
  async saveSchedule(p,id){return save(mine().schedules,p,id)},
  async deleteSchedule(id){mine().schedules=mine().schedules.filter(r=>r.id!==id)},
  async saveWeight(p,id){return save(mine().weights,p,id)},
  async deleteWeight(id){mine().weights=mine().weights.filter(r=>r.id!==id)},
  async exportOwnData(){return {profile:mine().profile,schedules:mine().schedules,weights:mine().weights,settings:members.find(m=>m.user_id===uid())}},
  async eraseOwnHealthData(){mine().profile=null;mine().schedules=[];mine().weights=[]},
  async leaveSpace(){throw new Error('Not used by synthetic UI suite')}
};
`;
}

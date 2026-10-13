// 只在浏览器测试路由替换中使用，不被应用导入，不进入生产构建。
// 合成账号、内存模拟接口，不构成真实Auth/持久化/跨设备验收。
export function mockApiModule({ recovery = false } = {}) {
  return `
export const configured = true;
export const configurationError = '';
const uid = '11111111-1111-4111-8111-111111111111';
const partnerId = '22222222-2222-4222-8222-222222222222';
let session = ${recovery ? `{access_token:'synthetic-recovery',user:{id:uid}}` : 'null'};
let space = null, callback, profile = null, schedules = [], weights = [], members = [], seq = 0;
const user = { id:uid,email:'synthetic-a@example.invalid' };
const stamp = () => new Date(Date.now() + (++seq) * 1000).toISOString();
const row = p => ({...p,id:'synthetic-'+(++seq),space_id:'synthetic-space',created_at:stamp(),updated_at:stamp(),updated_by:uid});
const save = (rows,p,id) => {
  if (p.notes === 'conflict-test') throw new Error('Update conflict');
  if(id){const old=rows.find(r=>r.id===id); if(!old || old.updated_at!==p.expected_updated_at)throw new Error('Update conflict');Object.assign(old,p,{updated_at:stamp(),updated_by:uid});return old;}
  if(rows.some(r=>r.user_id===p.user_id&&r.record_date===p.record_date))throw Object.assign(new Error('duplicate'),{code:'23505'});
  const item=row(p); rows.push(item);return item;
};
export const api={
 async session(){return session},
 onAuthChange(cb){callback=cb;${recovery ? "setTimeout(()=>cb(session,'PASSWORD_RECOVERY'),10);" : ''}return()=>{}},
 async signIn(){session={access_token:'synthetic-session',user}},
 async signUp(){return {needsEmailConfirmation:true}},
 async signOut(){session=null;callback?.(null,'SIGNED_OUT')},
 async resetPassword(){},async updatePassword(){},
 async load(){return {user,space,members,profile,profiles:profile?[profile]:[],schedules:[...schedules],weights:[...weights],audit:[],range:{from:'2026-01-01',to:'2027-01-01'}}},
 async createSpace(name,displayName){space={id:'synthetic-space',name};members=[{user_id:uid,space_id:space.id,display_name:displayName,share_profile:false,share_schedule:false,share_weight:false,allow_partner_edit:false}];return space.id},
 async createInvite(){return{token:'synthetic-token',expires_at:stamp()}},
 async joinSpace(){throw new Error('Invalid invitation')},
 async saveSettings(p){Object.assign(members[0],p)},
 async saveProfile(p){profile={...row(p),user_id:uid}},
 async saveSchedule(p,id){const saved=save(schedules,p,id);saved.version=(saved.version??0)+1;return saved},
 async deleteSchedule(id){schedules=schedules.filter(r=>r.id!==id)},
 async saveWeight(p,id){return save(weights,p,id)},
 async deleteWeight(id){weights=weights.filter(r=>r.id!==id)},
 async exportOwnData(){return{profile,schedules,weights,settings:members[0]}},
 async eraseOwnHealthData(){profile=null;schedules=[];weights=[]},
 async leaveSpace(){space=null;members=[];profile=null;schedules=[];weights=[]}
};
`;
}

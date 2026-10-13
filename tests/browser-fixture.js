// Only imported by the Playwright UI suite. All identities and records are synthetic.
export function mockApiModule() {
  return `
export const configured = true;
export const configurationError = '';
const ids = {me:'11111111-1111-4111-8111-111111111111',w:'22222222-2222-4222-8222-222222222222'};
const emails = {me:'me@plans.invalid',w:'w@plans.invalid'};
const credentials = {me:'Synthetic-only-password',w:'Synthetic-only-password'};
const store = {me:{profile:null,schedules:[],weights:[]},w:{profile:null,schedules:[],weights:[]}};
const members = Object.entries(ids).map(([slot,user_id])=>({user_id,space_id:'synthetic-space',display_name:slot==='me'?'合成甲':'合成 W',share_profile:false,share_schedule:false,share_weight:false,allow_partner_edit:false}));
const space = {id:'synthetic-space',name:'合成测试空间'};
let slot=null, session=null, callback, seq=0, hold=false, release;
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
  if (rows.some(r=>r.user_id===p.user_id&&r.record_date===p.record_date)) throw Object.assign(new Error('duplicate'),{code:'23505'});
  const item=row(p); rows.push(item); return {...item};
};
window.__synthetic = {
  holdNextLoad(){hold=true},
  isHeld(){return Boolean(release)},
  releaseLoad(){release?.();release=null},
  passwordCalls:0
};
export const api = {
  async session(){return session},
  onAuthChange(cb){callback=cb;return()=>{}},
  async currentAccount(){return slot},
  async signIn(next,password){
    if (!ids[next] || credentials[next]!==password) throw Object.assign(new Error('Invalid login'),{code:'INVALID_CREDENTIALS'});
    slot=next;
    session={access_token:'synthetic-session-'+(++seq),user:{id:ids[slot],email:emails[slot]}};
    callback?.(session,'SIGNED_IN');
  },
  async signOut(){session=null;slot=null;callback?.(null,'SIGNED_OUT')},
  async updatePassword(currentPassword,newPassword){
    window.__synthetic.passwordCalls++;
    if (credentials[slot]!==currentPassword) throw Object.assign(new Error('Wrong current password'),{code:'INVALID_CURRENT_PASSWORD'});
    credentials[slot]=newPassword;
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
    };
    if (hold) {hold=false;await new Promise(resolve=>{release=resolve})}
    return snapshot;
  },
  async saveSettings(p){Object.assign(members.find(m=>m.user_id===uid()),p)},
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

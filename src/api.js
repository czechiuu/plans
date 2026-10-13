import { createClient } from '@supabase/supabase-js'
import { shanghaiDate, validateConfig } from './domain.js'
import { authRedirectUrl } from './auth-redirect.js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const validation = validateConfig(url, key)
export const configured = validation.configured
export const configurationError = validation.error
const client = configured ? createClient(url, key) : null

function ready() {
  if (!client) throw new Error(configurationError || '尚未配置 Supabase')
  return client
}

async function result(promise) {
  const { data, error } = await promise
  if (error) throw error
  return data
}

async function ownUser() {
  const { data: { user }, error } = await ready().auth.getUser()
  if (error) throw error
  if (!user) throw new Error('请先登录')
  return user
}

async function allPages(table, column, value) {
  const rows = []
  for (let offset = 0;; offset += 500) {
    const page = await result(ready().from(table).select('*').eq(column, value).order('created_at', { ascending: true }).order('id').range(offset, offset + 499))
    rows.push(...page)
    if (page.length < 500) return rows
  }
}

export const api = {
  async session() {
    const { data: { session }, error } = await ready().auth.getSession()
    if (error) throw error
    return session
  },
  onAuthChange(callback) {
    const { data: { subscription } } = ready().auth.onAuthStateChange((event, session) => callback(session, event))
    return () => subscription.unsubscribe()
  },
  async signIn(email, password) { await result(ready().auth.signInWithPassword({ email, password })) },
  async signUp(email, password) {
    const data = await result(ready().auth.signUp({ email, password, options: { emailRedirectTo: authRedirectUrl(window.location.href) } }))
    return { needsEmailConfirmation: !data.session }
  },
  async signOut() { await result(ready().auth.signOut()) },
  async resetPassword(email) {
    const redirectTo = authRedirectUrl(window.location.href)
    await result(ready().auth.resetPasswordForEmail(email, { redirectTo }))
  },
  async updatePassword(password) { await result(ready().auth.updateUser({ password })) },
  async load() {
    const user = await ownUser()
    const member = await result(ready().from('members').select('space_id').eq('user_id', user.id).maybeSingle())
    const today = shanghaiDate()
    if (!member) return { user, space: null, members: [], profile: null, profiles: [], schedules: [], weights: [], audit: [], range: { from: today, to: today } }
    const spaceId = member.space_id
    const [space, members, profiles, schedules, weights, audit] = await Promise.all([
      result(ready().from('spaces').select('id,name').eq('id', spaceId).single()),
      result(ready().from('members').select('space_id,user_id,display_name,share_profile,share_schedule,share_weight,allow_partner_edit').eq('space_id', spaceId)),
      result(ready().from('health_profiles').select('*').eq('space_id', spaceId)),
      allPages('schedules', 'space_id', spaceId),
      allPages('weights', 'space_id', spaceId),
      result(ready().from('audit_events').select('*').eq('space_id', spaceId).order('created_at', { ascending: false }).limit(100))
    ])
    const dates = [...schedules, ...weights].map(row => row.record_date).sort()
    const range = { from: dates[0] ?? today, to: dates.at(-1) ?? today }
    return { user, space, members, profile: profiles.find(row => row.user_id === user.id) ?? null, profiles, schedules, weights, audit, range }
  },
  async createSpace(name, displayName) { return result(ready().rpc('create_space', { p_name: name, p_display_name: displayName })) },
  async createInvite() {
    const rows = await result(ready().rpc('create_invite'))
    return rows[0]
  },
  async joinSpace(token, displayName, settings = {}) { return result(ready().rpc('join_space', { p_token: token, p_display_name: displayName, p_settings: settings })) },
  async saveSettings(settings) { await result(ready().rpc('save_settings', { p_settings: settings })) },
  async saveProfile(payload) { return result(ready().rpc('save_profile', { p_payload: payload }).single()) },
  async saveSchedule(payload, id = null) { return result(ready().rpc('save_schedule', { p_payload: payload, p_id: id }).single()) },
  async deleteSchedule(id) { await result(ready().rpc('delete_schedule', { p_id: id })) },
  async saveWeight(payload, id = null) { return result(ready().rpc('save_weight', { p_payload: payload, p_id: id }).single()) },
  async deleteWeight(id) { await result(ready().rpc('delete_weight', { p_id: id })) },
  async exportOwnData() {
    const user = await ownUser()
    const member = await result(ready().from('members').select('display_name,share_profile,share_schedule,share_weight,allow_partner_edit').eq('user_id', user.id).maybeSingle())
    const [profiles, schedules, weights] = await Promise.all([
      allPages('health_profiles', 'user_id', user.id), allPages('schedules', 'user_id', user.id), allPages('weights', 'user_id', user.id)
    ])
    return { exported_at: new Date().toISOString(), profile: profiles[0] ?? null, schedules, weights, settings: member }
  },
  async eraseOwnHealthData() { await result(ready().rpc('erase_own_health_data')) },
  async leaveSpace() { await result(ready().rpc('leave_space')) }
}

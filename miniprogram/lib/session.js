const { requestJson, fail } = require('./client.js')

const STORAGE_KEY = 'plans-mini:session'
const emails = { me: 'me@plans.invalid', w: 'w@plans.invalid' }

function createSession(wx, config, onInvalidated = async () => {}) {
  const base = config.url.replace(/\/$/, '')
  let credential = null, identity = null, epoch = 0, refreshPromise = null
  const headers = token => ({ apikey: config.key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) })
  const assert = expected => { if (epoch !== expected) throw fail('ACCOUNT_CHANGED') }
  const suspend = () => { epoch++; credential = null; identity = null; refreshPromise = null }
  const clear = () => { suspend(); wx.removeStorageSync(STORAGE_KEY) }
  const temporary = error => ['NETWORK_ERROR', 'REQUEST_TIMEOUT'].includes(error?.code) ||
    error?.status === 408 || error?.status === 429 || error?.status >= 500
  const invalidate = async expectedEpoch => { assert(expectedEpoch); clear(); await onInvalidated(); throw fail('AUTH_REQUIRED') }
  const persist = () => wx.setStorageSync(STORAGE_KEY, credential)
  const parseCredential = (data, slot) => {
    if (!data || typeof data.access_token !== 'string' || !data.access_token ||
      typeof data.refresh_token !== 'string' || !data.refresh_token ||
      !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw fail('ACCOUNT_CHECK_FAILED')
    return { access_token: data.access_token, refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000, slot }
  }
  async function verify(token, slot, expectedEpoch, previous = null) {
    const user = await requestJson(wx, { url: `${base}/auth/v1/user`, method: 'GET', header: headers(token) })
    assert(expectedEpoch)
    if (!user?.id || user.email !== emails[slot] || (previous?.userId && previous.userId !== user.id)) throw fail('ACCOUNT_DENIED')
    const account = await requestJson(wx, { url: `${base}/rest/v1/rpc/current_account`, method: 'POST', data: {}, header: headers(token) })
    assert(expectedEpoch)
    if (account !== slot) throw fail('ACCOUNT_DENIED')
    const spaceId = await requestJson(wx, { url: `${base}/rest/v1/rpc/current_space_id`, method: 'POST', data: {}, header: headers(token) })
    assert(expectedEpoch)
    if (!spaceId || typeof spaceId !== 'string' || (previous?.spaceId && previous.spaceId !== spaceId)) throw fail('ACCOUNT_DENIED')
    const members = await requestJson(wx, { url: `${base}/rest/v1/members?select=space_id&user_id=${encodeURIComponent(`eq.${user.id}`)}&space_id=${encodeURIComponent(`eq.${spaceId}`)}&limit=2`,
      method: 'GET', header: headers(token) })
    assert(expectedEpoch)
    if (!Array.isArray(members) || members.length !== 1 || members[0]?.space_id !== spaceId) throw fail('ACCOUNT_DENIED')
    return { user, account, spaceId, userId: user.id }
  }
  async function refresh() {
    if (!credential) throw fail('AUTH_REQUIRED')
    if (refreshPromise) return refreshPromise
    const at = epoch, previous = { userId: credential.userId, spaceId: credential.spaceId }
    const current = credential
    const work = (async () => {
      const data = await requestJson(wx, { url: `${base}/auth/v1/token?grant_type=refresh_token`, method: 'POST',
        data: { refresh_token: current.refresh_token }, header: headers() })
      assert(at)
      const next = parseCredential(data, current.slot)
      credential = { ...next, ...previous }
      persist()
      const verified = await verify(next.access_token, current.slot, at, previous)
      assert(at)
      credential = { ...next, userId: verified.userId, spaceId: verified.spaceId }
      identity = { user: verified.user, account: verified.account, spaceId: verified.spaceId }
      persist()
      return credential
    })()
    const settled = work.catch(async error => {
      if (epoch === at) {
        if (temporary(error)) suspend(); else clear()
        await onInvalidated()
        if (error.status === 401 || error.code === 'invalid_grant') throw fail('AUTH_REQUIRED')
      }
      throw error
    }).finally(() => { if (refreshPromise === settled) refreshPromise = null })
    refreshPromise = settled
    return settled
  }
  async function capture() {
    if (!credential || !identity) throw fail('AUTH_REQUIRED')
    if (credential.expires_at <= Date.now() + 30000) await refresh()
    if (!credential || !identity) throw fail('AUTH_REQUIRED')
    return { token: credential.access_token, epoch }
  }
  async function signIn(slot, password) {
    if (!emails[slot] || typeof password !== 'string' || !password) throw fail('ACCOUNT_DENIED')
    clear()
    const at = epoch
    try {
      const data = await requestJson(wx, { url: `${base}/auth/v1/token?grant_type=password`, method: 'POST',
        data: { email: emails[slot], password }, header: headers() })
      assert(at)
      const next = parseCredential(data, slot)
      const verified = await verify(next.access_token, slot, at)
      assert(at)
      credential = { ...next, userId: verified.userId, spaceId: verified.spaceId }
      identity = { user: verified.user, account: verified.account, spaceId: verified.spaceId }
      persist()
      return identity
    } catch (error) { if (epoch === at) clear(); throw error }
  }
  async function restore() {
    if (identity) return identity
    const saved = wx.getStorageSync(STORAGE_KEY)
    if (!saved) return null
    suspend()
    const at = epoch
    try {
      if (!emails[saved.slot] || !saved.access_token || !saved.refresh_token || !Number.isFinite(saved.expires_at)) throw fail('AUTH_REQUIRED')
      credential = saved
      if (saved.expires_at <= Date.now() + 30000) {
        await refresh()
        return identity
      }
      const verified = await verify(saved.access_token, saved.slot, at, saved)
      assert(at)
      identity = { user: verified.user, account: verified.account, spaceId: verified.spaceId }
      credential = { ...saved, userId: verified.userId, spaceId: verified.spaceId }
      persist()
      return identity
    } catch (error) {
      if (epoch === at) {
        if (temporary(error)) suspend(); else clear()
        await onInvalidated()
        if (error.status === 401) throw fail('AUTH_REQUIRED')
      }
      throw error
    }
  }
  const session = () => identity && { user: identity.user, account: identity.account, spaceId: identity.spaceId }
  const signOut = () => { const token = credential?.access_token || null; clear(); return token }
  return { capture, assert, clear, invalidate, signOut, signIn, restore, session }
}

module.exports = { createSession, STORAGE_KEY }

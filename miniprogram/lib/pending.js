const prefix = 'plans-mini:pending:'
const failure = code => Object.assign(new Error(code), { code })
const clone = value => JSON.parse(JSON.stringify(value))
function key(kind) {
  const userId = getApp().api.session()?.user?.id
  if (!userId) throw failure('AUTH_REQUIRED')
  if (!/^[a-z-]+$/.test(kind)) throw failure('INVALID_REQUEST')
  return `${prefix}${userId}:${kind}`
}
function get(kind) { return wx.getStorageSync(key(kind)) || null }
async function reserve(kind, payload) {
  const storageKey = key(kind)
  const existing = wx.getStorageSync(storageKey)
  if (existing) {
    const { client_request_id, ...source } = existing
    if (JSON.stringify(source) !== JSON.stringify(payload)) throw failure('PENDING_CONFLICT')
    return clone(existing)
  }
  const bytes = await new Promise((resolve, reject) => wx.getRandomValues({ length: 16,
    success: result => resolve(new Uint8Array(result.randomValues)), fail: () => reject(failure('RANDOM_UNAVAILABLE')) }))
  if (bytes.length !== 16) throw failure('RANDOM_UNAVAILABLE')
  if (key(kind) !== storageKey) throw failure('ACCOUNT_CHANGED')
  // 并行点击也只能保留同一份请求；网络写入由页面 busy 再限制。
  const raced = wx.getStorageSync(storageKey)
  if (raced) {
    const { client_request_id, ...source } = raced
    if (JSON.stringify(source) !== JSON.stringify(payload)) throw failure('PENDING_CONFLICT')
    return clone(raced)
  }
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  const value = { ...clone(payload), client_request_id: `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}` }
  wx.setStorageSync(storageKey, value)
  return clone(value)
}
function clear(kind) { wx.removeStorageSync(key(kind)) }
function clearOwner(userId) {
  if (!userId) return
  for (const item of wx.getStorageInfoSync().keys) if (item.startsWith(`${prefix}${userId}:`)) wx.removeStorageSync(item)
}
module.exports = { get, reserve, clear, clearOwner }

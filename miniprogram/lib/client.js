const fail = (code, status, message = code) => Object.assign(new Error(message), { code, ...(status ? { status } : {}) })

function wxCall(method, options, errorCode = 'NETWORK_ERROR') {
  return new Promise((resolve, reject) => {
    try {
      method({ ...options, success: resolve, fail: error => reject(Object.assign(fail(errorCode), { cause: error })) })
    } catch (error) { reject(Object.assign(fail(errorCode), { cause: error })) }
  })
}

const networkQueues = new WeakMap()
function networkCall(wx, method, options, beforeSend = () => {}) {
  let queue = networkQueues.get(wx)
  if (!queue) { queue = { active: 0, pending: [] }; networkQueues.set(wx, queue) }
  const drain = () => {
    while (queue.active < 10 && queue.pending.length) queue.pending.shift()()
  }
  return new Promise((resolve, reject) => {
    queue.pending.push(() => {
      queue.active++
      Promise.resolve().then(() => { beforeSend(); return wxCall(wx[method].bind(wx), options) })
        .then(resolve, reject).finally(() => { queue.active--; drain() })
    })
    drain()
  })
}

function json(value) {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

function checked(response) {
  const data = json(response.data)
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const code = typeof data?.error === 'string' ? data.error :
      typeof data?.code === 'string' ? data.code : `HTTP_${response.statusCode}`
    throw fail(code, response.statusCode, typeof data?.message === 'string' && data.message ? data.message : code)
  }
  return data
}

async function requestJson(wx, options, beforeSend) {
  return checked(await networkCall(wx, 'request', { timeout: 30000, ...options }, beforeSend))
}

function one(data, optional = false) {
  const rows = Array.isArray(data) ? data : [data]
  if (optional && rows.length === 0) return null
  if (rows.length !== 1 || !rows[0] || typeof rows[0] !== 'object' || Array.isArray(rows[0])) throw fail('INVALID_RESPONSE')
  return rows[0]
}

function createClient(wx, config, session) {
  const base = config.url.replace(/\/$/, '')
  const common = { apikey: config.key, 'Content-Type': 'application/json' }
  async function authorized(method, path, data, extraHeader = {}, expectedEpoch = null) {
    const { token, epoch } = await session.capture()
    if (expectedEpoch !== null) session.assert(expectedEpoch)
    try {
      const result = await requestJson(wx, { url: base + path, method, data,
        header: { ...common, Authorization: `Bearer ${token}`, ...extraHeader } }, () => session.assert(epoch))
      session.assert(epoch)
      return result
    } catch (error) {
      session.assert(epoch)
      if (error.status === 401) return session.invalidate(epoch)
      throw error
    }
  }
  const rpc = (name, args = {}, expectedEpoch = null) => authorized('POST', `/rest/v1/rpc/${name}`, args, {}, expectedEpoch)
  const rpcOne = async (name, args = {}) => one(await rpc(name, args))
  const rpcVoid = async (name, args = {}) => { await rpc(name, args) }
  async function rows(table, filters = {}, options = {}) {
    const query = [`select=${encodeURIComponent(options.select || '*')}`]
    for (const [column, value] of Object.entries(filters)) query.push(`${encodeURIComponent(column)}=${encodeURIComponent(`eq.${value}`)}`)
    if (options.order) query.push(`order=${encodeURIComponent(options.order)}`)
    if (options.limit != null) query.push(`limit=${options.limit}`)
    if (options.offset != null) query.push(`offset=${options.offset}`)
    const data = await authorized('GET', `/rest/v1/${table}?${query.join('&')}`, undefined, {}, options.epoch ?? null)
    if (!Array.isArray(data)) throw fail('INVALID_RESPONSE')
    return data
  }
  async function allRows(table, filters, order = 'created_at.asc,id.asc', epoch = null) {
    const result = []
    for (let offset = 0;; offset += 500) {
      const page = await rows(table, filters, { order, limit: 500, offset, epoch })
      result.push(...page)
      if (page.length < 500) return result
    }
  }
  async function upload(path, mealId, isShared, expectedEpoch = null) {
    const { token, epoch } = await session.capture()
    if (expectedEpoch !== null) session.assert(expectedEpoch)
    let response
    try {
      response = await networkCall(wx, 'uploadFile', { url: `${base}/functions/v1/health-photo?action=upload`,
        filePath: path, name: 'file', formData: { ...(mealId ? { meal_id: mealId } : {}), is_shared: String(isShared) },
        header: { apikey: config.key, Authorization: `Bearer ${token}` }, timeout: 30000 }, () => session.assert(epoch))
      session.assert(epoch)
      return checked(response)
    } catch (error) {
      session.assert(epoch)
      if (error.status === 401) return session.invalidate(epoch)
      throw error
    }
  }
  async function download(id, expectedEpoch = null) {
    const { token, epoch } = await session.capture()
    if (expectedEpoch !== null) session.assert(expectedEpoch)
    let response
    try {
      response = await networkCall(wx, 'downloadFile', { url: `${base}/functions/v1/health-photo?action=download&photo_id=${encodeURIComponent(id)}`,
        header: { apikey: config.key, Authorization: `Bearer ${token}` }, timeout: 30000 }, () => session.assert(epoch))
      session.assert(epoch)
      if (response.statusCode < 200 || response.statusCode >= 300) throw fail('PHOTO_DOWNLOAD_FAILED', response.statusCode)
      const contentType = Object.entries(response.header || {}).find(([name]) => name.toLowerCase() === 'content-type')?.[1]
      if (String(contentType || '').split(';')[0].trim().toLowerCase() !== 'image/png') throw fail('PHOTO_INVALID_RESPONSE')
      if (!response.tempFilePath) throw fail('PHOTO_INVALID_RESPONSE')
      return response.tempFilePath
    } catch (error) {
      if (response?.tempFilePath) await wxCall(wx.getFileSystemManager().unlink.bind(wx.getFileSystemManager()),
        { filePath: response.tempFilePath }).catch(() => {})
      session.assert(epoch)
      if (error.status === 401) return session.invalidate(epoch)
      throw error
    }
  }
  return { authorized, rpc, rpcOne, rpcVoid, rows, allRows, upload, download }
}

module.exports = { createClient, requestJson, wxCall, one, fail }

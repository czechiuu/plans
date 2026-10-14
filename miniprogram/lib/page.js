const baseData = { loading: false, busy: false, error: '', notice: '', offline: false }
const labels = {
  AUTH_REQUIRED: '登录已失效，请重新登录', ACCOUNT_CHANGED: '账号已变化，请重新打开页面', ACCOUNT_DENIED: '此账号不能访问本空间',
  ACCOUNT_CHECK_FAILED: '账号核验失败，请重新登录', CONFIG_INVALID: '尚未配置公开后端地址', NETWORK_ERROR: '网络连接失败，请检查网络后重试',
  REQUEST_TIMEOUT: '请求超时，保存结果暂不确定，请先刷新再重试', AI_CONSENT_REQUIRED: '尚未授权此项 AI 用途，请到设置核对',
  AI_BUDGET_EXCEEDED: 'AI 额度不足，手动记录仍可使用', AI_HEALTH_DISABLED: '此服务健康用途未启用',
  PENDING_CONFLICT: '有一条结果未确认的提交，请先重试或刷新核对原记录', RANDOM_UNAVAILABLE: '无法生成提交编号，请更新微信后重试',
  CANCELLED: '已取消', PHOTO_NOT_FOUND: '照片已删除或当前无权查看', PHOTO_UPLOAD_PENDING: '照片上传仍待确认，请刷新后检查',
  CONFLICT: '记录已被更新，请刷新后再修改', SIGNOUT_UNCONFIRMED: '本机已退出；服务器注销未确认，请联网后再登录',
  PUBLIC_CONFIG_INVALID: '后端公开配置不正确，请重新构建项目'
}
function errorText(error) { return labels[error?.code] || labels[error?.message] || error?.message || '操作失败，请重试' }
function api() { return getApp().api }
function authError(error) {
  if (['AUTH_REQUIRED','ACCOUNT_CHANGED','ACCOUNT_DENIED','ACCOUNT_CHECK_FAILED'].includes(error?.code) || !api().session()) {
    if (error?.code === 'NETWORK_ERROR' || error?.code === 'REQUEST_TIMEOUT') getApp().restoreError = error
    getApp().clearViewData()
    wx.reLaunch({ url: '/pages/login/index' })
    return true
  }
  return false
}
async function refresh(page) {
  const token = {}; page.refreshToken = token
  page.setData({ loading: true, error: '', offline: Boolean(getApp().globalData.offline) })
  try {
    const data = await getApp().loadData()
    if (page.refreshToken === token) { page.ownerUserId = data.user.id; await page.receive(data) }
    return data
  } catch (error) {
    if (page.refreshToken === token && !authError(error)) page.setData({ error: errorText(error) })
    return null
  } finally { if (page.refreshToken === token) page.setData({ loading: false }) }
}
async function perform(page, action, success, { reload = true } = {}) {
  if (page.data.busy) return { ok: false, error: new Error('请等待当前操作完成') }
  page.setData({ busy: true, error: '', notice: '' })
  const owner = api().session()?.user?.id
  try {
    if (page.ownerUserId && page.ownerUserId !== owner) throw Object.assign(new Error('ACCOUNT_CHANGED'),{code:'ACCOUNT_CHANGED'})
    const value = await action()
    if (api().session()?.user?.id !== owner) throw Object.assign(new Error('ACCOUNT_CHANGED'),{code:'ACCOUNT_CHANGED'})
    if (reload) await refresh(page)
    page.setData({ notice: success || '已保存' })
    return { ok: true, value }
  } catch (error) {
    if (!authError(error)) page.setData({ error: errorText(error) })
    return { ok: false, error }
  } finally { page.setData({ busy: false }) }
}
const openSettings = () => wx.navigateTo({ url: '/pages/settings/index' })
const openWeight = () => wx.navigateTo({ url: '/pages/weight/index' })
module.exports = { baseData, refresh, perform, api, openSettings, openWeight, errorText }

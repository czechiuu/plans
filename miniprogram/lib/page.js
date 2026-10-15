const baseData = { loading: false, busy: false, error: '', notice: '', offline: false }
const labels = {
  AUTH_REQUIRED: '登录已失效，请重新登录', ACCOUNT_CHANGED: '账号已变化，请重新打开页面', ACCOUNT_DENIED: '此账号不能访问本空间',
  ACCOUNT_CHECK_FAILED: '账号核验失败，请重新登录', CONFIG_INVALID: '尚未配置公开后端地址', NETWORK_ERROR: '网络连接失败，请检查网络后重试',
  REQUEST_TIMEOUT: '请求超时，保存结果暂不确定，请先刷新再重试', AI_CONSENT_REQUIRED: '尚未授权此项 AI 用途，请到设置核对',
  AI_BUDGET_EXCEEDED: 'AI 额度不足，手动记录仍可使用', AI_HEALTH_DISABLED: '此服务健康用途未启用',
  PENDING_CONFLICT: '有一条结果未确认的提交，请先重试或刷新核对原记录', RANDOM_UNAVAILABLE: '无法生成提交编号，请更新微信后重试',
  CANCELLED: '已取消', PHOTO_NOT_FOUND: '照片已删除或当前无权查看', PHOTO_UPLOAD_PENDING: '照片上传仍待确认，请刷新后检查',
  PHOTO_PRIVACY_FAILED: '微信隐私确认未完成，请重试并核对隐私指引状态（PHOTO_PRIVACY_FAILED）',
  PHOTO_PERMISSION_DENIED: '相机或相册权限被拒绝，请在微信设置中允许后重试（PHOTO_PERMISSION_DENIED）',
  PHOTO_SOURCE_FAILED: '无法打开拍照或相册菜单，请重试（PHOTO_SOURCE_FAILED）',
  PHOTO_CHOOSE_FAILED: '未能打开或完成微信选图，尚未上传（PHOTO_CHOOSE_FAILED）',
  PHOTO_EMPTY_RESULT: '微信返回成功但未提供一张可读取的照片，尚未上传（PHOTO_EMPTY_RESULT）',
  PHOTO_READ_FAILED: '无法读取所选照片，请重新选择（PHOTO_READ_FAILED）',
  PHOTO_SANITIZE_FAILED: '照片处理失败，尚未上传，请重新选择（PHOTO_SANITIZE_FAILED）',
  PHOTO_CANVAS_UNAVAILABLE: '照片处理画布尚未就绪，请重新打开此页面（PHOTO_CANVAS_UNAVAILABLE）',
  PHOTO_TOO_LARGE: '照片实际超过 4 MiB 上限，未继续处理，请重新选择（PHOTO_TOO_LARGE）',
  PHOTO_FILE_SIZE_INVALID: '微信未返回有效的照片文件大小，未继续处理（PHOTO_FILE_SIZE_INVALID）',
  PHOTO_FILE_SIZE_MISMATCH: '照片读取字节与文件大小不一致，未继续处理（PHOTO_FILE_SIZE_MISMATCH）',
  PHOTO_FILE_DATA_INVALID: '微信未返回二进制照片数据，未继续处理（PHOTO_FILE_DATA_INVALID）',
  PHOTO_DIMENSIONS_INVALID: '微信未返回有效的照片宽高，尚未上传（PHOTO_DIMENSIONS_INVALID）',
  INVALID_PNG: '照片文件头不是 PNG，未继续处理（INVALID_PNG）',
  CONFLICT: '记录已被更新，请刷新后再修改', SIGNOUT_UNCONFIRMED: '本机已退出；服务器注销未确认，请联网后再登录',
  PUBLIC_CONFIG_INVALID: '后端公开配置不正确，请重新构建项目'
}
function errorText(error) {
  const text = labels[error?.code] || labels[error?.message] || error?.message || '操作失败，请重试'
  const stage = { source: '来源选择', privacy: '隐私确认', choose: '微信选图', sanitize: '本机照片处理', validate: 'PNG 文件校验' }[error?.photoStage]
  if (!stage) return text
  const reason = { 'privacy-declaration': '隐私指引未声明此接口', 'permission-denied': '权限被拒绝', unsupported: '当前微信环境不支持此接口', unknown: '原因尚未识别' }[error?.photoReason]
  return `${text}；阶段：${stage}${reason ? `；${reason}` : ''}${Number.isSafeInteger(error.wxErrCode) ? `；微信 errCode：${error.wxErrCode}` : ''}${Number.isSafeInteger(error.wxErrno) ? `；微信 errno：${error.wxErrno}` : ''}` +
    `${Number.isSafeInteger(error.photoWidth) && error.photoWidth > 0 && Number.isSafeInteger(error.photoHeight) && error.photoHeight > 0 ? `；输出：${error.photoWidth}×${error.photoHeight}` : ''}` +
    `${Number.isSafeInteger(error.photoBytes) && error.photoBytes >= 0 ? `；文件：${error.photoBytes} 字节` : ''}${Number.isSafeInteger(error.photoReadBytes) && error.photoReadBytes >= 0 ? `；读取：${error.photoReadBytes} 字节` : ''}` +
    `${['null', 'undefined', 'string', 'number', 'boolean', 'object', 'function', 'symbol', 'bigint', 'TypedArray'].includes(error.photoDataType) ? `；数据类型：${error.photoDataType}` : ''}`
}
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

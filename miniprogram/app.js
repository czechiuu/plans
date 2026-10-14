const config = require('./config')
const { createApi } = require('./lib/api')
App({
  globalData: { data: null, offline: false },
  onLaunch() {
    this.api = createApi(wx, config)
    this.restoreSession()
    wx.onNetworkStatusChange(({ isConnected }) => {
      this.globalData.offline = !isConnected
      for (const page of getCurrentPages()) page.setData({ offline: !isConnected })
    })
    wx.getNetworkType({ success: ({ networkType }) => { this.globalData.offline = networkType === 'none' } })
    wx.onNeedPrivacyAuthorization(resolve => {
      if (this.privacyResolve) this.privacyResolve({ event: 'disagree' })
      this.privacyResolve = resolve
      wx.navigateTo({ url: '/pages/privacy/index', fail: () => this.resolvePrivacy(false) })
    })
  },
  restoreSession() {
    this.restoreError = null
    this.ready = this.api.restore().catch(error => { this.restoreError = error; return null })
    return this.ready
  },
  async loadData() {
    await this.ready
    const data = await this.api.load()
    this.globalData.data = data
    return data
  },
  clearViewData() {
    this.globalData.data = null
    // 调用方用 reLaunch 关闭健康页面栈，不能按字段类型猜测并改写页面表单。
  },
  resolvePrivacy(agree) {
    const resolve = this.privacyResolve; this.privacyResolve = null
    if (resolve) resolve(agree ? { event: 'agree', buttonId: 'privacy-agree' } : { event: 'disagree' })
  }
})

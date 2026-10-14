const { errorText } = require('../../lib/page')
Page({
  data: { slot: 'me', password: '', busy: false, error: '', offline: false },
  async onShow() {
    const app = getApp(); await app.ready
    this.setData({ password: '', offline: app.globalData.offline, error: app.globalData.signoutNotice || (app.restoreError ? errorText(app.restoreError) : '') })
    app.globalData.signoutNotice = ''
    if (app.api.session()) wx.switchTab({ url: '/pages/today/index' })
  },
  async reconnect() {
    if (this.data.busy) return
    this.setData({busy:true,error:''})
    try {
      const identity = await getApp().restoreSession()
      if (identity) wx.switchTab({url:'/pages/today/index'})
      else this.setData({error:getApp().restoreError ? errorText(getApp().restoreError) : '本机没有可恢复会话，请输入密码登录'})
    } finally { this.setData({busy:false}) }
  },
  slot(event) { this.setData({ slot: event.currentTarget.dataset.slot, password: '', error: '' }) },
  password(event) { this.setData({ password: event.detail.value }) },
  async login() {
    if (this.data.busy) return
    if (!this.data.password) { this.setData({ error: '请输入自己的账号密码' }); return }
    this.setData({ busy: true, error: '' })
    const password = this.data.password
    this.setData({ password: '' })
    try {
      getApp().clearViewData()
      await getApp().api.signIn(this.data.slot, password)
      await wx.switchTab({ url: '/pages/today/index' })
    } catch (error) { this.setData({ error: errorText(error) }) }
    finally { this.setData({ busy: false }) }
  },
  privacy() { wx.navigateTo({ url: '/pages/privacy/index' }) }
})

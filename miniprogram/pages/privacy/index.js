Page({
  data: { requesting: false, error: '' },
  onLoad() { this.setData({ requesting: Boolean(getApp().privacyResolve) }) },
  contract() { wx.openPrivacyContract({ fail: () => this.setData({ error: '微信后台尚未发布隐私指引，照片权限暂不能核验。' }) }) },
  agree() { getApp().resolvePrivacy(true); wx.navigateBack() },
  disagree() { getApp().resolvePrivacy(false); wx.navigateBack() },
  onUnload() { if (getApp().privacyResolve) getApp().resolvePrivacy(false) }
})

const { baseData, refresh, perform, api } = require('../../lib/page')
const { clearOwner } = require('../../lib/pending')
const purposes = [
  ['parse_schedule','日程文字解析','本次原文、提交时间和本人账号槽位'],
  ['generate_plan','计划生成','目标日、本人档案与规则、日程和近期训练摘要'],
  ['estimate_meal_text','文字餐食估算','本餐食物、份量、油酱、剩余与实际吃下比例'],
  ['estimate_meal_photo','图片餐食估算','本餐文字资料和最多两张仍获授权的净化照片'],
  ['adjust_plan','餐后调整','当天计划、确认餐食、日程、运动反馈与本人规则']
]
const sharingFields = [ ['share_profile','个人档案'],['share_schedule','日程'],['share_weight','体重'],['share_plan','计划'],['share_training','训练'],['share_meal','餐食'],['share_photo','照片'],['allow_partner_edit','允许伴侣修改已共享记录'] ]
const providerNames = ['确定性规则','DeepSeek','OpenAI']
const providerValues = ['rules','deepseek','openai']
Page({
  data: { ...baseData, account: '', consents: [], sharing: [], services: [], providerNames, providerIndex: 0, settingsReady:false },
  onShow() { refresh(this) },
  async receive(data) {
    const status = await api().aiStatus()
    const member = data.members.find(row => row.user_id === data.user.id) || {}
    const consents = ['deepseek','openai'].flatMap(provider => purposes.map(([purpose,title,scope]) => {
      const row = data.ai_consents.find(item => item.user_id === data.user.id && item.provider === provider && item.purpose === purpose)
      const usage = status.providers?.[provider]?.usage?.[purpose]
      return { key: `${provider}:${purpose}`, provider, providerName: provider === 'deepseek' ? 'DeepSeek' : 'OpenAI', purpose, title, scope,
        enabled: row?.enabled || false, savedEnabled: row?.enabled || false, limit: String(row?.monthly_limit_cents ?? 0),
        usage: usage ? `本月已用 ${usage.charged_cents} 美分，预约 ${usage.reserved_cents} 美分` : '当前用途用量未返回',
        ...(this._consentDrafts?.[`${provider}:${purpose}`] || {}) }
    }))
    this.setData({ account: data.account === 'me' ? '我' : 'W', consents, settingsReady:true,
      sharing: sharingFields.map(([key,title]) => ({key,title,enabled:this._sharingDraft?.[key] ?? !!member[key]})),
      providerIndex: Math.max(0, providerValues.indexOf(status.plan_provider)),
      services: ['deepseek','openai'].map(provider => ({name:provider==='deepseek'?'DeepSeek':'OpenAI',
        text: status.providers?.[provider]?.configured && status.providers?.[provider]?.budget_configured && status.global_budget_configured && status.providers?.[provider]?.health_enabled === true ? '服务已配置，仍受本人用途授权和预算限制' : '服务或预算未就绪'})) })
  },
  consentToggle(event) { this.consentDraft(Number(event.currentTarget.dataset.index),'enabled',!!event.detail.value) },
  consentLimit(event) { this.consentDraft(Number(event.currentTarget.dataset.index),'limit',event.detail.value) },
  consentDraft(index,field,value) {
    const row=this.data.consents[index]
    this._consentDrafts=this._consentDrafts || {}
    this._consentDrafts[row.key]={enabled:row.enabled,limit:row.limit,[field]:value}
    this.setData({[`consents[${index}].${field}`]:value})
  },
  saveConsent(event) {
    if (!this.data.settingsReady) return
    const row = this.data.consents[Number(event.currentTarget.dataset.index)]
    const limit = Number(row.limit)
    if (!/^\d+$/.test(row.limit) || !Number.isInteger(limit) || limit < 0 || limit > 500) { this.setData({error:'每月上限须为 0–500 的整数美分'}); return }
    wx.showModal({ title: `${row.enabled?'允许':'撤销'} ${row.providerName} · ${row.title}`, content: `${row.scope}。每月上限 ${limit} 美分。保存本身不调用 AI，不提高全局预算。`, success: async ({confirm}) => {
      if (confirm) {
        const result=await perform(this, () => api().setAiProviderConsent(row.provider,row.purpose,row.enabled,limit,`2026-10-13-${row.provider}-health-v1`),'本人用途授权已保存',{reload:false})
        if (result.ok) { if(this._consentDrafts) delete this._consentDrafts[row.key]; await refresh(this) }
      }
    } })
  },
  shareToggle(event) {
    const index=Number(event.currentTarget.dataset.index), row=this.data.sharing[index]
    this._sharingDraft=this._sharingDraft || {}; this._sharingDraft[row.key]=!!event.detail.value
    this.setData({[`sharing[${index}].enabled`]:!!event.detail.value})
  },
  async saveSharing(event) {
    if (!this.data.settingsReady) return
    const keys = event.currentTarget.dataset.kind === 'health' ? ['share_plan','share_training','share_meal','share_photo'] : ['share_profile','share_schedule','share_weight','allow_partner_edit']
    const values = Object.fromEntries(this.data.sharing.filter(row => keys.includes(row.key)).map(row => [row.key,row.enabled]))
    const result=await perform(this, () => event.currentTarget.dataset.kind === 'health' ? api().saveHealthSharing(values) : api().saveSettings(values),'所选类别共享设置已保存',{reload:false})
    if (result.ok) { for(const key of keys) if(this._sharingDraft) delete this._sharingDraft[key]; await refresh(this) }
  },
  provider(event) { this.setData({providerIndex:Number(event.detail.value)}) },
  saveProvider() {
    if (!this.data.settingsReady) return
    const provider = providerValues[this.data.providerIndex]
    wx.showModal({ title:'保存夜间计划方式', content:`采用${providerNames[this.data.providerIndex]}。付费方式仍需本人计划用途授权和预算；不修改另一人的选择。`, success: async ({confirm}) => {
      if (confirm) await perform(this, () => api().setAiPlanProvider(provider),'夜间计划方式已保存')
    } })
  },
  privacy() { wx.navigateTo({url:'/pages/privacy/index'}) },
  refreshPage() { refresh(this) },
  signout() {
    const owner = api().session()?.user?.id
    wx.showModal({title:'退出当前设备？',content:'不会退出网页或另一台手机。尚未确认的本机提交会被清除，请先核对记录。',success:async({confirm})=>{
      if (!confirm || this.data.busy) return
      if (api().session()?.user?.id !== owner) return
      const userId = api().session()?.user?.id
      clearOwner(userId)
      const exiting = api().signOut()
      getApp().clearViewData()
      wx.reLaunch({url:'/pages/login/index'})
      try { await exiting } catch {
        getApp().globalData.signoutNotice = '本机已退出；服务器注销未确认，请联网后再登录。'
        const login = getCurrentPages().find(page => page.route === 'pages/login/index')
        if (login) login.setData({error:getApp().globalData.signoutNotice})
      }
    }})
  }
})

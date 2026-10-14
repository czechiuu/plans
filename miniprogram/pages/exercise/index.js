const {exerciseById} = require('../../lib/shared')
const {openSettings} = require('../../lib/page')

Page({
  data:{exercise:null,mediaState:'closed',mediaAttempt:0,error:'',notice:'',offline:false},
  onLoad(options){
    const exercise=exerciseById.get(options.id)
    this.setData({exercise:exercise ? {...exercise,musclesText:exercise.muscles.join('、'),
      alternativesText:exercise.alternatives.map(id=>exerciseById.get(id)?.name || id).join('、')} : null,error:exercise ? '' : '未找到这个动作',offline:!!getApp().globalData.offline})
  },
  onHide(){ this.closeMedia() },
  settings:openSettings,
  showMedia(){ this.setData({mediaState:'loading',mediaAttempt:this.data.mediaAttempt+1}) },
  mediaLoaded(event){
    if(this.data.mediaState !== 'loading' || Number(event.currentTarget.dataset.attempt) !== this.data.mediaAttempt) return
    this.setData({mediaState:event.detail.width>0 && event.detail.height>0 ? 'loaded' : 'error'})
  },
  mediaFailed(event){
    if(this.data.mediaState === 'loading' && Number(event.currentTarget.dataset.attempt) === this.data.mediaAttempt) this.setData({mediaState:'error'})
  },
  closeMedia(){ this.setData({mediaState:'closed',mediaAttempt:this.data.mediaAttempt+1}) },
  copySource(event){
    const url=event?.currentTarget?.dataset?.kind === 'attribution' ? this.data.exercise?.demo?.gifSource : this.data.exercise?.demo?.url
    if (!url) return
    wx.setClipboardData({data:url,success:() => this.setData({notice:'原视频地址已复制'})})
  }
})

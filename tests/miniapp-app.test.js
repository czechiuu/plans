import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const dates = require('../miniprogram/lib/dates.js')
const pending = require('../miniprogram/lib/pending.js')
const page = require('../miniprogram/lib/page.js')

test('原生日期固定上海日，补录和七日平均不受设备时区或缺日影响', () => {
  assert.equal(dates.today('2026-10-14T16:01:00Z'),'2026-10-15')
  assert.equal(dates.today('2026-10-14T15:59:00Z'),'2026-10-14')
  assert.equal(dates.validDate('2026-02-30'),false)
  assert.equal(dates.localDateTimeToInstant('2026-10-15T00:01'),'2026-10-14T16:01:00.000Z')
  assert.equal(dates.instantToLocalDateTime('2026-10-14T16:01:00Z'),'2026-10-15T00:01')
  assert.deepEqual(dates.sevenDayAverage([{record_date:'2026-10-12',weight_kg:70},{record_date:'2026-10-14',weight_kg:72},{record_date:'2026-10-13',weight_kg:null}], '2026-10-14'),{average:71,count:2,startDate:'2026-10-08',endDate:'2026-10-14'})
})
function context() {
  const storage = new Map(); let owner = 'synthetic-me'; const routes = []
  const app = {api:{session:()=>({user:{id:owner}})},globalData:{offline:false},clearViewData(){this.cleared=true}}
  globalThis.getApp = () => app
  globalThis.wx = {getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,structuredClone(value)),removeStorageSync:key=>storage.delete(key),getStorageInfoSync:()=>({keys:[...storage.keys()]}),
    getRandomValues:options=>options.success({randomValues:Uint8Array.from({length:16},(_,i)=>i+1).buffer}),reLaunch:args=>routes.push(args.url)}
  return {storage,app,routes,owner:value=>{owner=value}}
}
test('新建请求并发与刷新复用同一 UUID，改内容拒绝且按账号隔离', async () => {
  const c=context(), payload={data:{items:[]},status:'draft',is_shared:false}
  const [a,b]=await Promise.all([pending.reserve('meal',payload),pending.reserve('meal',payload)])
  assert.deepEqual(a,b); assert.match(a.client_request_id,/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/)
  assert.deepEqual(await pending.reserve('meal',payload),a)
  await assert.rejects(pending.reserve('meal',{...payload,status:'confirmed'}),{code:'PENDING_CONFLICT'})
  c.owner('synthetic-w'); assert.equal(pending.get('meal'),null)
  c.owner('synthetic-me'); assert.deepEqual(pending.get('meal'),a)
  pending.clearOwner('synthetic-w'); assert.deepEqual(pending.get('meal'),a)
  pending.clear('meal'); assert.equal(pending.get('meal'),null)
})
test('生成提交编号期间切号不得保存到任何账号', async () => {
  const c=context(); let finish
  wx.getRandomValues=options=>{finish=options.success}
  const work=pending.reserve('meal',{status:'draft'})
  c.owner('synthetic-w'); finish({randomValues:new ArrayBuffer(16)})
  await assert.rejects(work,{code:'ACCOUNT_CHANGED'}); assert.equal(c.storage.size,0)
})
test('重复点击不重复提交，失败不自动重试或提示成功', async () => {
  context(); const view={data:{busy:false},setData(value){Object.assign(this.data,value)}}
  let finish,calls=0
  const first=page.perform(view,()=>{calls++;return new Promise(resolve=>{finish=resolve})},'已保存',{reload:false})
  const duplicate=await page.perform(view,()=>{calls++},'已保存',{reload:false})
  assert.equal(duplicate.ok,false); finish({id:'synthetic'}); assert.equal((await first).ok,true); assert.equal(calls,1)
  const failed=await page.perform(view,()=>{throw Object.assign(new Error('offline'),{code:'NETWORK_ERROR'})},'已保存',{reload:false})
  assert.equal(failed.ok,false);assert.equal(view.data.notice,'');assert.match(view.data.error,/网络/)
})
test('旧账号页面结果不能写回新会话，失效直接关闭健康页栈', async () => {
  const c=context(), view={data:{busy:false},setData(value){Object.assign(this.data,value)}}
  const result=await page.perform(view,async()=>{c.owner('synthetic-w');return {private:'synthetic'}},'已保存',{reload:false})
  assert.equal(result.ok,false);assert.equal(view.data.notice,'');assert.equal(c.app.cleared,true);assert.deepEqual(c.routes,['/pages/login/index'])
})
test('旧页面延迟确认回调不得开始新账号写入', async () => {
  const c=context(),view={data:{busy:false},ownerUserId:'synthetic-me',setData(value){Object.assign(this.data,value)}}
  c.owner('synthetic-w');let calls=0
  const result=await page.perform(view,async()=>{calls++;return {}},'已保存',{reload:false})
  assert.equal(result.ok,false);assert.equal(calls,0);assert.equal(view.data.notice,'')
})
test('失效续期遇临时网络错误时关闭健康页并保留重连原因', async () => {
  const c=context(),view={data:{busy:false},setData(value){Object.assign(this.data,value)}}
  c.app.api.session=()=>null
  const error=Object.assign(new Error('NETWORK_ERROR'),{code:'NETWORK_ERROR'})
  await page.perform(view,async()=>{throw error},'已保存',{reload:false})
  assert.equal(c.app.restoreError,error);assert.equal(c.app.cleared,true);assert.equal(c.routes[0],'/pages/login/index')
})

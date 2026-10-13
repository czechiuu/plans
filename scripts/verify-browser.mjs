import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mockApiModule } from '../tests/browser-fixture.js';
import { shanghaiDate, addDays } from '../src/domain.js';

const origin = process.env.TEST_SITE_URL ?? 'http://127.0.0.1:5173';
const output = new URL('../test-results/', import.meta.url);
await mkdir(output, { recursive: true });
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const executablePath = process.env.TEST_BROWSER_PATH || (existsSync(chromePath) ? chromePath : undefined);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const cases = [];
async function check(name, fn, simulated = true) {
  try { await fn(); cases.push({ name, status:'passed', simulated }); }
  catch (error) { cases.push({ name, status:'failed', simulated, error:String(error.message).slice(0,300) }); throw error; }
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
}
async function mock(context, options) {
  await context.route('**/src/api.js*', route => route.fulfill({ status:200, contentType:'application/javascript', body:mockApiModule(options) }));
  await context.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const mark = document.createElement('div'); mark.textContent='界面测试 · 合成资料 / 模拟接口';
      Object.assign(mark.style,{position:'fixed',top:'0',right:'0',zIndex:'999',background:'#772f20',color:'white',fontSize:'11px',padding:'4px 8px',pointerEvents:'none'});
      document.body.append(mark);
    });
  });
}
try {
  const desktop = await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'America/Los_Angeles'});
  const unconfigured = await desktop.newPage();
  await check('真实未配置页面明确阻止登录保存；桌面无溢出', async () => {
    await unconfigured.goto(origin); await unconfigured.getByRole('heading',{name:'先连接私人后台'}).waitFor();
    assert.equal(await unconfigured.locator('form').count(),0); await noOverflow(unconfigured);
    await unconfigured.screenshot({path:fileURLToPath(new URL('desktop-unconfigured.png',output)),fullPage:true});
  }, false);
  await check('开发服务器拒绝私人目录直接访问', async () => {
    const response = await unconfigured.request.get(origin+'/private/my-profile.json');
    assert.equal(response.status(),403);
  }, false);
  await desktop.close();

  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1,timezoneId:'America/Los_Angeles',reducedMotion:'reduce'});
  await mock(context);
  const page = await context.newPage(); const pageErrors=[]; page.on('pageerror',e=>pageErrors.push(e.message));
  await check('手机独立登录入口与创建空间，默认类别私有', async () => {
    await page.goto(origin); await page.getByLabel('邮箱',{exact:true}).fill('synthetic-a@example.invalid');
    await page.getByLabel('密码',{exact:true}).fill('Synthetic-only-password');
    await page.getByRole('button',{name:'登录',exact:true}).click();
    await page.getByLabel('空间名称').fill('界面测试空间'); await page.getByLabel('你的昵称').fill('合成用户甲');
    await page.getByRole('button',{name:'创建私人空间',exact:true}).click();
    await page.getByRole('heading',{name:'照顾自己，也看见彼此'}).waitFor(); await noOverflow(page);
  });
  await check('明日手动日程保存显示，缺计划如实提示', async () => {
    await page.getByRole('button',{name:'日程',exact:true}).click();
    const form=page.locator('[data-form="schedule"]');
    await form.locator('[name="record_date"]').fill(addDays(shanghaiDate(),1));
    await form.locator('[name="raw_text"]').fill('合成测试：晚间打球，晚饭外卖');
    await form.locator('[name="start_time"]').fill('19:00'); await form.locator('[name="end_time"]').fill('20:00');
    await form.locator('[name="exercise_intent"]').selectOption('yes');
    assert.equal(await form.locator('[name="is_shared"]').isChecked(),false);
    await form.getByRole('button',{name:'保存日程',exact:true}).click();
    await page.getByText('日程已保存',{exact:true}).waitFor();
    await page.getByRole('button',{name:'今日',exact:true}).click();
    await page.getByText('合成测试：晚间打球，晚饭外卖',{exact:true}).waitFor();
    await noOverflow(page); await page.screenshot({path:fileURLToPath(new URL('mobile-dashboard-synthetic.png',output)),fullPage:true});
  });
  await check('体重补录保存、平均真实数量、修改与冲突展示', async () => {
    await page.getByRole('button',{name:'体重',exact:true}).click();
    let form=page.locator('[data-form="weight"]');
    await form.locator('[name="record_date"]').fill(shanghaiDate());await form.locator('[name="weight_kg"]').fill('70.2');
    await form.getByRole('button',{name:'保存体重',exact:true}).click();await page.getByText('体重已保存',{exact:true}).waitFor();
    await page.getByText('1 条真实记录',{exact:true}).waitFor();
    await page.locator('[data-action="edit-weight"]').click(); form=page.locator('[data-form="weight"]');
    await form.locator('[name="weight_kg"]').fill('70.4');await form.getByRole('button',{name:'保存修改',exact:true}).click();
    await page.getByText('体重已保存',{exact:true}).waitFor();
    await page.locator('[data-action="edit-weight"]').click();form=page.locator('[data-form="weight"]');
    await form.locator('[name="notes"]').fill('conflict-test'); await form.getByRole('button',{name:'保存修改',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'已在其他设备更新'}).waitFor(); await noOverflow(page);
    await page.screenshot({path:fileURLToPath(new URL('mobile-weight-synthetic.png',output)),fullPage:true});
  });
  await check('导入只填本人表单不自动保存；共享与代改默认关闭；退出清数据',async()=>{
    await page.getByRole('button',{name:'设置',exact:true}).click();
    for(const key of ['share_profile','share_schedule','share_weight','allow_partner_edit'])assert.equal(await page.locator('[data-form="settings"]').locator('[name="'+key+'"]').isChecked(),false);
    await page.locator('#profile-import').setInputFiles({name:'synthetic-profile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({age:31,sex:'male',health_notes:'仅用于界面测试，非真实健康资料',user_id:'must-be-ignored',is_shared:true}))});
    await page.getByText('已填入导入内容，请逐项确认后保存。',{exact:true}).waitFor();
    assert.equal(await page.locator('[data-form="profile"] [name="age"]').inputValue(),'31');
    assert.equal(await page.locator('[data-form="profile"] [name="is_shared"]').isChecked(),false);
    await page.locator('[data-form="profile"]').getByRole('button',{name:'保存档案',exact:true}).click();await page.getByText('档案已保存',{exact:true}).waitFor();
    await page.getByRole('button',{name:'退出登录',exact:true}).click();await page.getByRole('heading',{name:'欢迎回来'}).waitFor();
    assert.equal(await page.getByText('仅用于界面测试，非真实健康资料',{exact:true}).count(),0);
    assert.deepEqual(pageErrors,[]);
  });
  await context.close();
  const recoveryContext=await browser.newContext({viewport:{width:390,height:844}});await mock(recoveryContext,{recovery:true});const recovery=await recoveryContext.newPage();
  await check('恢复密码事件显示专用表单，不误进看板',async()=>{
    await recovery.goto(origin);await recovery.getByRole('heading',{name:'设置新密码'}).waitFor();assert.equal(await recovery.locator('[data-form="recovery"]').count(),1);
  });await recoveryContext.close();
} catch(error) {
  process.exitCode=1;process.stderr.write('浏览器验证失败：'+String(error.message).slice(0,300)+'\n');
} finally {
  await browser.close();
  const result={run_at:new Date().toISOString(),scope:'本地浏览器验证。带simulated=true的项目使用合成资料/内存接口，不能替代云端登录或持久化。',passed:cases.filter(c=>c.status==='passed').length,failed:cases.filter(c=>c.status==='failed').length,cases};
  await writeFile(new URL('browser-results.json',output),JSON.stringify(result,null,2)+'\n');
  process.stdout.write(JSON.stringify({passed:result.passed,failed:result.failed,simulated:cases.filter(c=>c.simulated).length})+'\n');
}

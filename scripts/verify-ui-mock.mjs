import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mockApiModule } from '../tests/browser-fixture.js';
import { shanghaiDate, addDays } from '../src/domain.js';
import { report, runCase } from './test-helpers/report.mjs';
import { browserOrigin, launchBrowser } from './test-helpers/browser.mjs';

const origin = browserOrigin();
const output = new URL('../test-results/', import.meta.url);
let browser;
const cases = [], details = [];
const check = (id, fn) => runCase(cases, details, id, fn);
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
  browser = await launchBrowser();
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1,timezoneId:'America/Los_Angeles',reducedMotion:'reduce'});
  await mock(context);
  const page = await context.newPage(); const pageErrors=[]; page.on('pageerror',e=>pageErrors.push(e.message));
  await check('UI_AUTH_SPACE', async () => {
    await page.goto(origin); await page.getByLabel('邮箱',{exact:true}).fill('synthetic-a@example.invalid');
    await page.getByLabel('密码',{exact:true}).fill('Synthetic-only-password');
    await page.getByRole('button',{name:'登录',exact:true}).click();
    await page.getByLabel('空间名称').fill('界面测试空间'); await page.getByLabel('你的昵称').fill('合成用户甲');
    await page.getByRole('button',{name:'创建私人空间',exact:true}).click();
    await page.getByRole('heading',{name:'照顾自己，也看见彼此'}).waitFor(); await noOverflow(page);
  });
  await check('UI_SCHEDULE', async () => {
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
  await check('UI_WEIGHT_CONFLICT', async () => {
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
  await check('UI_IMPORT_LOGOUT',async()=>{
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
  await check('UI_RECOVERY',async()=>{
    await recovery.goto(origin);await recovery.getByRole('heading',{name:'设置新密码'}).waitFor();assert.equal(await recovery.locator('[data-form="recovery"]').count(),1);
  });await recoveryContext.close();
} catch(error) {
  if (!cases.some(item => item.status === 'failed')) { cases.push({ id:'UI_SETUP', status:'failed' }); details.push({ id:'UI_SETUP', error:String(error?.stack || error) }); }
} finally {
  await browser?.close();
  for (const id of ['UI_AUTH_SPACE','UI_SCHEDULE','UI_WEIGHT_CONFLICT','UI_IMPORT_LOGOUT','UI_RECOVERY']) if (!cases.some(item => item.id === id)) cases.push({ id, status:'notrun' });
  await report('ui-mock', 'synthetic-ui-memory-api', cases, details);
}

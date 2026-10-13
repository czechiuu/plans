import test from 'node:test';
import assert from 'node:assert/strict';
import { shanghaiDate, addDays, sevenDayAverage, escapeHtml, validateConfig, localDateTimeToInstant, instantToLocalDateTime } from '../src/domain.js';

test('上海跨午夜日期由时刻决定，不使用宿主时区', () => {
  assert.equal(shanghaiDate('2026-10-13T15:59:59Z'), '2026-10-13');
  assert.equal(shanghaiDate('2026-10-13T16:00:00Z'), '2026-10-14');
  assert.equal(shanghaiDate('2026-10-13T12:00:00Z'), '2026-10-13');
});
test('日期加减支持跨年与闰年，拒绝不存在的日期', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.throws(() => addDays('2026-02-30', 1));
});
test('七日平均只计自然日窗口内的实际体重，不补缺失值或计腰围', () => {
  const result = sevenDayAverage([
    { record_date: '2026-10-06', weight_kg: 90 },
    { record_date: '2026-10-07', weight_kg: 70 },
    { record_date: '2026-10-11', weight_kg: '72' },
    { record_date: '2026-10-12', weight_kg: null, waist_cm: 80 },
    { record_date: '2026-10-14', weight_kg: 75 },
  ], '2026-10-13');
  assert.deepEqual(result, { average: 71, count: 2, startDate: '2026-10-07', endDate: '2026-10-13' });
  assert.equal(sevenDayAverage([], '2026-10-13').average, null);
});
test('记录时间按上海时间转UTC，可逆且校验真实日期和时刻', () => {
  assert.equal(localDateTimeToInstant('2026-10-14T00:10'), '2026-10-13T16:10:00.000Z');
  assert.equal(instantToLocalDateTime('2026-10-13T16:10:00Z'), '2026-10-14T00:10');
  assert.throws(() => localDateTimeToInstant('2026-10-14T24:10'));
  assert.throws(() => localDateTimeToInstant('2026-02-30T08:00'));
});
test('未经配置不建立客户端；拒绝私钥、HTTP与错误项目地址', () => {
  const url = 'https://syntheticproject.supabase.co';
  const key = 'sb_publishable_synthetic_key_for_tests_only';
  assert.equal(validateConfig('', '').configured, false);
  assert.equal(validateConfig(url, key).configured, true);
  assert.equal(validateConfig(url, 'sb_secret_do_not_publish').configured, false);
  assert.equal(validateConfig('http://syntheticproject.supabase.co', key).configured, false);
  assert.equal(validateConfig('https://evil.example', key).configured, false);
  const jwt = role => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  assert.equal(validateConfig(url, jwt('anon')).configured, true);
  assert.equal(validateConfig(url, jwt('service_role')).configured, false);
});
test('用户文字转义，不能插入脚本或HTML属性', () => {
  assert.equal(escapeHtml('<script>"&\'</script>'), '&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;');
});

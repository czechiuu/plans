const SHANGHAI = 'Asia/Shanghai';
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: SHANGHAI, year: 'numeric', month: '2-digit', day: '2-digit' });
const dateTimeFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: SHANGHAI, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function shanghaiDate(instant = new Date()) {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new Error('无效时间');
  const parts = Object.fromEntries(dateFormatter.formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(value, n) {
  if (!validDate(value) || !Number.isInteger(n)) throw new Error('无效日期');
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

export function sevenDayAverage(rows, endDate) {
  const startDate = addDays(endDate, -6);
  const actual = rows.filter(row => validDate(row.record_date) && row.record_date >= startDate && row.record_date <= endDate && row.weight_kg != null && Number.isFinite(Number(row.weight_kg)));
  return {
    average: actual.length ? actual.reduce((sum, row) => sum + Number(row.weight_kg), 0) / actual.length : null,
    count: actual.length, startDate, endDate,
  };
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function validateConfig(url, key) {
  if (!url || !key) return { configured: false, error: '尚未连接私人后端。请配置 Supabase URL 和 publishable 公共密钥。' };
  let parsed;
  try { parsed = new URL(url); } catch { return { configured: false, error: 'Supabase URL 格式无效。' }; }
  if (parsed.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/' || parsed.port) {
    return { configured: false, error: '请使用控制台提供的 https://项目编号.supabase.co 地址。' };
  }
  if (key.startsWith('sb_publishable_') && /^[A-Za-z0-9_-]+$/.test(key) && key.length >= 30) return { configured: true, error: '' };
  // 旧版 anon JWT 可用于浏览器；service_role/secret/AI 密钥必须拒绝。
  try {
    const parts = key.split('.');
    if (parts.length !== 3 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) throw new Error('invalid');
    const decoded = typeof atob === 'function' ? atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')) : '';
    const payload = JSON.parse(decoded);
    if (payload.role === 'anon') return { configured: true, error: '' };
  } catch { /* 格式不接受时不创建客户端。 */ }
  return { configured: false, error: '密钥类型不允许进入前端。这里只接受 publishable 公共密钥或旧版 anon 密钥。' };
}

export function localDateTimeToInstant(local) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local ?? '') || !validDate(local.slice(0, 10))) throw new Error('无效记录时间');
  const hour = Number(local.slice(11, 13)), minute = Number(local.slice(14, 16));
  if (hour > 23 || minute > 59) throw new Error('无效记录时间');
  return new Date(`${local}:00+08:00`).toISOString();
}

export function instantToLocalDateTime(iso) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) throw new Error('无效时间');
  return dateTimeFormatter.format(date).replace(' ', 'T');
}

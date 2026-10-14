// 产品使用现代上海日期（UTC+8），不依赖设备时区或浏览器 Intl。
const offset = 8 * 60 * 60 * 1000
function today(instant = Date.now()) {
  const time = new Date(instant).getTime()
  if (!Number.isFinite(time)) throw new Error('无效时间')
  return new Date(time + offset).toISOString().slice(0, 10)
}
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}
function addDays(value, n) {
  if (!validDate(value) || !Number.isInteger(n)) throw new Error('无效日期')
  return new Date(Date.parse(`${value}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
}
function sevenDayAverage(rows, endDate) {
  const startDate = addDays(endDate, -6)
  const actual = rows.filter(row => validDate(row.record_date) && row.record_date >= startDate && row.record_date <= endDate && row.weight_kg != null && Number.isFinite(Number(row.weight_kg)))
  return { average: actual.length ? actual.reduce((sum, row) => sum + Number(row.weight_kg), 0) / actual.length : null, count: actual.length, startDate, endDate }
}
function instantToLocalDateTime(iso) {
  const time = new Date(iso).getTime()
  if (!Number.isFinite(time)) throw new Error('无效时间')
  return new Date(time + offset).toISOString().slice(0, 16)
}
function localDateTimeToInstant(local) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local || '') || !validDate(local.slice(0, 10)) || Number(local.slice(11, 13)) > 23 || Number(local.slice(14, 16)) > 59) throw new Error('无效记录时间')
  return new Date(`${local}:00+08:00`).toISOString()
}
module.exports = { today, validDate, addDays, sevenDayAverage, instantToLocalDateTime, localDateTimeToInstant }

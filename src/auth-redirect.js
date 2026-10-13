export function authRedirectUrl(pageUrl) {
  const url = new URL(pageUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new TypeError('无效网页地址')
  url.search = ''
  url.hash = ''
  return url.href
}

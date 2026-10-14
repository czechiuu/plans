import { readFile, readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'
const root = resolve('miniprogram')
const require = createRequire(import.meta.url)
const app = JSON.parse(await readFile(resolve(root,'app.json'),'utf8'))
const project = JSON.parse(await readFile(resolve(root,'project.config.json'),'utf8'))
if (project.setting.urlCheck !== true) throw new Error('禁止关闭合法域名校验')
if (app.tabBar.list.length !== 5 || app.tabBar.list.some(tab => !app.pages.includes(tab.pagePath))) throw new Error('五个主页面路由不完整')
let checks = 0
for (const page of app.pages) {
  const [js,wxml,json,css] = await Promise.all(['js','wxml','json','wxss'].map(ext => readFile(resolve(root,`${page}.${ext}`),'utf8')))
  JSON.parse(json); await transform(js,{loader:'js',target:'es2018'})
  let definition
  globalThis.Page = value => { definition = value }
  require(resolve(root,`${page}.js`))
  if (!definition?.data) throw new Error(`${page} 未注册原生页面`)
  for (const match of wxml.matchAll(/\b(?:bind|catch):?[\w-]+\s*=\s*["']([\w]+)["']/g)) {
    if (typeof definition[match[1]] !== 'function') throw new Error(`${page} 缺少事件 ${match[1]}`)
  }
  if (/<web-view\b|<video\b|<iframe\b/i.test(wxml)) throw new Error(`${page} 含未授权媒体或网页容器`)
  if (!wxml.trim() || css == null) throw new Error(`${page} 页面缺文件`)
  checks++
}
delete globalThis.Page
async function files(dir) {
  return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(async entry => entry.isDirectory() ? files(resolve(dir,entry.name)) : [resolve(dir,entry.name)]))).flat()
}
for (const file of await files(root)) {
  if (!/\.(js|json|wxml|wxss)$/.test(file)) continue
  const source = await readFile(file,'utf8')
  if (/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|service_role["']\s*[:=]|sk-[a-zA-Z0-9]{16}/.test(source)) throw new Error('小程序包含不允许的密钥标记')
  if (/\.js$/.test(file)) {
    await transform(source,{loader:'js',target:'es2018'})
    if (/\b(?:window|document|localStorage|sessionStorage)\s*\.|\b(?:fetch|atob|btoa)\s*\(|import\.meta|require\(['"](?:https?|fs|node:)/.test(source)) throw new Error(`${file} 包含浏览器或 Node 专用代码`)
    for (const match of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
      require.resolve(resolve(dirname(file),match[1]))
    }
  }
}
console.log(`原生项目静态检查：${checks} 页通过，0 失败；不替代微信 WXML 编译及真机验收。`)

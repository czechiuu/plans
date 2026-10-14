import { build } from 'esbuild'
import { loadEnv } from 'vite'
import { writeFile } from 'node:fs/promises'
import { validateConfig } from '../src/domain.js'
const env = loadEnv('production', process.cwd(), 'VITE_')
const url = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? ''
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
if (!validateConfig(url, key).configured || !key.startsWith('sb_publishable_')) throw new Error('小程序构建需要有效的公开后端地址和 publishable key；不接受管理密钥')
await build({entryPoints:['scripts/miniapp-shared-entry.mjs'],outfile:'miniprogram/lib/shared.js',bundle:true,format:'cjs',platform:'neutral',target:'es2018',legalComments:'inline'})
await writeFile('miniprogram/config.js', `// 生成自已校验的网页公开配置；仅 publishable，不含服务端凭据。\nmodule.exports = ${JSON.stringify({url,key},null,2)}\n`)
console.log('原生共享代码与公开配置已生成；不代表微信编译、合法域名或真机通过。')

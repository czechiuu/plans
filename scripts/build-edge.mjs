import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root=new URL('../',import.meta.url)
const names=['health-ai','health-photo','health-cron']
await build({
  entryPoints:names.map(name=>fileURLToPath(new URL(`supabase/functions/${name}/index.js`,root))),
  outdir:fileURLToPath(new URL('supabase/bundles/',root)),
  entryNames:'[dir]',
  outbase:fileURLToPath(new URL('supabase/functions/',root)),
  bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,
  legalComments:'eof',logLevel:'warning',loader:{'.png':'dataurl'},
})
console.log(`Built ${names.length} Edge Function bundles.`)

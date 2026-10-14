import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'

const { outputFiles } = await build({
  entryPoints: ['src/api.js'], bundle: true, write: false, format: 'esm', platform: 'browser',
  define: { 'import.meta.env.VITE_SUPABASE_URL': '"https://example.supabase.co"', 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '"sb_publishable_test"' },
  plugins: [{ name: 'snapshot-export-fixture', setup(b) {
    b.onResolve({ filter: /^@supabase\/supabase-js$|^\.\/(domain|fixed-account|auth-password)\.js$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: ({
      '@supabase/supabase-js': 'export const createClient=()=>({rpc:(...args)=>globalThis.__snapshotClient.rpc(...args),from:(...args)=>globalThis.__snapshotClient.from(...args)})',
      './domain.js': 'export const shanghaiDate=()=>"2026-10-14"; export const validateConfig=()=>({configured:true,error:null})',
      './fixed-account.js': 'export const emails={}; export const verifiedUser=async()=>({user:{id:"owner"},account:"me"})',
      './auth-password.js': 'export const updatePasswordWithToken=async()=>{}'
    })[args.path], loader: 'js' }))
  } }]
})
const { api } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

function client(snapshotVersion = 9, snapshotError = null) {
  const records = Array.from({ length: 501 }, (_, index) => ({ user_id: 'owner', job_id: 'job', input_version: `v${String(index).padStart(3, '0')}`, captured_at: '2026-10-14T00:00:00Z' }))
  records.push({ user_id: 'partner', job_id: 'private-job', input_version: 'v000', captured_at: '2026-10-14T00:00:00Z' })
  const queried = []
  const db = {
    members: [{ user_id: 'owner', display_name: '我' }],
    generation_input_snapshots: records
  }
  return {
    queried,
    rpc(name) {
      if (name === 'health_schema_version') return Promise.resolve({ data: 4, error: null })
      if (name === 'health_daily_flow_version') return Promise.resolve({ data: 7, error: null })
      if (name === 'health_input_snapshot_schema_version') return Promise.resolve(snapshotVersion === null ? { data: null, error: { code: 'PGRST202' } } : { data: snapshotVersion, error: null })
      throw new Error(`Unexpected RPC: ${name}`)
    },
    from(table) {
      queried.push(table)
      const query = { column: null, value: null, orders: [],
        select() { return this }, eq(column, value) { this.column = column; this.value = value; return this },
        order(column) { this.orders.push(column); return this },
        maybeSingle() { return Promise.resolve({ data: (db[table] || []).find(row => row[this.column] === this.value) || null, error: null }) },
        range(start, end) {
          if (table === 'generation_input_snapshots' && snapshotError) return Promise.resolve({ data: null, error: snapshotError })
          const rows = (db[table] || []).filter(row => row[this.column] === this.value).sort((a, b) => {
            for (const column of this.orders) { const order = String(a[column]).localeCompare(String(b[column])); if (order) return order }
            return 0
          })
          return Promise.resolve({ data: rows.slice(start, end + 1), error: null })
        }
      }
      return query
    }
  }
}

test('本人导出包含跨页快照，不包含伴侣快照', async () => {
  globalThis.__snapshotClient = client()
  const exported = await api.exportOwnData()
  assert.equal(exported.generation_input_snapshots.length, 501)
  assert.equal(exported.generation_input_snapshots.at(-1).input_version, 'v500')
  assert.ok(exported.generation_input_snapshots.every(row => row.user_id === 'owner'))
})

test('009 未部署时拒绝生成缺项导出', async () => {
  globalThis.__snapshotClient = client(null)
  await assert.rejects(api.exportOwnData(), /完整导出需要输入快照版本 9/)
  assert.ok(!globalThis.__snapshotClient.queried.includes('generation_input_snapshots'))
})

test('009 快照读取失败时显式报错', async () => {
  globalThis.__snapshotClient = client(9, { code: 'SNAPSHOT_READ_FAILED' })
  await assert.rejects(api.exportOwnData(), error => error.code === 'SNAPSHOT_READ_FAILED')
})

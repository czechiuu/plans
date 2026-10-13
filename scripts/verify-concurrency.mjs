import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import pg from 'pg'
import { localPostgres } from './with-local-postgres.mjs'

const { Client } = pg
const reportPath = resolve('test-results/concurrency-results.json')
const migrationsDir = new URL('../supabase/migrations/', import.meta.url)
const migrations = (await readdir(migrationsDir)).filter(name => name.endsWith('.sql')).sort()
assert.deepEqual(migrations.slice(0, 2), ['202610130001_initial.sql', '202610130002_space_lock_order.sql'])

async function freePort() {
  const server = createServer()
  await new Promise((accept, reject) => server.once('error', reject).listen(0, '127.0.0.1', accept))
  const port = server.address().port
  await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()))
  return port
}

function syntheticUser() { return randomUUID() }
async function waitForBlock(observer, waiterPid, holderPid) {
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    const { rows } = await observer.query(`
      select wait_event_type, wait_event, pg_blocking_pids(pid) as blockers
      from pg_stat_activity where pid=$1`, [waiterPid])
    const state = rows[0]
    if (state?.wait_event_type === 'Lock' && state.blockers.map(Number).includes(holderPid)) {
      return { wait_event_type: state.wait_event_type, wait_event: state.wait_event, blocker_confirmed: true }
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('未在pg_stat_activity/pg_blocking_pids观察到预期锁等待')
}

async function environment(server, database, adminPassword, authPassword, fixed) {
  await server.createDatabase(database)
  const common = { host: '127.0.0.1', port: server.port, database }
  const admin = new Client({ ...common, user: 'test_admin', password: adminPassword })
  await admin.connect()
  const actors = []
  try {
    await admin.query('create schema auth')
    await admin.query('create table auth.users(id uuid primary key)')
    await admin.query(`create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$`)
    await admin.query('grant usage on schema auth,public to authenticated')
    await admin.query('grant execute on function auth.uid() to authenticated')
    for (const file of migrations.slice(0, fixed ? 2 : 1)) {
      await admin.query(await readFile(new URL(file, migrationsDir), 'utf8'))
    }
    async function actor(id) {
      await admin.query('insert into auth.users(id) values($1) on conflict do nothing', [id])
      const client = new Client({ ...common, user: 'authenticated', password: authPassword })
      await client.connect()
      actors.push(client)
      await client.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
      const { rows } = await client.query(`select current_user, auth.uid() as uid,
        current_setting('row_security') as row_security,
        (select rolsuper or rolbypassrls from pg_roles where rolname=current_user) as elevated,
        pg_backend_pid() as pid`)
      assert.equal(rows[0].current_user, 'authenticated')
      assert.equal(rows[0].uid, id)
      assert.equal(rows[0].row_security, 'on')
      assert.equal(rows[0].elevated, false)
      return { client, pid: rows[0].pid, id }
    }
    return { admin, actor, close: async () => {
      await Promise.allSettled(actors.map(client => client.end()))
      await admin.end()
    } }
  } catch (error) {
    await Promise.allSettled(actors.map(client => client.end()))
    await admin.end()
    throw error
  }
}

async function inviteAfterLeave(env, fixed) {
  const owner = await env.actor(syntheticUser())
  const partner = await env.actor(syntheticUser())
  const newcomer = await env.actor(syntheticUser())
  const waiter = await env.actor(owner.id)
  const space = (await owner.client.query('select public.create_space($1,$2) as id', ['Synthetic race', 'Synthetic owner'])).rows[0].id
  const first = (await owner.client.query('select token from public.create_invite()')).rows[0].token
  await partner.client.query('select public.join_space($1,$2,$3::jsonb)', [first, 'Synthetic partner', '{}'])

  await owner.client.query('begin')
  let held = true
  try {
    await owner.client.query('select public.leave_space()')
    const pending = waiter.client.query('select token from public.create_invite()')
      .then(value => ({ value }), error => ({ error }))
    const observed = await waitForBlock(env.admin, waiter.pid, owner.pid)
    await owner.client.query('commit')
    held = false
    const outcome = await pending
    const memberCount = Number((await env.admin.query('select count(*)::int as n from public.members where space_id=$1', [space])).rows[0].n)
    assert.equal(memberCount, 1)
    if (fixed) {
      assert.match(outcome.error?.message ?? '', /Space membership required/)
      assert.equal((await env.admin.query('select count(*)::int as n from public.invites where space_id=$1', [space])).rows[0].n, 0)
      assert.equal((await env.admin.query('select count(*)::int as n from public.members where user_id=$1', [newcomer.id])).rows[0].n, 0)
    } else {
      assert.ok(outcome.value?.rows[0]?.token, 'baseline must produce stale-member invitation')
      const token = outcome.value.rows[0].token
      await newcomer.client.query('select public.join_space($1,$2,$3::jsonb)', [token, 'Synthetic newcomer', '{}'])
      assert.equal((await env.admin.query('select count(*)::int as n from public.members where space_id=$1', [space])).rows[0].n, 2)
    }
    return { ...observed, stale_member_invite_accepted: !fixed }
  } finally {
    if (held) await owner.client.query('rollback').catch(() => {})
  }
}

async function joinWhileHeld(env, sameToken) {
  const owner = await env.actor(syntheticUser())
  const first = await env.actor(syntheticUser())
  const second = await env.actor(syntheticUser())
  const space = (await owner.client.query('select public.create_space($1,$2) as id', ['Synthetic join race', 'Synthetic owner'])).rows[0].id
  const token1 = (await owner.client.query('select token from public.create_invite()')).rows[0].token
  const token2 = sameToken ? token1 : (await owner.client.query('select token from public.create_invite()')).rows[0].token

  await first.client.query('begin')
  let held = true
  try {
    await first.client.query('select public.join_space($1,$2,$3::jsonb)', [token1, 'Synthetic first', '{}'])
    const pending = second.client.query('select public.join_space($1,$2,$3::jsonb)', [token2, 'Synthetic second', '{}'])
      .then(value => ({ value }), error => ({ error }))
    const observed = await waitForBlock(env.admin, second.pid, first.pid)
    await first.client.query('commit')
    held = false
    const outcome = await pending
    assert.match(outcome.error?.message ?? '', sameToken ? /Invalid or expired invitation/ : /Space is full/)
    assert.equal((await env.admin.query('select count(*)::int as n from public.members where space_id=$1', [space])).rows[0].n, 2)
    return { ...observed, rejected: true, member_count: 2 }
  } finally {
    if (held) await first.client.query('rollback').catch(() => {})
  }
}

async function joinWhileLeave(env) {
  const owner = await env.actor(syntheticUser())
  const newcomer = await env.actor(syntheticUser())
  const space = (await owner.client.query('select public.create_space($1,$2) as id', ['Synthetic leave race', 'Synthetic owner'])).rows[0].id
  const spare = (await owner.client.query('select token from public.create_invite()')).rows[0].token

  await owner.client.query('begin')
  let held = true
  try {
    await owner.client.query('select token from public.create_invite()')
    const pending = newcomer.client.query('select public.join_space($1,$2,$3::jsonb)', [spare, 'Synthetic newcomer', '{}'])
      .then(value => ({ value }), error => ({ error }))
    const observed = await waitForBlock(env.admin, newcomer.pid, owner.pid)
    await owner.client.query('select public.leave_space()')
    await owner.client.query('commit')
    held = false
    const outcome = await pending
    assert.match(outcome.error?.message ?? '', /Invalid or expired invitation/)
    assert.equal((await env.admin.query('select count(*)::int as n from public.members where space_id=$1', [space])).rows[0].n, 0)
    return { ...observed, rejected: true, member_count: 0, deadlock: false }
  } finally {
    if (held) await owner.client.query('rollback').catch(() => {})
  }
}

async function doubleLeave(env) {
  const owner = await env.actor(syntheticUser())
  const partner = await env.actor(syntheticUser())
  const secondOwner = await env.actor(owner.id)
  const space = (await owner.client.query('select public.create_space($1,$2) as id', ['Synthetic double leave', 'Synthetic owner'])).rows[0].id
  const token = (await owner.client.query('select token from public.create_invite()')).rows[0].token
  await partner.client.query('select public.join_space($1,$2,$3::jsonb)', [token, 'Synthetic partner', '{}'])
  await owner.client.query('begin')
  let held = true
  try {
    await owner.client.query('select public.leave_space()')
    const pending = secondOwner.client.query('select public.leave_space()')
      .then(value => ({ value }), error => ({ error }))
    const observed = await waitForBlock(env.admin, secondOwner.pid, owner.pid)
    await owner.client.query('commit')
    held = false
    const outcome = await pending
    assert.match(outcome.error?.message ?? '', /Space membership required/)
    assert.equal((await env.admin.query('select count(*)::int as n from public.members where space_id=$1', [space])).rows[0].n, 1)
    return { ...observed, rejected: true, member_count: 1 }
  } finally {
    if (held) await owner.client.query('rollback').catch(() => {})
  }
}

const port = await freePort()
const scenarioNames = ['invite_after_leave', 'same_token', 'full_space', 'join_during_leave', 'double_leave']
const report = {
  checked_at_utc: new Date().toISOString(), database: 'isolated local PostgreSQL 17',
  baseline: { status: 'not_run' },
  fixed: { status: 'not_run', scenarios: Object.fromEntries(scenarioNames.map(name => [name, { status: 'not_run' }])) },
  counts: { baseline_reproduced: 0, fixed_passed: 0, failed: 0 }, passed: false
}
let server
let stage = 'initialise'
try {
  server = await localPostgres(port)
  const { adminPassword, authPassword } = server
  stage = 'create roles'
  const bootstrap = new Client({ host: '127.0.0.1', port, user: 'test_admin', password: adminPassword, database: 'postgres' })
  await bootstrap.connect()
  try {
    await bootstrap.query(`create role authenticated login password ${bootstrap.escapeLiteral(authPassword)}`)
    await bootstrap.query('create role anon')
  } finally { await bootstrap.end() }

  stage = 'baseline setup'
  const baseline = await environment(server, 'pair_health_baseline', adminPassword, authPassword, false)
  stage = 'baseline race'
  try { report.baseline = { status: 'reproduced', evidence: await inviteAfterLeave(baseline, false) }; report.counts.baseline_reproduced = 1 }
  finally { await baseline.close() }
  stage = 'fixed setup'
  const fixed = await environment(server, 'pair_health_fixed', adminPassword, authPassword, true)
  stage = 'fixed races'
  try {
    const cases = [
      ['invite_after_leave', () => inviteAfterLeave(fixed, true)],
      ['same_token', () => joinWhileHeld(fixed, true)],
      ['full_space', () => joinWhileHeld(fixed, false)],
      ['join_during_leave', () => joinWhileLeave(fixed)],
      ['double_leave', () => doubleLeave(fixed)]
    ]
    for (const [name, run] of cases) {
      stage = name
      report.fixed.scenarios[name] = { status: 'passed', evidence: await run() }
      report.counts.fixed_passed++
    }
    report.fixed.status = 'passed'
  } finally { await fixed.close() }
  report.passed = true
  console.log('真实PostgreSQL并发回归：基线漏洞复现1项；修复后5项通过，0项失败。')
} catch (error) {
  report.stage = stage
  report.counts.failed = 1
  report.error = String(error?.message ?? error)
    .replaceAll(server?.adminPassword ?? '\0', '[redacted]')
    .replaceAll(server?.authPassword ?? '\0', '[redacted]')
    .replaceAll(server?.clusterRoot ?? '\0', '[private path]')
    .replaceAll(resolve(tmpdir()), '[temp]')
  console.error(`真实PostgreSQL并发回归失败（${stage}）：${report.error}`)
  process.exitCode = 1
} finally {
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
  if (server) {
    try { await server.stop() }
    catch { console.error('隔离测试数据库停止失败；数据目录位于系统临时目录。'); process.exitCode = 1 }
  }
}
if (!report.passed) process.exit(1)

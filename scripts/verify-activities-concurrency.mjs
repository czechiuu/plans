import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import pg from 'pg'
import { localPostgres } from './with-local-postgres.mjs'
import { buildRulePlan } from '../shared/health.js'

const users = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
const ids = ['MEAL_CREATE_REPLAY_RACE', 'ACTIVITY_CREATE_REPLAY_RACE', 'NON_STRENGTH_RECOVERY_AND_WEEKLY_COUNTS']
const report = { scope: 'Isolated PostgreSQL, synthetic records only; no production or paid calls',
  cases: Object.fromEntries(ids.map(id => [id, { status: 'not_run' }])), passed: 0, failed: 0, not_run: ids.length }
const activity = () => ({ record_date: '2001-01-02', plan_id: null, status: 'completed', started_at: '2001-01-02T10:00:00+08:00',
  active_since: null, rest_until: null, rest_remaining_seconds: 0, ended_at: '2001-01-02T11:00:00+08:00',
  elapsed_seconds: 3600, stop_reason: null, sets: [], activity_type: 'badminton', duration_seconds: 3600,
  intensity: 'moderate', pain: 'none', notes: 'SYNTHETIC' })
const meal = () => ({ recorded_at: '2001-01-02T12:00:00+08:00', kind: 'lunch',
  items: [{ name: 'SYNTHETIC', portion: '1', unit: '份' }], eaten_fraction: 1, shared_meal_id: null,
  photo_ids: [], cooking: null, oil: null, leftover: null, estimate: null })
const clients = []
let server
async function run(id, fn) {
  try { report.cases[id] = { status: 'passed', evidence: await fn() }; report.passed++ }
  catch (error) { report.cases[id] = { status: 'failed', reason: error.message.slice(0, 240) }; report.failed++ }
  report.not_run--
}
try {
  const socket = createServer()
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  server = await localPostgres(port)
  const connect = async (role, user = null) => {
    const client = new pg.Client({ host: '127.0.0.1', port, database: 'postgres', user: role,
      password: role === 'test_admin' ? server.adminPassword : server.authPassword })
    await client.connect(); clients.push(client)
    await client.query("set statement_timeout='12000ms'")
    if (user) await client.query("select set_config('request.jwt.claim.sub',$1,false)", [user])
    return client
  }
  const admin = await connect('test_admin')
  await admin.query(`create role authenticated login password ${admin.escapeLiteral(server.authPassword)};create role anon;create role service_role;
    create schema auth;create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`)
  for (let i = 0; i < users.length; i++) await admin.query('insert into auth.users values($1,$2,now(),$3)', [users[i], ['me@plans.invalid', 'w@plans.invalid'][i], 'SYNTHETIC'])
  const dir = new URL('../supabase/migrations/', import.meta.url)
  report.applied_migrations = (await readdir(dir)).filter(x => x.endsWith('.sql')).sort()
  for (const file of report.applied_migrations) await admin.query(await readFile(new URL(file, dir), 'utf8'))
  await admin.query(await readFile(new URL('../supabase/admin/initialize-fixed-accounts.sql', import.meta.url), 'utf8'))
  const one = await connect('authenticated', users[0]), two = await connect('authenticated', users[0])
  const pidOne = (await one.query('select pg_backend_pid() pid')).rows[0].pid
  const pidTwo = (await two.query('select pg_backend_pid() pid')).rows[0].pid
  for (const kind of ['meal', 'training']) await run(kind === 'meal' ? ids[0] : ids[1], async () => {
    const payload = { data: kind === 'meal' ? meal() : activity(), status: kind === 'meal' ? 'confirmed' : 'completed',
      is_shared: false, client_request_id: randomUUID() }
    const rpc = client => client.query(`select to_jsonb(public.${kind === 'meal' ? 'save_meal' : 'save_training_session'}($1::jsonb)) v`, [JSON.stringify(payload)]).then(x => x.rows[0].v)
    await one.query('begin'); let held = true
    try {
      const first = await rpc(one)
      const replay = rpc(two).then(value => ({ value }), error => ({ error }))
      let observed = false
      for (let i = 0; i < 160; i++) {
        if ((await admin.query('select pg_blocking_pids($1) pids', [pidTwo])).rows[0].pids.includes(pidOne)) { observed = true; break }
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      assert.ok(observed, 'replay must wait behind the first create transaction')
      await one.query('commit'); held = false
      const second = await replay
      if (second.error) throw second.error
      assert.equal(second.value.id, first.id)
      const table = kind === 'meal' ? 'meals' : 'training_sessions'
      assert.equal((await admin.query(`select count(*)::int n from public.${table} where user_id=$1`, [users[0]])).rows[0].n, 1)
      payload.is_shared = true
      await assert.rejects(rpc(two), /payload conflict/)
      payload.is_shared = false
      await one.query(`select public.${kind === 'meal' ? 'delete_meal' : 'delete_training_session'}($1)`, [first.id])
      await assert.rejects(rpc(two), /record was deleted/)
      return 'second real connection blocked; one record; changed payload denied; delayed retry after deletion denied'
    } finally { if (held) await one.query('rollback') }
  })
  await run(ids[2], async () => {
    const rules = { confirmed: true, equipment: 'dorm', ankle_status: 'no_issue', free_weekdays: [], exercise_minutes: 60,
      training_history_complete: true, weekly_strength_limit: 1, max_gym_visits: 2, limitations: null }
    await one.query('select public.save_health_rules($1::jsonb,false)', [JSON.stringify(rules)])
    await admin.query("update health_rules set training_history_confirmed_at='2001-01-07T00:00:00Z' where user_id=$1", [users[0]])
    const content = buildRulePlan({ date: '2001-01-07', rules, historyComplete: true,
      trainingHistoryConfirmedAt: '2001-01-07T00:00:00Z', slot: 'me' }).content
    assert.equal(content.training.mode, 'workout')
    const allowed = async () => (await admin.query('select public.health_plan_allowed($1,$2,$3::jsonb) v', [users[0], '2001-01-07', JSON.stringify(content)])).rows[0].v
    assert.equal(await allowed(), true)
    const dateOnly = { ...activity(), started_at: null, ended_at: null }
    const dateOnlyRow = (await one.query('select to_jsonb(public.save_training_session($1::jsonb)) v', [JSON.stringify({ data: dateOnly, status: 'completed', is_shared: false })])).rows[0].v
    assert.equal(dateOnlyRow.data.started_at, null)
    assert.equal(dateOnlyRow.data.ended_at, null)
    assert.equal(await allowed(), true, 'a date-only activity outside the full recovery interval must not remain unknown forever')
    for (const completionDate of ['2001-01-06', '2001-01-07']) {
      await admin.query("update training_sessions set record_date=$2::date,data=jsonb_set(data,'{record_date}',to_jsonb($2::text)) where id=$1", [dateOnlyRow.id, completionDate])
      assert.equal(await allowed(), false, 'date-only completion uses its latest possible end for recovery, including the target day')
    }
    await one.query('select public.delete_training_session($1)', [dateOnlyRow.id])
    const saved = (await one.query('select to_jsonb(public.save_training_session($1::jsonb)) v', [JSON.stringify({ data: activity(), status: 'completed', is_shared: false })])).rows[0].v
    assert.equal(await allowed(), true, 'Tuesday badminton must not consume the Sunday strength allowance')
    await admin.query("update training_sessions set data=jsonb_set(data,'{activity_type}','\"strength\"') where id=$1", [saved.id])
    assert.equal(await allowed(), false, 'Tuesday strength must consume the weekly allowance')
    await admin.query("update training_sessions set status='stopped',record_date='2001-01-06',data=jsonb_set(jsonb_set(jsonb_set(data,'{activity_type}','\"badminton\"'),'{ended_at}','\"2001-01-06T11:00:00+08:00\"'),'{status}','\"stopped\"') where id=$1", [saved.id])
    assert.equal(await allowed(), false, 'actual stopped badminton still requires recovery')
    await admin.query("update training_sessions set data=jsonb_set(data,'{ended_at}','null') where id=$1", [saved.id])
    assert.equal(await allowed(), false, 'missing actual end time cannot imply recovery completed')
    return 'date-only times remain null with bounded recovery; non-strength excluded from weekly count; stopped badminton still affects recovery'
  })
} catch (error) { report.setup_error = error.message.slice(0, 240); process.exitCode = 1 }
finally {
  await Promise.allSettled(clients.map(client => client.end()))
  if (server) await server.stop().catch(() => { report.teardown_error = true })
  report.generated_at = new Date().toISOString()
  await writeFile('test-results/integrity-activities-results.json', JSON.stringify(report, null, 2) + '\n')
  console.log(`activity concurrency: ${report.passed} passed, ${report.failed} failed, ${report.not_run} not run`)
  if (report.failed || report.not_run || report.setup_error || report.teardown_error) process.exitCode = 1
}
process.exit(process.exitCode || 0)

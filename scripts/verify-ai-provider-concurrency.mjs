import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import pg from 'pg';
import { localPostgres } from './with-local-postgres.mjs';

const { Client } = pg;
const ids = ['PROVIDER_AND_PURPOSE_BOUNDARY', 'GLOBAL_CROSS_PROVIDER_RACE',
  'DEEPSEEK_PROBE_CAP_RACE', 'WRAPPER_CRLF_AND_REPEAT', 'WRAPPER_HISTORY_GUARD'];
const report = { started_at: new Date().toISOString(), generated_at: null,
  scope: 'Isolated local PostgreSQL with synthetic fixed accounts; no cloud or paid AI calls',
  cases: Object.fromEntries(ids.map(id => [id, { status: 'not_run' }])),
  passed: 0, failed: 0, not_run: ids.length };
const userIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const md5 = text => createHash('md5').update(text).digest('hex');
async function port() {
  const socket = createServer();
  await new Promise((ok, fail) => socket.once('error', fail).listen(0, '127.0.0.1', ok));
  const value = socket.address().port;
  await new Promise((ok, fail) => socket.close(error => error ? fail(error) : ok()));
  return value;
}
async function run(id, fn) {
  try { await fn(); report.cases[id] = { status: 'passed' }; report.passed++; }
  catch (error) { report.cases[id] = { status: 'failed', error_name: error.name,
    error_code: error.code ?? null, reason: String(error.message).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[synthetic-id]').slice(0, 180) }; report.failed++; }
  report.not_run--;
}
async function blockedBy(observer, waiter, holder) {
  const waitPid = waiter;
  const holdPid = holder;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if ((await observer.query('select pg_blocking_pids($1) pids', [waitPid])).rows[0].pids.includes(holdPid)) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error('Expected competing reservation to wait on budget row');
}
async function denied(promise, pattern) { await assert.rejects(promise, pattern); }
let server;
const clients = [];
try {
  server = await localPostgres(await port());
  const common = { host: '127.0.0.1', port: server.port, database: 'postgres' };
  const boot = new Client({ ...common, user: 'test_admin', password: server.adminPassword });
  await boot.connect();
  await boot.query(`create role authenticated login password ${boot.escapeLiteral(server.authPassword)}`);
  await boot.query(`create role service_role login password ${boot.escapeLiteral(server.authPassword)}`);
  await boot.query('create role anon');
  await boot.query('create database ai_provider_concurrency');
  await boot.end();
  const connect = async (role, id = '') => {
    const client = new Client({ ...common, database: 'ai_provider_concurrency', user: role,
      password: role === 'test_admin' ? server.adminPassword : server.authPassword });
    await client.connect();
    await client.query("set statement_timeout='10000ms'");
    if (id) await client.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    clients.push(client);
    return client;
  };
  const admin = await connect('test_admin');
  report.postgresql_version = (await admin.query('show server_version')).rows[0].server_version;
  await admin.query('create schema auth');
  await admin.query('create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,encrypted_password text)');
  await admin.query(`create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$`);
  await admin.query('grant usage on schema auth,public to authenticated,service_role');
  await admin.query('grant execute on function auth.uid() to authenticated,service_role');
  for (let i = 0; i < 2; i++) await admin.query(
    'insert into auth.users values($1,$2,now(),$3)',
    [userIds[i], ['me@plans.invalid', 'w@plans.invalid'][i], `SYNTHETIC-${randomBytes(8).toString('hex')}`]);
  await admin.query('create schema supabase_migrations');
  await admin.query('create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text)');
  const migrationDir = new URL('../supabase/migrations/', import.meta.url);
  const names = (await readdir(migrationDir)).filter(name => /^20261013000[1-5]_.*\.sql$/.test(name)).sort();
  assert.equal(names.length, 5);
  for (const name of names.slice(0, 4)) {
    const source = (await readFile(new URL(name, migrationDir), 'utf8')).replace(/\r\n/g, '\n');
    await admin.query(source);
    await admin.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)',
      [name.slice(0, 12), [source], name.slice(13, -4)]);
  }
  await admin.query(await readFile(new URL('../supabase/admin/initialize-fixed-accounts.sql', import.meta.url), 'utf8'));
  const source005 = (await readFile(new URL(names[4], migrationDir), 'utf8')).replace(/\r\n/g, '\n');
  const wrapper = await readFile(new URL('../supabase/admin/apply-ai-providers-005.sql', import.meta.url), 'utf8');
  report.migration_005_sha256 = sha(source005);
  report.migration_005_md5 = md5(source005);
  report.wrapper_005_sha256 = sha(wrapper);
  const expectedMd5 = md5(source005);
  await run('WRAPPER_CRLF_AND_REPEAT', async () => {
    assert.ok(wrapper.includes(expectedMd5));
    await admin.query(wrapper.replace(/\n/g, '\r\n'));
    let rows = (await admin.query("select statements,name from supabase_migrations.schema_migrations where version='202610130005'")).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'ai_providers');
    assert.equal(rows[0].statements.length, 1);
    assert.equal(md5(rows[0].statements[0]), expectedMd5);
    await admin.query(wrapper.replace(/\n/g, '\r\n'));
    rows = (await admin.query("select count(*)::int n from supabase_migrations.schema_migrations where version='202610130005'")).rows;
    assert.equal(rows[0].n, 1);
    const alteredSource = wrapper.replace('DeepSeek health data is not enabled', 'DeepSeek health data is enabled');
    assert.notEqual(alteredSource, wrapper);
    await denied(admin.query(alteredSource), /Migration source mismatch: 202610130005/);
    await admin.query('rollback');
  });
  await run('WRAPPER_HISTORY_GUARD', async () => {
    await admin.query("update supabase_migrations.schema_migrations set statements=array['tampered'] where version='202610130001'");
    await denied(admin.query(wrapper), /Migration history mismatch: 202610130001/);
    await admin.query('rollback');
    assert.equal((await admin.query('select public.health_provider_schema_version() v')).rows[0].v, 5);
    await admin.query('update supabase_migrations.schema_migrations set statements=array[$1] where version=$2',
      [(await readFile(new URL(names[0], migrationDir), 'utf8')).replace(/\r\n/g, '\n'), '202610130001']);
    await admin.query("update supabase_migrations.schema_migrations set statements=array['tampered'] where version='202610130005'");
    await denied(admin.query(wrapper), /Migration history mismatch: 202610130005/);
    await admin.query('rollback');
    await admin.query('update supabase_migrations.schema_migrations set statements=array[$1] where version=$2',
      [source005, '202610130005']);
  });
  const me = await connect('authenticated', userIds[0]);
  const serviceA = await connect('service_role');
  const serviceB = await connect('service_role');
  const pidA = Number((await serviceA.query('select pg_backend_pid() pid')).rows[0].pid);
  const pidB = Number((await serviceB.query('select pg_backend_pid() pid')).rows[0].pid);
  const period = (await admin.query("select date_trunc('month',now() at time zone 'Asia/Shanghai')::date period")).rows[0].period;
  await admin.query('insert into public.ai_monthly_budgets(period,limit_cents) values($1,200)', [period]);
  await admin.query("insert into public.ai_provider_budgets(period,provider,limit_cents) values($1,'openai',200),($1,'deepseek',10)", [period]);
  await me.query("select public.set_ai_provider_consent('openai','parse_schedule',true,500,'2026-10-13-openai-health-v1')");
  await run('PROVIDER_AND_PURPOSE_BOUNDARY', async () => {
    await denied(me.query("select public.reserve_ai_probe('parse_schedule',1)"), /permission denied/);
    await denied(me.query("select public.reserve_ai_provider_usage($1,'openai','parse_schedule',1)", [userIds[0]]), /permission denied/);
    await denied(me.query("select public.set_ai_provider_consent('deepseek','parse_schedule',true,10,'2026-10-13-deepseek-health-v1')"), /DeepSeek health data is not enabled/);
    await denied(me.query("select public.set_ai_consent('text',true,10,'2026-10-13-openai-health-v1')"), /Use provider and purpose consent/);
    await denied(serviceA.query("select public.reserve_ai_provider_usage($1,'deepseek','parse_schedule',1)", [userIds[0]]), /Invalid provider reservation/);
    await denied(serviceA.query("select public.reserve_ai_provider_usage($1,'openai','generate_plan',1)", [userIds[0]]), /AI consent unavailable/);
    assert.equal((await admin.query('select count(*)::int n from public.ai_usage')).rows[0].n, 0);
  });
  await run('GLOBAL_CROSS_PROVIDER_RACE', async () => {
    await admin.query("insert into public.ai_usage(user_id,period,kind,provider,purpose,reserved_cents,status) values($1,$2,'text','openai','parse_schedule',195,'reserved')", [userIds[0], period]);
    await serviceA.query('begin');
    try {
      await serviceA.query("select public.reserve_ai_provider_usage($1,'openai','parse_schedule',5)", [userIds[0]]);
      const pending = serviceB.query("select public.reserve_ai_probe('estimate_meal_text',5)").then(() => ({ ok: true }), error => ({ error }));
      await blockedBy(admin, pidB, pidA);
      await serviceA.query('commit');
      assert.match((await pending).error?.message ?? '', /Global AI budget exceeded/);
      const spent = (await admin.query("select (select coalesce(sum(reserved_cents),0) from public.ai_usage where period=$1)+(select coalesce(sum(reserved_cents),0) from public.ai_probe_usage where period=$1) cents", [period])).rows[0].cents;
      assert.equal(Number(spent), 200);
    } catch (error) { await serviceA.query('rollback').catch(() => {}); throw error; }
  });
  await run('DEEPSEEK_PROBE_CAP_RACE', async () => {
    await admin.query('delete from public.ai_usage');
    await serviceA.query('begin');
    try {
      await serviceA.query("select public.reserve_ai_probe('parse_schedule',6)");
      const pending = serviceB.query("select public.reserve_ai_probe('estimate_meal_text',6)").then(() => ({ ok: true }), error => ({ error }));
      await blockedBy(admin, pidB, pidA);
      await serviceA.query('commit');
      assert.match((await pending).error?.message ?? '', /DeepSeek probe budget exceeded/);
      assert.equal(Number((await admin.query('select coalesce(sum(reserved_cents),0) cents from public.ai_probe_usage')).rows[0].cents), 6);
    } catch (error) { await serviceA.query('rollback').catch(() => {}); throw error; }
  });
} catch (error) {
  report.setup_error = { name: error.name, code: error.code ?? null,
    reason: String(error.message).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[synthetic-id]').slice(0, 180) };
  process.exitCode = 1;
} finally {
  await Promise.allSettled(clients.map(client => client.end()));
  if (server) await server.stop().catch(() => { report.teardown_error = true; process.exitCode = 1; });
  report.generated_at = new Date().toISOString();
  report.script_sha256 = sha(await readFile(new URL('./verify-ai-provider-concurrency.mjs', import.meta.url)));
  await writeFile('test-results/ai-provider-concurrency-results.json', JSON.stringify(report, null, 2) + '\n');
  console.log(`AI provider concurrency: ${report.passed} passed, ${report.failed} failed, ${report.not_run} not run`);
  if (report.failed || report.not_run || report.setup_error || report.teardown_error) process.exitCode = 1;
}

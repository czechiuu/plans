import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import pg from 'pg';
import { localPostgres } from './with-local-postgres.mjs';

const ids = ['FIRST_APPLY_EXACT_HISTORY', 'SAME_HASH_NO_OP',
  'OLD_HISTORY_001_REJECTED', 'OLD_HISTORY_002_REJECTED', 'OLD_HISTORY_003_REJECTED',
  'DIFFERENT_004_REJECTED', 'FIXED_ACCOUNT_PRECONDITION',
  'REPAIR_EXACT_CRLF_HISTORY', 'REPAIR_ALREADY_LF_NO_OP', 'REPAIR_NON_NEWLINE_TAMPER_REJECTED',
  'REPAIR_WRONG_NAME_REJECTED', 'REPAIR_WRONG_CARDINALITY_REJECTED'];
const result = { started_at: new Date().toISOString(), scope: 'Isolated local PostgreSQL; synthetic accounts; no cloud',
  cases: Object.fromEntries(ids.map(id => [id, { status: 'not_run' }])), passed: 0, failed: 0, not_run: ids.length };
const users = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const root = new URL('../', import.meta.url);
const wrapper = await readFile(new URL('supabase/admin/apply-health-004.sql', root), 'utf8');
const repair = await readFile(new URL('supabase/admin/normalize-health-004-history.sql', root), 'utf8');
const normalization = `  -- SQL Editor clipboard transport can turn LF into CRLF inside the quoted migration.\n  v_source := replace(v_source, chr(13)||chr(10), chr(10));\n  if md5(v_source) is distinct from '9a430516e9a44d8d27c651cf24e73e2b' then\n    raise exception 'Migration source mismatch: 202610130004';\n  end if;\n`;
assert.ok(wrapper.includes(normalization));
const crlfWrapper = wrapper.replace(/\n/g, '\r\n');
const legacyCrlfWrapper = wrapper.replace(normalization, '').replace(/\n/g, '\r\n');
const migrationDir = new URL('supabase/migrations/', root);
const names = (await readdir(migrationDir)).filter(name => /^20261013000[1-4]_.*\.sql$/.test(name)).sort();
assert.equal(names.length, 4);
const source = await Promise.all(names.map(async name => (await readFile(new URL(name, migrationDir), 'utf8')).replace(/\r\n/g, '\n')));
const md5 = text => createHash('md5').update(text, 'utf8').digest('hex');
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');
result.wrapper_sha256 = sha256(wrapper);
result.repair_sha256 = sha256(repair);
result.migration_004_sha256 = sha256(source[3]);

async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return port;
}
async function caseRun(id, fn) {
  try { result.cases[id] = { status: 'passed', evidence: await fn() }; result.passed++; }
  catch (error) { result.cases[id] = { status: 'failed', error_name: error.name, error_code: error.code ?? null,
    reason: String(error.message).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[synthetic-id]').slice(0, 180) }; result.failed++; }
  result.not_run--;
}

let server;
const clients = [];
try {
  server = await localPostgres(await freePort());
  const common = { host: '127.0.0.1', port: server.port, user: 'test_admin', password: server.adminPassword };
  const connect = async database => {
    const c = new pg.Client({ ...common, database }); await c.connect(); clients.push(c); return c;
  };
  const bootstrap = await connect('postgres');
  result.postgresql_version = (await bootstrap.query('show server_version')).rows[0].server_version;
  await bootstrap.query(`create role authenticated login password ${bootstrap.escapeLiteral(server.authPassword)}`);
  await bootstrap.query(`create role service_role login password ${bootstrap.escapeLiteral(server.authPassword)}`);
  await bootstrap.query('create role anon');

  async function fixture(label, { badOldIndex = null, badFixed = false, existing004 = false } = {}) {
    const database = `health_wrapper_${label}`;
    await bootstrap.query(`create database ${bootstrap.escapeIdentifier(database)}`);
    const db = await connect(database);
    await db.query("set statement_timeout='12000ms'");
    await db.query('create schema auth');
    await db.query('create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,encrypted_password text)');
    await db.query(`create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$`);
    await db.query('grant usage on schema auth,public to authenticated,service_role');
    await db.query('grant execute on function auth.uid() to authenticated,service_role');
    await db.query('create schema supabase_migrations');
    await db.query('create table supabase_migrations.schema_migrations(version text primary key, statements text[], name text)');
    for (let i = 0; i < 2; i++) await db.query(
      'insert into auth.users(id,email,email_confirmed_at,encrypted_password) values($1,$2,now(),$3)',
      [users[i], ['me@plans.invalid', 'w@plans.invalid'][i], `SYNTHETIC-${randomBytes(8).toString('hex')}`]);
    for (let i = 0; i < 3; i++) {
      await db.query(source[i]);
      await db.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)',
        [names[i].slice(0, 12), [badOldIndex === i ? `${source[i]} -- tampered` : source[i]], names[i].slice(13, -4)]);
    }
    await db.query(await readFile(new URL('supabase/admin/initialize-fixed-accounts.sql', root), 'utf8'));
    if (badFixed) await db.query('delete from public.members where user_id=$1', [users[1]]);
    if (existing004) await db.query(`insert into supabase_migrations.schema_migrations(version,statements,name)
      values('202610130004',array['SYNTHETIC DIFFERENT 004'],'health_daily')`);
    return db;
  }
  const no004 = async db => {
    assert.equal((await db.query("select to_regclass('public.health_rules') as t")).rows[0].t, null);
    assert.equal((await db.query("select count(*)::int as n from supabase_migrations.schema_migrations where version='202610130004'"))
      .rows[0].n, 0);
  };
  const rejected = async (db, pattern) => {
    await assert.rejects(db.query(wrapper), pattern);
    await db.query('rollback');
    await no004(db);
  };

  let good;
  await caseRun('FIRST_APPLY_EXACT_HISTORY', async () => {
    good = await fixture('good');
    await good.query(crlfWrapper);
    assert.ok((await good.query("select to_regclass('public.health_rules') as t")).rows[0].t);
    const row = (await good.query("select statements,name from supabase_migrations.schema_migrations where version='202610130004'"))
      .rows[0];
    assert.equal(row.name, 'health_daily');
    assert.deepEqual(row.statements, [source[3]]);
    assert.equal(md5(row.statements[0]), md5(source[3]));
    return 'CRLF-pasted wrapper executed 004 but registered exact LF original in same transaction';
  });
  await caseRun('SAME_HASH_NO_OP', async () => {
    assert.ok(good);
    const before = (await good.query("select 'public.health_rules'::regclass::oid as oid")).rows[0].oid;
    await good.query(crlfWrapper);
    const after = (await good.query("select 'public.health_rules'::regclass::oid as oid")).rows[0].oid;
    assert.equal(after, before);
    assert.equal((await good.query("select count(*)::int as n from supabase_migrations.schema_migrations where version='202610130004'"))
      .rows[0].n, 1);
    return 'same source rerun kept one history row and same table OID';
  });
  for (let i = 0; i < 3; i++) await caseRun(`OLD_HISTORY_00${i + 1}_REJECTED`, async () => {
    const db = await fixture(`old${i + 1}`, { badOldIndex: i });
    await rejected(db, new RegExp(`Migration history mismatch: 20261013000${i + 1}`));
    return `altered 00${i + 1} statement rejected before 004 DDL`;
  });
  await caseRun('DIFFERENT_004_REJECTED', async () => {
    const db = await fixture('different', { existing004: true });
    await assert.rejects(db.query(wrapper), /Migration history mismatch: 202610130004/);
    await db.query('rollback');
    assert.equal((await db.query("select to_regclass('public.health_rules') as t")).rows[0].t, null);
    assert.deepEqual((await db.query("select statements from supabase_migrations.schema_migrations where version='202610130004'"))
      .rows[0].statements, ['SYNTHETIC DIFFERENT 004']);
    return 'different registered 004 rejected before DDL';
  });
  await caseRun('FIXED_ACCOUNT_PRECONDITION', async () => {
    const db = await fixture('fixed', { badFixed: true });
    await rejected(db, /Fixed two-account space precondition failed/);
    return 'missing fixed member rejected before 004 DDL';
  });
  let legacy;
  await caseRun('REPAIR_EXACT_CRLF_HISTORY', async () => {
    legacy = await fixture('legacy');
    await legacy.query(legacyCrlfWrapper);
    const before = (await legacy.query("select statements[1] as s from supabase_migrations.schema_migrations where version='202610130004'"))
      .rows[0].s;
    assert.equal(md5(before), 'ec77b7c1e820787e54e61da4b23bc990');
    assert.equal(Buffer.byteLength(before), 69006);
    const oid = (await legacy.query("select 'public.health_rules'::regclass::oid as oid")).rows[0].oid;
    await legacy.query(repair);
    const after = (await legacy.query("select statements[1] as s from supabase_migrations.schema_migrations where version='202610130004'"))
      .rows[0].s;
    assert.equal(after, source[3]);
    assert.equal((await legacy.query("select 'public.health_rules'::regclass::oid as oid")).rows[0].oid, oid);
    await legacy.query(crlfWrapper);
    return 'exact legacy CRLF hash repaired to LF; DDL unchanged; fixed wrapper accepts history';
  });
  await caseRun('REPAIR_ALREADY_LF_NO_OP', async () => {
    assert.ok(legacy);
    const before = (await legacy.query("select statements[1] as s from supabase_migrations.schema_migrations where version='202610130004'"))
      .rows[0].s;
    await legacy.query(repair);
    const after = (await legacy.query("select statements[1] as s from supabase_migrations.schema_migrations where version='202610130004'"))
      .rows[0].s;
    assert.equal(after, before);
    return 'already normalized history stayed unchanged';
  });
  await caseRun('REPAIR_NON_NEWLINE_TAMPER_REJECTED', async () => {
    const db = await fixture('tamper');
    await db.query(legacyCrlfWrapper);
    await db.query("update supabase_migrations.schema_migrations set statements[1]=statements[1]||'X' where version='202610130004'");
    const before = (await db.query("select statements[1] as s from supabase_migrations.schema_migrations where version='202610130004'"))
      .rows[0].s;
    const oid = (await db.query("select 'public.health_rules'::regclass::oid as oid")).rows[0].oid;
    await assert.rejects(db.query(repair), /Migration history mismatch: 202610130004/);
    await db.query('rollback');
    assert.equal((await db.query("select statements[1] as s from supabase_migrations.schema_migrations where version='202610130004'"))
      .rows[0].s, before);
    assert.equal((await db.query("select 'public.health_rules'::regclass::oid as oid")).rows[0].oid, oid);
    return 'non-newline byte change refused without history or DDL mutation';
  });
  for (const kind of ['name', 'cardinality']) await caseRun(`REPAIR_WRONG_${kind.toUpperCase()}_REJECTED`, async () => {
    const db = await fixture(`wrong${kind}`);
    await db.query(legacyCrlfWrapper);
    if (kind === 'name') await db.query("update supabase_migrations.schema_migrations set name='other' where version='202610130004'");
    else await db.query("update supabase_migrations.schema_migrations set statements=statements||array['extra'] where version='202610130004'");
    const before = (await db.query("select statements,name from supabase_migrations.schema_migrations where version='202610130004'"))
      .rows[0];
    await assert.rejects(db.query(repair), /Migration history mismatch: 202610130004/);
    await db.query('rollback');
    const after = (await db.query("select statements,name from supabase_migrations.schema_migrations where version='202610130004'"))
      .rows[0];
    assert.deepEqual(after, before);
    return `wrong ${kind} refused without metadata mutation`;
  });
} catch (error) {
  result.setup_error = { name: error.name, code: error.code ?? null, reason: String(error.message).slice(0, 180) };
  process.exitCode = 1;
} finally {
  await Promise.allSettled(clients.map(c => c.end()));
  if (server) await server.stop().catch(() => { result.teardown_error = true; process.exitCode = 1; });
  result.generated_at = new Date().toISOString();
  result.script_sha256 = sha256(await readFile(new URL('./verify-health-migration-wrapper.mjs', import.meta.url), 'utf8'));
  await writeFile(new URL('test-results/health-migration-wrapper-results.json', root), JSON.stringify(result, null, 2) + '\n');
  console.log(`health migration wrapper: ${result.passed} passed, ${result.failed} failed, ${result.not_run} not run`);
  if (result.failed || result.not_run || result.teardown_error) process.exitCode = 1;
}

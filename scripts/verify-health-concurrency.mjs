import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import pg from 'pg';
import { localPostgres } from './with-local-postgres.mjs';

const { Client } = pg;
const users = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const caseIds = [
  'CLIENT_RLS_SERVICE_BOUNDARY', 'DUPLICATE_QUEUE_AND_CLAIM', 'LEASE_FENCING',
  'FINITE_RETRY', 'INPUT_UPDATE_VS_PUBLISH', 'PHOTO_ATTACH_DELETE_LOCK_ORDER',
  'MANUAL_SAVE_DURING_RUNNING', 'MANUAL_SCHEDULED_PUBLISH_RACE',
  'SHARE_REVOKE_AND_LEAVE', 'MONTHLY_BUDGET_RACE',
  'FINISH_VS_LEAVE','GENERATION_REPLAY_PROVIDER_BINDING','PHOTO_STORAGE_DELETE_RECOVERY','UPLOAD_CLEAR_LEAVE_LOCK_ORDER','SCHEDULED_PROVIDER_LOCK_ORDER',
];
const report = {
  started_at: new Date().toISOString(), generated_at: null,
  scope: 'Isolated local PostgreSQL; synthetic fixed accounts only; no production connection',
  cases: Object.fromEntries(caseIds.map(id => [id, { status: 'not_run' }])),
  passed: 0, failed: 0, not_run: caseIds.length,
};
const templateMeals = ['08:00', '12:00', '18:00'].map((time,index) => ({
  time, title: ['早餐','午餐','晚餐'][index], foods: [{ name: 'SYNTHETIC', portion: '1', unit: '份' }],
  prep_method: 'SYNTHETIC', purchase_or_prep: 'SYNTHETIC', alternative: 'SYNTHETIC',
  notes: '', snack_reason: null,
}));
const content = { summary: 'SYNTHETIC', meals: templateMeals, warnings: [], training: {
  mode: 'rest', purpose: 'SYNTHETIC', time: null, intensity: 'none', equipment: 'none',
  muscles: [], warmup: [], items: [], cooldown: [], total_seconds: 0,
} };
const rules = (note = 'SYNTHETIC') => ({
  confirmed: false, equipment: 'unknown', ankle_status: 'unknown', free_weekdays: [],
  exercise_minutes: null, limitations: note,
});
const sharing = (meal) => ({ share_plan: false, share_training: false, share_meal: meal, share_photo: false });
const mealData = () => ({ recorded_at: new Date().toISOString(), kind: 'dinner', items: [
  { name: 'SYNTHETIC', portion: '1', unit: '份' },
], eaten_fraction: 1, shared_meal_id: null, photo_ids: [], cooking: null, oil: null,
leftover: null, estimate: null });

async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return port;
}
async function blockedBy(observer, waiterPid, holderPid, label = 'lock') {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const { rows } = await observer.query('select pg_blocking_pids($1) as pids', [waiterPid]);
    if (rows[0].pids.includes(holderPid)) return true;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(`expected PostgreSQL ${label} wait was not observed`);
}
async function waitingOnLock(observer, waiterPid, label) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const { rows } = await observer.query('select pg_blocking_pids($1) as pids', [waiterPid]);
    if (rows[0].pids.length) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(`expected PostgreSQL ${label} wait was not observed`);
}
async function run(id, fn) {
  try {
    const evidence = await fn();
    report.cases[id] = { status: 'passed', ...evidence };
    report.passed++;
  } catch (error) {
    report.cases[id] = { status: 'failed', error_name: error.name, error_code: error.code ?? null,
      reason: String(error.message).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[synthetic-id]').slice(0, 240) };
    report.failed++;
  }
  report.not_run--;
}

let server;
let clients = [];
try {
  server = await localPostgres(await freePort());
  const common = { host: '127.0.0.1', port: server.port, database: 'postgres' };
  const bootstrap = new Client({ ...common, user: 'test_admin', password: server.adminPassword });
  await bootstrap.connect();
  await bootstrap.query(`create role authenticated login password ${bootstrap.escapeLiteral(server.authPassword)}`);
  await bootstrap.query(`create role service_role login password ${bootstrap.escapeLiteral(server.authPassword)}`);
  await bootstrap.query('create role anon');
  await bootstrap.query('create database health_concurrency');
  await bootstrap.end();
  const database = 'health_concurrency';
  const connect = async (role, userId = '') => {
    const client = new Client({ ...common, database, user: role,
      password: role === 'test_admin' ? server.adminPassword : server.authPassword });
    await client.connect();
    await client.query("set statement_timeout='10000ms'");
    if (role === 'authenticated') await client.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
    clients.push(client);
    return client;
  };
  const admin = await connect('test_admin');
  report.postgresql_version = (await admin.query('show server_version')).rows[0].server_version;
  await admin.query('create schema storage');
  await admin.query('create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text unique not null)');
  await admin.query('grant usage on schema storage to service_role');
  await admin.query('grant select,insert,delete on storage.objects to service_role');
  await admin.query('create schema auth');
  await admin.query('create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,encrypted_password text)');
  await admin.query(`create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$`);
  await admin.query('grant usage on schema auth,public to authenticated,service_role');
  await admin.query('grant execute on function auth.uid() to authenticated,service_role');
  for (let i = 0; i < 2; i++) await admin.query(
    'insert into auth.users(id,email,email_confirmed_at,encrypted_password) values($1,$2,now(),$3)',
    [users[i], ['me@plans.invalid', 'w@plans.invalid'][i], `SYNTHETIC-${randomBytes(8).toString('hex')}`],
  );
  const migrationDir = new URL('../supabase/migrations/', import.meta.url);
  const migrationNames = (await readdir(migrationDir)).filter(name => name.endsWith('.sql')).sort();
  assert.ok(migrationNames.some(name=>name.endsWith('_integrity.sql')), 'Integrity migration required');
  report.applied_migrations=migrationNames;
  report.migration_sha256={};
  for (const name of migrationNames) {
    const source=await readFile(new URL(name,migrationDir),'utf8');
    await admin.query(source);
    report.migration_sha256[name]=createHash('sha256').update(source).digest('hex');
  }
  report.migration_004_sha256 = createHash('sha256').update(await readFile(new URL(migrationNames[3], migrationDir))).digest('hex');
  await admin.query(await readFile(new URL('../supabase/admin/initialize-fixed-accounts.sql', import.meta.url), 'utf8'));
  const me = await connect('authenticated', users[0]);
  const me2 = await connect('authenticated', users[0]);
  const partner = await connect('authenticated', users[1]);
  const serviceA = await connect('service_role');
  const serviceB = await connect('service_role');
  const rpc = async (client, name, args = [], casts = []) => (await client.query(
    `select to_jsonb(public.${name}(${args.map((_, i) => `$${i + 1}${casts[i] ?? ''}`).join(',')})) as v`, args,
  )).rows[0].v;
  const target = (await admin.query("select ((now() at time zone 'Asia/Shanghai')::date+1)::text as d")).rows[0].d;
  const later = days => new Date(`${target}T00:00:00Z`).getTime() + (days - 1) * 86400000;
  const date = days => new Date(later(days)).toISOString().slice(0, 10);
  const pid = async client => Number((await client.query('select pg_backend_pid() as pid')).rows[0].pid);

  await run('CLIENT_RLS_SERVICE_BOUNDARY', async () => {
    const state = (await me.query(`select current_user,auth.uid() as uid,current_setting('row_security') as rls,
      (select rolsuper or rolbypassrls from pg_roles where rolname=current_user) as elevated`)).rows[0];
    assert.equal(state.current_user, 'authenticated'); assert.equal(state.uid, users[0]);
    assert.equal(state.rls, 'on'); assert.equal(state.elevated, false);
    await assert.rejects(me.query('select public.claim_generation_job()'), /permission denied/);
    await assert.rejects(me.query("select public.begin_photo_upload(auth.uid(),gen_random_uuid(),repeat('a',64),1,1,100,null,false)"), /permission denied/);
    await assert.rejects(me.query('select public.complete_photo_upload(gen_random_uuid(),auth.uid(),gen_random_uuid())'), /permission denied/);
    await assert.rejects(me.query('select public.lock_health_owner(auth.uid(),gen_random_uuid())'), /permission denied/);
    await assert.rejects(me.query("insert into public.generation_jobs(space_id,user_id,target_date,kind,scheduled_for,input_version) values(gen_random_uuid(),auth.uid(),current_date,'manual',now(),'x')"), /permission denied/);
    assert.equal((await partner.query('select * from public.health_rules')).rows.length, 0);
    return { evidence: 'client role non-elevated; service-only RPC and direct write rejected' };
  });

  await run('DUPLICATE_QUEUE_AND_CLAIM', async () => {
    await rpc(me, 'save_health_rules', [JSON.stringify({ ...rules(), confirmed: true, meal_template: templateMeals }), false, null],
      ['::jsonb', '::boolean', '::timestamptz']);
    const [one, two] = await Promise.all([rpc(me, 'request_plan_generation', [date(1), 'rules'], ['::date', '::text']),
      rpc(me2, 'request_plan_generation', [date(1), 'rules'], ['::date', '::text'])]);
    assert.equal(one.id, two.id);
    assert.equal((await admin.query('select count(*)::int as n from public.generation_jobs where user_id=$1 and target_date=$2', [users[0], date(1)])).rows[0].n, 1);
    await serviceA.query('begin');
    let held = true;
    try {
      const claimed = await rpc(serviceA, 'claim_generation_job', [one.id], ['::uuid']);
      assert.equal(claimed.status, 'running');
      assert.equal(await rpc(serviceB, 'claim_generation_job', [one.id], ['::uuid']), null);
      await serviceA.query('commit'); held = false;
      const done = await rpc(serviceA, 'finish_generation_job',
        [one.id, claimed.claim_token, JSON.stringify(content), claimed.input_version, 'rules', null],
        ['::uuid', '::uuid', '::jsonb', '::text', '::text', '::text']);
      assert.equal(done.status, 'succeeded');
      assert.equal((await admin.query('select count(*)::int as n from public.daily_plans where user_id=$1 and target_date=$2', [users[0], date(1)])).rows[0].n, 1);
    } finally { if (held) await serviceA.query('rollback'); }
    return { evidence: 'same-date queue idempotent; SKIP LOCKED single claim; one plan persisted' };
  });

  await run('GENERATION_REPLAY_PROVIDER_BINDING',async()=>{
    const before=(await admin.query('select * from public.generation_jobs where user_id=$1 and target_date=$2',[users[0],date(1)])).rows[0];
    const replay=await rpc(me,'request_plan_generation',[date(1),'openai'],['::date','::text']);
    assert.equal(replay.id,before.id);assert.equal(replay.status,'succeeded');assert.equal(replay.provider,'rules');assert.equal(replay.attempts,before.attempts);
    assert.equal(await rpc(serviceA,'claim_generation_job',[replay.id],['::uuid']),null);
    const plan=(await me.query('select *,updated_at::text as updated_at from daily_plans where id=$1',[replay.plan_id])).rows[0];
    const beforeHash=replay.input_version;
    const locked=await rpc(me,'set_plan_lock',[plan.id,true,plan.updated_at],['::uuid','::boolean','::timestamptz']);
    assert.notEqual(await rpc(serviceA,'health_input_version',[users[0],date(1)],['::uuid','::date']),beforeHash);
    await rpc(me,'set_plan_lock',[plan.id,false,locked.updated_at],['::uuid','::boolean','::timestamptz']);
    assert.notEqual(await rpc(serviceA,'health_input_version',[users[0],date(1)],['::uuid','::date']),beforeHash);
    const queued=await rpc(me,'request_plan_generation',[date(20),'openai'],['::date','::text']);
    await admin.query("insert into public.ai_plan_preferences(user_id,space_id,plan_provider) values($1,$2,'rules') on conflict(user_id) do update set plan_provider='rules'",[users[0],queued.space_id]);
    const claim=await rpc(serviceA,'claim_generation_job',[queued.id],['::uuid']);assert.equal(claim.provider,'openai');
    await rpc(serviceA,'finish_generation_job',[queued.id,claim.claim_token,null,null,'ai','SYNTHETIC_FAILURE'],['::uuid','::uuid','::jsonb','::text','::text','::text']);
    const retry=await rpc(me,'retry_generation_job',[queued.id],['::uuid']);assert.equal(retry.provider,'openai');
    await admin.query('delete from public.generation_jobs where id=$1',[queued.id]);
    return {evidence:'same input replay is succeeded and unclaimable; provider remains bound through preference changes and retry'};
  });

  await run('LEASE_FENCING', async () => {
    const job = await rpc(me, 'request_plan_generation', [date(2), 'rules'], ['::date', '::text']);
    const old = await rpc(serviceA, 'claim_generation_job', [job.id], ['::uuid']);
    await admin.query("update public.generation_jobs set lease_until=now()-interval '1 second' where id=$1", [job.id]);
    const fresh = await rpc(serviceB, 'claim_generation_job', [job.id], ['::uuid']);
    assert.notEqual(old.claim_token, fresh.claim_token); assert.equal(fresh.attempts, 2);
    const finish = (client, token) => rpc(client, 'finish_generation_job',
      [job.id, token, JSON.stringify(content), fresh.input_version, 'rules', null],
      ['::uuid', '::uuid', '::jsonb', '::text', '::text', '::text']);
    await assert.rejects(finish(serviceA, old.claim_token), /Job lease unavailable/);
    assert.equal((await finish(serviceB, fresh.claim_token)).status, 'succeeded');
    await assert.rejects(finish(serviceB, fresh.claim_token), /Job lease unavailable/);
    assert.equal((await admin.query('select count(*)::int as n from public.daily_plans where user_id=$1 and target_date=$2', [users[0], date(2)])).rows[0].n, 1);
    return { evidence: 'expired token rejected after reclaim; duplicate finish rejected' };
  });

  await run('FINITE_RETRY', async () => {
    const job = await rpc(me, 'request_plan_generation', [date(3), 'rules'], ['::date', '::text']);
    for (let attempt = 1; attempt <= 3; attempt++) {
      const claimed = await rpc(serviceA, 'claim_generation_job', [job.id], ['::uuid']);
      assert.equal(claimed.attempts, attempt);
      const result = await rpc(serviceA, 'finish_generation_job',
        [job.id, claimed.claim_token, null, null, 'rules', 'SYNTHETIC_FAILURE'],
        ['::uuid', '::uuid', '::jsonb', '::text', '::text', '::text']);
      assert.equal(result.status, attempt === 3 ? 'exhausted' : 'failed');
      await admin.query('update public.generation_jobs set next_run_at=now() where id=$1', [job.id]);
    }
    assert.equal(await rpc(serviceB, 'claim_generation_job', [job.id], ['::uuid']), null);
    return { evidence: 'three attempts exhausted; fourth claim unavailable' };
  });

  await run('INPUT_UPDATE_VS_PUBLISH', async () => {
    const initial = (await me.query('select updated_at::text as updated_at from public.health_rules where user_id=auth.uid()')).rows[0];
    assert.ok(initial);
    const job = await rpc(me, 'request_plan_generation', [date(4), 'rules'], ['::date', '::text']);
    const claimed = await rpc(serviceA, 'claim_generation_job', [job.id], ['::uuid']);
    await me.query('begin');
    let held = true;
    try {
      await rpc(me, 'save_health_rules', [JSON.stringify({ ...rules('SYNTHETIC UPDATE'), confirmed: true,
        meal_template: templateMeals }), false, initial.updated_at],
        ['::jsonb', '::boolean', '::timestamptz']);
      const pending = rpc(serviceA, 'finish_generation_job',
        [job.id, claimed.claim_token, JSON.stringify(content), claimed.input_version, 'rules', null],
        ['::uuid', '::uuid', '::jsonb', '::text', '::text', '::text']);
      const first = await Promise.race([pending.then(value => ({ value }), error => ({ error })),
        new Promise(resolve => setTimeout(() => resolve({ pending: true }), 700))]);
      await me.query('commit'); held = false;
      const result = first.pending ? await pending.then(value => ({ value }), error => ({ error })) : first;
      const current = (await admin.query('select is_stale,input_version from public.daily_plans where user_id=$1 and target_date=$2 and is_current',
        [users[0], date(4)])).rows[0];
      assert.ok(result.error || !current || current.is_stale || current.input_version !== claimed.input_version,
        'An old-input plan remained current and fresh after a committed rules update');
      return { evidence: result.error ? 'stale publish rejected' : 'published plan visibly stale after input update' };
    } finally { if (held) await me.query('rollback'); }
  });

  await run('MANUAL_SAVE_DURING_RUNNING', async () => {
    const targetDate = date(7);
    const job = await rpc(me, 'request_plan_generation', [targetDate, 'rules'], ['::date', '::text']);
    const claim = await rpc(serviceA, 'claim_generation_job', [job.id], ['::uuid']);
    const manual = await rpc(me, 'save_daily_plan', [targetDate, JSON.stringify(content), null, false, null],
      ['::date', '::jsonb', '::integer', '::boolean', '::uuid']);
    assert.equal(manual.source, 'manual');
    const finished = await rpc(serviceA, 'finish_generation_job',
      [job.id, claim.claim_token, JSON.stringify(content), claim.input_version, 'rules', null],
      ['::uuid', '::uuid', '::jsonb', '::text', '::text', '::text']);
    assert.equal(finished.status, 'exhausted');
    assert.equal(finished.error_code, 'PLAN_MANUAL_NEWER');
    const rows = (await admin.query('select id,source,version from public.daily_plans where user_id=$1 and target_date=$2',
      [users[0], targetDate])).rows;
    assert.equal(rows.length, 1); assert.equal(rows[0].id, manual.id);
    assert.equal(rows[0].source, 'manual'); assert.equal(rows[0].version, 1);
    return { evidence: 'manual save after claim persists once; older automatic finish converges without overwrite' };
  });

  await run('MANUAL_SCHEDULED_PUBLISH_RACE', async () => {
    const targetDate = date(8);
    const manual = await rpc(me, 'request_plan_generation', [targetDate, 'rules'], ['::date', '::text']);
    const scheduled = (await admin.query(`insert into public.generation_jobs
      (space_id,user_id,target_date,kind,scheduled_for,input_version,provider)
      values($1,$2,$3,'scheduled',now(),$4,'rules') returning id`,
    [manual.space_id, users[0], targetDate, manual.input_version])).rows[0];
    const first = await rpc(serviceA, 'claim_generation_job', [manual.id], ['::uuid']);
    const second = await rpc(serviceB, 'claim_generation_job', [scheduled.id], ['::uuid']);
    assert.equal(first.status, 'running'); assert.equal(second.status, 'running');
    const finish = (client, jobId, claim) => rpc(client, 'finish_generation_job',
      [jobId, claim.claim_token, JSON.stringify(content), claim.input_version, 'rules', null],
      ['::uuid', '::uuid', '::jsonb', '::text', '::text', '::text']);
    await serviceA.query('begin'); let held = true;
    try {
      const a = await finish(serviceA, manual.id, first);
      assert.equal(a.status, 'succeeded');
      const holderPid = await pid(serviceA), waiterPid = await pid(serviceB);
      const pending = finish(serviceB, scheduled.id, second).then(value => ({ value }), error => ({ error }));
      await blockedBy(admin, waiterPid, holderPid);
      await serviceA.query('commit'); held = false;
      const b = await pending;
      if (b.error) throw b.error;
      assert.equal(b.value.status, 'succeeded');
      assert.equal(b.value.plan_id, a.plan_id);
      const rows = (await admin.query('select id,version from public.daily_plans where user_id=$1 and target_date=$2',
        [users[0], targetDate])).rows;
      assert.equal(rows.length, 1); assert.equal(rows[0].version, 1);
      return { evidence: 'manual and scheduled jobs claimed separately; second finish waited and reused first plan id' };
    } finally { if (held) await serviceA.query('rollback'); }
  });

  await run('PHOTO_ATTACH_DELETE_LOCK_ORDER', async () => {
    const meal = await rpc(me, 'save_meal', [JSON.stringify({ data: mealData(), status: 'draft', is_shared: false }), null],
      ['::jsonb', '::uuid']);
    const space = (await admin.query('select space_id from public.fixed_accounts where user_id=$1', [users[0]])).rows[0].space_id;
    const photo = (await admin.query(`insert into public.photo_assets
      (space_id,user_id,sha256,storage_path,mime,width,height,bytes,updated_by)
      values($1,$2,$3,$4,'image/png',1,1,100,$2) returning id`,
    [space, users[0], 'a'.repeat(64), `${users[0]}/synthetic.png`])).rows[0].id;
    await serviceA.query('begin'); let held = true, attaching;
    try {
      assert.equal(await rpc(serviceA, 'begin_photo_delete', [photo, users[0], space],
        ['::uuid', '::uuid', '::uuid']), `${users[0]}/synthetic.png`);
      const holderPid = await pid(serviceA), waiterPid = await pid(me2), reusePid = await pid(serviceB);
      const data = mealData(); data.photo_ids = [photo];
      attaching = rpc(me2, 'save_meal',
        [JSON.stringify({ data, status: 'draft', is_shared: false, expected_updated_at: meal.updated_at }), meal.id],
        ['::jsonb', '::uuid']).then(value => ({ value }), error => ({ error }));
      await blockedBy(admin, waiterPid, holderPid, 'photo attachment');
      const reusing = rpc(serviceB, 'reuse_photo_asset', [photo, users[0], space, meal.id],
        ['::uuid', '::uuid', '::uuid', '::uuid']).then(value => ({ value }), error => ({ error }));
      await waitingOnLock(admin, reusePid, 'photo reuse');
      await serviceA.query('commit'); held = false;
      const [attach, reuse] = await Promise.all([attaching, reusing]);
      assert.notEqual(attach.error?.code, '40P01', 'Meal attachment deadlocked against photo unlink');
      assert.match(attach.error?.message ?? '', /Invalid meal photos/);
      assert.match(reuse.error?.message ?? '', /Photo unavailable/);
      await rpc(serviceB, 'unlink_photo_asset', [photo], ['::uuid']);
      const row = (await admin.query("select data->'photo_ids' as ids from public.meals where id=$1", [meal.id])).rows[0];
      const exists = (await admin.query('select count(*)::int as n from public.photo_assets where id=$1', [photo])).rows[0].n;
      assert.ok(!row?.ids?.includes(photo) || exists === 1,
        'Meal retained a photo id after the linked photo was deleted');
      return { evidence: 'deletion marker committed while attachment waited; attachment rejected; unlink left no dangling reference' };
    } finally {
      if (held) await serviceA.query('rollback');
      if (attaching) await attaching;
      await admin.query('delete from public.photo_assets where id=$1', [photo]);
    }
  });

  const reservePhoto=async(sha)=>{
    const space=(await admin.query('select space_id from public.members where user_id=$1',[users[0]])).rows[0].space_id;
    return rpc(serviceA,'begin_photo_upload',[users[0],space,sha.repeat(64),1,1,100,null,true],['::uuid','::uuid','::text','::integer','::integer','::integer','::uuid','::boolean']);
  };
  await run('PHOTO_STORAGE_DELETE_RECOVERY',async()=>{
    const photo=await reservePhoto('b');assert.equal(photo.uploading,true);
    await serviceA.query("insert into storage.objects(bucket_id,name) values('health-photos',$1)",[photo.storage_path]);
    await rpc(serviceA,'complete_photo_upload',[photo.id,users[0],photo.space_id],['::uuid','::uuid','::uuid']);
    await rpc(serviceA,'begin_photo_delete',[photo.id,users[0],photo.space_id],['::uuid','::uuid','::uuid']);
    // Simulate Storage remove failure: no unlink runs, so retry remains discoverable.
    assert.equal((await me.query('select deleting from photo_assets where id=$1',[photo.id])).rows[0].deleting,true);
    assert.equal((await partner.query('select id from photo_assets where id=$1',[photo.id])).rows.length,0);
    assert.equal((await me.query('select id from photo_assets where id=$1 and not deleting and not uploading',[photo.id])).rows.length,0);
    assert.equal(await rpc(serviceA,'begin_photo_delete',[photo.id,users[0],photo.space_id],['::uuid','::uuid','::uuid']),photo.storage_path);
    await serviceA.query('delete from storage.objects where name=$1',[photo.storage_path]);
    await assert.rejects(serviceB.query("insert into storage.objects(bucket_id,name) values('health-photos',$1)",[photo.storage_path]),/reservation unavailable/);
    await rpc(serviceA,'unlink_photo_asset',[photo.id],['::uuid']);
    await assert.rejects(serviceB.query("insert into storage.objects(bucket_id,name) values('health-photos',$1)",[photo.storage_path]),/reservation required/);
    await assert.rejects(rpc(serviceA,'complete_photo_upload',[photo.id,users[0],photo.space_id],['::uuid','::uuid','::uuid']),/Photo unavailable/);
    return {evidence:'failed remove retains owner cleanup row; partner/download denied; retry cleans; late Storage insert rejected'};
  });
  await run('UPLOAD_CLEAR_LEAVE_LOCK_ORDER',async()=>{
    for(const action of ['erase_own_health_data','leave_space']){
      await serviceA.query('begin');let held=true;
      try{
        const photo=await reservePhoto(action==='leave_space'?'c':'d');
        const waiterPid=await pid(me2),holderPid=await pid(serviceA);
        const pending=rpc(me2,action).then(value=>({value}),error=>({error}));
        await Promise.race([blockedBy(admin,waiterPid,holderPid,'upload lifecycle'),pending.then(x=>{throw x.error??new Error('Unexpected erasure success')})]);
        await serviceA.query('commit');held=false;
        assert.match((await pending).error?.message??'',/Delete private photos first/);
        await rpc(serviceA,'begin_photo_delete',[photo.id,users[0],photo.space_id],['::uuid','::uuid','::uuid']);
        await rpc(serviceA,'unlink_photo_asset',[photo.id],['::uuid']);
      }finally{if(held)await serviceA.query('rollback');}
    }
    return {evidence:'clear and leave wait behind reserved upload then refuse erasure; interrupted upload cleanup succeeds'};
  });

  await run('SCHEDULED_PROVIDER_LOCK_ORDER',async()=>{
    const photo=await reservePhoto('e');
    await admin.query("update ai_plan_preferences set plan_provider='openai' where user_id=$1",[users[0]]);
    const stamp=(await admin.query('select now()::text stamp')).rows[0].stamp;
    const holderPid=await pid(serviceA),waiterPid=await pid(me2);
    await serviceA.query('begin');let held=true;
    try{
      assert.equal(await rpc(serviceA,'enqueue_scheduled_plans',[stamp],['::timestamptz']),2);
      const leaving=rpc(me2,'leave_space').then(value=>({value}),error=>({error}));
      await blockedBy(admin,waiterPid,holderPid,'scheduled enqueue / leave');
      await serviceA.query('commit');held=false;
      assert.match((await leaving).error?.message??'',/Delete private photos first/);
      await admin.query("update ai_plan_preferences set plan_provider='rules' where user_id=$1",[users[0]]);
      const jobs=(await admin.query("select user_id,provider from generation_jobs where kind='scheduled' and scheduled_for=$1",[stamp])).rows;
      assert.equal(jobs.find(x=>x.user_id===users[0]).provider,'openai');
      assert.equal(jobs.find(x=>x.user_id===users[1]).provider,'rules');
      await admin.query("delete from generation_jobs where kind='scheduled' and scheduled_for=$1",[stamp]);
      await rpc(serviceA,'begin_photo_delete',[photo.id,users[0],photo.space_id],['::uuid','::uuid','::uuid']);
      await rpc(serviceA,'unlink_photo_asset',[photo.id],['::uuid']);
    }finally{if(held)await serviceA.query('rollback');}
    return {evidence:'scheduled provider captured for each owner; enqueue and leave share space-first order'};
  });

  await run('SHARE_REVOKE_AND_LEAVE', async () => {
    const saved = await rpc(me, 'save_meal', [JSON.stringify({ data: mealData(), status: 'draft', is_shared: true }), null],
      ['::jsonb', '::uuid']);
    assert.equal((await partner.query('select count(*)::int as n from public.meals where id=$1', [saved.id])).rows[0].n, 0);
    await rpc(me, 'save_health_sharing', [JSON.stringify(sharing(true))], ['::jsonb']);
    assert.equal((await partner.query('select count(*)::int as n from public.meals where id=$1', [saved.id])).rows[0].n, 1);
    const edit = (stamp) => rpc(partner, 'save_meal', [JSON.stringify({ data: mealData(), status: 'draft', is_shared: true, expected_updated_at: stamp }), saved.id],
      ['::jsonb', '::uuid']);
    await assert.rejects(edit(saved.updated_at), /not found or access denied/);
    await rpc(me, 'save_settings', [JSON.stringify({ share_profile: false, share_schedule: false, share_weight: false, allow_partner_edit: true })], ['::jsonb']);
    const changed = await edit(saved.updated_at); assert.equal(changed.updated_by, users[1]);
    // The partner starts an allowed edit, then waits on the meal row while the owner revokes access.
    await admin.query('begin'); let held = true;
    try {
      await admin.query('select id from public.meals where id=$1 for update', [saved.id]);
      const holderPid = await pid(admin), waiterPid = await pid(partner);
      let order = 0, editOrder = 0, revokeOrder = 0;
      const pendingEdit = edit(changed.updated_at).then(value => { editOrder = ++order; return { value }; },
        error => { editOrder = ++order; return { error }; });
      await blockedBy(serviceB, waiterPid, holderPid);
      let revoked = false;
      const pendingRevoke = rpc(me, 'save_health_sharing', [JSON.stringify(sharing(false))], ['::jsonb'])
        .then(() => { revoked = true; revokeOrder = ++order; return { ok: true }; },
          error => { revokeOrder = ++order; return { error }; });
      await new Promise(resolve => setTimeout(resolve, 250));
      const revokedBeforeRelease = revoked;
      await admin.query('commit'); held = false;
      const [editResult, revokeResult] = await Promise.all([pendingEdit, pendingRevoke]);
      assert.equal(revokeResult.ok, true);
      if (editResult.value) assert.ok(editOrder < revokeOrder, 'Partner edit committed after revocation');
      else assert.match(editResult.error?.message ?? '', /not found or access denied|Edit conflict/);
      if (revokedBeforeRelease) assert.ok(editResult.error, 'Waiting edit succeeded after committed revocation');
    } finally { if (held) await admin.query('rollback'); }
    assert.equal((await partner.query('select count(*)::int as n from public.meals where id=$1', [saved.id])).rows[0].n, 0);
    await assert.rejects(edit(changed.updated_at), /not found or access denied/);
    await rpc(me, 'leave_space');
    assert.equal((await admin.query('select count(*)::int as n from public.meals where id=$1', [saved.id])).rows[0].n, 0);
    await assert.rejects(edit(changed.updated_at), /not found or access denied/);
    return { evidence: 'default private; grant permits edit; actual blocked edit/revoke race serialized; leave removes record' };
  });

  await run('MONTHLY_BUDGET_RACE', async () => {
    await rpc(partner, 'set_ai_provider_consent', ['openai','estimate_meal_text', true, 2, '2026-10-13-openai-health-v1'],
      ['::text','::text', '::boolean', '::integer', '::text']);
    await admin.query("insert into public.ai_provider_budgets(period,provider,limit_cents) values(date_trunc('month',now() at time zone 'Asia/Shanghai')::date,'openai',2)");
    await admin.query("insert into public.ai_monthly_budgets(period,limit_cents) values(date_trunc('month',now() at time zone 'Asia/Shanghai')::date,2)");
    await serviceA.query('begin'); let held = true;
    try {
      const first = await rpc(serviceA, 'reserve_ai_provider_usage', [users[1], 'openai','estimate_meal_text', 2], ['::uuid', '::text','::text', '::integer']);
      const holderPid = await pid(serviceA);
      const waiterPid = await pid(serviceB);
      const pending = rpc(serviceB, 'reserve_ai_provider_usage', [users[1], 'openai','estimate_meal_text', 2], ['::uuid', '::text','::text', '::integer'])
        .then(value => ({ value }), error => ({ error }));
      await blockedBy(admin, waiterPid, holderPid);
      await serviceA.query('commit'); held = false;
      const second = await pending;
      assert.match(second.error?.message ?? '', /Global AI budget exceeded/);
      assert.equal((await admin.query("select count(*)::int as n from public.ai_usage where status='reserved'")).rows[0].n, 1);
      await rpc(serviceA, 'settle_ai_usage', [first, 1], ['::uuid', '::integer']);
      assert.ok(await rpc(serviceB, 'reserve_ai_provider_usage', [users[1], 'openai','estimate_meal_text', 1], ['::uuid', '::text','::text', '::integer']));
      return { evidence: 'second connection blocked on budget row; over-limit rejected; released capacity reusable' };
    } finally { if (held) await serviceA.query('rollback'); }
  });

  await run('FINISH_VS_LEAVE', async () => {
    await rpc(partner, 'save_health_rules', [JSON.stringify({ ...rules(), confirmed: true, meal_template: templateMeals }), false, null],
      ['::jsonb', '::boolean', '::timestamptz']);
    const job = await rpc(partner, 'request_plan_generation', [date(5), 'rules'], ['::date', '::text']);
    const claim = await rpc(serviceA, 'claim_generation_job', [job.id], ['::uuid']);
    await serviceA.query('begin'); let held = true;
    try {
      const finished = await rpc(serviceA, 'finish_generation_job',
        [job.id, claim.claim_token, JSON.stringify(content), claim.input_version, 'rules', null],
        ['::uuid', '::uuid', '::jsonb', '::text', '::text', '::text']);
      assert.equal(finished.status, 'succeeded');
      const holderPid = await pid(serviceA), waiterPid = await pid(partner);
      const leaving = rpc(partner, 'leave_space').then(() => ({ ok: true }), error => ({ error }));
      await blockedBy(admin, waiterPid, holderPid);
      await serviceA.query('commit'); held = false;
      assert.equal((await leaving).ok, true);
      assert.equal((await admin.query('select count(*)::int as n from public.generation_jobs where id=$1', [job.id])).rows[0].n, 0);
    } finally { if (held) await serviceA.query('rollback'); }

    // Recreate only this synthetic fixture, then let leave commit while finish is waiting.
    await admin.query(await readFile(new URL('../supabase/admin/initialize-fixed-accounts.sql', import.meta.url), 'utf8'));
    await rpc(me, 'save_health_rules', [JSON.stringify({ ...rules(), confirmed: true, meal_template: templateMeals }), false, null],
      ['::jsonb', '::boolean', '::timestamptz']);
    const secondJob = await rpc(me, 'request_plan_generation', [date(6), 'rules'], ['::date', '::text']);
    const secondClaim = await rpc(serviceA, 'claim_generation_job', [secondJob.id], ['::uuid']);
    await me.query('begin'); held = true;
    try {
      await rpc(me, 'leave_space');
      const holderPid = await pid(me), waiterPid = await pid(serviceA);
      const finishing = rpc(serviceA, 'finish_generation_job',
        [secondJob.id, secondClaim.claim_token, JSON.stringify(content), secondClaim.input_version, 'rules', null],
        ['::uuid', '::uuid', '::jsonb', '::text', '::text', '::text']).then(value => ({ value }), error => ({ error }));
      await blockedBy(admin, waiterPid, holderPid);
      await me.query('commit'); held = false;
      assert.match((await finishing).error?.message ?? '', /Member unavailable|Job lease unavailable/);
      assert.equal((await admin.query('select count(*)::int as n from public.daily_plans where user_id=$1 and target_date=$2',
        [users[0], date(6)])).rows[0].n, 0);
    } finally { if (held) await me.query('rollback'); }
    return { evidence: 'both lock orders observed: finish then leave, leave then finish; no deadlock or post-leave plan' };
  });
} catch (error) {
  report.setup_error = { name: error.name, code: error.code ?? null,
    reason: String(error.message).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[synthetic-id]').slice(0, 240) };
  process.exitCode = 1;
} finally {
  await Promise.allSettled(clients.map(client => client.end()));
  if (server) await server.stop().catch(() => { report.teardown_error = true; process.exitCode = 1; });
  report.generated_at = new Date().toISOString();
  report.script_sha256 = createHash('sha256').update(await readFile(new URL('./verify-health-concurrency.mjs', import.meta.url))).digest('hex');
  await writeFile('test-results/integrity-health-concurrency-results.json', JSON.stringify(report, null, 2) + '\n');
  console.log(`health concurrency: ${report.passed} passed, ${report.failed} failed, ${report.not_run} not run`);
  if (report.failed || report.not_run || report.setup_error || report.teardown_error) process.exitCode = 1;
}

// embedded-postgres installs beforeExit hooks; preserve a failed gate after cleanup.
process.exit(process.exitCode || 0);

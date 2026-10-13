import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { report, blocked, runCase } from './test-helpers/report.mjs';
import { cloudSetup, client, ok, denied } from './test-helpers/cloud.mjs';

const automatic = [
  'HEALTH_SCHEMA', 'HEALTH_FIXED_SCOPE', 'HEALTH_RLS', 'HEALTH_MEAL_CREATE_PRIVATE',
  'HEALTH_MEAL_EDIT_CONFLICT', 'HEALTH_MEAL_PARTNER_DENIAL', 'HEALTH_MEAL_DELETE_READBACK',
  'HEALTH_TRAINING_CREATE_PRIVATE', 'HEALTH_TRAINING_EDIT_CONFLICT',
  'HEALTH_TRAINING_PARTNER_DENIAL', 'HEALTH_TRAINING_DELETE_READBACK',
  'HEALTH_RULES_READONLY', 'HEALTH_CLEANUP',
];
const dependencies = [
  'HEALTH_PLAN_NO_SAFE_JOB_DELETE',
  'HEALTH_SHARING_REQUIRES_SETTINGS_CHANGE', 'HEALTH_PHOTO_REQUIRES_STORAGE',
  'HEALTH_AI_REQUIRES_CONSENT_AND_BUDGET',
];
const ids = [...automatic, ...dependencies];
let setup;
try { setup = cloudSetup(); } catch { setup = { blocked: true, reason: 'Invalid cloud configuration' }; }
if (setup.blocked) {
  process.stderr.write(`健康云测未运行：${setup.reason}\n`);
  await report('cloud-health', 'two-fixed-accounts-safe-health-subset', blocked(ids));
} else {
  const api = [client(setup.url, setup.key), client(setup.url, setup.key)];
  const cases = [], details = [], users = [];
  const marker = `SYNTHETIC-HEALTH-${randomUUID()}`;
  const recordedAt = '2020-01-01T12:00:00+08:00';
  // Plans stop at 2100, so this synthetic session cannot mark a real plan stale.
  const trainingRecordedAt = '2101-01-01T12:00:00+08:00';
  const mealData = () => ({ recorded_at: recordedAt, kind: 'dinner',
    items: [{ name: marker, portion: '1', unit: '份' }], eaten_fraction: 1,
    shared_meal_id: null, photo_ids: [], cooking: null, oil: null, leftover: null, estimate: null });
  const payload = (stamp = null) => ({ data: mealData(), status: 'draft', is_shared: false,
    ...(stamp ? { expected_updated_at: stamp } : {}) });
  const trainingData = (seconds = 0) => ({ plan_id: null, status: 'stopped', started_at: trainingRecordedAt,
    active_since: null, rest_until: null, rest_remaining_seconds: 0, ended_at: trainingRecordedAt,
    elapsed_seconds: seconds, stop_reason: marker, sets: [] });
  const trainingPayload = (stamp = null, seconds = 0) => ({ data: trainingData(seconds), status: 'stopped', is_shared: false,
    ...(stamp ? { expected_updated_at: stamp } : {}) });
  const check = (id, fn) => runCase(cases, details, id, fn);
  const rpc = (i, name, args = {}) => ok(api[i].rpc(name, args));
  const byId = (i, id) => ok(api[i].from('meals').select('id,user_id,data,updated_at').eq('id', id));
  const trainingById = (i, id) => ok(api[i].from('training_sessions').select('id,user_id,data,updated_at').eq('id', id));
  let createdId = null, createdStamp = null, trainingId = null, trainingStamp = null, safeAccount = false;
  try {
    await check('HEALTH_SCHEMA', async () => {
      for (let i = 0; i < 2; i++) {
        const signed = await ok(api[i].auth.signInWithPassword({ email: setup.emails[i], password: setup.passwords[i] }));
        assert.ok(signed.user?.id);
        users.push(signed.user.id);
      }
      assert.notEqual(users[0], users[1]);
      assert.equal(await rpc(0, 'health_schema_version'), 4);
    });
    await check('HEALTH_FIXED_SCOPE', async () => {
      assert.equal(await rpc(0, 'current_account'), 'me');
      assert.equal(await rpc(1, 'current_account'), 'w');
      const spaces = await Promise.all([rpc(0, 'current_space_id'), rpc(1, 'current_space_id')]);
      assert.ok(spaces[0]); assert.equal(spaces[0], spaces[1]);
      safeAccount = true;
    });
    await check('HEALTH_RLS', async () => {
      const anon = client(setup.url, setup.key);
      for (const table of ['health_rules', 'generation_jobs', 'training_sessions', 'meals', 'photo_assets']) {
        await denied(anon.from(table).select('id'), ['42501']);
      }
      await denied(api[0].from('meals').insert({ user_id: users[0], data: mealData() }), ['42501']);
      await denied(api[0].rpc('claim_generation_job'), ['42501']);
    });
    await check('HEALTH_MEAL_CREATE_PRIVATE', async () => {
      const row = await ok(api[0].rpc('save_meal', { p_payload: payload(), p_id: null }).single());
      createdId = row.id; createdStamp = row.updated_at;
      assert.equal(row.user_id, users[0]);
      assert.equal(row.data.items[0].name, marker);
      assert.equal((await byId(1, createdId)).length, 0);
    });
    await check('HEALTH_MEAL_EDIT_CONFLICT', async () => {
      const oldStamp = createdStamp;
      const row = await ok(api[0].rpc('save_meal', { p_payload: payload(createdStamp), p_id: createdId }).single());
      createdStamp = row.updated_at;
      assert.equal(row.id, createdId);
      await denied(api[0].rpc('save_meal', { p_payload: payload(oldStamp), p_id: createdId }).single(), ['P0001']);
      assert.equal((await byId(0, createdId))[0].data.items[0].name, marker);
    });
    await check('HEALTH_MEAL_PARTNER_DENIAL', async () => {
      assert.equal((await byId(1, createdId)).length, 0);
      await denied(api[1].rpc('save_meal', { p_payload: payload(createdStamp), p_id: createdId }).single(), ['P0001']);
      await denied(api[1].rpc('delete_meal', { p_id: createdId }), ['P0001']);
    });
    await check('HEALTH_MEAL_DELETE_READBACK', async () => {
      await rpc(0, 'delete_meal', { p_id: createdId });
      assert.equal((await byId(0, createdId)).length, 0);
    });
    await check('HEALTH_TRAINING_CREATE_PRIVATE', async () => {
      const row = await ok(api[0].rpc('save_training_session',
        { p_payload: trainingPayload(), p_id: null }).single());
      trainingId = row.id; trainingStamp = row.updated_at;
      assert.equal(row.user_id, users[0]);
      assert.equal(row.data.stop_reason, marker);
      assert.equal((await trainingById(1, trainingId)).length, 0);
    });
    await check('HEALTH_TRAINING_EDIT_CONFLICT', async () => {
      const oldStamp = trainingStamp;
      const row = await ok(api[0].rpc('save_training_session',
        { p_payload: trainingPayload(trainingStamp, 1), p_id: trainingId }).single());
      trainingStamp = row.updated_at;
      assert.equal(row.id, trainingId);
      await denied(api[0].rpc('save_training_session',
        { p_payload: trainingPayload(oldStamp, 2), p_id: trainingId }).single(), ['P0001']);
      assert.equal((await trainingById(0, trainingId))[0].data.elapsed_seconds, 1);
    });
    await check('HEALTH_TRAINING_PARTNER_DENIAL', async () => {
      assert.equal((await trainingById(1, trainingId)).length, 0);
      await denied(api[1].rpc('save_training_session',
        { p_payload: trainingPayload(trainingStamp, 2), p_id: trainingId }).single(), ['P0001']);
      await denied(api[1].rpc('delete_training_session', { p_id: trainingId }), ['P0001']);
    });
    await check('HEALTH_TRAINING_DELETE_READBACK', async () => {
      await rpc(0, 'delete_training_session', { p_id: trainingId });
      assert.equal((await trainingById(0, trainingId)).length, 0);
    });
    await check('HEALTH_RULES_READONLY', async () => {
      for (let i = 0; i < 2; i++) {
        const rows = await ok(api[i].from('health_rules').select('user_id').eq('user_id', users[i]));
        assert.ok(rows.every(row => row.user_id === users[i]));
      }
    });
  } catch {
    // runCase retains the safe case ID and redacted error kind/code.
  } finally {
    if (safeAccount) {
      try {
        const matches = await ok(api[0].from('meals').select('id,user_id,data').contains('data',
          { items: [{ name: marker }] }));
        for (const row of matches) {
          assert.equal(row.user_id, users[0]);
          assert.equal(row.data.items[0].name, marker);
          assert.ok(!createdId || row.id === createdId, 'Unexpected synthetic marker collision');
          await rpc(0, 'delete_meal', { p_id: row.id });
          assert.equal((await byId(0, row.id)).length, 0);
        }
        const sessions = await ok(api[0].from('training_sessions').select('id,user_id,data')
          .contains('data', { stop_reason: marker }));
        for (const row of sessions) {
          assert.equal(row.user_id, users[0]);
          assert.equal(row.data.stop_reason, marker);
          assert.ok(!trainingId || row.id === trainingId, 'Unexpected synthetic marker collision');
          await rpc(0, 'delete_training_session', { p_id: row.id });
          assert.equal((await trainingById(0, row.id)).length, 0);
        }
        cases.push({ id: 'HEALTH_CLEANUP', status: 'passed' });
      } catch (error) {
        cases.push({ id: 'HEALTH_CLEANUP', status: 'failed' }); details.push({ id: 'HEALTH_CLEANUP', error });
      }
    }
    for (const id of automatic) if (!cases.some(item => item.id === id)) cases.push({ id, status: 'notrun' });
    for (const id of dependencies) cases.push({ id, status: 'blocked' });
    for (const c of api) try { await c.auth.signOut({ scope: 'local' }); } catch {}
    await report('cloud-health', 'two-fixed-accounts-safe-health-subset', cases, details);
  }
}

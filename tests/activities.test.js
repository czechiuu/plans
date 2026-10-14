import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const users = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
const activity = () => ({ record_date: '2001-01-02', plan_id: null, status: 'completed', started_at: '2001-01-02T10:00:00+08:00',
  active_since: null, rest_until: null, rest_remaining_seconds: 0, ended_at: '2001-01-02T11:00:00+08:00',
  elapsed_seconds: 3600, stop_reason: null, sets: [], activity_type: 'badminton', duration_seconds: 3600,
  intensity: 'moderate', pain: 'none', notes: 'SYNTHETIC actual badminton' })
const meal = () => ({ recorded_at: '2001-01-02T12:00:00+08:00', kind: 'lunch',
  items: [{ name: 'SYNTHETIC', portion: '1', unit: '份' }], eaten_fraction: 1, shared_meal_id: null,
  photo_ids: [], cooking: null, oil: null, leftover: null, estimate: null })

test('008 external activity validation, ownership, edit conflicts and durable create replay', async () => {
  const db = new PGlite()
  const as = async (owner, query, values = []) => {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner === null ? '' : users[owner]])
    if (owner !== null) await db.exec('set role authenticated')
    return db.query(query, values)
  }
  const save = async (owner, kind, payload, id = null) => (await as(owner,
    `select to_jsonb(public.${kind === 'meal' ? 'save_meal' : 'save_training_session'}($1::jsonb,$2::uuid)) v`, [JSON.stringify(payload), id])).rows[0].v
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      alter default privileges grant execute on functions to anon,authenticated;
      create schema auth;create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,encrypted_password text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;`)
    for (let i = 0; i < users.length; i++) await db.query('insert into auth.users values($1,$2,now(),$3)', [users[i], ['me@plans.invalid', 'w@plans.invalid'][i], 'SYNTHETIC'])
    const dir = new URL('../supabase/migrations/', import.meta.url)
    for (const file of (await readdir(dir)).filter(x => x.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(file, dir), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/admin/initialize-fixed-accounts.sql', import.meta.url), 'utf8'))
    assert.equal((await as(0, 'select public.health_activity_schema_version() v')).rows[0].v, 8)
    await assert.rejects(as(0, 'select * from public.record_create_requests'), /permission denied/)
    await assert.rejects(as(0, 'select public.save_training_session_007(null,null)'), /permission denied/)

    const payload = { data: activity(), status: 'completed', is_shared: false, client_request_id: randomUUID() }
    const first = await save(0, 'training', payload)
    assert.equal(first.record_date, '2001-01-02')
    assert.equal(first.data.plan_id, null)
    assert.equal(first.data.activity_type, 'badminton')
    const dateOnly = { ...activity(), started_at: null, ended_at: null }
    const dateOnlyRow = await save(0, 'training', { data: dateOnly, status: 'completed', is_shared: false })
    assert.equal(dateOnlyRow.record_date, '2001-01-02')
    assert.equal(dateOnlyRow.data.started_at, null)
    assert.equal(dateOnlyRow.data.ended_at, null)
    await as(0, 'select public.delete_training_session($1)', [dateOnlyRow.id])
    assert.equal((await as(1, 'select id from training_sessions where id=$1', [first.id])).rows.length, 0)
    assert.equal((await save(0, 'training', payload)).id, first.id)
    await assert.rejects(save(0, 'training', { ...payload, data: { ...payload.data, notes: 'changed' } }), /payload conflict/)
    assert.notEqual((await save(1, 'training', payload)).id, first.id)
    await assert.rejects(save(1, 'training', { ...payload, expected_updated_at: first.updated_at }, first.id), /access denied/)
    const edited = await save(0, 'training', { data: { ...payload.data, notes: 'owner correction' }, status: 'completed', is_shared: false, expected_updated_at: first.updated_at }, first.id)
    await assert.rejects(save(0, 'training', { data: payload.data, status: 'completed', is_shared: false, expected_updated_at: first.updated_at }, first.id), /Edit conflict/)
    assert.equal((await save(0, 'training', payload)).data.notes, edited.data.notes)
    assert.equal((await as(0, 'select count(*)::int n from training_sessions')).rows[0].n, 1)

    for (const changes of [
      { activity_type: null }, { activity_type: 'invented' }, { intensity: null }, { pain: 'invented' },
      { status: 'active', active_since: payload.data.started_at }, { duration_seconds: 0 }, { duration_seconds: 3601 },
      { elapsed_seconds: 60 }, { notes: 'x'.repeat(1001) }, { rest_remaining_seconds: null },
      { started_at: '2001-02-30T10:00:00+08:00' }, { started_at: '2001-01-02T10:00:00' },
      { record_date: '2001-02-30' }, { record_date: '2001-01-03' }, { started_at: null },
      { started_at: null, ended_at: null, record_date: '2099-01-02' },
      { ended_at: '2001-01-02T09:00:00+08:00' }, { extra: true },
      { started_at: '2099-01-02T10:00:00+08:00', ended_at: '2099-01-02T11:00:00+08:00' },
    ]) {
      const data = { ...activity(), ...changes }
      await assert.rejects(save(0, 'training', { data, status: data.status, is_shared: false }), /Invalid/)
    }
    const stopped = { ...activity(), activity_type: 'other', status: 'stopped', stop_reason: 'SYNTHETIC pain', pain: 'mild' }
    assert.equal((await save(0, 'training', { data: stopped, status: stopped.status, is_shared: false })).status, 'stopped')

    const legacy = activity()
    for (const key of ['record_date', 'activity_type', 'duration_seconds', 'intensity', 'pain', 'notes']) delete legacy[key]
    assert.deepEqual((await save(0, 'training', { data: legacy, status: legacy.status, is_shared: false })).data, legacy)
    const mealPayload = { data: meal(), status: 'confirmed', is_shared: false, client_request_id: randomUUID() }
    const savedMeal = await save(0, 'meal', mealPayload)
    assert.equal((await save(0, 'meal', mealPayload)).id, savedMeal.id)
    await assert.rejects(save(0, 'meal', { ...mealPayload, data: { ...mealPayload.data, eaten_fraction: 0.5 } }), /payload conflict/)
    await assert.rejects(save(0, 'training', { ...payload, client_request_id: mealPayload.client_request_id }), /payload conflict/)
    await assert.rejects(save(0, 'meal', { ...mealPayload, client_request_id: null }), /Invalid client request/)
    await as(0, 'select public.delete_meal($1)', [savedMeal.id])
    await assert.rejects(save(0, 'meal', mealPayload), /record was deleted/)
    await as(0, 'select public.delete_training_session($1)', [first.id])
    await assert.rejects(save(0, 'training', payload), /record was deleted/)
    await as(0, 'select public.erase_own_health_data()')
    assert.equal((await as(null, 'select count(*)::int n from record_create_requests where user_id=$1', [users[0]])).rows[0].n, 0)
    assert.equal((await as(null, 'select count(*)::int n from record_create_requests where user_id=$1', [users[1]])).rows[0].n, 1)
  } finally { await db.close() }
})

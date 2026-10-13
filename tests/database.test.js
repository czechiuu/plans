import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444'
]
const date = '2026-10-13'

test('local PostgreSQL access and sharing contract', async t => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated; create role anon;
      alter default privileges grant execute on functions to anon,authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;
    `)
    for (const id of ids) await db.query('insert into auth.users(id) values($1)', [id])
    const migrations = new URL('../supabase/migrations/', import.meta.url)
    // Historical invitation-mode contract: 003 replaces this access model.
    for (const file of (await readdir(migrations)).filter(name => /^20261013000[12]_.*\.sql$/.test(name)).sort()) {
      await db.exec(await readFile(new URL(file, migrations), 'utf8'))
    }

    async function actor(index, sql, params = []) {
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [index === null ? '' : ids[index]])
      await db.exec(`set role ${index === null ? 'anon' : 'authenticated'}`)
      return db.query(sql, params)
    }
    async function denied(index, sql, params = [], message = /./) {
      await assert.rejects(actor(index, sql, params), message)
    }
    const rpc = (index, fn, params = []) => actor(index, `select to_jsonb(public.${fn}(${params.map((_, i) => `$${i + 1}`).join(',')})) as value`, params)
    const json = value => JSON.stringify(value)

    await t.test('anonymous has no health access or RPC', async () => {
      await denied(null, 'select * from public.members', [], /permission denied/)
      await denied(null, "select public.create_space('bad','bad')", [], /permission denied/)
    })

    const space = (await rpc(0, 'create_space', ['A', '甲'])).rows[0].value
    const other = (await rpc(2, 'create_space', ['B', '丙'])).rows[0].value
    await t.test('third account cannot read or mutate another space', async () => {
      assert.equal((await actor(2, 'select * from public.spaces where id=$1', [space])).rows.length, 0)
      assert.equal((await actor(2, 'select * from public.members where space_id=$1', [space])).rows.length, 0)
      await denied(2, 'update public.members set space_id=$1 where user_id=$2', [space, ids[2]], /permission denied/)
      await denied(2, 'select public.save_schedule($1::jsonb)', [json({ user_id: ids[0], record_date: date })], /Only owner/)
      assert.notEqual(other, space)
    })

    const invite = (await actor(0, 'select * from public.create_invite()')).rows[0].token
    const spareInvite = (await actor(0, 'select * from public.create_invite()')).rows[0].token
    assert.equal(invite.length, 72)
    await rpc(1, 'join_space', [invite, '乙', json({})])
    await t.test('invitation is single use and space holds at most two', async () => {
      await denied(3, 'select public.join_space($1,$2,$3::jsonb)', [invite, '丁', '{}'], /Invalid or expired/)
      await denied(3, 'select public.join_space($1,$2,$3::jsonb)', [spareInvite, '丁', json({ share_profile: 'yes' })], /Invalid sharing settings/)
      await denied(0, 'select public.create_invite()', [], /Space is full/)
      await denied(3, 'select public.join_space($1,$2,$3::jsonb)', ['x'.repeat(72), '丁', '{}'], /Invalid or expired/)
    })

    const baseSchedule = { user_id: ids[0], record_date: date, raw_text: 'private synthetic', exercise_intent: 'unknown', is_shared: false }
    const schedule = (await rpc(0, 'save_schedule', [json(baseSchedule)])).rows[0].value
    const scheduleRow = (await actor(0, 'select * from public.schedules where id=$1', [schedule.id])).rows[0]
    const baseWeight = { user_id: ids[0], record_date: date, weight_kg: 70.125, is_shared: false }
    const weight = (await rpc(0, 'save_weight', [json(baseWeight)])).rows[0].value
    assert.equal(Number(weight.weight_kg), 70.125)
    const profile = (await rpc(0, 'save_profile', [json({ age: 30, health_notes: 'private synthetic', is_shared: false })])).rows[0].value

    await t.test('private rows stay private and direct writes are denied', async () => {
      for (const table of ['schedules', 'weights', 'health_profiles']) {
        assert.equal((await actor(1, `select * from public.${table}`)).rows.length, 0)
        assert.equal((await actor(2, `select * from public.${table}`)).rows.length, 0)
        await denied(1, `update public.${table} set user_id=$1`, [ids[1]], /permission denied/)
      }
      await denied(1, 'select public.save_schedule($1::jsonb,$2::uuid)', [json({ ...baseSchedule, expected_updated_at: scheduleRow.updated_at }), schedule.id], /not found or access denied/)
      await denied(1, 'select public.save_schedule($1::jsonb,$2::uuid)', [json({ ...baseSchedule, expected_updated_at: '2000-01-01T00:00:00Z' }), schedule.id], /not found or access denied/)
      await denied(0, 'select public.save_schedule($1::jsonb)', [json(baseSchedule)], /duplicate key/)
      await denied(0, 'select public.save_weight($1::jsonb)', [json(baseWeight)], /duplicate key/)
    })

    await t.test('sharing needs category and row consent, partner edit needs separate consent', async () => {
      await rpc(0, 'save_settings', [json({ share_profile: true, share_schedule: true, share_weight: true, allow_partner_edit: false })])
      assert.equal((await actor(1, 'select * from public.schedules')).rows.length, 0)
      await denied(0, 'select public.save_profile($1::jsonb)', [json({ age: 30, is_shared: true })], /Update conflict/)
      await rpc(0, 'save_profile', [json({ age: 30, health_notes: 'shared synthetic', is_shared: true, expected_updated_at: profile.updated_at })])
      const sharedSchedule = (await rpc(0, 'save_schedule', [json({ ...baseSchedule, raw_text: 'shared synthetic', is_shared: true, expected_updated_at: scheduleRow.updated_at }), schedule.id])).rows[0].value
      await rpc(0, 'save_weight', [json({ ...baseWeight, is_shared: true, expected_updated_at: weight.updated_at }), weight.id])
      assert.equal((await actor(1, 'select * from public.health_profiles')).rows.length, 1)
      assert.equal((await actor(1, 'select * from public.schedules')).rows.length, 1)
      assert.equal((await actor(1, 'select * from public.weights')).rows.length, 1)
      await denied(1, 'select public.save_schedule($1::jsonb,$2::uuid)', [json({ ...baseSchedule, is_shared: true, expected_updated_at: sharedSchedule.updated_at }), schedule.id], /not found or access denied/)
      await rpc(0, 'save_settings', [json({ share_profile: true, share_schedule: true, share_weight: true, allow_partner_edit: true })])
      await denied(1, 'select public.save_schedule($1::jsonb,$2::uuid)', [json({ ...baseSchedule, is_shared: false, expected_updated_at: sharedSchedule.updated_at }), schedule.id], /Only owner controls sharing/)
      const changed = (await rpc(1, 'save_schedule', [json({ ...baseSchedule, raw_text: 'partner synthetic edit', is_shared: true, expected_updated_at: sharedSchedule.updated_at }), schedule.id])).rows[0].value
      assert.equal(changed.updated_by, ids[1])
      assert.equal(changed.version, 3)
      await denied(0, 'select public.save_schedule($1::jsonb,$2::uuid)', [json({ ...baseSchedule, is_shared: true, expected_updated_at: sharedSchedule.updated_at }), schedule.id], /Update conflict/)
      const audit = (await actor(0, "select actor_id from public.audit_events where entity='schedule' and action='update' order by created_at desc limit 1")).rows[0]
      assert.equal(audit.actor_id, ids[1])
    })

    await t.test('invalid ranges and identity transfer fail; leaving revokes prior consent and invites', async () => {
      await denied(0, 'select public.save_weight($1::jsonb)', [json({ user_id: ids[0], record_date: '2026-10-14', weight_kg: 10 })], /check constraint/)
      await denied(0, 'select public.save_weight($1::jsonb)', [json({ user_id: ids[0], record_date: '2026-10-14', weight_kg: '70' })], /Invalid weight fields/)
      await denied(0, 'select public.save_schedule($1::jsonb)', [json({ user_id: ids[0], record_date: 'tomorrow', is_shared: 'true' })], /Invalid schedule fields/)
      await denied(0, 'select public.save_weight($1::jsonb)', [json({ user_id: ids[0], record_date: '2026-10-14', measured_at: '2026-10-13T00:00:00Z', weight_kg: 70 })], /check constraint/)
      await denied(0, 'select public.save_schedule($1::jsonb,$2::uuid)', [json({ ...baseSchedule, user_id: ids[1], is_shared: true, expected_updated_at: (await actor(0, 'select updated_at from public.schedules where id=$1', [schedule.id])).rows[0].updated_at }), schedule.id], /identity cannot change/)
      const current = (await actor(0, 'select updated_at from public.schedules where id=$1', [schedule.id])).rows[0]
      const corrected = (await rpc(0, 'save_schedule', [json({ ...baseSchedule, record_date: '2026-10-14', is_shared: true, expected_updated_at: current.updated_at }), schedule.id])).rows[0].value
      assert.equal(corrected.record_date, '2026-10-14')
      await rpc(1, 'leave_space')
      assert.equal((await actor(1, 'select * from public.members')).rows.length, 0)
      const remaining = (await actor(0, 'select * from public.members where user_id=$1', [ids[0]])).rows[0]
      assert.equal(remaining.share_profile, false)
      assert.equal(remaining.share_schedule, false)
      assert.equal(remaining.share_weight, false)
      assert.equal(remaining.allow_partner_edit, false)
      await denied(3, 'select public.join_space($1,$2,$3::jsonb)', [spareInvite, '丁', '{}'], /Invalid or expired/)
      const fresh = (await actor(0, 'select * from public.create_invite()')).rows[0].token
      await rpc(3, 'join_space', [fresh, '丁', '{}'])
      assert.equal((await actor(3, 'select * from public.schedules')).rows.length, 0)
      assert.equal((await actor(3, 'select * from public.health_profiles')).rows.length, 0)
      await rpc(0, 'erase_own_health_data')
      assert.equal((await actor(0, 'select * from public.schedules')).rows.length, 0)
      await denied(1, 'select public.save_profile($1::jsonb)', [json({ age: 30 })], /Space membership required/)
    })
  } finally {
    await db.close()
  }
})

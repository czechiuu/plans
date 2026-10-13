import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
]
const emails = ['me@plans.invalid', 'w@plans.invalid', 'third@plans.invalid']
const date = '2026-10-13'
const json = JSON.stringify

async function fixture(count = 2, through = 3) {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    alter default privileges grant execute on functions to anon,authenticated;
    create schema auth;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
  `)
  for (let i = 0; i < count; i++) {
    await db.query('insert into auth.users(id,email,email_confirmed_at,encrypted_password) values($1,$2,now(),$3)', [ids[i], emails[i], 'SYNTHETIC-NONLOGIN-HASH'])
  }
  const migrations = new URL('../supabase/migrations/', import.meta.url)
  const files = (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort().slice(0, through)
  for (const file of files) await db.exec(await readFile(new URL(file, migrations), 'utf8'))

  async function admin(sql, params = []) {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub','',false)")
    return db.query(sql, params)
  }
  async function actor(index, sql, params = []) {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [index === null ? '' : ids[index]])
    await db.exec(`set role ${index === null ? 'anon' : 'authenticated'}`)
    return db.query(sql, params)
  }
  async function initialize() {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub','',false)")
    try {
      await db.exec(await readFile(new URL('../supabase/admin/initialize-fixed-accounts.sql', import.meta.url), 'utf8'))
    } catch (error) {
      await db.exec('rollback')
      throw error
    }
  }
  async function rpc(index, name, args = [], casts = []) {
    const placeholders = args.map((_, i) => `$${i + 1}${casts[i] ?? ''}`).join(',')
    const result = await actor(index, `select to_jsonb(public.${name}(${placeholders})) as value`, args)
    return result.rows[0].value
  }
  return { db, admin, actor, initialize, rpc }
}

test('fixed accounts initialize once, preserve records, and retain owner-controlled sharing', async t => {
  const { db, admin, actor, initialize, rpc } = await fixture()
  const denied = (index, sql, params, pattern) => assert.rejects(actor(index, sql, params), pattern)
  try {
    await initialize()
    await initialize()
    const members = (await admin('select slot,user_id,space_id from public.fixed_accounts order by slot')).rows
    assert.deepEqual(members.map(row => row.slot), ['me', 'w'])
    assert.equal(members[0].space_id, members[1].space_id)
    assert.deepEqual(members.map(row => row.user_id), [ids[0], ids[1]])
    assert.equal((await admin('select count(*)::int as n from public.spaces')).rows[0].n, 1)

    await t.test('new members are private and registry is administrator-only', async () => {
      const flags = (await actor(0, 'select share_profile,share_schedule,share_weight,allow_partner_edit from public.members')).rows
      assert.equal(flags.length, 2)
      assert.ok(flags.every(row => Object.values(row).every(value => value === false)))
      assert.equal(await rpc(0, 'current_account'), 'me')
      assert.equal(await rpc(1, 'current_account'), 'w')
      await denied(null, 'select public.current_account()', [], /permission denied/)
      await denied(0, 'select * from public.fixed_accounts', [], /permission denied/)
      await denied(0, 'update public.fixed_accounts set slot=$1', ['w'], /permission denied/)
      await denied(1, 'insert into public.fixed_accounts(slot,user_id,space_id) values($1,$2,$3)', ['w', ids[2], members[0].space_id], /permission denied/)
    })

    await t.test('old creation and invitation RPCs are closed to every client', async () => {
      for (const index of [null, 0, 1]) {
        await denied(index, "select public.create_space('x','x')", [], /permission denied/)
        await denied(index, 'select * from public.create_invite()', [], /permission denied/)
        await denied(index, 'select public.join_space($1,$2,$3::jsonb)', ['x'.repeat(72), 'x', '{}'], /permission denied/)
      }
    })

    const scheduleBase = { user_id: ids[0], record_date: date, raw_text: 'SYNTHETIC', is_shared: false }
    const weightBase = { user_id: ids[0], record_date: date, weight_kg: 70.2, is_shared: false }
    let schedule = await rpc(0, 'save_schedule', [json(scheduleBase)], ['::jsonb'])
    let weight = await rpc(0, 'save_weight', [json(weightBase)], ['::jsonb'])
    let profile = await rpc(0, 'save_profile', [json({ age: 30, is_shared: false })], ['::jsonb'])
    for (const table of ['schedules', 'weights', 'health_profiles']) {
      assert.equal((await actor(1, `select * from public.${table}`)).rows.length, 0)
    }

    const settings = (share, edit) => json({ share_profile: share, share_schedule: share, share_weight: share, allow_partner_edit: edit })
    await rpc(0, 'save_settings', [settings(true, false)], ['::jsonb'])
    assert.equal((await actor(1, 'select * from public.schedules')).rows.length, 0)
    schedule = await rpc(0, 'save_schedule', [json({ ...scheduleBase, is_shared: true, expected_updated_at: schedule.updated_at }), schedule.id], ['::jsonb', '::uuid'])
    weight = await rpc(0, 'save_weight', [json({ ...weightBase, is_shared: true, expected_updated_at: weight.updated_at }), weight.id], ['::jsonb', '::uuid'])
    profile = await rpc(0, 'save_profile', [json({ age: 30, is_shared: true, expected_updated_at: profile.updated_at })], ['::jsonb'])

    await t.test('category, row, and partner-edit revocations keep their old behavior', async () => {
      for (const table of ['schedules', 'weights', 'health_profiles']) {
        assert.equal((await actor(1, `select * from public.${table}`)).rows.length, 1)
      }
      await denied(1, 'select public.save_schedule($1::jsonb,$2::uuid)', [json({ ...scheduleBase, is_shared: true, expected_updated_at: schedule.updated_at }), schedule.id], /not found or access denied/)
      await rpc(0, 'save_settings', [settings(false, false)], ['::jsonb'])
      for (const table of ['schedules', 'weights', 'health_profiles']) {
        assert.equal((await actor(1, `select * from public.${table}`)).rows.length, 0)
      }
      await rpc(0, 'save_settings', [settings(true, true)], ['::jsonb'])
      const edited = await rpc(1, 'save_schedule', [json({ ...scheduleBase, raw_text: 'SYNTHETIC PARTNER EDIT', is_shared: true, expected_updated_at: schedule.updated_at }), schedule.id], ['::jsonb', '::uuid'])
      assert.equal(edited.updated_by, ids[1])
      assert.equal((await actor(0, "select actor_id from public.audit_events where entity='schedule' and action='update' order by created_at desc limit 1")).rows[0].actor_id, ids[1])
      await rpc(0, 'save_settings', [settings(true, false)], ['::jsonb'])
      await denied(1, 'select public.save_schedule($1::jsonb,$2::uuid)', [json({ ...scheduleBase, is_shared: true, expected_updated_at: edited.updated_at }), schedule.id], /not found or access denied/)
    })

    await t.test('administrator rerun preserves all health rows and existing settings', async () => {
      const before = (await admin('select share_profile,share_schedule,share_weight,allow_partner_edit from public.members where user_id=$1', [ids[0]])).rows[0]
      const totals = (await admin('select (select count(*) from public.schedules)::int as schedules,(select count(*) from public.weights)::int as weights,(select count(*) from public.health_profiles)::int as profiles')).rows[0]
      await initialize()
      assert.deepEqual((await admin('select share_profile,share_schedule,share_weight,allow_partner_edit from public.members where user_id=$1', [ids[0]])).rows[0], before)
      assert.deepEqual((await admin('select (select count(*) from public.schedules)::int as schedules,(select count(*) from public.weights)::int as weights,(select count(*) from public.health_profiles)::int as profiles')).rows[0], totals)
      assert.deepEqual(totals, { schedules: 1, weights: 1, profiles: 1 })
    })

    await t.test('leaving removes business access but keeps slot for administrator relink', async () => {
      await rpc(1, 'leave_space')
      assert.equal(await rpc(1, 'current_account'), 'w')
      assert.equal(await rpc(1, 'current_space_id'), null)
      assert.equal((await actor(1, 'select * from public.members')).rows.length, 0)
      await denied(1, 'select public.save_profile($1::jsonb)', [json({ age: 35 })], /Space membership required/)
      const remaining = (await actor(0, 'select share_profile,share_schedule,share_weight,allow_partner_edit from public.members')).rows[0]
      assert.ok(Object.values(remaining).every(value => value === false))
      await initialize()
      assert.equal(await rpc(1, 'current_space_id'), members[0].space_id)
      const relinked = (await actor(1, 'select share_profile,share_schedule,share_weight,allow_partner_edit from public.members where user_id=$1', [ids[1]])).rows[0]
      assert.ok(Object.values(relinked).every(value => value === false))
      assert.equal((await actor(1, 'select * from public.schedules')).rows.length, 0)
    })
  } finally { await db.close() }
})

test('legacy third member stays outside fixed-account RLS and RPC', async () => {
  const { db, admin, actor, rpc } = await fixture(3, 2)
  try {
    const space = await rpc(0, 'create_space', ['SYNTHETIC', 'Me'])
    await admin('insert into public.members(space_id,user_id,display_name) values($1,$2,$3),($1,$4,$5)', [space, ids[1], 'W', ids[2], 'Legacy'])
    await db.exec(await readFile(new URL('../supabase/migrations/202610130003_fixed_accounts.sql', import.meta.url), 'utf8'))
    assert.equal(await rpc(0, 'current_space_id'), null)
    assert.equal((await actor(0, 'select * from public.members')).rows.length, 0)
    await admin("insert into public.fixed_accounts(slot,user_id,space_id) values('me',$1,$3),('w',$2,$3)", [ids[0], ids[1], space])
    assert.equal(await rpc(2, 'current_account'), null)
    assert.equal(await rpc(2, 'current_space_id'), null)
    assert.equal((await actor(2, 'select * from public.members')).rows.length, 0)
    assert.equal((await actor(2, 'select * from public.spaces')).rows.length, 0)
    await rpc(0, 'save_settings', [json({ share_profile: false, share_schedule: true, share_weight: false, allow_partner_edit: true })], ['::jsonb'])
    await rpc(0, 'save_schedule', [json({ user_id: ids[0], record_date: date, raw_text: 'SYNTHETIC SHARE', is_shared: true })], ['::jsonb'])
    assert.equal((await actor(2, 'select * from public.schedules')).rows.length, 0)
    await assert.rejects(actor(2, 'select public.save_profile($1::jsonb)', [json({ age: 33 })]), /Space membership required/)
    await assert.rejects(actor(2, 'select public.leave_space()'), /Space membership required/)
    await assert.rejects(actor(2, 'select * from public.fixed_accounts'), /permission denied/)
    await assert.rejects(actor(2, 'select public.create_invite()'), /permission denied/)
    await assert.rejects(actor(2, "select public.create_space('x','x')"), /permission denied/)
    await assert.rejects(actor(2, 'select public.join_space($1,$2,$3::jsonb)', ['x'.repeat(72), 'x', '{}']), /permission denied/)
    const wrongSpace = (await admin("insert into public.spaces(name) values('WRONG') returning id")).rows[0].id
    await admin("update public.fixed_accounts set space_id=$1 where slot='w'", [wrongSpace])
    assert.equal(await rpc(0, 'current_space_id'), null)
    assert.equal(await rpc(1, 'current_space_id'), null)
    await admin("update public.fixed_accounts set space_id=$1 where slot='w'", [space])
    await admin("delete from public.fixed_accounts where slot='w'")
    assert.equal(await rpc(0, 'current_space_id'), null)
  } finally { await db.close() }
})

test('administrator initialization rejects unconfirmed, extra, or conflicting accounts without writing', async () => {
  const { db, admin, initialize } = await fixture()
  try {
    await admin('update auth.users set email_confirmed_at=null where id=$1', [ids[1]])
    await assert.rejects(initialize(), /confirmed emails and passwords/)
    assert.equal((await admin('select count(*)::int as n from public.spaces')).rows[0].n, 0)
    await admin('update auth.users set email_confirmed_at=now() where id=$1', [ids[1]])
    await admin('update auth.users set encrypted_password=null where id=$1', [ids[1]])
    await assert.rejects(initialize(), /confirmed emails and passwords/)
    await admin('update auth.users set encrypted_password=$1 where id=$2', ['SYNTHETIC-NONLOGIN-HASH', ids[1]])
    await admin('insert into auth.users(id,email,email_confirmed_at,encrypted_password) values($1,$2,now(),$3)', [ids[2], emails[2], 'SYNTHETIC-NONLOGIN-HASH'])
    const outsiderSpace = (await admin("insert into public.spaces(name) values('OUTSIDER') returning id")).rows[0].id
    await admin('insert into public.members(space_id,user_id,display_name) values($1,$2,$3)', [outsiderSpace, ids[2], 'Third'])
    await assert.rejects(initialize(), /Other space members/)
    await admin('delete from public.members where user_id=$1', [ids[2]])
    await assert.rejects(initialize(), /Only the two designated Auth users/)
    await admin('delete from auth.users where id=$1', [ids[2]])
    await admin('delete from public.spaces where id=$1', [outsiderSpace])
    const a = (await admin("insert into public.spaces(name) values('A') returning id")).rows[0].id
    const b = (await admin("insert into public.spaces(name) values('B') returning id")).rows[0].id
    await admin('insert into public.members(space_id,user_id,display_name) values($1,$2,$3),($4,$5,$6)', [a, ids[0], 'Me', b, ids[1], 'W'])
    await assert.rejects(initialize(), /different spaces/)
    assert.equal((await admin('select count(*)::int as n from public.fixed_accounts')).rows[0].n, 0)
    assert.equal((await admin('select count(*)::int as n from public.members')).rows[0].n, 2)
  } finally { await db.close() }
})

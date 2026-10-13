import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PGlite } from '@electric-sql/pglite';

test('本地PostgreSQL写入后关闭重开仍保存，更正与删除持久化', async () => {
  // 使用临时合成账号；本地磁盘验证不代表Supabase云端Auth或跨设备。
  const directory = await mkdtemp(join(tmpdir(), 'pair-health-persistence-'));
  const id = '88888888-8888-4888-8888-888888888888';
  let db;
  const authenticate = async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec('set role authenticated');
  };
  try {
    db = new PGlite(directory);
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    await db.query('insert into auth.users(id) values($1)',[id]);
    await db.exec(await readFile(new URL('../supabase/migrations/202610130001_initial.sql',import.meta.url),'utf8'));
    await authenticate();
    await db.query("select public.create_space('Synthetic disk test','合成资料')");
    await db.query('select public.save_weight($1::jsonb)',[JSON.stringify({user_id:id,record_date:'2026-01-02',weight_kg:71.3})]);
    await db.close();
    db = new PGlite(directory); await authenticate();
    const saved = (await db.query('select * from public.weights')).rows[0];
    assert.equal(Number(saved.weight_kg),71.3);
    await db.query('select public.save_weight($1::jsonb,$2::uuid)',[JSON.stringify({user_id:id,record_date:'2026-01-03',weight_kg:71.1,expected_updated_at:saved.updated_at}),saved.id]);
    await db.close(); db = new PGlite(directory); await authenticate();
    const corrected=(await db.query('select * from public.weights')).rows[0];
    assert.equal(corrected.record_date.toISOString().slice(0,10),'2026-01-03'); assert.equal(Number(corrected.weight_kg),71.1);
    await db.query('select public.delete_weight($1::uuid)',[saved.id]);
    await db.close();db = new PGlite(directory);await authenticate();
    assert.equal((await db.query('select * from public.weights')).rows.length,0);
  } finally {
    if(db)await db.close();
    // 目标由mkdtemp产生且只属于本测试，删除该目录，不拼跨shell命令。
    await rm(directory,{recursive:true,force:true});
  }
});

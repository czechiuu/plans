import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {buildCleanupSql} from '../scripts/prepare-daily-flow-cleanup.mjs'

function manifests(){
 const owner=randomUUID(),other=randomUUID(),marker='SYNTHETIC-DAILY-'+randomUUID()
 const receipt=(user_id=owner)=>({id:randomUUID(),user_id})
 const daily={marker,created:{schedules:[receipt(),receipt(other),receipt()],meals:[receipt()],photos:[receipt()],
  jobs:[receipt(),receipt(other),receipt()],plans:[receipt(),receipt(other),receipt(),receipt(),receipt()],
  adjustments:[receipt()],ai_requests:[receipt(),receipt(),receipt(),receipt()],training:[receipt()]},
  read_only_baseline_jobs:[randomUUID(),randomUUID()]}
 const ui={marker:'SYNTHETIC-UI-'+randomUUID(),generated_at:'2026-10-14T07:30:00.000Z',
  created:{meals:[receipt()],photos:[receipt()],weights:[],training:[],rules:[receipt()],plans:[receipt()],create_receipts:[receipt()]},
  existing_synthetic_plan_ids_affected:daily.created.plans.filter(x=>x.user_id===owner).map(x=>x.id)}
 return [{scope:'daily',data:daily},{scope:'ui',data:ui}]
}

test('generates exact cleanup without inventing missing API timestamps or deleting the review plan',()=>{
 const sql=buildCleanupSql(manifests())
 assert.match(sql,/review_only boolean/)
 assert.match(sql,/not coalesce\(t\.review_only,false\)/)
 assert.match(sql,/CLEANUP_PLAN_PROVENANCE_UNCONFIRMED/)
 const adjustmentGuard=sql.match(/elsif v_target\.kind='adjustments' and \([\s\S]*?CLEANUP_ADJUSTMENT_SOURCE_UNCONFIRMED/)?.[0]
 assert.ok(adjustmentGuard)
 assert.match(adjustmentGuard,/md5\(\(v_row->'source_snapshot'\)::text\)/)
 assert.match(adjustmentGuard,/join public\.generation_input_snapshots s/)
 assert.match(adjustmentGuard,/v_row->'source_snapshot'->'plan'->'content'=b\.content/)
 assert.doesNotMatch(adjustmentGuard,/position\(v_target\.marker/)
 assert.match(sql,/v_target\.scope='daily' and not v_target\.review_only/)
 assert.match(sql,/CLEANUP_UI_PLAN_MARKER_MISMATCH/)
 assert.match(sql,/CLEANUP_UNKNOWN_CASCADE_OR_SET_NULL/)
 assert.match(sql,/CLEANUP_BASELINE_CHANGED/)
 assert.doesNotMatch(sql,/delete from (?:public\.)?(?:ai_usage|ai_probe_usage|ai_consents|ai_plan_preferences)/i)
 assert.match(sql,/2026-10-13 16:00:00\+00/)
 assert.match(sql,/2026-10-14 16:00:00\+00/)
})

test('rejects a baseline job in the deletion set',()=>{
 const input=manifests()
 input[0].data.read_only_baseline_jobs[0]=input[0].data.created.jobs[0].id
 assert.throws(()=>buildCleanupSql(input),/CLEANUP_BASELINE_OVERLAP/)
})

test('rejects an uncorroborated restoration plan',()=>{
 const input=manifests()
 input[1].data.existing_synthetic_plan_ids_affected=[]
 assert.throws(()=>buildCleanupSql(input),/CLEANUP_REVIEW_PLAN_NOT_CORROBORATED/)
})

test('requires exact, separately confirmed evidence before including an older UI receipt',()=>{
 const row={id:randomUUID(),record_id:randomUUID(),user_id:randomUUID(),kind:'meal',evidence:'prior-run-exact-receipt'}
 assert.throws(()=>buildCleanupSql(manifests(),[{...row,evidence:'same-day-orphan'}]),/CLEANUP_EXTRA_RECEIPT_UNCONFIRMED/)
 const sql=buildCleanupSql(manifests(),[row])
 assert.match(sql,/CLEANUP_EXTRA_RECEIPT_MAPPING_MISMATCH/)
 assert.match(sql,/exists\(select 1 from public\.meals m where m\.id=v_target\.record_id\)/)
})

test('deletes only a rule with its exact recorded revision and leaves other data unchanged',async()=>{
 const input=manifests(),owner=input[1].data.created.rules[0].user_id
 const unchanged=input[1].data.created.rules[0].id,changed=randomUUID(),missing=randomUUID()
 input[1].data.created.rules=[
  {id:unchanged,user_id:owner,expected_updated_at:'2026-10-14T08:00:00.123456+00:00'},
  {id:changed,user_id:owner,expected_updated_at:'2026-10-14T08:00:00.123456+00:00'},
  {id:missing,user_id:owner}
 ]
 const sql=buildCleanupSql(input)
 const deleteRule=sql.match(/delete from public\.health_rules r using cleanup_targets t[\s\S]*?;/i)?.[0]
 assert.ok(deleteRule)
 assert.match(sql,/missing_revision/)
 assert.match(sql,/changed_revision/)
 assert.doesNotMatch(sql,/delete from public\.(?:ai_usage|ai_consents)/i)
 const db=new PGlite()
 try{
  await db.exec(`create table public.health_rules(id uuid primary key,user_id uuid,updated_at timestamptz);
   create temp table cleanup_targets(kind text,id uuid,user_id uuid,review_only boolean,expected_updated_at timestamptz);
   create table public.ai_usage(id uuid primary key);
   create table public.ai_consents(id uuid primary key);`)
  for(const [id,current,expected] of [
   [unchanged,'2026-10-14T08:00:00.123456+00:00','2026-10-14T08:00:00.123456+00:00'],
   [changed,'2026-10-14T08:00:01.123456+00:00','2026-10-14T08:00:00.123456+00:00'],
   [missing,'2026-10-14T08:00:00.123456+00:00',null]
  ]){
   await db.query('insert into public.health_rules values($1,$2,$3)',[id,owner,current])
   await db.query('insert into cleanup_targets values($1,$2,$3,$4,$5)',['rules',id,owner,false,expected])
  }
  const ledger=randomUUID(),consent=randomUUID()
  await db.query('insert into public.ai_usage values($1)',[ledger])
  await db.query('insert into public.ai_consents values($1)',[consent])
  await db.exec(deleteRule)
  const remaining=await db.query('select id from public.health_rules order by id')
  assert.deepEqual(remaining.rows.map(x=>x.id),[changed,missing].sort())
  assert.deepEqual((await db.query('select id from public.ai_usage')).rows.map(x=>x.id),[ledger])
  assert.deepEqual((await db.query('select id from public.ai_consents')).rows.map(x=>x.id),[consent])
 }finally{await db.close()}
})

test('rejects an invalid rule revision instead of embedding it in SQL',()=>{
 const input=manifests()
 input[1].data.created.rules[0].expected_updated_at="2026-10-14T08:00:00Z'); drop table public.health_rules; --"
 assert.throws(()=>buildCleanupSql(input),/CLEANUP_RULE_REVISION_INVALID/)
})

test('PL/pgSQL variables do not shadow cleanup target or rule query aliases',async()=>{
 const sql=buildCleanupSql(manifests())
 const declarations=sql.match(/do \$cleanup\$\s*declare ([^\r\n]+)/)?.[1]
 const ownerGuard=sql.match(/if exists\(select 1 from cleanup_targets t left join public\.fixed_accounts f on f\.user_id=t\.user_id where f\.user_id is null\)\s*then raise exception 'CLEANUP_OWNER_NOT_FIXED_ACCOUNT'; end if;/)?.[0]
 assert.ok(declarations&&ownerGuard)
 const db=new PGlite()
 try{
  await db.exec(`create temp table cleanup_targets(kind text,id uuid,user_id uuid);
   create table public.fixed_accounts(user_id uuid primary key);`)
  const owner=randomUUID()
  await db.query('insert into public.fixed_accounts values($1)',[owner])
  await db.query('insert into cleanup_targets values($1,$2,$3)',['rules',randomUUID(),owner])
  await db.exec(`do $test$ declare ${declarations} begin ${ownerGuard}
   if exists(select 1 from cleanup_targets r where r.kind='rules') then null; end if;
   end $test$;`)
 }finally{await db.close()}
})

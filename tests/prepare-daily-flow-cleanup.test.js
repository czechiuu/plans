import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
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
 assert.match(sql,/t\.scope='daily' and not t\.review_only/)
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
 assert.match(sql,/exists\(select 1 from public\.meals m where m\.id=t\.record_id\)/)
})

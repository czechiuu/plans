import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const timestamp=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
const kinds={daily:['schedules','meals','photos','jobs','plans','adjustments','ai_requests','training'],
 ui:['meals','photos','weights','training','rules','plans','create_receipts']}
const fail=code=>{throw new Error(code)}

export function buildCleanupSql(manifests,extraConfirmedReceipts=[]){
 if(!Array.isArray(manifests)||!manifests.length)fail('CLEANUP_MANIFEST_MISSING')
 const targets=[],baseline=[],seen=new Set(),scopes=new Set()
 for(const {scope,data} of manifests){
  if(!kinds[scope]||scopes.has(scope))fail('CLEANUP_MANIFEST_SCOPE_INVALID')
  scopes.add(scope)
  if(!new RegExp(`^SYNTHETIC-${scope==='daily'?'DAILY':'UI'}-[0-9a-f-]{36}$`,'i').test(data?.marker)||!uuid.test(data.marker.slice(scope==='daily'?16:13)))fail('CLEANUP_MARKER_INVALID')
  // The API runner has no start/end fields. This run was authorized for one Shanghai day.
  if(scope==='ui'&&(!Number.isFinite(Date.parse(data.generated_at))||
   Date.parse(data.generated_at)<Date.parse('2026-10-13T16:00:00Z')||
   Date.parse(data.generated_at)>=Date.parse('2026-10-14T16:00:00Z')))
   fail('CLEANUP_UI_REPORT_OUTSIDE_AUDIT_DAY')
  if(!data.created||typeof data.created!=='object'||Object.keys(data.created).some(k=>!kinds[scope].includes(k)))fail('CLEANUP_CREATED_INVALID')
  for(const kind of kinds[scope]){
   if(!Array.isArray(data.created[kind]))fail('CLEANUP_CREATED_INVALID')
   for(const row of data.created[kind]){
    if(!uuid.test(row?.id??'')||!uuid.test(row?.user_id??''))fail('CLEANUP_RECEIPT_INVALID')
    if(kind==='rules'&&row.expected_updated_at!=null&&
      (typeof row.expected_updated_at!=='string'||!timestamp.test(row.expected_updated_at)||
       !Number.isFinite(Date.parse(row.expected_updated_at))))fail('CLEANUP_RULE_REVISION_INVALID')
    const key=kind+':'+row.id.toLowerCase()+(kind==='create_receipts'?':'+row.user_id.toLowerCase():'')
    if(seen.has(key))fail('CLEANUP_DUPLICATE_RECEIPT')
    seen.add(key)
    targets.push({scope,kind,id:row.id.toLowerCase(),user_id:row.user_id.toLowerCase(),marker:data.marker,
     review_only:false,record_id:null,expected_updated_at:kind==='rules'?row.expected_updated_at??null:null})
   }
  }
  if(scope==='daily'){
   if(!Array.isArray(data.read_only_baseline_jobs)||data.read_only_baseline_jobs.some(x=>!uuid.test(x)))fail('CLEANUP_BASELINE_INVALID')
   baseline.push(...data.read_only_baseline_jobs.map(x=>x.toLowerCase()))
  }
 }
 if(scopes.has('ui')&&!scopes.has('daily'))fail('CLEANUP_DAILY_SOURCE_MANIFEST_REQUIRED')
 if(!targets.length)fail('CLEANUP_NO_CREATED_RECORDS')
 if(new Set(baseline).size!==baseline.length||targets.some(x=>x.kind==='jobs'&&baseline.includes(x.id)))fail('CLEANUP_BASELINE_OVERLAP')
 const daily=manifests.find(x=>x.scope==='daily')?.data
 if(!daily||baseline.length!==2||daily.created.plans.length!==5||daily.created.adjustments.length!==1)
  fail('CLEANUP_RUN_RECEIPT_SHAPE_CHANGED')
 // The runner appended the undo-created plan by listing that day's plans, not from the RPC result.
 // Keep that one plan for exact manual review; the other four have direct job/adjustment provenance.
 const reviewPlan=daily.created.plans[4]
 if(reviewPlan.user_id!==daily.created.adjustments[0].user_id||
  !manifests.find(x=>x.scope==='ui')?.data.existing_synthetic_plan_ids_affected?.includes(reviewPlan.id))
  fail('CLEANUP_REVIEW_PLAN_NOT_CORROBORATED')
 targets.find(x=>x.kind==='plans'&&x.id===reviewPlan.id.toLowerCase()).review_only=true
 if(!Array.isArray(extraConfirmedReceipts)||extraConfirmedReceipts.length>2)fail('CLEANUP_EXTRA_RECEIPTS_INVALID')
 for(const row of extraConfirmedReceipts){
  if(!uuid.test(row?.id??'')||!uuid.test(row?.record_id??'')||!uuid.test(row?.user_id??'')||
    row.kind!=='meal'||row.evidence!=='prior-run-exact-receipt')fail('CLEANUP_EXTRA_RECEIPT_UNCONFIRMED')
  const key='create_receipts:'+row.id.toLowerCase()+':'+row.user_id.toLowerCase()
  if(seen.has(key))fail('CLEANUP_DUPLICATE_RECEIPT')
  seen.add(key)
  targets.push({scope:'extra',kind:'create_receipts',id:row.id.toLowerCase(),user_id:row.user_id.toLowerCase(),
   marker:null,review_only:false,record_id:row.record_id.toLowerCase(),expected_updated_at:null})
 }
 // All interpolated values are constrained UUIDs, marker tokens or fixed enums.
 const rows=JSON.stringify(targets),baselineJson=JSON.stringify(baseline)
 return `-- Exact receipt-based cleanup. Review before running; no credentials or health content.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create temp table cleanup_targets(scope text,kind text,id uuid,user_id uuid,marker text,review_only boolean,record_id uuid,expected_updated_at timestamptz,primary key(kind,id,user_id)) on commit drop;
insert into cleanup_targets select * from jsonb_to_recordset('${rows}'::jsonb)
 as t(scope text,kind text,id uuid,user_id uuid,marker text,review_only boolean,record_id uuid,expected_updated_at timestamptz);
create temp table cleanup_baseline(id uuid primary key,original jsonb) on commit drop;
insert into cleanup_baseline select j.id,to_jsonb(j) from public.generation_jobs j
 where j.id in(select value::uuid from jsonb_array_elements_text('${baselineJson}'::jsonb));
create temp table cleanup_counts(kind text primary key,deleted integer) on commit drop;
create temp table cleanup_rule_skips(id uuid primary key,reason text not null) on commit drop;
do $cleanup$
declare t record;r jsonb;owner record;table_name text;key_name text;n integer;
begin
 if (select count(*) from cleanup_baseline)<>jsonb_array_length('${baselineJson}'::jsonb) then raise exception 'CLEANUP_BASELINE_MISSING'; end if;
 if exists(select 1 from cleanup_targets t left join public.fixed_accounts f on f.user_id=t.user_id where f.user_id is null)
 then raise exception 'CLEANUP_OWNER_NOT_FIXED_ACCOUNT'; end if;
 for owner in select distinct f.space_id,f.user_id from public.fixed_accounts f join cleanup_targets t on t.user_id=f.user_id order by f.space_id,f.user_id loop
  perform public.lock_health_owner(owner.user_id,owner.space_id);
 end loop;
 if to_regclass('storage.objects') is null then raise exception 'CLEANUP_STORAGE_SCHEMA_MISSING'; end if;
 -- Storage must be removed by the Storage API first; this SQL never deletes object metadata.
 if exists(select 1 from public.photo_assets p join cleanup_targets t on t.kind='photos' and t.id=p.id and t.user_id=p.user_id)
  or exists(select 1 from storage.objects o join cleanup_targets t on t.kind='photos'
   and o.bucket_id='health-photos' and o.name=t.user_id::text||'/'||t.id::text||'.png')
 then raise exception 'CLEANUP_PHOTO_STORAGE_NOT_FINISHED'; end if;
 -- The runners remove these records through their normal owner APIs. Never bypass that cleanup.
 for t in select * from cleanup_targets order by kind,id loop
  table_name:=case t.kind when 'jobs' then 'generation_jobs' when 'plans' then 'daily_plans'
   when 'adjustments' then 'meal_adjustments' when 'ai_requests' then 'ai_request_results'
   when 'rules' then 'health_rules' when 'create_receipts' then 'record_create_requests'
   when 'training' then 'training_sessions' when 'photos' then 'photo_assets' else t.kind end;
  key_name:=case when t.kind='create_receipts' then 'client_request_id' else 'id' end;
  if t.kind='create_receipts' then
   select to_jsonb(x) into r from public.record_create_requests x where x.client_request_id=t.id and x.user_id=t.user_id for update;
  else
   execute format('select to_jsonb(r) from public.%I r where %I=$1 for update',table_name,key_name) into r using t.id;
  end if;
  if r is null then
   if t.kind='rules' then insert into cleanup_rule_skips values(t.id,'missing_row');continue;end if;
   if t.kind in ('schedules','meals','training','weights','photos') then continue; end if;
   raise exception 'CLEANUP_EXPECTED_ROW_MISSING: %',t.kind;
  end if;
  if r->>'user_id' is distinct from t.user_id::text then raise exception 'CLEANUP_OWNER_MISMATCH'; end if;
  if t.kind='rules' and t.expected_updated_at is null then
   insert into cleanup_rule_skips values(t.id,'missing_revision');continue;
  end if;
  if t.kind='rules' and (r->>'updated_at')::timestamptz is distinct from t.expected_updated_at then
   insert into cleanup_rule_skips values(t.id,'changed_revision');continue;
  end if;
  if (r->>'created_at')::timestamptz < timestamptz '2026-10-13 16:00:00+00'
    or (r->>'created_at')::timestamptz >= timestamptz '2026-10-14 16:00:00+00'
    or r->>'created_at' is null
  then raise exception 'CLEANUP_CREATION_OUTSIDE_RUN'; end if;
  if t.kind in ('schedules','meals','training','weights','photos') then raise exception 'CLEANUP_OWNER_API_NOT_FINISHED'; end if;
  if t.kind='jobs' then
   if r->>'status' in ('queued','running','failed') then raise exception 'CLEANUP_GENERATION_STILL_ACTIVE'; end if;
   if exists(select 1 from cleanup_baseline b where b.id=t.id) then raise exception 'CLEANUP_BASELINE_OVERLAP'; end if;
   if not exists(select 1 from public.generation_input_snapshots s where s.job_id=t.id and s.user_id=t.user_id
     and position(t.marker in s.source_snapshot::text)>0) then raise exception 'CLEANUP_JOB_SOURCE_MARKER_MISMATCH'; end if;
  elsif t.kind='plans' and t.scope='daily' and not t.review_only and not exists(
    select 1 from public.generation_jobs j join cleanup_targets x on x.kind='jobs' and x.id=j.id and x.user_id=j.user_id
     where j.plan_id=t.id and j.user_id=t.user_id)
    and not exists(select 1 from public.meal_adjustments a join cleanup_targets x
      on x.kind='adjustments' and x.id=a.id and x.user_id=a.user_id
      where a.applied_plan_id=t.id and a.user_id=t.user_id)
   then raise exception 'CLEANUP_PLAN_PROVENANCE_UNCONFIRMED';
  elsif t.kind='adjustments' and (position(t.marker in (r->'source_snapshot')::text)=0
    or not exists(select 1 from cleanup_targets p where p.kind='plans' and p.id=(r->>'base_plan_id')::uuid and p.user_id=t.user_id))
   then raise exception 'CLEANUP_ADJUSTMENT_SOURCE_UNCONFIRMED';
  elsif t.kind='rules' and position(t.marker in (r->'rules')::text)=0 then raise exception 'CLEANUP_RULE_MARKER_MISMATCH';
  elsif t.kind='plans' and t.scope='ui' and position(t.marker in (r->'content')::text)=0 then raise exception 'CLEANUP_UI_PLAN_MARKER_MISMATCH';
  elsif t.kind='ai_requests' and r->>'status'='running' then raise exception 'CLEANUP_AI_STILL_ACTIVE';
  elsif t.kind='ai_requests' and r->>'provider' is distinct from 'deepseek' then raise exception 'CLEANUP_AI_PROVIDER_MISMATCH';
  elsif t.kind='adjustments' and r->>'status'='running' then raise exception 'CLEANUP_ADJUSTMENT_STILL_ACTIVE';
  elsif t.kind='create_receipts' and t.scope='extra' and
    (r->>'kind' is distinct from 'meal' or (r->>'record_id')::uuid is distinct from t.record_id or
     exists(select 1 from public.meals m where m.id=t.record_id))
   then raise exception 'CLEANUP_EXTRA_RECEIPT_MAPPING_MISMATCH';
  elsif t.kind='create_receipts' and t.scope<>'extra' and not exists(select 1 from cleanup_targets x where x.scope=t.scope and x.marker=t.marker
    and x.user_id=t.user_id and x.id=(r->>'record_id')::uuid and x.kind=case r->>'kind' when 'meal' then 'meals' when 'training' then 'training' end)
   then raise exception 'CLEANUP_RECEIPT_RECORD_NOT_LISTED'; end if;
 end loop;
 if exists(select 1 from pg_constraint c where c.contype='f' and c.confrelid in
   ('public.generation_jobs'::regclass,'public.daily_plans'::regclass,'public.meal_adjustments'::regclass,
    'public.ai_request_results'::regclass,'public.health_rules'::regclass,'public.record_create_requests'::regclass)
   and c.confdeltype in ('c','n','d') and not (
    (c.conrelid='public.generation_input_snapshots'::regclass and c.confrelid in ('public.generation_jobs'::regclass,'public.daily_plans'::regclass))
    or (c.conrelid='public.meal_adjustments'::regclass and c.confrelid='public.daily_plans'::regclass)))
 then raise exception 'CLEANUP_UNKNOWN_CASCADE_OR_SET_NULL'; end if;
 -- Refuse cascades or trigger updates to records outside the exact manifest.
 if exists(select 1 from public.generation_jobs j join cleanup_targets p on p.kind='plans' and not p.review_only and p.id=j.plan_id
  where not exists(select 1 from cleanup_targets t where t.kind='jobs' and t.id=j.id and t.user_id=j.user_id))
  or exists(select 1 from public.meal_adjustments a join cleanup_targets p on p.kind='plans' and not p.review_only and p.id in(a.base_plan_id,a.applied_plan_id)
  where not exists(select 1 from cleanup_targets t where t.kind='adjustments' and t.id=a.id and t.user_id=a.user_id))
  or exists(select 1 from public.generation_input_snapshots s join cleanup_targets p on p.kind='plans' and not p.review_only and p.id=s.plan_id
  where not exists(select 1 from cleanup_targets t where t.kind='jobs' and t.id=s.job_id and t.user_id=s.user_id))
  or exists(select 1 from public.training_sessions s join cleanup_targets p on p.kind='plans' and not p.review_only and p.id::text=s.data->>'plan_id')
 then raise exception 'CLEANUP_UNLISTED_PLAN_DEPENDENCY'; end if;
 if exists(select 1 from public.meal_adjustments a join cleanup_targets r on r.kind='rules' and r.user_id=a.user_id
  and r.expected_updated_at is not null and not exists(select 1 from cleanup_rule_skips s where s.id=r.id)
  where a.status='draft' and not exists(select 1 from cleanup_targets t where t.kind='adjustments' and t.id=a.id and t.user_id=a.user_id))
 then raise exception 'CLEANUP_UNLISTED_RULE_TRIGGER_TARGET'; end if;
 for table_name,key_name,n in select * from (values
  ('meal_adjustments','id',1),('generation_jobs','id',2),('daily_plans','id',3),
  ('ai_request_results','id',4),('record_create_requests','client_request_id',6)) d(t,k,seq) order by seq loop
  execute format('delete from public.%I r using cleanup_targets t where t.kind=$1 and not coalesce(t.review_only,false) and r.%I=t.id and r.user_id=t.user_id',table_name,key_name)
   using case table_name when 'meal_adjustments' then 'adjustments' when 'generation_jobs' then 'jobs'
    when 'daily_plans' then 'plans' when 'ai_request_results' then 'ai_requests' else 'create_receipts' end;
  get diagnostics n=row_count;
  if n<>(select count(*) from cleanup_targets where kind=case table_name
    when 'meal_adjustments' then 'adjustments' when 'generation_jobs' then 'jobs'
    when 'daily_plans' then 'plans' when 'ai_request_results' then 'ai_requests'
    else 'create_receipts' end and not review_only)
  then raise exception 'CLEANUP_DELETE_COUNT_MISMATCH: %',table_name; end if;
  insert into cleanup_counts values(table_name,n);
 end loop;
 delete from public.health_rules r using cleanup_targets t where t.kind='rules'
  and not coalesce(t.review_only,false) and r.id=t.id and r.user_id=t.user_id
  and t.expected_updated_at is not null and r.updated_at=t.expected_updated_at;
 get diagnostics n=row_count;
 if n<>(select count(*) from cleanup_targets t where t.kind='rules' and not t.review_only
  and not exists(select 1 from cleanup_rule_skips s where s.id=t.id))
 then raise exception 'CLEANUP_RULE_DELETE_COUNT_MISMATCH'; end if;
 insert into cleanup_counts values('health_rules',n);
 if exists(select 1 from cleanup_baseline b left join public.generation_jobs j on j.id=b.id where to_jsonb(j) is distinct from b.original)
 then raise exception 'CLEANUP_BASELINE_CHANGED'; end if;
 if not exists(select 1 from public.daily_plans p join cleanup_targets t on t.kind='plans' and t.review_only
   and p.id=t.id and p.user_id=t.user_id) then raise exception 'CLEANUP_REVIEW_PLAN_CHANGED'; end if;
end $cleanup$;
select kind,deleted from cleanup_counts order by kind;
select reason,count(*) as preserved from cleanup_rule_skips group by reason order by reason;
commit;
`
}

export async function main(){
 const manifests=[]
 for(const [scope,name] of [['daily','daily-flow-cleanup.json'],['ui','daily-flow-ui-cleanup.json']]){
  let raw
  try{raw=await readFile(new URL('../test-results/private/'+name,import.meta.url),'utf8')}
  catch(error){if(error.code==='ENOENT')continue;throw error}
  manifests.push({scope,data:JSON.parse(raw)})
 }
 let extra=[]
 try{extra=JSON.parse(await readFile(new URL('../private/daily-flow-extra-confirmed-receipts.json',import.meta.url),'utf8')).receipts}
 catch(error){if(error.code!=='ENOENT')throw error}
 const sql=buildCleanupSql(manifests,extra)
 const path=new URL('../private/daily-flow-cleanup-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sql',import.meta.url)
 await mkdir(new URL('../private/',import.meta.url),{recursive:true})
 await writeFile(path,sql,{flag:'wx'})
 console.log('Prepared private cleanup SQL; manifests='+manifests.length+'; records='+manifests.reduce((n,m)=>n+Object.values(m.data.created).reduce((a,x)=>a+x.length,0),0)+'; extra_confirmed_receipts='+extra.length)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main().catch(error=>{console.error(error.message);process.exitCode=1})

-- Generated reviewed migrations; no credentials or account identifiers.
-- Existing queued work without an explicit provider is failed by 006 before 007.
begin;
lock table supabase_migrations.schema_migrations in share row exclusive mode;
do $daily_apply$
declare expected record; registered text[]; registered_name text;
begin
 for expected in select * from (values
 ('202610130001','initial','1d56c15aa7609c057d53a05b124b172d'),
 ('202610130002','space_lock_order','c1e2788c3d67dccb544ab8166a6c096b'),
 ('202610130003','fixed_accounts','d13a863ec3337d16a4a968835d5ee12d'),
 ('202610130004','health_daily','9a430516e9a44d8d27c651cf24e73e2b'),
 ('202610130005','ai_providers','2c57e2948216f3e08e2170754e1fd883')
 ) as required(version,name,hash) loop
  select statements,name into registered,registered_name from supabase_migrations.schema_migrations where version=expected.version;
  if not found or cardinality(registered) is distinct from 1 or md5(registered[1]) is distinct from expected.hash or registered_name is distinct from expected.name
  then raise exception 'Migration history mismatch: %',expected.version; end if;
 end loop;
 if (select count(*) from public.fixed_accounts)<>2 or (select count(*) from public.members)<>2
   or (select count(*) from auth.users)<>2 or (select count(distinct space_id) from public.fixed_accounts)<>1
   or (select count(*) from public.fixed_accounts f join public.members m on m.user_id=f.user_id and m.space_id=f.space_id
       join auth.users u on u.id=f.user_id where ((f.slot='me' and u.email='me@plans.invalid') or (f.slot='w' and u.email='w@plans.invalid'))
       and u.email_confirmed_at is not null and nullif(u.encrypted_password,'') is not null)<>2
 then raise exception 'Fixed two-account space precondition failed'; end if;
end $daily_apply$;

do $daily_apply$
declare body text := $daily_body$-- Lifecycle state is committed before Storage receives bytes. Every lifecycle RPC
-- and Storage metadata insertion locks space, then owner, then dependent rows.
alter table public.photo_assets add column uploading boolean not null default false;
drop policy photo_assets_read on public.photo_assets;
create policy photo_assets_read on public.photo_assets for select to authenticated using
 ((user_id=auth.uid() and space_id=public.current_space_id()) or
  (not deleting and not uploading and public.health_can_read(space_id,user_id,is_shared,'photo')));

create function public.lock_health_owner(p_owner uuid,p_space uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from public.spaces where id=p_space for update;
 if not found then raise exception 'Space membership required'; end if;
 perform 1 from public.members where space_id=p_space and user_id=p_owner for update;
 if not found then raise exception 'Space membership required'; end if;
end $$;

create function public.begin_photo_upload(p_owner uuid,p_space uuid,p_sha256 text,p_width integer,p_height integer,p_bytes integer,p_meal_id uuid,p_shared boolean)
returns public.photo_assets language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.photo_assets; v_id uuid:=gen_random_uuid();
begin
 perform public.lock_health_owner(p_owner,p_space);
 if p_shared is null then raise exception 'Invalid photo'; end if;
 if p_meal_id is not null and not exists(select 1 from public.meals where id=p_meal_id and user_id=p_owner and space_id=p_space)
 then raise exception 'Meal unavailable'; end if;
 select * into v_row from public.photo_assets where user_id=p_owner and sha256=p_sha256 for update;
 if found then
  if v_row.deleting or v_row.uploading then raise exception 'Photo cleanup required'; end if;
  perform public.reuse_photo_asset(v_row.id,p_owner,p_space,p_meal_id);
  return v_row;
 end if;
 insert into public.photo_assets(id,space_id,user_id,meal_id,sha256,storage_path,mime,width,height,bytes,is_shared,updated_by,uploading)
 values(v_id,p_space,p_owner,p_meal_id,p_sha256,p_owner::text||'/'||v_id::text||'.png','image/png',p_width,p_height,p_bytes,p_shared,p_owner,true)
 returning * into v_row;
 return v_row;
end $$;

create function public.complete_photo_upload(p_id uuid,p_owner uuid,p_space uuid) returns public.photo_assets
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.photo_assets;
begin
 perform public.lock_health_owner(p_owner,p_space);
 update public.photo_assets set uploading=false,updated_at=clock_timestamp()
 where id=p_id and user_id=p_owner and space_id=p_space and uploading and not deleting returning * into v_row;
 if not found then raise exception 'Photo unavailable'; end if;
 return v_row;
end $$;

-- Storage metadata commits share the lifecycle locks. A request arriving after a
-- deletion/clear cannot recreate an object; the Storage API cleans failed writes.
create function public.guard_health_storage_upload() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid; v_space uuid;
begin
 if new.bucket_id<>'health-photos' then return new; end if;
 select user_id,space_id into v_owner,v_space from public.photo_assets where storage_path=new.name;
 if not found then raise exception 'Photo upload reservation required'; end if;
 perform public.lock_health_owner(v_owner,v_space);
 if not exists(select 1 from public.photo_assets where storage_path=new.name and uploading and not deleting)
 then raise exception 'Photo upload reservation unavailable'; end if;
 return new;
end $$;
do $$ begin
 if to_regclass('storage.objects') is not null then
  create trigger health_photo_upload_guard before insert or update of name,bucket_id on storage.objects
   for each row execute function public.guard_health_storage_upload();
 end if;
end $$;

create or replace function public.reuse_photo_asset(p_id uuid,p_owner uuid,p_space uuid,p_meal_id uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_row public.photo_assets;
begin
  perform public.lock_health_owner(p_owner,p_space);
  select * into v_row from public.photo_assets
    where id=p_id and user_id=p_owner and space_id=p_space for update;
  if not found or v_row.deleting or v_row.uploading or (p_meal_id is not null and v_row.meal_id is not null
    and v_row.meal_id<>p_meal_id) then raise exception 'Photo unavailable'; end if;
  if p_meal_id is not null then
    if not exists(select 1 from public.meals where id=p_meal_id and user_id=p_owner and space_id=p_space)
    then raise exception 'Meal unavailable'; end if;
    update public.photo_assets set meal_id=p_meal_id,updated_at=clock_timestamp() where id=p_id;
  end if;
  return p_id;
end $$;

create or replace function public.begin_photo_delete(p_id uuid,p_owner uuid,p_space uuid) returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_path text;
begin
  perform public.lock_health_owner(p_owner,p_space);
  update public.photo_assets set deleting=true,updated_at=clock_timestamp()
    where id=p_id and user_id=p_owner and space_id=p_space
    returning storage_path into v_path;
  if not found then raise exception 'Photo not found'; end if;
  return v_path;
end $$;

create or replace function public.unlink_photo_asset(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_row public.photo_assets;
begin
  select * into v_row from public.photo_assets where id=p_id;
  if not found then return; end if;
  perform public.lock_health_owner(v_row.user_id,v_row.space_id);
  if not v_row.deleting then raise exception 'Photo not found'; end if;
  update public.meals m set data=jsonb_set(m.data,'{photo_ids}',
      coalesce((select jsonb_agg(x.value) from jsonb_array_elements(m.data->'photo_ids') x
        where x.value<>to_jsonb(p_id::text)),'[]'::jsonb)),updated_at=clock_timestamp()
    where m.user_id=v_row.user_id and m.data->'photo_ids' ? p_id::text;
  select * into v_row from public.photo_assets where id=p_id for update;
  if not found then return; end if;
  if not v_row.deleting then raise exception 'Photo not found'; end if;
  delete from public.photo_assets where id=p_id;
end $$;

create or replace function public.erase_own_health_data() returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform public.lock_health_owner(auth.uid(),public.current_space_id());
  if exists(select 1 from public.photo_assets where user_id=auth.uid()) then raise exception 'Delete private photos first'; end if;
  -- Minimal cost ledger stays until account deletion, so erasure cannot reset a monthly spending cap.
  delete from public.ai_consents where user_id=auth.uid();
  delete from public.generation_jobs where user_id=auth.uid();
  delete from public.plan_input_revisions where user_id=auth.uid();
  delete from public.training_sessions where user_id=auth.uid();
  delete from public.meals where user_id=auth.uid();
  delete from public.daily_plans where user_id=auth.uid();
  delete from public.health_rules where user_id=auth.uid();
  delete from public.health_profiles where user_id=auth.uid();
  delete from public.schedules where user_id=auth.uid();
  delete from public.weights where user_id=auth.uid();
  delete from public.audit_events where user_id=auth.uid();
end $$;

-- A persistent edit revision captures manual edits and lock/unlock transitions,
-- without hashing the generated target output back into its own source input.
create table public.plan_input_revisions (
 space_id uuid not null,user_id uuid not null,target_date date not null,revision bigint not null default 1,
 primary key(user_id,target_date),foreign key(space_id,user_id) references public.members(space_id,user_id) on delete cascade
);
alter table public.plan_input_revisions enable row level security;
revoke all on public.plan_input_revisions from public,anon,authenticated;
insert into public.plan_input_revisions(space_id,user_id,target_date,revision)
 select space_id,user_id,target_date,count(*) from public.daily_plans where source='manual' or is_locked group by space_id,user_id,target_date;
create function public.bump_plan_input_revision() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if (tg_op='INSERT' and new.source='manual') or (tg_op='UPDATE' and new.is_locked is distinct from old.is_locked) then
  insert into public.plan_input_revisions(space_id,user_id,target_date) values(new.space_id,new.user_id,new.target_date)
  on conflict(user_id,target_date) do update set revision=public.plan_input_revisions.revision+1;
 end if;
 return new;
end $$;
create trigger plan_input_revision after insert or update of is_locked on public.daily_plans
 for each row execute function public.bump_plan_input_revision();

create or replace function public.health_input_version(p_owner uuid,p_date date) returns text
language sql stable security definer set search_path = public, pg_temp
as $$
  select md5(jsonb_build_object(
    'schedule',(select to_jsonb(s) from public.schedules s where s.user_id=p_owner and s.record_date=p_date),
    'rules',(select to_jsonb(r) from public.health_rules r where r.user_id=p_owner),
    'profile',(select to_jsonb(h) from public.health_profiles h where h.user_id=p_owner),
    'training',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)
      from public.training_sessions t where t.user_id=p_owner and t.record_date between p_date-8 and p_date),
    'target_revision',coalesce((select revision from public.plan_input_revisions where user_id=p_owner and target_date=p_date),0),
    'weights',(select coalesce(jsonb_agg(to_jsonb(w) order by w.id),'[]'::jsonb) from public.weights w where w.user_id=p_owner),
    'meals',(select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb) from public.meals m where m.user_id=p_owner and m.record_date between p_date-8 and p_date),
    'plans',(select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]'::jsonb)
      from public.daily_plans d where d.user_id=p_owner and d.is_current
        and d.target_date<>p_date and d.target_date between date_trunc('week',p_date::timestamp)::date
          and date_trunc('week',p_date::timestamp)::date+6)
  )::text)
$$;

create or replace function public.set_plan_lock(p_id uuid,p_locked boolean,p_expected_updated_at timestamptz)
returns public.daily_plans language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_old public.daily_plans; v_row public.daily_plans;
begin
  perform 1 from public.members where user_id=auth.uid() and space_id=public.current_space_id() for update;
  select * into v_old from public.daily_plans where id=p_id and user_id=auth.uid() and space_id=public.current_space_id() and is_current for update;
  if not found then raise exception 'not found or access denied'; end if;
  if p_locked is null or p_expected_updated_at is distinct from v_old.updated_at then raise exception 'Edit conflict'; end if;
  update public.daily_plans set is_locked=p_locked,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id returning * into v_row;
  return v_row;
end $$;
alter table public.generation_jobs add column provider text check(provider in ('rules','openai','deepseek'));
update public.generation_jobs set status='exhausted',error_code='PROVIDER_UNBOUND',lease_until=null,claim_token=null where status in ('queued','running','failed');
drop function public.request_plan_generation(date);

create or replace function public.request_plan_generation(p_target_date date,p_provider text) returns public.generation_jobs
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_space uuid := public.current_space_id(); v_row public.generation_jobs; v_input text;
begin
  if v_space is null then raise exception 'Space membership required'; end if;
  if p_target_date is null or p_target_date not between (now() at time zone 'Asia/Shanghai')::date and (now() at time zone 'Asia/Shanghai')::date+31
  then raise exception 'Invalid target date'; end if;
  perform 1 from public.members where user_id=auth.uid() and space_id=v_space for update;
  if not found then raise exception 'Space membership required'; end if;
  if p_provider is null or p_provider not in ('rules','openai','deepseek') then raise exception 'Invalid provider'; end if;
  v_input := public.health_input_version(auth.uid(),p_target_date);
  insert into public.generation_jobs(space_id,user_id,target_date,kind,scheduled_for,input_version,provider)
    values(v_space,auth.uid(),p_target_date,'manual',now(),v_input,p_provider)
    on conflict(user_id,target_date,kind) do update set status='queued',attempts=0,plan_id=null,
      error_code=null,lease_until=null,claim_token=null,next_run_at=now(),scheduled_for=now(),input_version=v_input,provider=p_provider,
      updated_at=clock_timestamp()
    where public.generation_jobs.status not in ('queued','running')
      and public.generation_jobs.input_version is distinct from v_input
    returning * into v_row;
  if v_row.id is null then select * into v_row from public.generation_jobs
    where user_id=auth.uid() and target_date=p_target_date and kind='manual'; end if;
  return v_row;
end $$;

create or replace function public.enqueue_scheduled_plans(p_scheduled_for timestamptz) returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_count integer:=0; v_member record; v_added integer;
begin
  if p_scheduled_for is null or p_scheduled_for>now()+interval '5 minutes'
    or p_scheduled_for<now()-interval '24 hours' then raise exception 'Invalid scheduled time'; end if;
  for v_member in select f.space_id,f.user_id from public.fixed_accounts f join public.members m on m.space_id=f.space_id and m.user_id=f.user_id order by f.user_id loop
    perform 1 from public.spaces where id=v_member.space_id for update;
    perform 1 from public.members where user_id=v_member.user_id and space_id=v_member.space_id for update;
    if not found then continue; end if;
    insert into public.generation_jobs(space_id,user_id,target_date,kind,scheduled_for,input_version,provider)
      values(v_member.space_id,v_member.user_id,(p_scheduled_for at time zone 'Asia/Shanghai')::date+1,'scheduled',p_scheduled_for,
      public.health_input_version(v_member.user_id,(p_scheduled_for at time zone 'Asia/Shanghai')::date+1),
      coalesce((select plan_provider from public.ai_plan_preferences where user_id=v_member.user_id),'rules'))
      on conflict(user_id,target_date,kind) do nothing;
    get diagnostics v_added=row_count;
    v_count:=v_count+v_added;
  end loop;
  return v_count;
end $$;

create or replace function public.finish_generation_job(p_id uuid,p_claim_token uuid,p_content jsonb,p_input_version text,
  p_source text,p_error_code text default null)
returns public.generation_jobs language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_job public.generation_jobs; v_old public.daily_plans; v_plan public.daily_plans; v_user uuid; v_space uuid; v_rules jsonb; v_free boolean;
begin
  select user_id,space_id into v_user,v_space from public.generation_jobs where id=p_id;
  if not found then raise exception 'Job lease unavailable'; end if;
  perform 1 from public.members where user_id=v_user and space_id=v_space for update;
  if not found then raise exception 'Member unavailable'; end if;
  select * into v_job from public.generation_jobs where id=p_id for update;
  if not found or v_job.status<>'running' or v_job.lease_until<now()
    or p_claim_token is distinct from v_job.claim_token then raise exception 'Job lease unavailable'; end if;
  if p_source not in ('rules','ai') then raise exception 'Invalid plan source'; end if;
  if p_error_code is not null or p_content is null then
    if p_error_code is null or p_error_code !~ '^[A-Z0-9_]{1,80}$' then raise exception 'Invalid error code'; end if;
    update public.generation_jobs set status=case when attempts>=max_attempts then 'exhausted' else 'failed' end,
      error_code=p_error_code,next_run_at=now()+make_interval(mins=>attempts*5),lease_until=null,claim_token=null,
      updated_at=clock_timestamp() where id=p_id returning * into v_job;
    return v_job;
  end if;
  if p_input_version is distinct from v_job.input_version
    or not public.health_plan_allowed(v_job.user_id,v_job.target_date,p_content)
  then raise exception 'Invalid or stale generated plan'; end if;
  select rules into v_rules from public.health_rules where user_id=v_job.user_id;
  v_free := coalesce(v_rules->>'free_day_meal_unrestricted','false')='true'
    and exists(select 1 from jsonb_array_elements_text(v_rules->'free_weekdays') d
      where d::integer=extract(isodow from v_job.target_date)::integer);
  if v_rules is null or v_rules->>'confirmed'<>'true'
    or p_content->'meals' is distinct from
      (case when v_free then '[]'::jsonb else v_rules->'meal_template' end)
  then raise exception 'Unconfirmed automatic meals'; end if;
  select * into v_old from public.daily_plans where user_id=v_job.user_id and target_date=v_job.target_date and is_current for update;
  if v_old.id is not null and v_old.source='manual'
    and (v_job.kind='scheduled' or v_old.updated_at>v_job.scheduled_for) then
    update public.generation_jobs set status='exhausted',error_code='PLAN_MANUAL_NEWER',
      lease_until=null,claim_token=null,updated_at=clock_timestamp() where id=p_id returning * into v_job;
    return v_job;
  end if;
  if p_input_version is distinct from public.health_input_version(v_job.user_id,v_job.target_date)
  then raise exception 'Invalid or stale generated plan'; end if;
  if v_old.id is not null and v_old.source in ('rules','ai') and not v_old.is_stale
    and v_old.input_version=p_input_version then
    update public.generation_jobs set status='succeeded',plan_id=v_old.id,error_code=null,
      lease_until=null,claim_token=null,updated_at=clock_timestamp() where id=p_id returning * into v_job;
    return v_job;
  end if;
  if v_old.is_locked or exists(select 1 from public.training_sessions t where t.user_id=v_job.user_id
    and t.record_date=v_job.target_date and t.status='completed') then
    update public.generation_jobs set status='exhausted',error_code='PLAN_LOCKED',lease_until=null,claim_token=null,
      updated_at=clock_timestamp() where id=p_id returning * into v_job;
    return v_job;
  end if;
  if v_old.id is not null then update public.daily_plans set is_current=false where id=v_old.id; end if;
  insert into public.daily_plans(space_id,user_id,target_date,version,source,status,is_shared,input_version,content,scheduled_for,updated_by)
    values(v_job.space_id,v_job.user_id,v_job.target_date,coalesce(v_old.version,0)+1,p_source,'published',
      coalesce(v_old.is_shared,false),p_input_version,p_content,v_job.scheduled_for,v_job.user_id) returning * into v_plan;
  update public.generation_jobs set status='succeeded',plan_id=v_plan.id,error_code=null,
    lease_until=null,claim_token=null,updated_at=clock_timestamp() where id=p_id returning * into v_job;
  return v_job;
end $$;

revoke all on function public.lock_health_owner(uuid,uuid),public.begin_photo_upload(uuid,uuid,text,integer,integer,integer,uuid,boolean),
 public.complete_photo_upload(uuid,uuid,uuid),public.guard_health_storage_upload(),public.bump_plan_input_revision(),
 public.request_plan_generation(date,text) from public,anon,authenticated;
grant execute on function public.begin_photo_upload(uuid,uuid,text,integer,integer,integer,uuid,boolean),public.complete_photo_upload(uuid,uuid,uuid) to service_role;
grant execute on function public.request_plan_generation(date,text) to authenticated;

create function public.require_bound_generation_provider() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if new.status in ('queued','running','failed') and new.provider is null then raise exception 'Provider binding required'; end if;
 return new;
end $$;
create trigger generation_provider_binding before insert or update on public.generation_jobs
 for each row execute function public.require_bound_generation_provider();
revoke all on function public.require_bound_generation_provider() from public,anon,authenticated;
$daily_body$; registered text[]; registered_name text;
begin
 body:=replace(body,chr(13)||chr(10),chr(10));
 if md5(body) is distinct from '387cc96e9854379726dec49837109f69' then raise exception 'Migration source mismatch: 202610140006'; end if;
 select statements,name into registered,registered_name from supabase_migrations.schema_migrations where version='202610140006';
 if found then
  if cardinality(registered) is distinct from 1 or md5(registered[1]) is distinct from '387cc96e9854379726dec49837109f69' or registered_name is distinct from 'integrity'
  then raise exception 'Migration history mismatch: 202610140006'; end if;
 else
  execute body;
  insert into supabase_migrations.schema_migrations(version,statements,name) values('202610140006',array[body],'integrity');
 end if;
end $daily_apply$;

do $daily_apply$
declare body text := $daily_body$-- Daily AI flow. No production budget or provider preference is increased or switched.
create table public.ai_provider_settings(provider text primary key check(provider in ('openai','deepseek')),health_enabled boolean not null default false);
insert into public.ai_provider_settings values('openai',true),('deepseek',false);
alter table public.ai_provider_settings enable row level security;
revoke all on public.ai_provider_settings from public,anon,authenticated;
grant select,update on public.ai_provider_settings to service_role;
alter table public.ai_consents drop constraint ai_consents_purpose_check;
alter table public.ai_consents add constraint ai_consents_purpose_check check(purpose in ('legacy_text','legacy_photo','parse_schedule','estimate_meal_text','estimate_meal_photo','generate_plan','adjust_plan') and kind=case when purpose in ('legacy_photo','estimate_meal_photo') then 'photo' else 'text' end);
alter table public.ai_usage drop constraint ai_usage_purpose_check;
alter table public.ai_usage add constraint ai_usage_purpose_check check(purpose in ('legacy','parse_schedule','estimate_meal_text','estimate_meal_photo','generate_plan','adjust_plan'));
create function public.health_daily_flow_version() returns integer language sql stable security definer set search_path=public,pg_temp as $$ select 7 $$;
revoke all on function public.health_daily_flow_version() from public,anon;
grant execute on function public.health_daily_flow_version() to authenticated;
-- Cache the outcome of one exact request. An uncertain network failure is never
-- retried automatically: it may already have been charged by the provider.
create table public.ai_request_results(
  id uuid primary key default gen_random_uuid(),space_id uuid not null,user_id uuid not null,
  provider text not null,purpose text not null,input_hash text not null,
  status text not null default 'running' check(status in ('running','completed','failed','retryable')),attempts integer not null default 1 check(attempts between 1 and 3),
  output jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(user_id,provider,purpose,input_hash),
  foreign key(space_id,user_id) references public.members(space_id,user_id) on delete cascade
);
alter table public.ai_request_results enable row level security;
revoke all on public.ai_request_results from public,anon,authenticated;
grant select,insert,update,delete on public.ai_request_results to service_role;
create function public.begin_ai_request(p_user uuid,p_provider text,p_purpose text,p_hash text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.ai_request_results; s uuid;
begin
  select space_id into s from public.fixed_accounts where user_id=p_user;
  if s is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid AI request'; end if;
  insert into public.ai_request_results(space_id,user_id,provider,purpose,input_hash)
    values(s,p_user,p_provider,p_purpose,p_hash) on conflict do nothing returning * into r;
  if r.id is not null then return jsonb_build_object('acquired',true,'request',to_jsonb(r)); end if;
  select * into r from public.ai_request_results where user_id=p_user and provider=p_provider and purpose=p_purpose and input_hash=p_hash for update;
  if r.status='retryable' and r.attempts<3 then
    update public.ai_request_results set status='running',attempts=attempts+1,updated_at=clock_timestamp() where id=r.id returning * into r;
    return jsonb_build_object('acquired',true,'request',to_jsonb(r));
  end if;
  return jsonb_build_object('acquired',false,'request',to_jsonb(r));
end $$;
revoke all on function public.begin_ai_request(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.begin_ai_request(uuid,text,text,text) to service_role;
create or replace function public.set_ai_provider_consent(
  p_provider text,p_purpose text,p_enabled boolean,p_monthly_limit_cents integer,p_policy_version text
) returns public.ai_consents
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_space uuid:=public.current_space_id(); v_kind text; v_row public.ai_consents;
begin
  if v_space is null then raise exception 'Space membership required'; end if;
  if p_provider is null or p_provider not in ('openai','deepseek')
    or p_purpose is null or p_purpose not in ('parse_schedule','estimate_meal_text','estimate_meal_photo','generate_plan','adjust_plan')
    or p_enabled is null or p_monthly_limit_cents is null or p_monthly_limit_cents not between 0 and 500
    or (p_enabled and p_monthly_limit_cents=0)
    or (p_provider='openai' and p_policy_version is distinct from '2026-10-13-openai-health-v1')
    or (p_provider='deepseek' and p_policy_version is distinct from '2026-10-13-deepseek-health-v1')
  then raise exception 'Invalid provider consent'; end if;
  if p_enabled and not exists(select 1 from public.ai_provider_settings where provider=p_provider and health_enabled) then
    raise exception 'Provider health data is not enabled';
  end if;
  v_kind:=case when p_purpose='estimate_meal_photo' then 'photo' else 'text' end;
  insert into public.ai_consents(space_id,user_id,kind,provider,purpose,enabled,
    monthly_limit_cents,policy_version,consented_at,revoked_at)
    values(v_space,auth.uid(),v_kind,p_provider,p_purpose,p_enabled,
      p_monthly_limit_cents,p_policy_version,
      case when p_enabled then now() else null end,case when p_enabled then null else now() end)
    on conflict(user_id,provider,purpose) do update set
      enabled=excluded.enabled,monthly_limit_cents=excluded.monthly_limit_cents,
      policy_version=excluded.policy_version,consented_at=excluded.consented_at,
      revoked_at=excluded.revoked_at,updated_at=clock_timestamp()
    returning * into v_row;
  if not p_enabled and p_purpose='generate_plan' then
    update public.ai_plan_preferences set plan_provider='rules',updated_at=clock_timestamp()
      where user_id=auth.uid() and plan_provider=p_provider;
  end if;
  return v_row;
end $$;
create or replace function public.set_ai_plan_provider(p_provider text) returns text
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_space uuid:=public.current_space_id();
begin
  if v_space is null then raise exception 'Space membership required'; end if;
  if p_provider is null or p_provider not in ('rules','openai','deepseek') then raise exception 'Invalid provider'; end if;
  if p_provider<>'rules' and not exists(select 1 from public.ai_provider_settings where provider=p_provider and health_enabled) then raise exception 'Provider health data is not enabled'; end if;
  if p_provider<>'rules' and not exists(select 1 from public.ai_consents
    where user_id=auth.uid() and provider=p_provider and purpose='generate_plan'
      and enabled and policy_version='2026-10-13-'||p_provider||'-health-v1')
  then raise exception 'AI consent unavailable'; end if;
  insert into public.ai_plan_preferences(user_id,space_id,plan_provider)
    values(auth.uid(),v_space,p_provider)
    on conflict(user_id) do update set plan_provider=excluded.plan_provider,
      updated_at=clock_timestamp();
  return p_provider;
end $$;
create or replace function public.reserve_ai_provider_usage(
  p_user uuid,p_provider text,p_purpose text,p_cents integer
) returns uuid language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_period date:=date_trunc('month',now() at time zone 'Asia/Shanghai')::date;
  v_global integer;v_provider_limit integer;v_personal integer;v_spent integer;v_id uuid;v_kind text;
begin
  if p_user is null or p_provider is null or p_provider not in ('openai','deepseek') or p_purpose is null or p_purpose not in
    ('parse_schedule','estimate_meal_text','estimate_meal_photo','generate_plan','adjust_plan')
    or p_cents is null or p_cents not between 1 and 100 then raise exception 'Invalid provider reservation'; end if;
  if not exists(select 1 from public.ai_provider_settings where provider=p_provider and health_enabled) then raise exception 'Provider health data is not enabled'; end if;
  v_kind:=case when p_purpose='estimate_meal_photo' then 'photo' else 'text' end;
  select limit_cents into v_global from public.ai_monthly_budgets where period=v_period for update;
  if not found then raise exception 'AI budget not configured'; end if;
  select limit_cents into v_provider_limit from public.ai_provider_budgets
    where period=v_period and provider=p_provider for update;
  if not found then raise exception 'Provider budget not configured'; end if;
  select monthly_limit_cents into v_personal from public.ai_consents c
    join public.fixed_accounts f on f.user_id=c.user_id and f.space_id=c.space_id
    join public.members m on m.user_id=f.user_id and m.space_id=f.space_id
    where c.user_id=p_user and c.provider=p_provider and c.purpose=p_purpose
      and c.enabled and c.policy_version='2026-10-13-'||p_provider||'-health-v1' for update of c;
  if not found then raise exception 'AI consent unavailable'; end if;
  if (select count(*) from public.ai_usage where user_id=p_user and created_at>=now()-interval '1 minute')>=3
     or (select count(*) from public.ai_usage where user_id=p_user
       and created_at>=((now() at time zone 'Asia/Shanghai')::date::timestamp at time zone 'Asia/Shanghai'))>=20
  then raise exception 'AI rate limit exceeded'; end if;
  select coalesce(sum(case when status='reserved' then reserved_cents else charged_cents end),0)::integer
    into v_spent from public.ai_usage where period=v_period;
  v_spent:=v_spent+(select coalesce(sum(case when status='reserved' then reserved_cents else charged_cents end),0)::integer
    from public.ai_probe_usage where period=v_period);
  if v_spent+p_cents>v_global then raise exception 'Global AI budget exceeded'; end if;
  select coalesce(sum(case when status='reserved' then reserved_cents else charged_cents end),0)::integer
    into v_spent from public.ai_usage where period=v_period and provider=p_provider;
  v_spent:=v_spent+(select coalesce(sum(case when status='reserved' then reserved_cents else charged_cents end),0)::integer
    from public.ai_probe_usage where period=v_period and provider=p_provider);
  if v_spent+p_cents>v_provider_limit then raise exception 'Provider AI budget exceeded'; end if;
  select coalesce(sum(case when status='reserved' then reserved_cents else charged_cents end),0)::integer
    into v_spent from public.ai_usage where period=v_period and user_id=p_user
      and provider=p_provider and purpose=p_purpose;
  if v_spent+p_cents>v_personal then raise exception 'Personal AI budget exceeded'; end if;
  insert into public.ai_usage(user_id,period,kind,provider,purpose,reserved_cents,status)
    values(p_user,v_period,v_kind,p_provider,p_purpose,p_cents,'reserved') returning id into v_id;
  return v_id;
end $$;

create or replace function public.require_current_ai_plan_consent() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.generation_jobs j join public.ai_consents c
    on c.user_id=j.user_id and c.provider=j.provider and c.purpose='generate_plan'
    join public.ai_provider_settings s on s.provider=c.provider and s.health_enabled
    where j.user_id=new.user_id and j.target_date=new.target_date and j.input_version=new.input_version
      and j.status='running' and c.enabled and c.policy_version='2026-10-13-'||j.provider||'-health-v1')
  then raise exception 'AI consent unavailable'; end if;
  return new;
end $$;
create function public.health_automatic_meals_allowed(p_owner uuid,p_date date,p_content jsonb) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r jsonb; m jsonb; title text;
begin
  select rules into r from public.health_rules where user_id=p_owner;
  if r->>'confirmed'='true' and r->>'free_day_meal_unrestricted'='true' and exists(select 1 from jsonb_array_elements_text(r->'free_weekdays') d where d::int=extract(isodow from p_date))
  then return p_content->'meals'='[]'::jsonb; end if;
  foreach title in array array['早餐','午餐','晚餐'] loop
    if (select count(*) from jsonb_array_elements(p_content->'meals') x where x->>'title'=title and jsonb_array_length(x->'foods')>0)<>1 then return false; end if;
  end loop;
  for m in select value from jsonb_array_elements(p_content->'meals') loop
    if jsonb_array_length(m->'foods')=0 then return false; end if;
    if m->>'title' not in ('早餐','午餐','晚餐') and nullif(m->>'snack_reason','') is null then return false; end if;
  end loop;
  return true;
end $$;
-- Preserve every 006 concurrency check; remove only the obsolete template prerequisite.
do $$ declare definition text; old_block text := $old$if v_rules is null or v_rules->>'confirmed'<>'true'
    or p_content->'meals' is distinct from
      (case when v_free then '[]'::jsonb else v_rules->'meal_template' end)
  then raise exception 'Unconfirmed automatic meals'; end if;$old$;
begin
  select replace(pg_get_functiondef('public.finish_generation_job(uuid,uuid,jsonb,text,text,text)'::regprocedure),chr(13),'') into definition;
  if position(old_block in definition)=0 then raise exception 'Unexpected finish_generation_job definition'; end if;
  execute replace(definition,old_block,'if not public.health_automatic_meals_allowed(v_job.user_id,v_job.target_date,p_content) then raise exception ''Invalid automatic meals''; end if;');
end $$;

create table public.meal_adjustments(
  id uuid primary key default gen_random_uuid(),space_id uuid not null,user_id uuid not null,record_date date not null,
  provider text not null check(provider in ('openai','deepseek')),base_plan_id uuid not null references public.daily_plans(id) on delete cascade,
  source_input_hash text not null,source_snapshot jsonb not null,content jsonb,
  attempts integer not null default 1 check(attempts between 1 and 3),
  status text not null default 'running' check(status in ('running','draft','applied','stale','failed','reverted')),
  applied_plan_id uuid references public.daily_plans(id) on delete set null,applied_input_hash text,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(user_id,provider,source_input_hash),foreign key(space_id,user_id) references public.members(space_id,user_id) on delete cascade
);
alter table public.meal_adjustments enable row level security;
create policy meal_adjustments_owner on public.meal_adjustments for select to authenticated using(user_id=auth.uid() and space_id=public.current_space_id());
revoke all on public.meal_adjustments from public,anon,authenticated;
grant select on public.meal_adjustments to authenticated;
grant select,insert,update,delete on public.meal_adjustments to service_role;

create function public.health_adjustment_snapshot(p_user uuid,p_date date) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
select jsonb_build_object('record_date',p_date,'slot',(select slot from public.fixed_accounts where user_id=p_user),
 'plan',(select to_jsonb(p) from public.daily_plans p where p.user_id=p_user and p.target_date=p_date and p.is_current),
 'confirmed_meals',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'data',m.data,'updated_at',m.updated_at) order by m.id) from public.meals m where m.user_id=p_user and m.record_date=p_date and m.status='confirmed'),'[]'::jsonb),
 'schedule',(select confirmed_data from public.schedules where user_id=p_user and record_date=p_date),
 'training_feedback',coalesce((select jsonb_agg(jsonb_build_object('status',t.status,'data',t.data,'updated_at',t.updated_at) order by t.id) from public.training_sessions t where t.user_id=p_user and t.record_date=p_date),'[]'::jsonb),
 'rules',(select rules from public.health_rules where user_id=p_user))
$$;
create function public.begin_meal_adjustment(p_user uuid,p_date date,p_provider text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s jsonb; h text; r public.meal_adjustments; sp uuid;
begin
  select space_id into sp from public.fixed_accounts where user_id=p_user;
  if sp is null or p_date<>(now() at time zone 'Asia/Shanghai')::date or p_provider not in ('openai','deepseek') then raise exception 'Invalid adjustment request'; end if;
  perform public.lock_health_owner(p_user,sp);
  s:=public.health_adjustment_snapshot(p_user,p_date); h:=md5(s::text);
  if s->'plan'='null'::jsonb or s->'plan'->>'is_locked'='true' then raise exception 'Current unlocked plan required'; end if;
  insert into public.meal_adjustments(space_id,user_id,record_date,provider,base_plan_id,source_input_hash,source_snapshot)
    values(sp,p_user,p_date,p_provider,(s->'plan'->>'id')::uuid,h,s) on conflict do nothing returning * into r;
  if r.id is not null then return jsonb_build_object('acquired',true,'adjustment',to_jsonb(r)); end if;
  select * into r from public.meal_adjustments where user_id=p_user and provider=p_provider and source_input_hash=h for update;
  if r.status='failed' and r.attempts<3 then
    update public.meal_adjustments set status='running',attempts=attempts+1,updated_at=clock_timestamp() where id=r.id returning * into r;
    return jsonb_build_object('acquired',true,'adjustment',to_jsonb(r));
  end if;
  return jsonb_build_object('acquired',false,'adjustment',to_jsonb(r));
end $$;

create function public.health_remaining_meal_indices(p_snapshot jsonb) returns integer[]
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(array_agg((x.n-1)::integer order by x.n),'{}'::integer[])
 from jsonb_array_elements(p_snapshot->'plan'->'content'->'meals') with ordinality x(m,n)
 where (x.m->>'time' is null or x.m->>'time'>to_char(now() at time zone 'Asia/Shanghai','HH24:MI'))
 and not exists(select 1 from jsonb_array_elements(p_snapshot->'confirmed_meals') c
  where case c->'data'->>'kind' when 'breakfast' then '早餐' when 'lunch' then '午餐' when 'dinner' then '晚餐' when 'snack' then '加餐' else '其他' end=x.m->>'title')
$$;
create function public.finish_meal_adjustment(p_id uuid,p_content jsonb) returns public.meal_adjustments
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.meal_adjustments; s jsonb; patched jsonb; change jsonb; idx integer; seen integer[]:='{}'; oldmeal jsonb;
begin
  select * into r from public.meal_adjustments where id=p_id for update;
  if not found or r.status<>'running' then raise exception 'Adjustment unavailable'; end if;
  if p_content is null then update public.meal_adjustments set status='failed',updated_at=clock_timestamp() where id=p_id returning * into r; return r; end if;
  s:=public.health_adjustment_snapshot(r.user_id,r.record_date);
  if md5(s::text)<>r.source_input_hash then update public.meal_adjustments set status='stale',updated_at=clock_timestamp() where id=p_id returning * into r; return r; end if;
  if jsonb_typeof(p_content->'reason') is distinct from 'string' or length(p_content->>'reason') not between 1 and 1000
    or jsonb_typeof(p_content->'meal_changes') is distinct from 'array' or jsonb_array_length(p_content->'meal_changes')>8
    or jsonb_typeof(p_content->'warnings') is distinct from 'array' then raise exception 'Invalid adjustment'; end if;
  patched:=s->'plan'->'content';
  for change in select value from jsonb_array_elements(p_content->'meal_changes') loop
    if change->>'meal_index' !~ '^[0-7]$' then raise exception 'Invalid meal index'; end if;
    idx:=(change->>'meal_index')::int;oldmeal:=patched->'meals'->idx;
    if not (idx=any(public.health_remaining_meal_indices(s))) or idx=any(seen)
      or change->'meal'->'title' is distinct from oldmeal->'title' or change->'meal'->'time' is distinct from oldmeal->'time'
      or jsonb_array_length(change->'meal'->'foods')=0 or nullif(change->>'reason','') is null then raise exception 'Invalid remaining meal change'; end if;
    seen:=array_append(seen,idx);patched:=jsonb_set(patched,array['meals',idx::text],change->'meal');
  end loop;
  if not public.health_valid_plan(patched) then raise exception 'Invalid adjustment plan'; end if;
  update public.meal_adjustments set status='draft',content=p_content,updated_at=clock_timestamp() where id=p_id returning * into r;
  return r;
end $$;
create function public.apply_meal_adjustment(p_id uuid,p_expected_updated_at timestamptz) returns public.meal_adjustments
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.meal_adjustments;s jsonb;p public.daily_plans;n public.daily_plans;patched jsonb;change jsonb;idx integer;
begin
  perform public.lock_health_owner(auth.uid(),public.current_space_id());
  select * into r from public.meal_adjustments where id=p_id and user_id=auth.uid() and space_id=public.current_space_id() for update;
  if not found then raise exception 'not found or access denied'; end if;
  if r.status='applied' then return r; end if;
  if r.status<>'draft' or p_expected_updated_at is distinct from r.updated_at then raise exception 'Edit conflict'; end if;
  if r.record_date<>(now() at time zone 'Asia/Shanghai')::date then raise exception 'Adjustment expired'; end if;
  s:=public.health_adjustment_snapshot(r.user_id,r.record_date);
  if md5(s::text)<>r.source_input_hash then raise exception 'Adjustment inputs changed'; end if;
  select * into p from public.daily_plans where id=r.base_plan_id and is_current for update;
  if not found or p.is_locked then raise exception 'Plan locked or replaced'; end if;
  patched:=p.content;
  for change in select value from jsonb_array_elements(r.content->'meal_changes') loop
    idx:=(change->>'meal_index')::int;
    if not (idx=any(public.health_remaining_meal_indices(s))) then raise exception 'Meal already eaten or time passed'; end if;
    patched:=jsonb_set(patched,array['meals',idx::text],change->'meal');
  end loop;
  if patched=p.content then raise exception 'No remaining meal changes'; end if;
  update public.daily_plans set is_current=false where id=p.id;
  insert into public.daily_plans(space_id,user_id,target_date,version,source,status,is_shared,input_version,content,updated_by)
    values(p.space_id,p.user_id,p.target_date,p.version+1,'manual','published',p.is_shared,
      public.health_input_version(p.user_id,p.target_date),patched,auth.uid()) returning * into n;
  update public.meal_adjustments set status='applied',applied_plan_id=n.id,
    applied_input_hash=md5(public.health_adjustment_snapshot(r.user_id,r.record_date)::text),updated_at=clock_timestamp() where id=r.id returning * into r;
  return r;
end $$;
create function public.undo_meal_adjustment(p_id uuid,p_expected_updated_at timestamptz) returns public.meal_adjustments
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.meal_adjustments;p public.daily_plans;b public.daily_plans;
begin
  perform public.lock_health_owner(auth.uid(),public.current_space_id());
  select * into r from public.meal_adjustments where id=p_id and user_id=auth.uid() and space_id=public.current_space_id() for update;
  if not found then raise exception 'not found or access denied'; end if;
  if r.status='reverted' then return r; end if;
  if r.status<>'applied' or p_expected_updated_at is distinct from r.updated_at then raise exception 'Edit conflict'; end if;
  if r.applied_input_hash is distinct from md5(public.health_adjustment_snapshot(r.user_id,r.record_date)::text) then raise exception 'Adjustment inputs changed'; end if;
  select * into p from public.daily_plans where id=r.applied_plan_id and is_current for update;
  if not found or p.is_locked then raise exception 'Plan locked or replaced'; end if;
  select * into b from public.daily_plans where id=r.base_plan_id;
  if not found then raise exception 'Original plan unavailable'; end if;
  update public.daily_plans set is_current=false where id=p.id;
  insert into public.daily_plans(space_id,user_id,target_date,version,source,status,is_shared,input_version,content,updated_by)
    values(p.space_id,p.user_id,p.target_date,p.version+1,'manual','published',p.is_shared,
      public.health_input_version(p.user_id,p.target_date),b.content,auth.uid());
  update public.meal_adjustments set status='reverted',updated_at=clock_timestamp() where id=r.id returning * into r;
  return r;
end $$;
create function public.invalidate_meal_adjustments() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op<>'INSERT' then update public.meal_adjustments set status='stale',updated_at=clock_timestamp()
    where user_id=old.user_id and status='draft'; end if;
  if tg_op<>'DELETE' then update public.meal_adjustments set status='stale',updated_at=clock_timestamp()
    where user_id=new.user_id and status='draft';return new; end if;
  return old;
end $$;
create trigger invalidate_meal_adjustments after insert or update or delete on public.meals for each row execute function public.invalidate_meal_adjustments();
create trigger invalidate_schedule_adjustments after insert or update or delete on public.schedules for each row execute function public.invalidate_meal_adjustments();
create trigger invalidate_training_adjustments after insert or update or delete on public.training_sessions for each row execute function public.invalidate_meal_adjustments();
create trigger invalidate_rules_adjustments after insert or update or delete on public.health_rules for each row execute function public.invalidate_meal_adjustments();
-- A changed food or oil quantity is a new estimation input. Keeping the old
-- number would be false precision; obtain a fresh estimate or enter one explicitly.
create function public.invalidate_changed_meal_estimate() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if (new.data->'items' is distinct from old.data->'items' or new.data->'cooking' is distinct from old.data->'cooking'
   or new.data->'oil' is distinct from old.data->'oil') and new.data->'estimate' is not distinct from old.data->'estimate'
 then new.data:=jsonb_set(new.data,'{estimate}','null'::jsonb); end if;
 return new;
end $$;
create trigger invalidate_changed_meal_estimate before update of data on public.meals for each row execute function public.invalidate_changed_meal_estimate();
revoke all on function public.invalidate_changed_meal_estimate() from public,anon,authenticated;
revoke all on function public.health_automatic_meals_allowed(uuid,date,jsonb),public.health_adjustment_snapshot(uuid,date),public.health_remaining_meal_indices(jsonb),
 public.begin_meal_adjustment(uuid,date,text),public.finish_meal_adjustment(uuid,jsonb),public.apply_meal_adjustment(uuid,timestamptz),public.undo_meal_adjustment(uuid,timestamptz),public.invalidate_meal_adjustments()
 from public,anon,authenticated;
grant execute on function public.health_adjustment_snapshot(uuid,date),public.health_remaining_meal_indices(jsonb),public.begin_meal_adjustment(uuid,date,text),public.finish_meal_adjustment(uuid,jsonb) to service_role;
grant execute on function public.apply_meal_adjustment(uuid,timestamptz),public.undo_meal_adjustment(uuid,timestamptz) to authenticated;

alter function public.health_plan_allowed(uuid,date,jsonb) rename to health_plan_allowed_004;
do $$ declare definition text;begin
 select replace(pg_get_functiondef('public.health_plan_allowed_004(uuid,date,jsonb)'::regprocedure),chr(13),'') into definition;
 definition:=replace(definition,'if v_rules is not null and v_rules->>''free_day_meal_unrestricted''=',
   'if v_rules->>''confirmed''=''true'' and v_rules->>''free_day_meal_unrestricted''=');
 definition:=replace(definition,$old$or (v_schedule.confirmed_data->'exercise'->>'intent'='yes'
      and v_schedule.confirmed_data->'exercise'->'duration_minutes' is distinct from 'null'::jsonb
      and v_schedule.confirmed_data->'exercise' ? 'duration_minutes')$old$,
   $new$or ((v_schedule.exercise_intent='yes' or v_schedule.confirmed_data->'exercise'->>'intent'='yes')
      and coalesce(v_schedule.confirmed_data->'exercise'->>'type','') not in
        ('力量训练','健身','器械力量训练','器械训练','strength','strength_training','gym'))$new$);
 definition:=replace(definition,'  for v_item in select value from jsonb_array_elements(v_training->''items'') loop',
 $time$  if v_schedule.confirmed_data->'exercise'->>'explicit_start_time' is not null then
    if (v_schedule.confirmed_data->'exercise'->>'explicit_start_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or v_training->>'time' is distinct from v_schedule.confirmed_data->'exercise'->>'explicit_start_time'
    then return false; end if;
  end if;
  if v_schedule.confirmed_data->'exercise'->>'explicit_end_time' is not null then
    if v_schedule.confirmed_data->'exercise'->>'explicit_start_time' is null
      or (v_schedule.confirmed_data->'exercise'->>'explicit_end_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    then return false; end if;
    if (v_schedule.confirmed_data->'exercise'->>'explicit_end_time')::time <= (v_schedule.confirmed_data->'exercise'->>'explicit_start_time')::time
      or (v_training->>'total_seconds')::integer>extract(epoch from
        ((v_schedule.confirmed_data->'exercise'->>'explicit_end_time')::time-(v_schedule.confirmed_data->'exercise'->>'explicit_start_time')::time))
    then return false; end if;
  end if;
  if v_schedule.confirmed_data->'exercise'->>'duration_minutes' is not null then
    if (v_schedule.confirmed_data->'exercise'->>'duration_minutes') !~ '^[0-9]{1,3}$' then return false; end if;
    if (v_training->>'total_seconds')::integer>(v_schedule.confirmed_data->'exercise'->>'duration_minutes')::integer*60 then return false; end if;
  end if;
  for v_item in select value from jsonb_array_elements(v_training->'items') loop$time$);
 if position('coalesce(v_schedule.confirmed_data->''exercise''->>''type'','''')' in definition)=0
   or position('explicit_end_time' in definition)=0 then raise exception 'Unexpected health plan policy definition'; end if;
 execute definition;
end $$;
revoke all on function public.health_plan_allowed_004(uuid,date,jsonb) from public,anon,authenticated,service_role;
create function public.health_plan_allowed(p_owner uuid,p_date date,p_content jsonb) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.health_plan_allowed_004(p_owner,p_date,p_content) and not
 (extract(isodow from p_date)=2 and exists(select 1 from public.fixed_accounts where user_id=p_owner and slot='w') and p_content->'training'->>'mode'<>'rest')
$$;
revoke all on function public.health_plan_allowed(uuid,date,jsonb) from public,anon,authenticated;
grant execute on function public.health_plan_allowed(uuid,date,jsonb) to service_role;
do $$ declare definition text;begin
 select pg_get_functiondef('public.erase_own_health_data()'::regprocedure) into definition;
 execute replace(definition,'  delete from public.ai_consents where user_id=auth.uid();',
 '  delete from public.ai_request_results where user_id=auth.uid(); delete from public.meal_adjustments where user_id=auth.uid(); delete from public.ai_consents where user_id=auth.uid();');
end $$;

-- All mutable inputs use the same space/owner lock before their existing row locks.
-- This makes confirmation vs. input editing a serial decision, not a stale read.
do $$ declare signature text;definition text;lock_statement text;
begin
 foreach signature in array array['public.save_meal(jsonb,uuid)','public.save_training_session(jsonb,uuid)',
  'public.save_confirmed_schedule(jsonb,uuid)','public.save_health_rules(jsonb,boolean,timestamp with time zone)',
  'public.save_daily_plan(date,jsonb,integer,boolean,uuid)','public.delete_meal(uuid)','public.delete_training_session(uuid)'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  lock_statement:='perform public.lock_health_owner(auth.uid(),public.current_space_id());';
  -- A partner edit shares the space lock first, so it also serializes with its owner.
  execute regexp_replace(definition,E'\\mbegin\\M',E'begin\n  '||lock_statement,'i');
 end loop;
end $$;
$daily_body$; registered text[]; registered_name text;
begin
 body:=replace(body,chr(13)||chr(10),chr(10));
 if md5(body) is distinct from 'a5d069d7931d57a8c9c103d68de54b85' then raise exception 'Migration source mismatch: 202610140007'; end if;
 select statements,name into registered,registered_name from supabase_migrations.schema_migrations where version='202610140007';
 if found then
  if cardinality(registered) is distinct from 1 or md5(registered[1]) is distinct from 'a5d069d7931d57a8c9c103d68de54b85' or registered_name is distinct from 'daily_flow'
  then raise exception 'Migration history mismatch: 202610140007'; end if;
 else
  execute body;
  insert into supabase_migrations.schema_migrations(version,statements,name) values('202610140007',array[body],'daily_flow');
 end if;
end $daily_apply$;

do $daily_apply$
declare body text := $daily_body$-- Explicit records of actual activity; existing strength/timer records are unchanged.
create function public.health_activity_schema_version() returns integer
language sql stable security definer set search_path=public,pg_temp as $$ select 8 $$;
revoke all on function public.health_activity_schema_version() from public,anon;
grant execute on function public.health_activity_schema_version() to authenticated;

alter function public.health_valid_record(jsonb,text) rename to health_valid_record_004;
revoke all on function public.health_valid_record_004(jsonb,text) from public,anon,authenticated,service_role;
create function public.health_valid_record(p_data jsonb,p_kind text) returns boolean
language plpgsql immutable security definer set search_path=public,pg_temp as $$
declare v_start timestamptz;v_end timestamptz;v_seconds integer;v_date date;
begin
 if p_kind<>'training' or not (p_data ? 'activity_type') then
  return public.health_valid_record_004(p_data,p_kind);
 end if;
 if jsonb_typeof(p_data) is distinct from 'object' or length(p_data::text)>30000
  or not (p_data ?& array['plan_id','status','started_at','active_since','rest_until','rest_remaining_seconds','ended_at','elapsed_seconds','stop_reason','sets','record_date','activity_type','duration_seconds','intensity','pain','notes'])
  or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('plan_id','status','started_at','active_since','rest_until','rest_remaining_seconds','ended_at','elapsed_seconds','stop_reason','sets','record_date','activity_type','duration_seconds','intensity','pain','notes'))
  or jsonb_typeof(p_data->'activity_type') is distinct from 'string'
  or jsonb_typeof(p_data->'status') is distinct from 'string'
  or jsonb_typeof(p_data->'intensity') is distinct from 'string'
  or jsonb_typeof(p_data->'pain') is distinct from 'string'
  or p_data->>'activity_type' not in ('badminton','strength','other')
  or p_data->>'status' not in ('completed','stopped')
  or p_data->>'intensity' not in ('light','moderate','vigorous')
  or p_data->>'pain' not in ('none','mild','moderate','severe')
  or jsonb_typeof(p_data->'notes') is distinct from 'string' or length(p_data->>'notes')>1000
  or jsonb_typeof(p_data->'record_date') is distinct from 'string'
  or p_data->>'record_date' !~ '^\d{4}-\d{2}-\d{2}$'
  or jsonb_typeof(p_data->'duration_seconds') is distinct from 'number'
  or (p_data->>'duration_seconds') !~ '^[0-9]{1,5}$'
  or p_data->'elapsed_seconds' is distinct from p_data->'duration_seconds'
  or p_data->'plan_id' is distinct from 'null'::jsonb
  or p_data->'sets' is distinct from '[]'::jsonb
  or p_data->'active_since' is distinct from 'null'::jsonb
  or p_data->'rest_until' is distinct from 'null'::jsonb or p_data->'rest_remaining_seconds' is distinct from '0'::jsonb
  or (p_data->'stop_reason'<>'null'::jsonb and (jsonb_typeof(p_data->'stop_reason') is distinct from 'string' or length(p_data->>'stop_reason')>1000))
 then return false; end if;
 v_seconds:=(p_data->>'duration_seconds')::integer;v_date:=(p_data->>'record_date')::date;
 if v_seconds not between 1 and 86400 or v_date not between date '1900-01-01' and date '2100-12-31' then return false; end if;
 -- Missing actual times stay null. The explicit date means the completion date.
 if p_data->'started_at'='null'::jsonb and p_data->'ended_at'='null'::jsonb then return true; end if;
 if jsonb_typeof(p_data->'started_at') is distinct from 'string' or jsonb_typeof(p_data->'ended_at') is distinct from 'string'
  or p_data->>'started_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
  or p_data->>'ended_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
 then return false; end if;
 v_start:=(p_data->>'started_at')::timestamptz;v_end:=(p_data->>'ended_at')::timestamptz;
 return v_end>=v_start+make_interval(secs=>v_seconds) and (v_end at time zone 'Asia/Shanghai')::date=v_date
  and (v_start at time zone 'Asia/Shanghai')::date between date '1900-01-01' and date '2100-12-31';
exception when invalid_datetime_format or datetime_field_overflow then return false;
end $$;
revoke all on function public.health_valid_record(jsonb,text) from public,anon,authenticated;

-- A durable receipt survives deletion of its record, so a delayed create retry
-- cannot recreate something the owner has already deleted. Only a SHA256 digest,
-- never deleted health content, remains in the receipt. Erasure removes it.
create table public.record_create_requests(
 user_id uuid not null,space_id uuid not null,client_request_id uuid not null,
 kind text not null check(kind in ('meal','training')),request_hash bytea not null check(octet_length(request_hash)=32),record_id uuid not null,
 created_at timestamptz not null default now(),primary key(user_id,client_request_id),
 foreign key(space_id,user_id) references public.members(space_id,user_id) on delete cascade
);
alter table public.record_create_requests enable row level security;
revoke all on public.record_create_requests from public,anon,authenticated,service_role;

alter function public.save_meal(jsonb,uuid) rename to save_meal_007;
alter function public.save_training_session(jsonb,uuid) rename to save_training_session_007;
revoke all on function public.save_meal_007(jsonb,uuid),public.save_training_session_007(jsonb,uuid)
 from public,anon,authenticated,service_role;

-- Use the explicit completion date for external activity without manufacturing times.
do $$ declare definition text;anchor text := $anchor$v_date := ((v_data->>'started_at')::timestamptz at time zone 'Asia/Shanghai')::date;$anchor$;
begin
 select pg_get_functiondef('public.save_training_session_007(jsonb,uuid)'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'Unexpected save_training_session definition'; end if;
 execute replace(definition,anchor,$replacement$v_date := case when v_data ? 'activity_type' then (v_data->>'record_date')::date else ((v_data->>'started_at')::timestamptz at time zone 'Asia/Shanghai')::date end;$replacement$);
end $$;

create function public.save_meal(p_payload jsonb,p_id uuid default null) returns public.meals
language plpgsql security definer set search_path=public,pg_temp as $$
declare request_id uuid;receipt public.record_create_requests;result public.meals;payload jsonb:=p_payload-'client_request_id';
begin
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid meal'; end if;
 if p_id is not null or not (p_payload ? 'client_request_id') then return public.save_meal_007(payload,p_id); end if;
 if jsonb_typeof(p_payload->'client_request_id') is distinct from 'string'
  or p_payload->>'client_request_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then raise exception 'Invalid client request ID'; end if;
 request_id:=(p_payload->>'client_request_id')::uuid;
 perform public.lock_health_owner(auth.uid(),public.current_space_id());
 select * into receipt from public.record_create_requests where user_id=auth.uid() and client_request_id=request_id;
 if found then
  if receipt.kind<>'meal' or receipt.request_hash is distinct from sha256(convert_to(payload::text,'UTF8')) then raise exception 'Create request payload conflict'; end if;
  select * into result from public.meals where id=receipt.record_id and user_id=auth.uid() and space_id=public.current_space_id();
  if not found then raise exception 'Create request record was deleted'; end if;
  return result;
 end if;
 result:=public.save_meal_007(payload,null);
 insert into public.record_create_requests(user_id,space_id,client_request_id,kind,request_hash,record_id)
  values(auth.uid(),result.space_id,request_id,'meal',sha256(convert_to(payload::text,'UTF8')),result.id);
 return result;
end $$;

create function public.save_training_session(p_payload jsonb,p_id uuid default null) returns public.training_sessions
language plpgsql security definer set search_path=public,pg_temp as $$
declare request_id uuid;receipt public.record_create_requests;result public.training_sessions;payload jsonb:=p_payload-'client_request_id';
begin
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid training session'; end if;
 if payload->'data' ? 'activity_type' then
  if public.health_valid_record(payload->'data','training') is distinct from true
   or (payload->'data'->>'record_date')::date>(now() at time zone 'Asia/Shanghai')::date
   or (payload->'data'->>'ended_at')::timestamptz>now()
  then raise exception 'Invalid actual activity'; end if;
 end if;
 if p_id is not null or not (p_payload ? 'client_request_id') then return public.save_training_session_007(payload,p_id); end if;
 if jsonb_typeof(p_payload->'client_request_id') is distinct from 'string'
  or p_payload->>'client_request_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then raise exception 'Invalid client request ID'; end if;
 request_id:=(p_payload->>'client_request_id')::uuid;
 perform public.lock_health_owner(auth.uid(),public.current_space_id());
 select * into receipt from public.record_create_requests where user_id=auth.uid() and client_request_id=request_id;
 if found then
  if receipt.kind<>'training' or receipt.request_hash is distinct from sha256(convert_to(payload::text,'UTF8')) then raise exception 'Create request payload conflict'; end if;
  select * into result from public.training_sessions where id=receipt.record_id and user_id=auth.uid() and space_id=public.current_space_id();
  if not found then raise exception 'Create request record was deleted'; end if;
  return result;
 end if;
 result:=public.save_training_session_007(payload,null);
 insert into public.record_create_requests(user_id,space_id,client_request_id,kind,request_hash,record_id)
  values(auth.uid(),result.space_id,request_id,'training',sha256(convert_to(payload::text,'UTF8')),result.id);
 return result;
end $$;
revoke all on function public.save_meal(jsonb,uuid),public.save_training_session(jsonb,uuid) from public,anon;
grant execute on function public.save_meal(jsonb,uuid),public.save_training_session(jsonb,uuid) to authenticated;

do $$ declare definition text;anchor text:='  delete from public.generation_jobs where user_id=auth.uid();';begin
 select pg_get_functiondef('public.erase_own_health_data()'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'Unexpected erase_own_health_data definition'; end if;
 execute replace(definition,anchor,'  delete from public.record_create_requests where user_id=auth.uid();'||chr(10)||anchor);
end $$;

create function public.health_activity_performed(p_status text,p_data jsonb) returns boolean
language sql immutable security definer set search_path=public,pg_temp as $$
 select p_status='completed' or (p_status='stopped' and
  (coalesce(p_data->>'duration_seconds',p_data->>'elapsed_seconds','0')::numeric>0
   or exists(select 1 from jsonb_array_elements(p_data->'sets') s where nullif(s->>'completed_at','') is not null)))
$$;
revoke all on function public.health_activity_performed(text,jsonb) from public,anon,authenticated;

-- An explicit date-only completion bounds its end by next Shanghai midnight.
-- This is a recovery bound, never a fabricated stored time.
create function public.health_activity_end_bound(p_date date,p_data jsonb) returns timestamptz
language sql stable security definer set search_path=public,pg_temp as $$
 select case when nullif(p_data->>'ended_at','') is not null then (p_data->>'ended_at')::timestamptz
  when p_data ? 'activity_type' then (p_date+1)::timestamp at time zone 'Asia/Shanghai' else null end
$$;
revoke all on function public.health_activity_end_bound(date,jsonb) from public,anon,authenticated;

-- Actual non-strength activity affects recovery, never the weekly strength count.
do $$ declare definition text;anchor text:='  if v_training->>''mode''=''rest'' then return true; end if;';begin
 select pg_get_functiondef('public.health_plan_allowed_004(uuid,date,jsonb)'::regprocedure) into definition;
 if position(anchor in definition)=0 or position('t.status=''completed''' in definition)=0 then
  raise exception 'Unexpected health_plan_allowed_004 definition'; end if;
 definition:=replace(definition,'t.status=''completed''','public.health_activity_performed(t.status,t.data)');
 definition:=replace(definition,'and t.record_date between p_date-(v_weekday-1)',
  'and coalesce(t.data->>''activity_type'',''strength'')=''strength'' and t.record_date between p_date-(v_weekday-1)');
 definition:=replace(definition,anchor,anchor||chr(10)||
  '  if exists(select 1 from public.training_sessions t where t.user_id=p_owner and t.record_date between p_date-8 and p_date and public.health_activity_performed(t.status,t.data) and public.health_activity_end_bound(t.record_date,t.data) is null) then return false; end if;');
 definition:=replace(definition,'(t.data->>''ended_at'')::timestamptz','public.health_activity_end_bound(t.record_date,t.data)');
 definition:=replace(definition,'< ((p_date+1)::timestamp at time zone ''Asia/Shanghai'')','<= ((p_date+1)::timestamp at time zone ''Asia/Shanghai'')');
 execute definition;
end $$;
$daily_body$; registered text[]; registered_name text;
begin
 body:=replace(body,chr(13)||chr(10),chr(10));
 if md5(body) is distinct from '51fba87f159fb01a44d55920fc7d0891' then raise exception 'Migration source mismatch: 202610140008'; end if;
 select statements,name into registered,registered_name from supabase_migrations.schema_migrations where version='202610140008';
 if found then
  if cardinality(registered) is distinct from 1 or md5(registered[1]) is distinct from '51fba87f159fb01a44d55920fc7d0891' or registered_name is distinct from 'activities'
  then raise exception 'Migration history mismatch: 202610140008'; end if;
 else
  execute body;
  insert into supabase_migrations.schema_migrations(version,statements,name) values('202610140008',array[body],'activities');
 end if;
end $daily_apply$;
commit;

-- Lifecycle state is committed before Storage receives bytes. Every lifecycle RPC
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

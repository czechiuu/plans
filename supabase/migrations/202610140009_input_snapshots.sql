-- Private, immutable source evidence for new generations. Never backfill history.
create function public.health_input_snapshot(p_owner uuid,p_date date) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
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
 )
$$;
revoke all on function public.health_input_snapshot(uuid,date) from public,anon,authenticated;
grant execute on function public.health_input_snapshot(uuid,date) to service_role;
create or replace function public.health_input_version(p_owner uuid,p_date date) returns text
language sql stable security definer set search_path=public,pg_temp as $$
 select md5(public.health_input_snapshot(p_owner,p_date)::text)
$$;

create function public.health_input_snapshot_schema_version() returns integer
language sql stable security definer set search_path=public,pg_temp as $$ select 9 $$;
revoke all on function public.health_input_snapshot_schema_version() from public,anon;
grant execute on function public.health_input_snapshot_schema_version() to authenticated;

create table public.generation_input_snapshots(
 job_id uuid not null references public.generation_jobs(id) on delete cascade,
 input_version text not null,
 space_id uuid not null,user_id uuid not null,target_date date not null,
 source_snapshot jsonb not null check(jsonb_typeof(source_snapshot)='object'),
 plan_id uuid references public.daily_plans(id) on delete cascade,
 captured_at timestamptz not null default clock_timestamp(),
 primary key(job_id,input_version),
 foreign key(space_id,user_id) references public.members(space_id,user_id) on delete cascade,
 check(input_version=md5(source_snapshot::text))
);
create index generation_input_snapshots_plan on public.generation_input_snapshots(plan_id) where plan_id is not null;
alter table public.generation_input_snapshots enable row level security;
revoke all on public.generation_input_snapshots from public,anon,authenticated,service_role;
grant select on public.generation_input_snapshots to authenticated,service_role;
create policy generation_input_snapshots_owner on public.generation_input_snapshots for select to authenticated
 using(user_id=auth.uid() and space_id=public.current_space_id());
create policy generation_input_snapshots_service on public.generation_input_snapshots for select to service_role using(true);

-- Leave already exhausted/succeeded historical rows byte-for-byte unchanged.
-- A running old worker cannot publish evidence that was never captured.
update public.generation_jobs set status='exhausted',error_code='INPUT_SNAPSHOT_UNAVAILABLE',
 lease_until=null,claim_token=null,updated_at=clock_timestamp()
 where status in ('queued','running','failed');

create function public.capture_generation_input() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_source jsonb;v_existing public.generation_input_snapshots;v_capture boolean;
begin
 if tg_op='UPDATE' and (new.id,new.user_id,new.space_id,new.target_date) is distinct from
   (old.id,old.user_id,old.space_id,old.target_date) then raise exception 'Generation identity is immutable'; end if;
 select * into v_existing from public.generation_input_snapshots where job_id=new.id and input_version=new.input_version;
 v_capture:=tg_op='INSERT' or (tg_op='UPDATE' and new.input_version is distinct from old.input_version)
   or (tg_op='UPDATE' and new.status='queued' and old.status not in ('queued','running') and v_existing.job_id is null);
 if v_capture then
  perform public.lock_health_owner(new.user_id,new.space_id);
  v_source:=public.health_input_snapshot(new.user_id,new.target_date);
  if new.input_version is distinct from md5(v_source::text) then raise exception 'Generation input changed before snapshot'; end if;
  if v_existing.job_id is not null and v_existing.source_snapshot is distinct from v_source
    then raise exception 'Generation snapshot hash collision'; end if;
  insert into public.generation_input_snapshots(job_id,input_version,space_id,user_id,target_date,source_snapshot)
   values(new.id,new.input_version,new.space_id,new.user_id,new.target_date,v_source) on conflict do nothing;
 end if;
 if new.status in ('queued','running','failed','succeeded') and not exists(
  select 1 from public.generation_input_snapshots where job_id=new.id and input_version=new.input_version)
  and (tg_op='INSERT' or new.status is distinct from old.status or new.plan_id is distinct from old.plan_id)
 then raise exception 'Generation input snapshot unavailable'; end if;
 if new.status='succeeded' and new.plan_id is not null and
  (tg_op='INSERT' or new.status is distinct from old.status or new.plan_id is distinct from old.plan_id) then
  if not exists(select 1 from public.daily_plans p where p.id=new.plan_id and p.user_id=new.user_id
    and p.space_id=new.space_id and p.target_date=new.target_date and p.input_version=new.input_version)
  then raise exception 'Plan does not match generation snapshot'; end if;
  update public.generation_input_snapshots set plan_id=new.plan_id
   where job_id=new.id and input_version=new.input_version and (plan_id is null or plan_id=new.plan_id);
  if not found then raise exception 'Generation snapshot already published'; end if;
 end if;
 return new;
end $$;
revoke all on function public.capture_generation_input() from public,anon,authenticated,service_role;
create trigger generation_input_capture after insert or update on public.generation_jobs
 for each row execute function public.capture_generation_input();

-- Serialize source writes before their row locks, using the same order as capture.
-- The 007/008 meal, training, rules and plan-save entry points already do this.
do $$ declare signature text;definition text;begin
 foreach signature in array array['public.save_profile(jsonb)','public.save_schedule(jsonb,uuid)',
  'public.save_weight(jsonb,uuid)','public.delete_schedule(uuid)','public.delete_weight(uuid)',
  'public.confirm_training_history(timestamp with time zone)',
  'public.set_plan_lock(uuid,boolean,timestamp with time zone)',
  'public.request_plan_generation(date,text)','public.retry_generation_job(uuid)'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  execute regexp_replace(definition,E'\\mbegin\\M',E'begin\n perform public.lock_health_owner(auth.uid(),public.current_space_id());','i');
 end loop;
end $$;

-- A deliberate new request may capture today's input for a legacy job, but never
-- labels an already-published historical plan with newly reconstructed evidence.
do $$ declare definition text;anchor text;begin
 select pg_get_functiondef('public.request_plan_generation(date,text)'::regprocedure) into definition;
 anchor:='and public.generation_jobs.input_version is distinct from v_input';
 if position(anchor in definition)=0 then raise exception 'Unexpected request_plan_generation definition'; end if;
 execute replace(definition,anchor,'and (public.generation_jobs.input_version is distinct from v_input or not exists
  (select 1 from public.generation_input_snapshots s where s.job_id=public.generation_jobs.id and s.input_version=v_input))');
 select pg_get_functiondef('public.finish_generation_job(uuid,uuid,jsonb,text,text,text)'::regprocedure) into definition;
 anchor:='  perform 1 from public.members where user_id=v_user and space_id=v_space for update;';
 if position(anchor in definition)=0 then raise exception 'Unexpected finish_generation_job lock'; end if;
 definition:=replace(definition,anchor,'  perform public.lock_health_owner(v_user,v_space);');
 anchor:='and v_old.input_version=p_input_version then';
 if position(anchor in definition)=0 then raise exception 'Unexpected finish_generation_job reuse'; end if;
 definition:=replace(definition,anchor,'and v_old.input_version=p_input_version and exists
   (select 1 from public.generation_input_snapshots s where s.plan_id=v_old.id and s.input_version=p_input_version) then');
 execute definition;
end $$;

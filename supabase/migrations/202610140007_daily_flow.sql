-- Daily AI flow. No production budget or provider preference is increased or switched.
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

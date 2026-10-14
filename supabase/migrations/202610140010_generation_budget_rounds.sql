-- A snapshot records immutable input; each successful claim records its own publication.
alter table public.generation_input_snapshots
 drop constraint generation_input_snapshots_plan_id_fkey,
 add constraint generation_input_snapshots_plan_id_fkey foreign key(plan_id)
   references public.daily_plans(id) on delete set null;
create table public.generation_publications(
 job_id uuid not null,input_version text not null,
 claim_token uuid not null,attempt integer not null check(attempt>0),
 plan_id uuid not null,
 published_at timestamptz not null default clock_timestamp(),
 primary key(job_id,claim_token),
 foreign key(job_id,input_version) references public.generation_input_snapshots(job_id,input_version) on delete cascade
);
create index generation_publications_plan on public.generation_publications(plan_id);
alter table public.generation_publications enable row level security;
revoke all on public.generation_publications from public,anon,authenticated,service_role;
grant select on public.generation_publications to service_role;
create policy generation_publications_service on public.generation_publications for select to service_role using(true);

create or replace function public.capture_generation_input() returns trigger
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
  if tg_op<>'UPDATE' or old.status<>'running' or old.claim_token is null
    then raise exception 'Generation publication requires a claim'; end if;
  if not exists(select 1 from public.daily_plans p where p.id=new.plan_id and p.user_id=new.user_id
    and p.space_id=new.space_id and p.target_date=new.target_date and p.input_version=new.input_version)
  then raise exception 'Plan does not match generation snapshot'; end if;
  insert into public.generation_publications(job_id,input_version,claim_token,attempt,plan_id)
    values(new.id,new.input_version,old.claim_token,new.attempts,new.plan_id);
  update public.generation_input_snapshots set plan_id=new.plan_id
    where job_id=new.id and input_version=new.input_version and plan_id is null;
 end if;
 return new;
end $$;

-- 009 allowed reuse only through the first plan_id; later publications are equally valid.
do $$ declare definition text;anchor text;begin
 select pg_get_functiondef('public.finish_generation_job(uuid,uuid,jsonb,text,text,text)'::regprocedure) into definition;
 anchor:='and exists
   (select 1 from public.generation_input_snapshots s where s.plan_id=v_old.id and s.input_version=p_input_version) then';
 if position(anchor in definition)=0 then raise exception 'Unexpected finish_generation_job snapshot guard'; end if;
 execute replace(definition,anchor,
  'and (exists (select 1 from public.generation_input_snapshots s where s.plan_id=v_old.id and s.input_version=p_input_version)
    or exists (select 1 from public.generation_publications p where p.plan_id=v_old.id and p.input_version=p_input_version)) then');
end $$;

-- Both reservation paths use the same charged-plus-live-reserved accounting.
create function public.ai_budget_spent(p_period date,p_provider text default null,p_user uuid default null,p_purpose text default null)
returns integer language sql stable security definer set search_path=public,pg_temp as $$
 select (
  select coalesce(sum(case status when 'reserved' then reserved_cents when 'settled' then charged_cents else 0 end),0)
   from public.ai_usage where period=p_period and (p_provider is null or provider=p_provider)
    and (p_user is null or user_id=p_user) and (p_purpose is null or purpose=p_purpose)
 )::integer+(
  select coalesce(sum(case status when 'reserved' then reserved_cents when 'settled' then charged_cents else 0 end),0)
   from public.ai_probe_usage where period=p_period and p_user is null and p_purpose is null
    and (p_provider is null or provider=p_provider)
 )::integer
$$;
revoke all on function public.ai_budget_spent(date,text,uuid,text) from public,anon,authenticated,service_role;

create or replace function public.reserve_ai_provider_usage(
  p_user uuid,p_provider text,p_purpose text,p_cents integer
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_period date:=date_trunc('month',now() at time zone 'Asia/Shanghai')::date;
 v_global integer;v_provider_limit integer;v_personal integer;v_id uuid;v_kind text;
begin
 if p_user is null or p_provider is null or p_provider not in ('openai','deepseek') or p_purpose is null or p_purpose not in
   ('parse_schedule','estimate_meal_text','estimate_meal_photo','generate_plan','adjust_plan')
   or p_cents is null or p_cents not between 1 and 100 then raise exception 'Invalid provider reservation'; end if;
 if not exists(select 1 from public.ai_provider_settings where provider=p_provider and health_enabled)
   then raise exception 'Provider health data is not enabled'; end if;
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
 if public.ai_budget_spent(v_period)+p_cents>v_global then raise exception 'Global AI budget exceeded'; end if;
 if public.ai_budget_spent(v_period,p_provider)+p_cents>v_provider_limit then raise exception 'Provider AI budget exceeded'; end if;
 if public.ai_budget_spent(v_period,p_provider,p_user,p_purpose)+p_cents>v_personal then raise exception 'Personal AI budget exceeded'; end if;
 insert into public.ai_usage(user_id,period,kind,provider,purpose,reserved_cents,status)
   values(p_user,v_period,v_kind,p_provider,p_purpose,p_cents,'reserved') returning id into v_id;
 return v_id;
end $$;

create or replace function public.reserve_ai_probe(p_purpose text,p_cents integer) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_period date:=date_trunc('month',now() at time zone 'Asia/Shanghai')::date;
 v_global integer;v_provider_limit integer;v_id uuid;
begin
 if p_purpose is null or p_purpose not in ('parse_schedule','estimate_meal_text','estimate_meal_photo','generate_plan')
   or p_cents is null or p_cents not between 1 and 10 then raise exception 'Invalid probe reservation'; end if;
 select limit_cents into v_global from public.ai_monthly_budgets where period=v_period for update;
 if not found then raise exception 'AI budget not configured'; end if;
 select limit_cents into v_provider_limit from public.ai_provider_budgets
   where period=v_period and provider='deepseek' for update;
 if not found then raise exception 'DeepSeek probe budget not configured'; end if;
 if public.ai_budget_spent(v_period)+p_cents>v_global then raise exception 'Global AI budget exceeded'; end if;
 if public.ai_budget_spent(v_period,'deepseek')+p_cents>v_provider_limit then raise exception 'DeepSeek probe budget exceeded'; end if;
 insert into public.ai_probe_usage(period,provider,purpose,reserved_cents,status)
   values(v_period,'deepseek',p_purpose,p_cents,'reserved') returning id into v_id;
 return v_id;
end $$;

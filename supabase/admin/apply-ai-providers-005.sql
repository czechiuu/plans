-- Generated from reviewed local migration. No passwords, keys or user IDs.
-- SQL Editor clipboard CRLF is normalized before source verification and registration.
begin;
lock table supabase_migrations.schema_migrations in share row exclusive mode;
do $ai005_apply$
declare
  v_source text := $ai005_body$-- Provider and purpose are separate consent boundaries. Existing generic 004
-- consents are retained as disabled legacy rows, never reused for new calls.
alter table public.ai_consents add column purpose text;
update public.ai_consents set purpose=case kind when 'photo' then 'legacy_photo' else 'legacy_text' end,
  enabled=false,revoked_at=now();
alter table public.ai_consents alter column purpose set not null;
alter table public.ai_consents drop constraint ai_consents_provider_check;
alter table public.ai_consents add constraint ai_consents_provider_check check (provider in ('openai','deepseek'));
alter table public.ai_consents add constraint ai_consents_purpose_check check (
  purpose in ('legacy_text','legacy_photo','parse_schedule','estimate_meal_text','estimate_meal_photo','generate_plan')
  and kind=case when purpose in ('legacy_photo','estimate_meal_photo') then 'photo' else 'text' end
);
alter table public.ai_consents drop constraint ai_consents_pkey;
alter table public.ai_consents add primary key(user_id,provider,purpose);

alter table public.ai_usage add column provider text not null default 'openai'
  check (provider in ('openai','deepseek'));
alter table public.ai_usage add column purpose text not null default 'legacy'
  check (purpose in ('legacy','parse_schedule','estimate_meal_text','estimate_meal_photo','generate_plan'));
create index ai_usage_provider_period on public.ai_usage(provider,period);

create table public.ai_provider_budgets (
  period date not null,
  provider text not null check(provider in ('openai','deepseek')),
  limit_cents integer not null check(limit_cents between 0 and 500 and (provider<>'deepseek' or limit_cents<=10)),
  created_at timestamptz not null default now(),
  primary key(period,provider)
);

create table public.ai_probe_usage (
  id uuid primary key default gen_random_uuid(),
  period date not null,
  provider text not null check(provider='deepseek'),
  purpose text not null check(purpose in ('parse_schedule','estimate_meal_text','estimate_meal_photo','generate_plan')),
  reserved_cents integer not null check(reserved_cents between 1 and 10),
  charged_cents integer check(charged_cents between 0 and 10),
  status text not null check(status in ('reserved','settled','released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_probe_usage_period on public.ai_probe_usage(period);

create table public.ai_plan_preferences (
  user_id uuid primary key,
  space_id uuid not null,
  plan_provider text not null default 'rules' check(plan_provider in ('rules','openai','deepseek')),
  updated_at timestamptz not null default now(),
  foreign key(space_id,user_id) references public.members(space_id,user_id) on delete cascade
);

alter table public.ai_provider_budgets enable row level security;
alter table public.ai_probe_usage enable row level security;
alter table public.ai_plan_preferences enable row level security;
create policy ai_plan_preferences_owner on public.ai_plan_preferences for select to authenticated
  using(user_id=auth.uid() and space_id=public.current_space_id());
revoke all on public.ai_provider_budgets,public.ai_probe_usage,public.ai_plan_preferences from public,anon,authenticated;
grant select on public.ai_plan_preferences to authenticated;
grant select,insert,update on public.ai_provider_budgets,public.ai_probe_usage to service_role;
grant select,insert,update,delete on public.ai_plan_preferences to service_role;

create function public.health_provider_schema_version() returns integer
language sql stable security definer set search_path=public,pg_temp
as $$ select 5 $$;

create function public.set_ai_provider_consent(
  p_provider text,p_purpose text,p_enabled boolean,p_monthly_limit_cents integer,p_policy_version text
) returns public.ai_consents
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_space uuid:=public.current_space_id(); v_kind text; v_row public.ai_consents;
begin
  if v_space is null then raise exception 'Space membership required'; end if;
  if p_provider is null or p_provider not in ('openai','deepseek')
    or p_purpose is null or p_purpose not in ('parse_schedule','estimate_meal_text','estimate_meal_photo','generate_plan')
    or p_enabled is null or p_monthly_limit_cents is null or p_monthly_limit_cents not between 0 and 500
    or (p_enabled and p_monthly_limit_cents=0)
    or (p_provider='openai' and p_policy_version is distinct from '2026-10-13-openai-health-v1')
    or (p_provider='deepseek' and p_policy_version is distinct from '2026-10-13-deepseek-health-v1')
  then raise exception 'Invalid provider consent'; end if;
  if p_provider='deepseek' and p_enabled then
    raise exception 'DeepSeek health data is not enabled';
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

create function public.set_ai_plan_provider(p_provider text) returns text
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_space uuid:=public.current_space_id();
begin
  if v_space is null then raise exception 'Space membership required'; end if;
  if p_provider is null or p_provider not in ('rules','openai','deepseek') then raise exception 'Invalid provider'; end if;
  if p_provider='deepseek' then raise exception 'DeepSeek health data is not enabled'; end if;
  if p_provider='openai' and not exists(select 1 from public.ai_consents
    where user_id=auth.uid() and provider='openai' and purpose='generate_plan'
      and enabled and policy_version='2026-10-13-openai-health-v1')
  then raise exception 'AI consent unavailable'; end if;
  insert into public.ai_plan_preferences(user_id,space_id,plan_provider)
    values(auth.uid(),v_space,p_provider)
    on conflict(user_id) do update set plan_provider=excluded.plan_provider,
      updated_at=clock_timestamp();
  return p_provider;
end $$;

create function public.reset_ai_plan_preference_on_consent_delete() returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  if old.purpose='generate_plan' then
    update public.ai_plan_preferences set plan_provider='rules',updated_at=clock_timestamp()
      where user_id=old.user_id and plan_provider=old.provider;
  end if;
  return old;
end $$;
create trigger reset_ai_plan_preference_on_consent_delete
  after delete on public.ai_consents for each row
  execute function public.reset_ai_plan_preference_on_consent_delete();

create function public.require_current_ai_plan_consent() returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  if not exists(select 1 from public.ai_consents c
    where c.user_id=new.user_id and c.space_id=new.space_id
      and c.provider='openai' and c.purpose='generate_plan' and c.enabled
      and c.policy_version='2026-10-13-openai-health-v1' for share)
    or not exists(select 1 from public.ai_plan_preferences p
      where p.user_id=new.user_id and p.space_id=new.space_id and p.plan_provider='openai' for share)
  then raise exception 'AI consent unavailable'; end if;
  return new;
end $$;
create trigger require_current_ai_plan_consent before insert on public.daily_plans
  for each row when (new.source='ai') execute function public.require_current_ai_plan_consent();

-- The old generic endpoint cannot grant a new provider/purpose permission.
create or replace function public.set_ai_consent(
  p_kind text,p_enabled boolean,p_monthly_limit_cents integer,p_policy_version text
) returns public.ai_consents language plpgsql security definer set search_path=public,pg_temp
as $$ begin raise exception 'Use provider and purpose consent'; end $$;

create function public.reserve_ai_provider_usage(
  p_user uuid,p_provider text,p_purpose text,p_cents integer
) returns uuid language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_period date:=date_trunc('month',now() at time zone 'Asia/Shanghai')::date;
  v_global integer;v_provider_limit integer;v_personal integer;v_spent integer;v_id uuid;v_kind text;
begin
  if p_user is null or p_provider is null or p_provider<>'openai' or p_purpose is null or p_purpose not in
    ('parse_schedule','estimate_meal_text','estimate_meal_photo','generate_plan')
    or p_cents is null or p_cents not between 1 and 100 then raise exception 'Invalid provider reservation'; end if;
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
      and c.enabled and c.policy_version='2026-10-13-openai-health-v1' for update of c;
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

create function public.reserve_ai_probe(p_purpose text,p_cents integer) returns uuid
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_period date:=date_trunc('month',now() at time zone 'Asia/Shanghai')::date;
  v_global integer;v_provider_limit integer;v_spent integer;v_id uuid;
begin
  if p_purpose is null or p_purpose not in ('parse_schedule','estimate_meal_text','estimate_meal_photo','generate_plan')
    or p_cents is null or p_cents not between 1 and 10 then raise exception 'Invalid probe reservation'; end if;
  select limit_cents into v_global from public.ai_monthly_budgets where period=v_period for update;
  if not found then raise exception 'AI budget not configured'; end if;
  select limit_cents into v_provider_limit from public.ai_provider_budgets
    where period=v_period and provider='deepseek' for update;
  if not found then raise exception 'DeepSeek probe budget not configured'; end if;
  select coalesce(sum(case when status='reserved' then reserved_cents else charged_cents end),0)::integer
    into v_spent from public.ai_usage where period=v_period;
  v_spent:=v_spent+(select coalesce(sum(case when status='reserved' then reserved_cents else charged_cents end),0)::integer
    from public.ai_probe_usage where period=v_period);
  if v_spent+p_cents>v_global then raise exception 'Global AI budget exceeded'; end if;
  select coalesce(sum(case when status='reserved' then reserved_cents else charged_cents end),0)::integer
    into v_spent from public.ai_probe_usage where period=v_period and provider='deepseek';
  if v_spent+p_cents>v_provider_limit then raise exception 'DeepSeek probe budget exceeded'; end if;
  insert into public.ai_probe_usage(period,provider,purpose,reserved_cents,status)
    values(v_period,'deepseek',p_purpose,p_cents,'reserved') returning id into v_id;
  return v_id;
end $$;

create function public.settle_ai_probe(p_id uuid,p_charged_cents integer) returns void
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_old public.ai_probe_usage;
begin
  select * into v_old from public.ai_probe_usage where id=p_id for update;
  if not found or v_old.status<>'reserved' or p_charged_cents is null
    or p_charged_cents not between 0 and v_old.reserved_cents
  then raise exception 'Invalid probe settlement'; end if;
  update public.ai_probe_usage set charged_cents=p_charged_cents,
    status=case when p_charged_cents=0 then 'released' else 'settled' end,
    updated_at=clock_timestamp() where id=p_id;
end $$;

-- Close the 004 reservation path so it cannot omit provider and probe spending.
create or replace function public.reserve_ai_usage(p_user uuid,p_kind text,p_cents integer) returns uuid
language plpgsql security definer set search_path=public,pg_temp
as $$ begin raise exception 'Use provider-specific reservation'; end $$;

create or replace function public.settle_ai_usage(p_id uuid,p_charged_cents integer) returns void
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_old public.ai_usage;
begin
  select * into v_old from public.ai_usage where id=p_id for update;
  if not found or v_old.status<>'reserved' or p_charged_cents is null
    or p_charged_cents not between 0 and v_old.reserved_cents
  then raise exception 'Invalid AI settlement'; end if;
  update public.ai_usage set charged_cents=p_charged_cents,
    status=case when p_charged_cents=0 then 'released' else 'settled' end,
    updated_at=clock_timestamp() where id=p_id;
end $$;

revoke all on function public.health_provider_schema_version(),
  public.set_ai_provider_consent(text,text,boolean,integer,text),public.set_ai_plan_provider(text),
  public.reserve_ai_provider_usage(uuid,text,text,integer),public.reserve_ai_probe(text,integer),
  public.settle_ai_probe(uuid,integer),public.reset_ai_plan_preference_on_consent_delete(),
  public.require_current_ai_plan_consent()
  from public,anon,authenticated;
grant execute on function public.health_provider_schema_version(),
  public.set_ai_provider_consent(text,text,boolean,integer,text),public.set_ai_plan_provider(text)
  to authenticated;
grant execute on function public.reserve_ai_provider_usage(uuid,text,text,integer),
  public.reserve_ai_probe(text,integer),public.settle_ai_probe(uuid,integer) to service_role;
$ai005_body$;
  v_registered text[];
  v_name text;
  v_expected record;
  v_count integer;
begin
  v_source := replace(v_source,chr(13)||chr(10),chr(10));
  if md5(v_source) is distinct from '2c57e2948216f3e08e2170754e1fd883' then
    raise exception 'Migration source mismatch: 202610130005';
  end if;
  for v_expected in select * from (values
    ('202610130001','1d56c15aa7609c057d53a05b124b172d'),
    ('202610130002','c1e2788c3d67dccb544ab8166a6c096b'),
    ('202610130003','d13a863ec3337d16a4a968835d5ee12d'),
    ('202610130004','9a430516e9a44d8d27c651cf24e73e2b')
  ) as required(version,source_md5) loop
    select statements into v_registered from supabase_migrations.schema_migrations
      where version=v_expected.version;
    if not found or cardinality(v_registered) is distinct from 1
      or md5(v_registered[1]) is distinct from v_expected.source_md5 then
      raise exception 'Migration history mismatch: %',v_expected.version;
    end if;
  end loop;
  select count(*) into v_count from public.fixed_accounts f
    join auth.users u on u.id=f.user_id
    join public.members m on m.user_id=f.user_id and m.space_id=f.space_id
    where ((f.slot='me' and u.email='me@plans.invalid')
        or (f.slot='w' and u.email='w@plans.invalid'))
      and u.email_confirmed_at is not null
      and nullif(u.encrypted_password,'') is not null;
  if v_count<>2 or (select count(*) from public.fixed_accounts)<>2
    or (select count(*) from auth.users)<>2
    or (select count(distinct space_id) from public.fixed_accounts)<>1
    or (select count(*) from public.members)<>2 then
    raise exception 'Fixed two-account space precondition failed';
  end if;
  select statements,name into v_registered,v_name from supabase_migrations.schema_migrations
    where version='202610130005';
  if found then
    if cardinality(v_registered) is distinct from 1
      or md5(v_registered[1]) is distinct from '2c57e2948216f3e08e2170754e1fd883'
      or v_name is distinct from 'ai_providers' then
      raise exception 'Migration history mismatch: 202610130005';
    end if;
    return;
  end if;
  execute v_source;
  insert into supabase_migrations.schema_migrations(version,statements,name)
    values('202610130005',array[v_source],'ai_providers');
end
$ai005_apply$;
commit;

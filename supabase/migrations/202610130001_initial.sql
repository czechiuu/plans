-- Synthetic test data only. Apply in a Supabase project before enabling the client.
create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 60),
  share_profile boolean not null default false,
  share_schedule boolean not null default false,
  share_weight boolean not null default false,
  allow_partner_edit boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (space_id, user_id)
);
create index members_space_idx on public.members(space_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.health_profiles (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null,
  sex text check (sex is null or char_length(sex) <= 40),
  age integer check (age between 1 and 120),
  height_cm numeric check (height_cm between 50 and 250),
  baseline_weight_kg numeric check (baseline_weight_kg between 20 and 500),
  baseline_date date,
  target_weight_kg numeric check (target_weight_kg between 20 and 500),
  target_date date,
  preferences text check (char_length(preferences) <= 4000),
  health_notes text check (char_length(health_notes) <= 4000),
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  unique(user_id),
  check (baseline_date is null or baseline_date between date '1900-01-01' and date '2100-12-31'),
  check (target_date is null or target_date between date '1900-01-01' and date '2100-12-31'),
  foreign key(space_id,user_id) references public.members(space_id,user_id) on delete cascade
);

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null,
  record_date date not null,
  raw_text text check (char_length(raw_text) <= 8000),
  start_time time,
  end_time time,
  exercise_intent text not null default 'unknown' check (exercise_intent in ('unknown','yes','no')),
  fixed_arrangements text check (char_length(fixed_arrangements) <= 4000),
  meal_conditions text check (char_length(meal_conditions) <= 4000),
  constraints text check (char_length(constraints) <= 4000),
  is_shared boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  unique(user_id,record_date),
  check (record_date between date '1900-01-01' and date '2100-12-31'),
  check (start_time is null or end_time is null or end_time >= start_time),
  foreign key(space_id,user_id) references public.members(space_id,user_id) on delete cascade
);
create index schedules_space_date_idx on public.schedules(space_id,record_date desc);

create table public.weights (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null,
  record_date date not null,
  measured_at timestamptz,
  weight_kg numeric not null check (weight_kg between 20 and 500),
  waist_cm numeric check (waist_cm between 30 and 250),
  notes text check (char_length(notes) <= 4000),
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  unique(user_id,record_date),
  check (record_date between date '1900-01-01' and date '2100-12-31'),
  check (measured_at is null or (measured_at at time zone 'Asia/Shanghai')::date = record_date),
  foreign key(space_id,user_id) references public.members(space_id,user_id) on delete cascade
);
create index weights_space_date_idx on public.weights(space_id,record_date desc);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  entity text not null check (entity in ('profile','schedule','weight','settings')),
  entity_id uuid,
  action text not null check (action in ('create','update','delete')),
  created_at timestamptz not null default now()
);
create index audit_space_time_idx on public.audit_events(space_id,created_at desc);

create function public.current_space_id() returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select space_id from public.members where user_id = auth.uid() $$;

create function public.create_space(p_name text, p_display_name text) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid(); v_space uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.members where user_id=v_user) then raise exception 'Already in a space'; end if;
  insert into public.spaces(name) values(p_name) returning id into v_space;
  insert into public.members(space_id,user_id,display_name) values(v_space,v_user,p_display_name);
  return v_space;
end $$;

create function public.create_invite() returns table(token text, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_space uuid := public.current_space_id(); v_token text;
begin
  if v_space is null then raise exception 'Space membership required'; end if;
  perform 1 from public.spaces where id=v_space for update;
  if (select count(*) from public.members where space_id=v_space) >= 2 then raise exception 'Space is full'; end if;
  v_token := gen_random_uuid()::text || gen_random_uuid()::text;
  return query insert into public.invites(space_id,token_hash,created_by,expires_at)
    values(v_space,encode(sha256(convert_to(v_token,'UTF8')),'hex'),auth.uid(),now()+interval '24 hours')
    returning v_token,public.invites.expires_at;
end $$;

create function public.join_space(p_token text, p_display_name text, p_settings jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid(); v_space uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.members where user_id=v_user) then raise exception 'Already in a space'; end if;
  if p_token is null or char_length(p_token) <> 72 then raise exception 'Invalid invitation'; end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' or
     exists(select 1 from jsonb_each(p_settings) e where e.key not in
       ('share_profile','share_schedule','share_weight','allow_partner_edit') or jsonb_typeof(e.value) <> 'boolean')
  then raise exception 'Invalid sharing settings'; end if;
  select space_id into v_space from public.invites
    where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
      and consumed_at is null and expires_at > now() for update;
  if v_space is null then raise exception 'Invalid or expired invitation'; end if;
  perform 1 from public.spaces where id=v_space for update;
  if (select count(*) from public.members where space_id=v_space) >= 2 then raise exception 'Space is full'; end if;
  insert into public.members(space_id,user_id,display_name,share_profile,share_schedule,share_weight,allow_partner_edit)
    values(v_space,v_user,p_display_name,
      coalesce((p_settings->>'share_profile')::boolean,false),
      coalesce((p_settings->>'share_schedule')::boolean,false),
      coalesce((p_settings->>'share_weight')::boolean,false),
      coalesce((p_settings->>'allow_partner_edit')::boolean,false));
  update public.invites set consumed_at=now() where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  return v_space;
end $$;

create function public.save_settings(p_settings jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_space uuid := public.current_space_id();
begin
  if v_space is null then raise exception 'Space membership required'; end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' or
     (select count(*) from jsonb_object_keys(p_settings)) <> 4 or
     exists(select 1 from jsonb_each(p_settings) e where e.key not in ('share_profile','share_schedule','share_weight','allow_partner_edit') or jsonb_typeof(e.value) <> 'boolean')
  then raise exception 'Invalid sharing settings'; end if;
  update public.members set share_profile=(p_settings->>'share_profile')::boolean,
    share_schedule=(p_settings->>'share_schedule')::boolean,
    share_weight=(p_settings->>'share_weight')::boolean,
    allow_partner_edit=(p_settings->>'allow_partner_edit')::boolean where user_id=auth.uid();
  insert into public.audit_events(space_id,user_id,actor_id,entity,action)
    values(v_space,auth.uid(),auth.uid(),'settings','update');
end $$;

create function public.save_profile(p_payload jsonb) returns public.health_profiles
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_space uuid := public.current_space_id(); v_row public.health_profiles; v_action text;
begin
  if v_space is null then raise exception 'Space membership required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or
     exists(select 1 from jsonb_object_keys(p_payload) k where k not in
       ('sex','age','height_cm','baseline_weight_kg','baseline_date','target_weight_kg','target_date','preferences','health_notes','is_shared','expected_updated_at')) or
     exists(select 1 from jsonb_each(p_payload) e where
       (e.key in ('sex','baseline_date','target_date','preferences','health_notes','expected_updated_at') and jsonb_typeof(e.value) not in ('string','null')) or
       (e.key in ('age','height_cm','baseline_weight_kg','target_weight_kg') and jsonb_typeof(e.value) not in ('number','null')) or
       (e.key='is_shared' and jsonb_typeof(e.value) not in ('boolean','null'))) or
     (p_payload->>'baseline_date' is not null and p_payload->>'baseline_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') or
     (p_payload->>'target_date' is not null and p_payload->>'target_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
  then raise exception 'Invalid profile fields'; end if;
  select * into v_row from public.health_profiles where user_id=auth.uid() for update;
  if found and (p_payload->>'expected_updated_at' is null or
     (p_payload->>'expected_updated_at')::timestamptz is distinct from v_row.updated_at)
  then raise exception 'Update conflict'; end if;
  if not found and p_payload->>'expected_updated_at' is not null then raise exception 'Update conflict'; end if;
  v_action := case when found then 'update' else 'create' end;
  if v_action='create' then
    insert into public.health_profiles(space_id,user_id,sex,age,height_cm,baseline_weight_kg,baseline_date,target_weight_kg,target_date,preferences,health_notes,is_shared,updated_by)
      values(v_space,auth.uid(),p_payload->>'sex',(p_payload->>'age')::integer,(p_payload->>'height_cm')::numeric,
        (p_payload->>'baseline_weight_kg')::numeric,(p_payload->>'baseline_date')::date,
        (p_payload->>'target_weight_kg')::numeric,(p_payload->>'target_date')::date,
        p_payload->>'preferences',p_payload->>'health_notes',coalesce((p_payload->>'is_shared')::boolean,false),auth.uid())
      returning * into v_row;
  else
    update public.health_profiles set sex=p_payload->>'sex',age=(p_payload->>'age')::integer,
      height_cm=(p_payload->>'height_cm')::numeric,baseline_weight_kg=(p_payload->>'baseline_weight_kg')::numeric,
      baseline_date=(p_payload->>'baseline_date')::date,target_weight_kg=(p_payload->>'target_weight_kg')::numeric,
      target_date=(p_payload->>'target_date')::date,preferences=p_payload->>'preferences',health_notes=p_payload->>'health_notes',
      is_shared=coalesce((p_payload->>'is_shared')::boolean,false),
      updated_at=greatest(clock_timestamp(),v_row.updated_at+interval '1 microsecond'),updated_by=auth.uid()
      where id=v_row.id returning * into v_row;
  end if;
  insert into public.audit_events(space_id,user_id,actor_id,entity,entity_id,action)
    values(v_space,auth.uid(),auth.uid(),'profile',v_row.id,v_action);
  return v_row;
end $$;

create function public.save_schedule(p_payload jsonb, p_id uuid default null) returns public.schedules
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_space uuid := public.current_space_id(); v_user uuid; v_old public.schedules; v_row public.schedules;
begin
  if v_space is null then raise exception 'Space membership required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or
     exists(select 1 from jsonb_object_keys(p_payload) k where k not in
       ('user_id','record_date','raw_text','start_time','end_time','exercise_intent','fixed_arrangements','meal_conditions','constraints','is_shared','expected_updated_at')) or
     exists(select 1 from jsonb_each(p_payload) e where
       (e.key in ('user_id','record_date','raw_text','start_time','end_time','exercise_intent','fixed_arrangements','meal_conditions','constraints','expected_updated_at') and jsonb_typeof(e.value) not in ('string','null')) or
       (e.key='is_shared' and jsonb_typeof(e.value) not in ('boolean','null'))) or
     p_payload->>'record_date' is null or p_payload->>'record_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  then raise exception 'Invalid schedule fields'; end if;
  v_user := (p_payload->>'user_id')::uuid;
  if p_id is null then
    if v_user is distinct from auth.uid() then raise exception 'Only owner may create'; end if;
    insert into public.schedules(space_id,user_id,record_date,raw_text,start_time,end_time,exercise_intent,fixed_arrangements,meal_conditions,constraints,is_shared,updated_by)
      values(v_space,v_user,(p_payload->>'record_date')::date,p_payload->>'raw_text',(p_payload->>'start_time')::time,
        (p_payload->>'end_time')::time,coalesce(p_payload->>'exercise_intent','unknown'),p_payload->>'fixed_arrangements',
        p_payload->>'meal_conditions',p_payload->>'constraints',coalesce((p_payload->>'is_shared')::boolean,false),auth.uid())
      returning * into v_row;
    insert into public.audit_events(space_id,user_id,actor_id,entity,entity_id,action) values(v_space,v_user,auth.uid(),'schedule',v_row.id,'create');
  else
    select * into v_old from public.schedules where id=p_id and space_id=v_space for update;
    if not found then raise exception 'Schedule not found or access denied'; end if;
    if v_old.user_id <> auth.uid() and not exists(
      select 1 from public.members where user_id=v_old.user_id and space_id=v_space and share_schedule and allow_partner_edit and v_old.is_shared)
    then raise exception 'Schedule not found or access denied'; end if;
    if v_user is distinct from v_old.user_id then raise exception 'Schedule identity cannot change'; end if;
    if p_payload->>'expected_updated_at' is null or (p_payload->>'expected_updated_at')::timestamptz is distinct from v_old.updated_at then raise exception 'Update conflict'; end if;
    if v_old.user_id <> auth.uid() and coalesce((p_payload->>'is_shared')::boolean,false) is distinct from v_old.is_shared then raise exception 'Only owner controls sharing'; end if;
    if v_old.user_id <> auth.uid() and (p_payload->>'record_date')::date is distinct from v_old.record_date then raise exception 'Only owner controls date'; end if;
    update public.schedules set record_date=(p_payload->>'record_date')::date,raw_text=p_payload->>'raw_text',start_time=(p_payload->>'start_time')::time,
      end_time=(p_payload->>'end_time')::time,exercise_intent=coalesce(p_payload->>'exercise_intent','unknown'),
      fixed_arrangements=p_payload->>'fixed_arrangements',meal_conditions=p_payload->>'meal_conditions',
      constraints=p_payload->>'constraints',is_shared=coalesce((p_payload->>'is_shared')::boolean,false),
      version=version+1,updated_at=greatest(clock_timestamp(),v_old.updated_at+interval '1 microsecond'),updated_by=auth.uid() where id=p_id returning * into v_row;
    insert into public.audit_events(space_id,user_id,actor_id,entity,entity_id,action) values(v_space,v_user,auth.uid(),'schedule',v_row.id,'update');
  end if;
  return v_row;
end $$;

create function public.save_weight(p_payload jsonb, p_id uuid default null) returns public.weights
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_space uuid := public.current_space_id(); v_user uuid; v_old public.weights; v_row public.weights;
begin
  if v_space is null then raise exception 'Space membership required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or
     exists(select 1 from jsonb_object_keys(p_payload) k where k not in
       ('user_id','record_date','measured_at','weight_kg','waist_cm','notes','is_shared','expected_updated_at')) or
     exists(select 1 from jsonb_each(p_payload) e where
       (e.key in ('user_id','record_date','measured_at','notes','expected_updated_at') and jsonb_typeof(e.value) not in ('string','null')) or
       (e.key in ('weight_kg','waist_cm') and jsonb_typeof(e.value) not in ('number','null')) or
       (e.key='is_shared' and jsonb_typeof(e.value) not in ('boolean','null'))) or
     p_payload->>'record_date' is null or p_payload->>'record_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  then raise exception 'Invalid weight fields'; end if;
  v_user := (p_payload->>'user_id')::uuid;
  if p_id is null then
    if v_user is distinct from auth.uid() then raise exception 'Only owner may create'; end if;
    insert into public.weights(space_id,user_id,record_date,measured_at,weight_kg,waist_cm,notes,is_shared,updated_by)
      values(v_space,v_user,(p_payload->>'record_date')::date,(p_payload->>'measured_at')::timestamptz,
        (p_payload->>'weight_kg')::numeric,(p_payload->>'waist_cm')::numeric,p_payload->>'notes',
        coalesce((p_payload->>'is_shared')::boolean,false),auth.uid()) returning * into v_row;
    insert into public.audit_events(space_id,user_id,actor_id,entity,entity_id,action) values(v_space,v_user,auth.uid(),'weight',v_row.id,'create');
  else
    select * into v_old from public.weights where id=p_id and space_id=v_space for update;
    if not found then raise exception 'Weight not found or access denied'; end if;
    if v_old.user_id <> auth.uid() and not exists(
      select 1 from public.members where user_id=v_old.user_id and space_id=v_space and share_weight and allow_partner_edit and v_old.is_shared)
    then raise exception 'Weight not found or access denied'; end if;
    if v_user is distinct from v_old.user_id then raise exception 'Weight identity cannot change'; end if;
    if p_payload->>'expected_updated_at' is null or (p_payload->>'expected_updated_at')::timestamptz is distinct from v_old.updated_at then raise exception 'Update conflict'; end if;
    if v_old.user_id <> auth.uid() and coalesce((p_payload->>'is_shared')::boolean,false) is distinct from v_old.is_shared then raise exception 'Only owner controls sharing'; end if;
    if v_old.user_id <> auth.uid() and (p_payload->>'record_date')::date is distinct from v_old.record_date then raise exception 'Only owner controls date'; end if;
    update public.weights set record_date=(p_payload->>'record_date')::date,measured_at=(p_payload->>'measured_at')::timestamptz,
      weight_kg=(p_payload->>'weight_kg')::numeric,waist_cm=(p_payload->>'waist_cm')::numeric,
      notes=p_payload->>'notes',is_shared=coalesce((p_payload->>'is_shared')::boolean,false),
      updated_at=greatest(clock_timestamp(),v_old.updated_at+interval '1 microsecond'),updated_by=auth.uid() where id=p_id returning * into v_row;
    insert into public.audit_events(space_id,user_id,actor_id,entity,entity_id,action) values(v_space,v_user,auth.uid(),'weight',v_row.id,'update');
  end if;
  return v_row;
end $$;

create function public.delete_schedule(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_row public.schedules;
begin
  delete from public.schedules where id=p_id and user_id=auth.uid() and space_id=public.current_space_id() returning * into v_row;
  if not found then raise exception 'Schedule not found or owner required'; end if;
  insert into public.audit_events(space_id,user_id,actor_id,entity,entity_id,action)
    values(v_row.space_id,v_row.user_id,auth.uid(),'schedule',p_id,'delete');
end $$;

create function public.delete_weight(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_row public.weights;
begin
  delete from public.weights where id=p_id and user_id=auth.uid() and space_id=public.current_space_id() returning * into v_row;
  if not found then raise exception 'Weight not found or owner required'; end if;
  insert into public.audit_events(space_id,user_id,actor_id,entity,entity_id,action)
    values(v_row.space_id,v_row.user_id,auth.uid(),'weight',p_id,'delete');
end $$;

create function public.erase_own_health_data() returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if public.current_space_id() is null then raise exception 'Space membership required'; end if;
  delete from public.health_profiles where user_id=auth.uid();
  delete from public.schedules where user_id=auth.uid();
  delete from public.weights where user_id=auth.uid();
  delete from public.audit_events where user_id=auth.uid();
end $$;

create function public.leave_space() returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_space uuid := public.current_space_id();
begin
  if v_space is null then raise exception 'Space membership required'; end if;
  perform 1 from public.spaces where id=v_space for update;
  perform public.erase_own_health_data();
  delete from public.invites where space_id=v_space;
  delete from public.audit_events where actor_id=auth.uid();
  delete from public.members where user_id=auth.uid();
  update public.members set share_profile=false,share_schedule=false,share_weight=false,allow_partner_edit=false
    where space_id=v_space;
  if not exists(select 1 from public.members where space_id=v_space) then delete from public.spaces where id=v_space; end if;
end $$;

alter table public.spaces enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.health_profiles enable row level security;
alter table public.schedules enable row level security;
alter table public.weights enable row level security;
alter table public.audit_events enable row level security;

create policy spaces_read on public.spaces for select to authenticated using (id=public.current_space_id());
create policy members_read on public.members for select to authenticated using (space_id=public.current_space_id());
create policy profile_read on public.health_profiles for select to authenticated using (
  space_id=public.current_space_id() and (user_id=auth.uid() or
  (is_shared and exists(select 1 from public.members m where m.user_id=health_profiles.user_id and m.share_profile))));
create policy schedules_read on public.schedules for select to authenticated using (
  space_id=public.current_space_id() and (user_id=auth.uid() or
  (is_shared and exists(select 1 from public.members m where m.user_id=schedules.user_id and m.share_schedule))));
create policy weights_read on public.weights for select to authenticated using (
  space_id=public.current_space_id() and (user_id=auth.uid() or
  (is_shared and exists(select 1 from public.members m where m.user_id=weights.user_id and m.share_weight))));
create policy audit_read on public.audit_events for select to authenticated using (
  space_id=public.current_space_id() and (user_id=auth.uid() or actor_id=auth.uid()));

revoke create on schema public from public,anon,authenticated;
revoke all on public.spaces,public.members,public.invites,public.health_profiles,public.schedules,public.weights,public.audit_events from public,anon,authenticated;
grant select on public.spaces,public.members,public.health_profiles,public.schedules,public.weights,public.audit_events to authenticated;
revoke all on function public.current_space_id(),public.create_space(text,text),public.create_invite(),public.join_space(text,text,jsonb),public.save_settings(jsonb),public.save_profile(jsonb),public.save_schedule(jsonb,uuid),public.save_weight(jsonb,uuid),public.delete_schedule(uuid),public.delete_weight(uuid),public.erase_own_health_data(),public.leave_space() from public,anon,authenticated;
grant execute on function public.current_space_id(),public.create_space(text,text),public.create_invite(),public.join_space(text,text,jsonb),public.save_settings(jsonb),public.save_profile(jsonb),public.save_schedule(jsonb,uuid),public.save_weight(jsonb,uuid),public.delete_schedule(uuid),public.delete_weight(uuid),public.erase_own_health_data(),public.leave_space() to authenticated;

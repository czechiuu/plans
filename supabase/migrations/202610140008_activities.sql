-- Explicit records of actual activity; existing strength/timer records are unchanged.
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

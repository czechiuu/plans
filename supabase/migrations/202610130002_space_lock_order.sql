-- Serialize membership and invitation changes on the space row. Existing function ACLs are retained by CREATE OR REPLACE.
create or replace function public.create_invite() returns table(token text, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_space uuid := public.current_space_id(); v_token text;
begin
  if v_space is null then raise exception 'Space membership required'; end if;
  perform 1 from public.spaces where id=v_space for update;
  if not found or not exists(select 1 from public.members where user_id=auth.uid() and space_id=v_space)
  then raise exception 'Space membership required'; end if;
  if (select count(*) from public.members where space_id=v_space) >= 2 then raise exception 'Space is full'; end if;
  v_token := gen_random_uuid()::text || gen_random_uuid()::text;
  return query insert into public.invites(space_id,token_hash,created_by,expires_at)
    values(v_space,encode(sha256(convert_to(v_token,'UTF8')),'hex'),auth.uid(),clock_timestamp()+interval '24 hours')
    returning v_token,public.invites.expires_at;
end $$;

create or replace function public.join_space(p_token text, p_display_name text, p_settings jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid(); v_space uuid; v_invite uuid; v_hash text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.members where user_id=v_user) then raise exception 'Already in a space'; end if;
  if p_token is null or char_length(p_token) <> 72 then raise exception 'Invalid invitation'; end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' or
     exists(select 1 from jsonb_each(p_settings) e where e.key not in
       ('share_profile','share_schedule','share_weight','allow_partner_edit') or jsonb_typeof(e.value) <> 'boolean')
  then raise exception 'Invalid sharing settings'; end if;
  v_hash := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  -- This first read is only a locator; validity and membership are checked again after the space lock.
  select space_id into v_space from public.invites where token_hash=v_hash;
  if v_space is null then raise exception 'Invalid or expired invitation'; end if;
  perform 1 from public.spaces where id=v_space for update;
  if not found then raise exception 'Invalid or expired invitation'; end if;
  select id into v_invite from public.invites
    where token_hash=v_hash and space_id=v_space and consumed_at is null and expires_at>clock_timestamp()
    for update;
  if v_invite is null then raise exception 'Invalid or expired invitation'; end if;
  if exists(select 1 from public.members where user_id=v_user) then raise exception 'Already in a space'; end if;
  if (select count(*) from public.members where space_id=v_space) >= 2 then raise exception 'Space is full'; end if;
  insert into public.members(space_id,user_id,display_name,share_profile,share_schedule,share_weight,allow_partner_edit)
    values(v_space,v_user,p_display_name,
      coalesce((p_settings->>'share_profile')::boolean,false),
      coalesce((p_settings->>'share_schedule')::boolean,false),
      coalesce((p_settings->>'share_weight')::boolean,false),
      coalesce((p_settings->>'allow_partner_edit')::boolean,false));
  update public.invites set consumed_at=clock_timestamp() where id=v_invite;
  return v_space;
end $$;

create or replace function public.leave_space() returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_space uuid := public.current_space_id();
begin
  if v_space is null then raise exception 'Space membership required'; end if;
  perform 1 from public.spaces where id=v_space for update;
  if not found or not exists(select 1 from public.members where user_id=auth.uid() and space_id=v_space)
  then raise exception 'Space membership required'; end if;
  perform public.erase_own_health_data();
  delete from public.invites where space_id=v_space;
  delete from public.audit_events where actor_id=auth.uid();
  delete from public.members where user_id=auth.uid() and space_id=v_space;
  update public.members set share_profile=false,share_schedule=false,share_weight=false,allow_partner_edit=false
    where space_id=v_space;
  if not exists(select 1 from public.members where space_id=v_space) then delete from public.spaces where id=v_space; end if;
end $$;

revoke all on function public.create_invite(),public.join_space(text,text,jsonb),public.leave_space() from public,anon,authenticated;
grant execute on function public.create_invite(),public.join_space(text,text,jsonb),public.leave_space() to authenticated;

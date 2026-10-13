-- Run only as a database administrator after Auth contains exactly these two
-- confirmed password users. Never put passwords or user UUIDs in this file.
begin;
lock table public.spaces, public.members, public.fixed_accounts in share row exclusive mode;

do $$
declare
  v_me uuid;
  v_w uuid;
  v_space uuid;
  v_existing_space uuid;
begin
  if (select count(*) from auth.users where email='me@plans.invalid' and email_confirmed_at is not null and nullif(encrypted_password,'') is not null) <> 1 or
     (select count(*) from auth.users where email='w@plans.invalid' and email_confirmed_at is not null and nullif(encrypted_password,'') is not null) <> 1
  then raise exception 'Both designated Auth users must exist with confirmed emails and passwords'; end if;
  select id into v_me from auth.users where email='me@plans.invalid';
  select id into v_w from auth.users where email='w@plans.invalid';
  if exists(select 1 from public.members where user_id not in (v_me,v_w))
  then raise exception 'Other space members require administrator review'; end if;
  if v_me=v_w or exists(select 1 from auth.users where id not in (v_me,v_w))
  then raise exception 'Only the two designated Auth users are allowed'; end if;
  if exists(select 1 from public.fixed_accounts where
    (slot='me' and user_id<>v_me) or (slot='w' and user_id<>v_w))
  then raise exception 'Fixed account identity conflict'; end if;

  select space_id into v_space from public.fixed_accounts limit 1;
  if v_space is not null and exists(select 1 from public.fixed_accounts where space_id<>v_space)
  then raise exception 'Fixed accounts reference different spaces'; end if;
  select space_id into v_existing_space from public.members where user_id in (v_me,v_w) limit 1;
  if v_existing_space is not null and exists(select 1 from public.members where user_id in (v_me,v_w) and space_id<>v_existing_space)
  then raise exception 'Designated users belong to different spaces'; end if;
  if v_space is not null and v_existing_space is not null and v_space<>v_existing_space
  then raise exception 'Membership and fixed account space conflict'; end if;
  v_space := coalesce(v_space,v_existing_space);

  if v_space is null then
    if exists(select 1 from public.spaces) then raise exception 'Existing space requires administrator review'; end if;
    insert into public.spaces(name) values('Private two-person space') returning id into v_space;
  elsif exists(select 1 from public.spaces where id<>v_space) then
    raise exception 'Other space requires administrator review';
  end if;

  if not exists(select 1 from public.members where user_id=v_me) then
    insert into public.members(space_id,user_id,display_name) values(v_space,v_me,'我');
  end if;
  if not exists(select 1 from public.members where user_id=v_w) then
    insert into public.members(space_id,user_id,display_name) values(v_space,v_w,'W');
  end if;
  if not exists(select 1 from public.fixed_accounts where slot='me') then
    insert into public.fixed_accounts(slot,user_id,space_id) values('me',v_me,v_space);
  end if;
  if not exists(select 1 from public.fixed_accounts where slot='w') then
    insert into public.fixed_accounts(slot,user_id,space_id) values('w',v_w,v_space);
  end if;
end $$;
commit;

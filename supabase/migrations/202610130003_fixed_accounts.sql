-- Only an administrator may bind the two fixed identities to one designated space.
create table public.fixed_accounts (
  slot text primary key check (slot in ('me','w')),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  space_id uuid not null references public.spaces(id) on delete restrict
);
alter table public.fixed_accounts enable row level security;
revoke all on public.fixed_accounts from public,anon,authenticated;

create or replace function public.current_space_id() returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select m.space_id from public.fixed_accounts f
    join public.members m on m.user_id=f.user_id and m.space_id=f.space_id
    where f.user_id=auth.uid()
      and (select count(*) from public.fixed_accounts)=2
      and not exists(select 1 from public.fixed_accounts other where other.space_id<>f.space_id)
$$;

create function public.current_account() returns text
language sql stable security definer set search_path = public, pg_temp
as $$ select slot from public.fixed_accounts where user_id=auth.uid() $$;

-- Keep an empty designated space after both members leave so identities remain
-- recognizable while all health data and memberships stay removed.
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
end $$;

revoke all on function public.current_space_id(),public.current_account(),public.create_space(text,text),
  public.create_invite(),public.join_space(text,text,jsonb),public.leave_space()
  from public,anon,authenticated;
grant execute on function public.current_space_id(),public.current_account(),public.leave_space() to authenticated;

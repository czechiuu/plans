-- Operator-only. Sets a $2.00 cap for the current Asia/Shanghai calendar month.
-- No API key, password, UUID, personal consent, or future-month budget is stored here.
begin;
lock table public.ai_monthly_budgets in share row exclusive mode;
do $budget$
declare
  v_period date := date_trunc('month',now() at time zone 'Asia/Shanghai')::date;
  v_accounts integer;
  v_committed integer;
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version='202610130004' and cardinality(statements)=1
        and md5(statements[1])='9a430516e9a44d8d27c651cf24e73e2b')<>1 then
    raise exception 'Health migration 004 is not the reviewed source';
  end if;
  select count(*) into v_accounts from public.fixed_accounts f
    join auth.users u on u.id=f.user_id
    join public.members m on m.user_id=f.user_id and m.space_id=f.space_id
    where ((f.slot='me' and u.email='me@plans.invalid')
        or (f.slot='w' and u.email='w@plans.invalid'))
      and u.email_confirmed_at is not null
      and nullif(u.encrypted_password,'') is not null;
  if v_accounts<>2 or (select count(*) from public.fixed_accounts)<>2
     or (select count(*) from auth.users)<>2
     or (select count(*) from public.members)<>2
     or (select count(distinct space_id) from public.fixed_accounts)<>1 then
    raise exception 'Fixed two-account space precondition failed';
  end if;

  select coalesce(sum(case when status='reserved' then reserved_cents
                           when status='settled' then charged_cents else 0 end),0)::integer
    into v_committed from public.ai_usage where period=v_period;
  if v_committed>200 then raise exception 'Existing AI usage exceeds the $2 cap'; end if;
  insert into public.ai_monthly_budgets(period,limit_cents)
    values(v_period,200)
    on conflict(period) do update set limit_cents=excluded.limit_cents;
end
$budget$;
commit;

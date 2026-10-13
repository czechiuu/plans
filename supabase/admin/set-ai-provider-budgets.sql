-- Operator-only. Current Asia/Shanghai month: global <= $2, OpenAI <= $2,
-- DeepSeek synthetic probe <= $0.10. Never increases an existing lower cap.
-- No credentials, user IDs, future-month rows, or ledger deletion.
begin;
do $provider_budget$
declare
  v_period date := date_trunc('month',now() at time zone 'Asia/Shanghai')::date;
  v_global integer;
  v_openai integer;
  v_deepseek integer;
  v_spent_global integer;
  v_spent_openai integer;
  v_spent_deepseek integer;
  v_spent_probe integer;
  v_accounts integer;
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version='202610130005' and cardinality(statements)=1
        and md5(statements[1])='2c57e2948216f3e08e2170754e1fd883'
        and name='ai_providers')<>1 then
    raise exception 'AI provider migration 005 is not the reviewed source';
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

  -- Reservation RPCs lock global first, then provider. Keep that lock order.
  insert into public.ai_monthly_budgets(period,limit_cents) values(v_period,200)
    on conflict(period) do update set limit_cents=least(public.ai_monthly_budgets.limit_cents,excluded.limit_cents)
    returning limit_cents into v_global;
  insert into public.ai_provider_budgets(period,provider,limit_cents) values(v_period,'openai',200)
    on conflict(period,provider) do update set limit_cents=least(public.ai_provider_budgets.limit_cents,excluded.limit_cents)
    returning limit_cents into v_openai;
  insert into public.ai_provider_budgets(period,provider,limit_cents) values(v_period,'deepseek',10)
    on conflict(period,provider) do update set limit_cents=least(public.ai_provider_budgets.limit_cents,excluded.limit_cents)
    returning limit_cents into v_deepseek;

  select coalesce(sum(case when status='reserved' then reserved_cents
                           when status='settled' then charged_cents else 0 end),0)::integer
    into v_spent_global from public.ai_usage where period=v_period;
  v_spent_openai:=coalesce((select sum(case when status='reserved' then reserved_cents
                                            when status='settled' then charged_cents else 0 end)
                            from public.ai_usage where period=v_period and provider='openai'),0)::integer;
  v_spent_deepseek:=coalesce((select sum(case when status='reserved' then reserved_cents
                                              when status='settled' then charged_cents else 0 end)
                              from public.ai_usage where period=v_period and provider='deepseek'),0)::integer;
  select coalesce(sum(case when status='reserved' then reserved_cents
                           when status='settled' then charged_cents else 0 end),0)::integer
    into v_spent_probe from public.ai_probe_usage where period=v_period;
  v_spent_global:=v_spent_global+v_spent_probe;
  v_spent_deepseek:=v_spent_deepseek+v_spent_probe;
  if v_spent_global>v_global or v_spent_openai>v_openai or v_spent_deepseek>v_deepseek then
    raise exception 'Existing AI usage exceeds the reviewed budget';
  end if;
end
$provider_budget$;
commit;

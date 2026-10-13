-- Operator-only deployment step. Store the three values in Supabase Vault first:
-- health_project_url, health_publishable_key, health_cron_secret.
-- health_cron_secret must match the Edge secret HEALTH_CRON_SECRET (>=32 random chars).
-- This file contains no credential values and must be run only in the target project SQL Editor.
do $check$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null
    or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
  then raise exception 'pg_cron and pg_net must be enabled first'; end if;
  if (select count(*) from vault.decrypted_secrets
      where name in ('health_project_url','health_publishable_key','health_cron_secret'))<>3
  then raise exception 'Health cron Vault configuration is incomplete'; end if;
end $check$;

select cron.schedule('health-daily-dispatch','*/5 * * * *',$cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='health_project_url') || '/functions/v1/health-cron',
    headers := jsonb_build_object(
      'content-type','application/json',
      'apikey',(select decrypted_secret from vault.decrypted_secrets where name='health_publishable_key'),
      'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='health_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);

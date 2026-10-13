-- Repair only the confirmed SQL Editor CRLF transport of migration 004.
-- This changes one migration-history statement, never application tables or functions.
begin;
lock table supabase_migrations.schema_migrations in share row exclusive mode;
do $normalize_health004$
declare
  v_statements text[];
  v_name text;
  v_lf text;
begin
  select statements,name into v_statements,v_name
    from supabase_migrations.schema_migrations
    where version='202610130004' for update;
  if not found or v_name is distinct from 'health_daily'
     or cardinality(v_statements) is distinct from 1 then
    raise exception 'Migration history mismatch: 202610130004';
  end if;

  if md5(v_statements[1])='9a430516e9a44d8d27c651cf24e73e2b'
     and octet_length(v_statements[1])=67968 then return; end if;
  if md5(v_statements[1]) is distinct from 'ec77b7c1e820787e54e61da4b23bc990'
     or octet_length(v_statements[1]) is distinct from 69006 then
    raise exception 'Migration history mismatch: 202610130004';
  end if;
  v_lf := replace(v_statements[1],chr(13)||chr(10),chr(10));
  if md5(v_lf) is distinct from '9a430516e9a44d8d27c651cf24e73e2b'
     or octet_length(v_lf) is distinct from 67968 then
    raise exception 'Migration newline normalization mismatch: 202610130004';
  end if;
  update supabase_migrations.schema_migrations set statements=array[v_lf]
    where version='202610130004';
end
$normalize_health004$;
commit;

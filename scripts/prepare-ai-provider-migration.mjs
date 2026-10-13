import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root=new URL('../',import.meta.url)
const history=[
  ['202610130001','1d56c15aa7609c057d53a05b124b172d'],
  ['202610130002','c1e2788c3d67dccb544ab8166a6c096b'],
  ['202610130003','d13a863ec3337d16a4a968835d5ee12d'],
  ['202610130004','9a430516e9a44d8d27c651cf24e73e2b'],
]
const md5=text=>createHash('md5').update(text,'utf8').digest('hex')
for(const [version,expected] of history){
  const names={202610130001:'initial',202610130002:'space_lock_order',
    202610130003:'fixed_accounts',202610130004:'health_daily'}
  const source=(await readFile(new URL(`supabase/migrations/${version}_${names[version]}.sql`,root),'utf8'))
    .replace(/\r\n/g,'\n')
  if(md5(source)!==expected) throw new Error(`Migration ${version} source changed`)
}
const body=(await readFile(new URL('supabase/migrations/202610130005_ai_providers.sql',root),'utf8'))
  .replace(/\r\n/g,'\n')
if(body.includes('$ai005_body$')||body.includes('$ai005_apply$')) throw new Error('SQL quote delimiter collision')
const expected=md5(body)
const sql=`-- Generated from reviewed local migration. No passwords, keys or user IDs.
-- SQL Editor clipboard CRLF is normalized before source verification and registration.
begin;
lock table supabase_migrations.schema_migrations in share row exclusive mode;
do $ai005_apply$
declare
  v_source text := $ai005_body$${body}$ai005_body$;
  v_registered text[];
  v_name text;
  v_expected record;
  v_count integer;
begin
  v_source := replace(v_source,chr(13)||chr(10),chr(10));
  if md5(v_source) is distinct from '${expected}' then
    raise exception 'Migration source mismatch: 202610130005';
  end if;
  for v_expected in select * from (values
${history.map(([version,hash])=>`    ('${version}','${hash}')`).join(',\n')}
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
      or md5(v_registered[1]) is distinct from '${expected}'
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
`
const output=new URL('supabase/admin/apply-ai-providers-005.sql',root)
await writeFile(output,sql,'utf8')
console.log(`Prepared ${fileURLToPath(output)} (${Buffer.byteLength(sql)} bytes, source MD5 ${expected})`)

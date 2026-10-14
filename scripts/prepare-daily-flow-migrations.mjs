import {createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'

const history=[
 ['202610130001','initial','1d56c15aa7609c057d53a05b124b172d'],
 ['202610130002','space_lock_order','c1e2788c3d67dccb544ab8166a6c096b'],
 ['202610130003','fixed_accounts','d13a863ec3337d16a4a968835d5ee12d'],
 ['202610130004','health_daily','9a430516e9a44d8d27c651cf24e73e2b'],
 ['202610130005','ai_providers','2c57e2948216f3e08e2170754e1fd883'],
]
// Pin historical deployed sources. New reviewed migrations are embedded with their hashes.
const md5=text=>createHash('md5').update(text).digest('hex')
const source=async(version,name)=>(await readFile(new URL('../supabase/migrations/'+version+'_'+name+'.sql',import.meta.url),'utf8')).replace(/\r\n/g,'\n')
for(const [version,name,hash] of history) if(md5(await source(version,name))!==hash) throw new Error('Historical migration source changed: '+version)
const additions=await Promise.all([['202610140006','integrity'],['202610140007','daily_flow'],['202610140008','activities']].map(async([version,name])=>{
 const body=await source(version,name)
 if(body.includes('$daily_body$')||body.includes('$daily_apply$')) throw new Error('SQL delimiter collision')
 return {version,name,body,hash:md5(body)}
}))
let sql=`-- Generated reviewed migrations; no credentials or account identifiers.
-- Existing queued work without an explicit provider is failed by 006 before 007.
begin;
lock table supabase_migrations.schema_migrations in share row exclusive mode;
do $daily_apply$
declare expected record; registered text[]; registered_name text;
begin
 for expected in select * from (values
${history.map(([version,name,hash])=>` ('${version}','${name}','${hash}')`).join(',\n')}
 ) as required(version,name,hash) loop
  select statements,name into registered,registered_name from supabase_migrations.schema_migrations where version=expected.version;
  if not found or cardinality(registered) is distinct from 1 or md5(registered[1]) is distinct from expected.hash or registered_name is distinct from expected.name
  then raise exception 'Migration history mismatch: %',expected.version; end if;
 end loop;
 if (select count(*) from public.fixed_accounts)<>2 or (select count(*) from public.members)<>2
   or (select count(*) from auth.users)<>2 or (select count(distinct space_id) from public.fixed_accounts)<>1
   or (select count(*) from public.fixed_accounts f join public.members m on m.user_id=f.user_id and m.space_id=f.space_id
       join auth.users u on u.id=f.user_id where ((f.slot='me' and u.email='me@plans.invalid') or (f.slot='w' and u.email='w@plans.invalid'))
       and u.email_confirmed_at is not null and nullif(u.encrypted_password,'') is not null)<>2
 then raise exception 'Fixed two-account space precondition failed'; end if;
end $daily_apply$;
`
for(const {version,name,body,hash} of additions) sql+=`
do $daily_apply$
declare body text := $daily_body$${body}$daily_body$; registered text[]; registered_name text;
begin
 body:=replace(body,chr(13)||chr(10),chr(10));
 if md5(body) is distinct from '${hash}' then raise exception 'Migration source mismatch: ${version}'; end if;
 select statements,name into registered,registered_name from supabase_migrations.schema_migrations where version='${version}';
 if found then
  if cardinality(registered) is distinct from 1 or md5(registered[1]) is distinct from '${hash}' or registered_name is distinct from '${name}'
  then raise exception 'Migration history mismatch: ${version}'; end if;
 else
  execute body;
  insert into supabase_migrations.schema_migrations(version,statements,name) values('${version}',array[body],'${name}');
 end if;
end $daily_apply$;
`
sql+='commit;\n'
await writeFile(new URL('../supabase/admin/apply-daily-flow-006-008.sql',import.meta.url),sql)
console.log('Prepared 006/007/008 wrapper: '+additions.map(x=>x.version+' MD5 '+x.hash).join('; '))

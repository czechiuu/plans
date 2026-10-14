import {createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'

const history=[
 ['202610130001','initial','1d56c15aa7609c057d53a05b124b172d'],
 ['202610130002','space_lock_order','c1e2788c3d67dccb544ab8166a6c096b'],
 ['202610130003','fixed_accounts','d13a863ec3337d16a4a968835d5ee12d'],
 ['202610130004','health_daily','9a430516e9a44d8d27c651cf24e73e2b'],
 ['202610130005','ai_providers','2c57e2948216f3e08e2170754e1fd883'],
 ['202610140006','integrity','387cc96e9854379726dec49837109f69'],
 ['202610140007','daily_flow','a5d069d7931d57a8c9c103d68de54b85'],
 ['202610140008','activities','51fba87f159fb01a44d55920fc7d0891'],
 ['202610140009','input_snapshots','dc32be5c3b0d7dd7539ee636001d7e74'],
]
const md5=text=>createHash('md5').update(text).digest('hex')
const source=async(version,name)=>(await readFile(new URL(`../supabase/migrations/${version}_${name}.sql`,import.meta.url),'utf8')).replace(/\r\n/g,'\n')
for(const [version,name,hash] of history) if(md5(await source(version,name))!==hash) throw new Error('Historical migration source changed: '+version)
const body=await source('202610140010','generation_budget_rounds'),hash=md5(body)
if(body.includes('$generation_body$')||body.includes('$generation_apply$')) throw new Error('SQL delimiter collision')
const sql=`-- Apply only 010; verify, never reapply, deployed 001-009 sources.
begin;
lock table supabase_migrations.schema_migrations in share row exclusive mode;
do $generation_apply$
declare expected record;registered text[];registered_name text;
begin
 for expected in select * from (values
${history.map(([version,name,digest])=>` ('${version}','${name}','${digest}')`).join(',\n')}
 ) required(version,name,hash) loop
  select statements,name into registered,registered_name from supabase_migrations.schema_migrations where version=expected.version;
  if not found or cardinality(registered) is distinct from 1 or md5(registered[1]) is distinct from expected.hash or registered_name is distinct from expected.name
  then raise exception 'Migration history mismatch: %',expected.version; end if;
 end loop;
end $generation_apply$;
do $generation_apply$
declare body text:=$generation_body$${body}$generation_body$;registered text[];registered_name text;
begin
 body:=replace(body,chr(13)||chr(10),chr(10));
 if md5(body) is distinct from '${hash}' then raise exception 'Migration source mismatch: 202610140010'; end if;
 select statements,name into registered,registered_name from supabase_migrations.schema_migrations where version='202610140010';
 if found then
  if cardinality(registered) is distinct from 1 or md5(registered[1]) is distinct from '${hash}' or registered_name is distinct from 'generation_budget_rounds'
  then raise exception 'Migration history mismatch: 202610140010'; end if;
 else
  execute body;
  insert into supabase_migrations.schema_migrations(version,statements,name) values('202610140010',array[body],'generation_budget_rounds');
 end if;
end $generation_apply$;
commit;
`
await writeFile(new URL('../supabase/admin/apply-generation-budget-010.sql',import.meta.url),sql)
console.log('Prepared standalone 010 wrapper; migration MD5 '+hash)

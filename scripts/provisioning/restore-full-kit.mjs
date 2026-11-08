// Local structural acceptance only. Never connects to a database server.
// node restore-full-kit.mjs KIT_DIRECTORY PGLITE_DIST_INDEX_JS REPORT_DIRECTORY
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
if(process.argv.length!==5)throw new Error('Usage: restore-full-kit.mjs KIT_DIRECTORY PGLITE_DIST_INDEX_JS REPORT_DIRECTORY');
const root=resolve(process.argv[2]),output=resolve(process.argv[4]);
assert.notEqual(root,output,'Reports must be separate from the immutable candidate');
mkdirSync(output,{recursive:true});
const entry=pathToFileURL(resolve(process.argv[3]));
const {PGlite}=await import(entry.href);
const extensionNames=['pgcrypto','pg_trgm','unaccent','uuid_ossp','moddatetime'];
const extensions={};
for(const name of extensionNames){extensions[name]=(await import(new URL('./contrib/'+name+'.js',entry).href))[name];}
const {pgcrypto,pg_trgm,unaccent,uuid_ossp,moddatetime}=extensions;
const manifest=JSON.parse(readFileSync(root+'/manifesto.json','utf8'));
for(const [name,hash] of Object.entries(manifest.sha256)){
 assert.match(name,/^[A-Za-z0-9_.-]+$/);
 assert.equal(createHash('sha256').update(readFileSync(root+'/'+name)).digest('hex'),hash,'Candidate digest mismatch: '+name);
}
const sql=readFileSync(root+'/01-estrutura-CANDIDATO-BLOQUEADO.sql','utf8');
const db=new PGlite({extensions:{pgcrypto,pg_trgm,unaccent,uuid_ossp,moddatetime}});
try {
 const managedSetup=`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;CREATE SCHEMA storage;CREATE SCHEMA extensions;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb,raw_app_meta_data jsonb);
 CREATE TABLE storage.objects(id uuid,bucket_id text,name text,owner uuid,owner_id text,metadata jsonb);
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
 GRANT EXECUTE ON FUNCTION auth.uid(),auth.role() TO anon,authenticated,service_role;`;
 await db.exec(managedSetup);
 await assert.rejects(db.exec(sql),/homologação/);await db.exec('ROLLBACK');
 // Release only the in-memory structural candidate in this disposable local DB.
 const restore=sql.replace(/DO \$guard\$[\s\S]*?END \$guard\$;/,'');
 try {await db.exec(restore);} catch(e){writeFileSync(output+'/restore-error.json',JSON.stringify({code:e.code,message:e.message,detail:e.detail,position:e.position}));console.log('RESTORE FAILED:',e.code,e.message);process.exitCode=1;await db.exec('ROLLBACK');}
 if(!process.exitCode){
 const tables=(await db.query("SELECT c.relname name,c.relrowsecurity rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname")).rows;
 assert.equal(tables.length,manifest.quantidades.tables);assert.ok(tables.every(t=>t.rls));
 for(const t of tables)assert.equal((await db.query('SELECT count(*)::int n FROM public."'+t.name.replaceAll('"','""')+'"')).rows[0].n,0);
 const policies=readFileSync(root+'/02-politicas-arquivos-CANDIDATO-BLOQUEADO.sql','utf8').replace(/DO \$guard\$[\s\S]*?END \$guard\$;/,'');
 await db.exec(policies);

 const expectedCount=manifest.quantidades.functions;
 const functions=(await db.query("SELECT p.proname name,pg_get_function_identity_arguments(p.oid) arguments FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')")).rows;
 assert.equal(functions.length,expectedCount);
 const definitions=(await db.query("SELECT pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')")).rows;
 await db.exec('SET check_function_bodies=true; SET search_path=public,extensions;');
 for(const item of definitions) await db.exec(item.definition);

 const constraints=(await db.query("SELECT count(*)::int n FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype<>'n'")).rows[0].n;
 assert.equal(constraints,manifest.quantidades.constraints);
 const policyCount=(await db.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='public' OR (schemaname='storage' AND tablename='objects')")).rows[0].n;
 assert.equal(policyCount,manifest.quantidades.policies);
 const indexes=(await db.query("SELECT count(*)::int n FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT EXISTS(SELECT 1 FROM pg_constraint co WHERE co.conindid=x.indexrelid)")).rows[0].n;
 assert.equal(indexes,manifest.quantidades.indexes);
 const triggers=(await db.query("SELECT count(*)::int n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE NOT t.tgisinternal AND (n.nspname='public' OR (n.nspname='auth' AND c.relname='users' AND pn.nspname='public'))")).rows[0].n;
 assert.equal(triggers,manifest.quantidades.triggers);
 const views=(await db.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v'")).rows[0].n;
 assert.equal(views,manifest.quantidades.views);

 await db.exec('SET ROLE authenticated');
 for(const call of ["SELECT public.list_profession_careness_setup()","SELECT public.confirm_profession_careness_mapping('test')","SELECT public.save_profession_careness_rule('test','Test',true,30,'days','global',false)"]) await assert.rejects(db.exec(call),/Somente Master/);
 await assert.rejects(db.exec("INSERT INTO public.profession_careness_mapping_state(id) VALUES(true)"),/permission denied/);
 await db.exec('RESET ROLE');
 await db.exec("BEGIN; CREATE TABLE public.rollback_probe(id int);");
 await assert.rejects(db.exec("SELECT definitely_missing_function()")); await db.exec('ROLLBACK');
 assert.equal((await db.query("SELECT to_regclass('public.rollback_probe') IS NULL missing")).rows[0].missing,true);
 await assert.rejects(db.exec(restore),/Destino não vazio/);await db.exec('ROLLBACK');
 await db.exec("INSERT INTO public.unidades(id,nome) VALUES ('test-unit-a','Unit A'),('test-unit-b','Unit B');");
 await db.exec("INSERT INTO public.funcionarios(nome,usuario,email,auth_user_id,unidade_id,role,ativo) VALUES ('Synthetic Reception','synthetic-reception','reception@example.invalid','00000000-0000-4000-8000-000000000a01','test-unit-a','recepcao',true);");
 await db.exec("BEGIN; SET LOCAL session_replication_role=replica; INSERT INTO public.agendamentos(id,unidade_id,hora) VALUES ('synthetic-a','test-unit-a','09:00'),('synthetic-b','test-unit-b','10:00'); COMMIT;");
 await db.exec("SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a01',false);");
 const visible=(await db.query("SELECT count(*)::int n FROM public.agendamentos WHERE unidade_id='test-unit-b'")).rows[0].n;
 await db.exec('RESET ROLE');
 assert.equal(visible,0);
 await db.exec("SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a01',false);");
 assert.equal((await db.query("SELECT count(*)::int n FROM public.agendamentos WHERE unidade_id='test-unit-a'")).rows[0].n,1);
 assert.equal((await db.query("DELETE FROM public.agendamentos WHERE id='synthetic-b' RETURNING id")).rows.length,0);
 await db.exec('RESET ROLE');
 console.log('CROSS-UNIT RLS: foreign appointments hidden, own unit preserved, foreign deletion denied');
 writeFileSync(output+'/unit-isolation-result.json',JSON.stringify({foreignUnitVisible:visible,isolationPassed:visible===0}));

 const rollbackDb=new PGlite({extensions:{pgcrypto,pg_trgm,unaccent,uuid_ossp,moddatetime}});
 try {
   await rollbackDb.exec(managedSetup);
   const brokenRestore=restore.replace(/COMMIT;\s*$/, 'SELECT deliberately_missing_restore_probe(); COMMIT;');
   assert.notEqual(brokenRestore,restore);
   await assert.rejects(rollbackDb.exec(brokenRestore),/deliberately_missing_restore_probe/);
   await rollbackDb.exec('ROLLBACK');
   assert.equal((await rollbackDb.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'")).rows[0].n,0);
 } finally { await rollbackDb.close(); }
 console.log('PASS: complete schema restore, all tables empty before fixtures, RLS, mapping permission checks, rollback and appointment unit isolation');
 writeFileSync(output+'/restore-result.json',JSON.stringify({tables:tables.length,functions:functions.length,functionDefinitionsRevalidated:true,constraints,indexes,triggers,views,policies:policyCount,allRls:true,allEmptyBeforeFixtures:true,storagePolicies:true,rollback:true,appointmentUnitIsolation:visible===0,managedAuth:'local_emulation',cloudServicesValidated:false,fullRestoreRollback:true}));
 }
}finally{await db.close();}

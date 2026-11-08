// Structural smoke test only. Never reads tenant metadata or connects to a server.
// Usage: node scripts/provisioning/restore-smoke.mjs /absolute/path/to/pglite/dist/index.js
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

if (!process.argv[2]) throw new Error('Provide the installed PGlite module path (tested with 0.5.15).');
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const root = mkdtempSync(join(tmpdir(), 'clean-kit-smoke-'));
const builder = fileURLToPath(new URL('./build-clean-kit.py', import.meta.url));
let db;
try {
  const python = String.raw`
import importlib.util,json,pathlib,sys
spec=importlib.util.spec_from_file_location('kit',sys.argv[1])
kit=importlib.util.module_from_spec(spec);spec.loader.exec_module(kit)
root=pathlib.Path(sys.argv[2]);source=root/'metadata';source.mkdir()
data={key:[] for key in kit.REQUIRED_METADATA}
data['tables']=[{'name':'kit_probe','rls':True,'force_rls':False,'columns':[
 {'name':'id','type':'uuid','not_null':True,'identity':'','generated':'','default':None}]}]
data['constraints']=[{'table_name':'kit_probe','name':'kit_probe_pkey','type':'p','definition':'PRIMARY KEY (id)'}]
data['table_grants']=[{'table_name':'kit_probe','grantee':'authenticated','privilege_type':'SELECT'}]
data['policies']=[{'policyname':'deny_unowned','schemaname':'public','tablename':'kit_probe',
 'permissive':'PERMISSIVE','cmd':'SELECT','roles':['authenticated'],'qual':'false','with_check':None}]
for name,rows in data.items(): (source/(name+'.json')).write_text(json.dumps(rows))
kit.build(source,root/'kit')
`;
  const generated = spawnSync('python', ['-c', python, builder, root], { encoding: 'utf8' });
  if (generated.status !== 0) throw new Error(generated.stderr || 'Fixture generation failed');
  const sql = readFileSync(join(root, 'kit', '01-estrutura-CANDIDATO-BLOQUEADO.sql'), 'utf8');
  db = new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await assert.rejects(db.exec(sql), /homologação/);
  await db.exec('ROLLBACK');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_class WHERE relname='kit_probe'")).rows[0].n, 0);
  // Unlock ONLY this generated synthetic fixture in memory, never a real schema candidate.
  const fixtureSql = sql.replace(/DO \$guard\$[\s\S]*?END \$guard\$;/, '');
  assert.notEqual(fixtureSql, sql);
  await db.exec(fixtureSql);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.kit_probe')).rows[0].n, 0);
  assert.equal((await db.query("SELECT relrowsecurity AS rls FROM pg_class WHERE relname='kit_probe'")).rows[0].rls, true);
  await db.exec('SET ROLE authenticated');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.kit_probe')).rows[0].n, 0);
  await assert.rejects(db.exec("INSERT INTO public.kit_probe VALUES ('00000000-0000-4000-8000-000000000001')"), /permission denied/);
  await db.exec('RESET ROLE');
  await assert.rejects(db.exec(fixtureSql), /Destino não vazio/);
  await db.exec('ROLLBACK');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.kit_probe')).rows[0].n, 0);
  console.log('PASS: candidate block, rollback, empty restore, RLS, denied write, nonempty refusal');
} finally {
  if (db) await db.close();
  rmSync(root, { recursive: true, force: true });
}

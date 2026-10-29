// Isolated PostgreSQL only. Requires @electric-sql/pglite in the test environment.
// Optionally set PGLITE_MODULE to its absolute module URL/path. Never connects to production.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const db = new PGlite();
try {
  let fixture = read('supabase/tests/fixtures/treatment_integrity_schema.sql');
  fixture = fixture.replace(/CREATE TABLE public\.agendamentos\([^;]*;/, read('supabase/tests/fixtures/agendamentos_live_20261029.sql'));
  fixture = fixture.replace(/ALTER TABLE public\.agendamentos[^;]*;/g, '');
  await db.exec(fixture);
  await db.exec(read('supabase/migrations/20261022113512_treatment_cycle_integrity.sql'));
  const regularization = read('supabase/migrations/20261022123911_treatment_manual_regularization.sql');
  const guardStart = regularization.indexOf('CREATE OR REPLACE FUNCTION public.guard_treatment_session_integrity()');
  await db.exec(regularization.slice(guardStart, regularization.indexOf('END $function$;', guardStart) + 'END $function$;'.length));
  await db.exec(read('drizzle/migrations/0003_treatment_cycle_free_extend_delete.sql').split('-- Exclusão:')[0]);
  await db.exec(read('drizzle/migrations/0004_treatment_extension_delta_guard.sql'));
  await db.exec(read('drizzle/migrations/0005_agenda_treatment_date_sync.sql'));
  const columns = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='agendamentos'")).rows.map(r => r.column_name);
  if (columns.includes('hora_chegada')) throw new Error('Invalid fixture: hora_chegada must not exist');
  let reproduced = false;
  try { await db.exec(read('supabase/tests/agenda_treatment_sync.test.sql')); }
  catch (error) {
    if (!String(error.message).includes('hora_chegada')) throw error;
    reproduced = true;
    console.log('PASS: reproduced deployed hora_chegada error on the real column structure');
    await db.exec('ROLLBACK');
  }
  if (!reproduced) throw new Error('Regression test did not reproduce the original failure');
  await db.exec(read('drizzle/migrations/0006_agenda_sync_real_schema.sql'));
  const definition = (await db.query("SELECT pg_get_functiondef('public.update_agenda_treatment_appointment(text,jsonb,jsonb)'::regprocedure) AS definition")).rows[0].definition;
  for (const [, field] of definition.matchAll(/proposed\.([a-z_0-9]+)/g)) {
    if (!columns.includes(field)) throw new Error(`Function references missing column: ${field}`);
  }
  for (const file of ['supabase/tests/treatment_cycle_integrity.test.sql','supabase/tests/treatment_extension_delta.test.sql','supabase/tests/agenda_treatment_sync.test.sql']) {
    await db.exec(read(file));
    console.log(`PASS: ${file}`);
  }
} catch (error) { console.error('FAIL:', error.code, error.message, error.where || ''); process.exitCode = 1; } finally { await db.close(); }

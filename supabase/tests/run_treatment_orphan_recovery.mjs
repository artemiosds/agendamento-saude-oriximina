// Isolated PostgreSQL only. Same column snapshot as the schema regression runner.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const db=new PGlite();
try {
 let fixture=read('supabase/tests/fixtures/treatment_integrity_schema.sql').replace(/CREATE TABLE public\.agendamentos\([^;]*;/,read('supabase/tests/fixtures/agendamentos_live_20261029.sql')).replace(/ALTER TABLE public\.agendamentos[^;]*;/g,'');
 await db.exec(fixture);
 await db.exec('ALTER TABLE treatment_cycles ADD PRIMARY KEY(id); ALTER TABLE treatment_sessions ADD CONSTRAINT test_real_cycle_fk FOREIGN KEY(cycle_id) REFERENCES treatment_cycles(id) ON DELETE CASCADE;');
 // Minimal stubs use verified real columns; no records or clinical behavior are simulated.
 await db.exec('CREATE TABLE prontuarios(id uuid DEFAULT gen_random_uuid(),agendamento_id text); CREATE TABLE atendimentos(id uuid DEFAULT gen_random_uuid(),agendamento_id text); CREATE TABLE triage_records(agendamento_id text); CREATE TABLE fila_espera(id text);');
 await db.exec(read('supabase/migrations/20261022113512_treatment_cycle_integrity.sql'));
 await db.exec(read('supabase/tests/fixtures/treatment_booking_rpc.sql'));
 await db.exec(read('supabase/migrations/20261022123911_treatment_manual_regularization.sql'));
 await db.exec(read('drizzle/migrations/0003_treatment_cycle_free_extend_delete.sql'));
 await db.exec(read('drizzle/migrations/0004_treatment_extension_delta_guard.sql'));
 await db.exec(read('drizzle/migrations/0005_agenda_treatment_date_sync.sql'));
 await db.exec(read('drizzle/migrations/0006_agenda_sync_real_schema.sql'));
 await db.exec(read('drizzle/migrations/0007_treatment_missing_appointment_recovery.sql'));
 await db.exec(read('drizzle/migrations/0008_treatment_professional_resolution.sql'));
 await db.exec(read('supabase/tests/treatment_professional_resolution.test.sql'));
 await db.exec(read('supabase/tests/treatment_orphan_recovery.test.sql'));
 console.log('PASS: orphan recovery / schedule / unschedule / deletion / history / scope');
 await db.exec(read('supabase/tests/agenda_treatment_sync.test.sql'));
 console.log('PASS: existing atomic Agenda synchronization SQL suite');
} catch(e){console.error('FAIL:',e.code,e.message,e.where||'');process.exitCode=1;}
finally {await db.close();}

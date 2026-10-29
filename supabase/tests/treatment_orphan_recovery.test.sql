-- ISOLATED FIXTURE ONLY. All mutations are rolled back, never production data.
BEGIN;
SELECT set_config('test.auth_uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
DO $$
DECLARE sid uuid; result jsonb; original_count integer; n integer; old_date date;
BEGIN
 SELECT id,scheduled_date INTO sid,old_date FROM treatment_sessions WHERE cycle_id='00000000-0000-0000-0000-000000000001' AND session_number=1;
 -- A historical orphan, seeded explicitly only in this isolated database.
 INSERT INTO agendamentos(id,paciente_id,profissional_id,unidade_id,data,hora,status) VALUES('old-orphan','patient','22222222-2222-2222-2222-222222222222','u',old_date,'08:00','confirmado');
 UPDATE treatment_sessions SET appointment_id='old-orphan',status='agendada' WHERE id=sid;
 ALTER TABLE agendamentos DISABLE TRIGGER trg_release_treatment_before_appointment_delete;
 DELETE FROM agendamentos WHERE id='old-orphan';
 ALTER TABLE agendamentos ENABLE TRIGGER trg_release_treatment_before_appointment_delete;
 SELECT count(*) INTO original_count FROM treatment_sessions;
 result:=recover_missing_treatment_appointments('00000000-0000-0000-0000-000000000001');
 IF NOT (result->'recovered_ids' ? sid::text) OR NOT EXISTS(SELECT 1 FROM treatment_sessions WHERE id=sid AND session_number=1 AND status='pendente_agendamento' AND appointment_id IS NULL AND scheduled_date IS NULL) THEN RAISE EXCEPTION 'Orphan not recovered'; END IF;
 IF (SELECT count(*) FROM treatment_sessions)<>original_count THEN RAISE EXCEPTION 'Session created or deleted'; END IF;
 SELECT count(*) INTO n FROM action_logs WHERE acao='liberar_sessao_agendamento_ausente';
 PERFORM recover_missing_treatment_appointments('00000000-0000-0000-0000-000000000001');
 IF (SELECT count(*) FROM action_logs WHERE acao='liberar_sessao_agendamento_ausente')<>n THEN RAISE EXCEPTION 'Duplicate recovery audit'; END IF;
 result:=schedule_treatment_session_checked(sid,'00000000-0000-0000-0000-000000000001',NULL,
  '{"id":"new-reservation","paciente_id":"patient","paciente_nome":"TESTE","profissional_id":"22222222-2222-2222-2222-222222222222","profissional_nome":"TESTE","unidade_id":"u","data":"2031-01-07","hora":"08:00","status":"confirmado","tipo":"Sessão de Tratamento"}',false,false,'Motivo não informado (campo opcional).');
 IF result->>'status'<>'agendado' OR NOT EXISTS(SELECT 1 FROM treatment_sessions WHERE id=sid AND session_number=1 AND appointment_id='new-reservation' AND status='agendada') THEN RAISE EXCEPTION 'Recovered session cannot be scheduled: %',result; END IF;
 result:=unschedule_treatment_session(sid,'00000000-0000-0000-0000-000000000001','new-reservation','2031-01-07');
 IF result->>'status'<>'desmarcado' OR EXISTS(SELECT 1 FROM agendamentos WHERE id='new-reservation') THEN RAISE EXCEPTION 'Existing unschedule broken: %',result; END IF;
 RAISE NOTICE 'PASS: scoped recovery, stable number/count, idempotent audit, normal scheduling and normal unscheduling';
END $$;
ROLLBACK;

BEGIN;
SELECT set_config('test.auth_uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
DO $$
DECLARE sid uuid; d date; failed boolean;
BEGIN
 SELECT id,scheduled_date INTO sid,d FROM treatment_sessions WHERE cycle_id='00000000-0000-0000-0000-000000000001' AND session_number=1;
 INSERT INTO agendamentos(id,paciente_id,profissional_id,unidade_id,data,hora,status) VALUES('delete-linked','patient','22222222-2222-2222-2222-222222222222','u',d,'08:00','confirmado');
 UPDATE treatment_sessions SET appointment_id='delete-linked',status='agendada' WHERE id=sid;
 DELETE FROM agendamentos WHERE id='delete-linked';
 IF NOT EXISTS(SELECT 1 FROM treatment_sessions WHERE id=sid AND status='pendente_agendamento' AND appointment_id IS NULL AND scheduled_date IS NULL) THEN RAISE EXCEPTION 'Deletion left an orphan'; END IF;
 INSERT INTO agendamentos(id,paciente_id,profissional_id,unidade_id,data,hora,status) VALUES('protected-linked','patient','22222222-2222-2222-2222-222222222222','u','2031-01-07','08:00','concluido');
 PERFORM set_config('app.treatment_change_reason','Fixture',true);
 UPDATE treatment_sessions SET scheduled_date='2031-01-07',appointment_id='protected-linked',status='realizada' WHERE id=sid;
 failed:=false;
 BEGIN DELETE FROM agendamentos WHERE id='protected-linked'; EXCEPTION WHEN check_violation THEN failed:=true; END;
 IF NOT failed OR NOT EXISTS(SELECT 1 FROM agendamentos WHERE id='protected-linked') OR (SELECT status FROM treatment_sessions WHERE id=sid)<>'realizada' THEN RAISE EXCEPTION 'Clinical history was not protected'; END IF;
 RAISE NOTICE 'PASS: Agenda deletion releases reservation; clinical history remains protected';
END $$;
ROLLBACK;

BEGIN;
SELECT set_config('test.auth_uid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true);
-- Different cycle/professional and unit must never be writable by the current professional.
INSERT INTO treatment_cycles(id,patient_id,professional_id,unit_id,total_sessions,status) VALUES('00000000-0000-0000-0000-000000000098','patient','11111111-1111-1111-1111-111111111111','u',1,'em_andamento');
INSERT INTO treatment_sessions(cycle_id,patient_id,professional_id,session_number,total_sessions,scheduled_date,status) VALUES('00000000-0000-0000-0000-000000000098','patient','11111111-1111-1111-1111-111111111111',1,1,'2031-01-07','pendente_agendamento');
SET CONSTRAINTS trg_guard_treatment_plan_count IMMEDIATE;
SET CONSTRAINTS trg_guard_treatment_plan_count DEFERRED;
SELECT set_config('test.auth_uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
DO $$ DECLARE failed boolean:=false; BEGIN
 BEGIN PERFORM recover_missing_treatment_appointments('00000000-0000-0000-0000-000000000098'); EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Cross-professional recovery accepted'; END IF;
END $$;
ROLLBACK;

-- An appointment hidden by RLS is not an absent appointment.
BEGIN;
SELECT set_config('test.auth_uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
INSERT INTO agendamentos(id,paciente_id,profissional_id,unidade_id,data,hora,status)
 SELECT 'hidden-existing','patient','22222222-2222-2222-2222-222222222222','u',scheduled_date,'08:00','confirmado'
 FROM treatment_sessions WHERE cycle_id='00000000-0000-0000-0000-000000000001' AND session_number=1;
UPDATE treatment_sessions SET appointment_id='hidden-existing',status='agendada' WHERE cycle_id='00000000-0000-0000-0000-000000000001' AND session_number=1;
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; BEGIN
 IF EXISTS(SELECT 1 FROM agendamentos WHERE id='hidden-existing') THEN RAISE EXCEPTION 'RLS fixture did not hide appointment'; END IF;
 r:=recover_missing_treatment_appointments('00000000-0000-0000-0000-000000000001');
 IF jsonb_array_length(r->'recovered_ids')<>0 THEN RAISE EXCEPTION 'RLS-hidden appointment released incorrectly'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM treatment_sessions WHERE appointment_id='hidden-existing' AND status='agendada') THEN RAISE EXCEPTION 'Hidden appointment link was modified'; END IF; END $$;
ROLLBACK;

-- A log failure must roll back both deletion and reservation release.
BEGIN;
SELECT set_config('test.auth_uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
INSERT INTO agendamentos(id,paciente_id,profissional_id,unidade_id,data,hora,status)
 SELECT 'failed-audit','patient','22222222-2222-2222-2222-222222222222','u',scheduled_date,'08:00','confirmado'
 FROM treatment_sessions WHERE cycle_id='00000000-0000-0000-0000-000000000001' AND session_number=1;
UPDATE treatment_sessions SET appointment_id='failed-audit',status='agendada' WHERE cycle_id='00000000-0000-0000-0000-000000000001' AND session_number=1;
CREATE FUNCTION public.test_fail_release_log() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.acao='liberar_sessao_apos_exclusao_agenda' THEN RAISE EXCEPTION 'Injected audit failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER test_fail_release_log BEFORE INSERT ON action_logs FOR EACH ROW EXECUTE FUNCTION public.test_fail_release_log();
DO $$ DECLARE failed boolean:=false; BEGIN
 BEGIN DELETE FROM agendamentos WHERE id='failed-audit'; EXCEPTION WHEN raise_exception THEN failed:=true; END;
 IF NOT failed OR NOT EXISTS(SELECT 1 FROM agendamentos WHERE id='failed-audit') OR NOT EXISTS(SELECT 1 FROM treatment_sessions WHERE appointment_id='failed-audit' AND status='agendada') THEN RAISE EXCEPTION 'Audit failure left a partial deletion'; END IF;
END $$;
ROLLBACK;

-- Existing explicit cycle deletion still removes untouched future reservations.
BEGIN;
SELECT set_config('test.auth_uid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true);
DO $$
DECLARE cid uuid:='00000000-0000-0000-0000-000000000099'; r jsonb;
BEGIN
 PERFORM save_treatment_cycle_plan(jsonb_build_object('id',cid,'patient_id','patient','professional_id','22222222-2222-2222-2222-222222222222','unit_id','u','total_sessions',1,'start_date','2099-01-07','frequency','manual','treatment_type','TESTE'),ARRAY['2099-01-07']::date[],NULL,0);
 INSERT INTO agendamentos(id,paciente_id,profissional_id,unidade_id,data,hora,status) VALUES('delete-cycle-ag','patient','22222222-2222-2222-2222-222222222222','u','2099-01-07','08:00','confirmado');
 UPDATE treatment_sessions SET appointment_id='delete-cycle-ag',status='agendada' WHERE cycle_id=cid;
 r:=delete_treatment_cycle_with_appointments(cid,'Exclusão explícita de teste');
 IF EXISTS(SELECT 1 FROM treatment_cycles WHERE id=cid) OR EXISTS(SELECT 1 FROM treatment_sessions WHERE cycle_id=cid) OR EXISTS(SELECT 1 FROM agendamentos WHERE id='delete-cycle-ag') OR (r->>'appointments_removed')::integer<>1 THEN RAISE EXCEPTION 'Existing cycle deletion broken'; END IF;
 SET CONSTRAINTS trg_guard_treatment_plan_count IMMEDIATE;
END $$;
ROLLBACK;

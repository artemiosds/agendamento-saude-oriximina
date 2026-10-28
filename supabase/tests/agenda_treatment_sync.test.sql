-- Isolated fixture only. Every clinical mutation is rolled back.
BEGIN;
SELECT set_config('test.auth_uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
DO $$
DECLARE sid uuid; original_date date; failed boolean; audits integer;
BEGIN
 SELECT id,scheduled_date INTO sid,original_date FROM treatment_sessions WHERE cycle_id='00000000-0000-0000-0000-000000000001' AND session_number=1;
 INSERT INTO agendamentos(id,paciente_id,profissional_id,unidade_id,data,hora,status) VALUES('sync-ag','patient','22222222-2222-2222-2222-222222222222','u',original_date,'16:25','confirmado');
 UPDATE treatment_sessions SET appointment_id='sync-ag',status='agendada' WHERE id=sid;
 SELECT count(*) INTO audits FROM action_logs;
 PERFORM update_agenda_treatment_appointment('sync-ag','{"data":"2031-01-07","hora":"15:00"}',jsonb_build_object('data',original_date,'hora','16:25','profissional_id','22222222-2222-2222-2222-222222222222'));
 IF (SELECT scheduled_date FROM treatment_sessions WHERE id=sid)<>'2031-01-07' OR (SELECT data FROM agendamentos WHERE id='sync-ag')<>'2031-01-07' THEN RAISE EXCEPTION 'Agenda and session diverged'; END IF;
 IF (SELECT count(*) FROM action_logs)<>audits+1 THEN RAISE EXCEPTION 'Missing audit'; END IF;
 failed:=false;
 BEGIN PERFORM update_agenda_treatment_appointment('sync-ag','{"data":"2030-02-04"}',NULL); EXCEPTION WHEN check_violation THEN failed:=true; END;
 IF NOT failed OR (SELECT data FROM agendamentos WHERE id='sync-ag')<>'2031-01-07' OR (SELECT scheduled_date FROM treatment_sessions WHERE id=sid)<>'2031-01-07' THEN RAISE EXCEPTION 'Duplicate rollback failed'; END IF;
 failed:=false;
 BEGIN PERFORM update_agenda_treatment_appointment('sync-ag','{"data":"2031-01-14"}',jsonb_build_object('data',original_date,'hora','16:25','profissional_id','22222222-2222-2222-2222-222222222222')); EXCEPTION WHEN serialization_failure THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Stale edit accepted'; END IF;
 failed:=false;
 BEGIN PERFORM update_agenda_treatment_appointment('sync-ag','{"profissional_id":"11111111-1111-1111-1111-111111111111"}',NULL); EXCEPTION WHEN check_violation THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Professional reassigned without cycle'; END IF;
 -- Simulate a legacy date mismatch introduced by an older Agenda client.
 UPDATE agendamentos SET data='2031-01-14' WHERE id='sync-ag';
 PERFORM align_treatment_session_to_agenda(sid,'2031-01-07','sync-ag','2031-01-14');
 IF (SELECT scheduled_date FROM treatment_sessions WHERE id=sid)<>'2031-01-14' THEN RAISE EXCEPTION 'Legacy alignment failed'; END IF;
 UPDATE treatment_sessions SET status='realizada' WHERE id=sid;
 failed:=false;
 BEGIN PERFORM update_agenda_treatment_appointment('sync-ag','{"data":"2031-01-21"}',NULL); EXCEPTION WHEN check_violation THEN failed:=true; END;
 IF NOT failed OR (SELECT data FROM agendamentos WHERE id='sync-ag')<>'2031-01-14' THEN RAISE EXCEPTION 'Clinical history moved'; END IF;
 RAISE NOTICE 'PASS: atomic move, duplicate rollback, audit, stale edit, identity protection, explicit alignment, clinical protection';
END $$;
ROLLBACK;

BEGIN;
SELECT set_config('test.auth_uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
DO $$
DECLARE sid uuid; original_date date; failed boolean;
BEGIN
 INSERT INTO agendamentos(id,paciente_id,profissional_id,unidade_id,data,hora,status) VALUES('plain-ag','patient','22222222-2222-2222-2222-222222222222','u','2031-01-07','16:25','confirmado');
 PERFORM update_agenda_treatment_appointment('plain-ag','{"data":"2031-01-14"}',NULL);
 IF (SELECT data FROM agendamentos WHERE id='plain-ag')<>'2031-01-14' THEN RAISE EXCEPTION 'Ordinary appointment broken'; END IF;
 IF EXISTS(SELECT 1 FROM treatment_sessions WHERE appointment_id='plain-ag') THEN RAISE EXCEPTION 'Invented treatment session'; END IF;
 SELECT id,scheduled_date INTO sid,original_date FROM treatment_sessions WHERE cycle_id='00000000-0000-0000-0000-000000000001' AND session_number=1;
 failed:=false;
 BEGIN PERFORM align_treatment_session_to_agenda(sid,original_date,'missing-ag','2031-01-14'); EXCEPTION WHEN serialization_failure THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Missing link guessed'; END IF;
 failed:=false;
 BEGIN PERFORM update_agenda_treatment_appointment('plain-ag','{"paciente_id":"other"}',NULL); EXCEPTION WHEN check_violation THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Unapproved patch field accepted'; END IF;
 RAISE NOTICE 'PASS: ordinary appointments unchanged, missing links never guessed, patch restricted';
END $$;
ROLLBACK;

-- A denied session update must never leave only the Agenda changed.
BEGIN;
SELECT set_config('test.auth_uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
INSERT INTO agendamentos(id,paciente_id,profissional_id,unidade_id,data,hora,status)
 SELECT 'rls-sync','patient','22222222-2222-2222-2222-222222222222','u',scheduled_date,'16:25','confirmado'
 FROM treatment_sessions WHERE cycle_id='00000000-0000-0000-0000-000000000001' AND session_number=1;
UPDATE treatment_sessions SET appointment_id='rls-sync',status='agendada' WHERE cycle_id='00000000-0000-0000-0000-000000000001' AND session_number=1;
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER TABLE treatment_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sync_test_read ON treatment_sessions FOR SELECT TO authenticated USING(true);
CREATE POLICY sync_test_no_update ON treatment_sessions FOR UPDATE TO authenticated USING(false) WITH CHECK(false);
SET LOCAL ROLE authenticated;
DO $$
DECLARE failed boolean:=false; old_date date;
BEGIN
 SELECT data INTO old_date FROM agendamentos WHERE id='rls-sync';
 BEGIN PERFORM update_agenda_treatment_appointment('rls-sync','{"data":"2031-01-07"}',NULL);
 EXCEPTION WHEN insufficient_privilege OR serialization_failure THEN failed:=true; END;
 IF NOT failed OR (SELECT data FROM agendamentos WHERE id='rls-sync') IS DISTINCT FROM old_date THEN RAISE EXCEPTION 'Session RLS denial left a partial Agenda update'; END IF;
END $$;
ROLLBACK;

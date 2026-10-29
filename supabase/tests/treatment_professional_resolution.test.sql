-- Isolated fixture only; all mutations rolled back.
BEGIN;
SELECT set_config('test.auth_uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
DO $$ DECLARE s1 uuid; s2 uuid; r jsonb; failed boolean; n integer; BEGIN
 SELECT id INTO s1 FROM treatment_sessions WHERE session_number=1;
 SELECT id INTO s2 FROM treatment_sessions WHERE session_number=2;
 UPDATE permissoes SET can_execute=false WHERE perfil='profissional';
 PERFORM assert_treatment_write_scope('22222222-2222-2222-2222-222222222222','u',false);
 failed:=false;
 BEGIN PERFORM assert_treatment_write_scope('11111111-1111-1111-1111-111111111111','u',false); EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Cross-professional access accepted'; END IF;
 ALTER TABLE treatment_sessions DISABLE TRIGGER trg_guard_treatment_session_integrity;
 UPDATE treatment_sessions SET status='agendada',appointment_id='legacy-valid',scheduled_date='2030-02-04' WHERE id IN(s1,s2);
 ALTER TABLE treatment_sessions ENABLE TRIGGER trg_guard_treatment_session_integrity;
 r:=unschedule_treatment_session(s1,'00000000-0000-0000-0000-000000000001','legacy-valid','2030-02-04');
 IF r->>'status'<>'vinculo_compartilhado' OR NOT EXISTS(SELECT 1 FROM treatment_sessions WHERE id=s2 AND appointment_id='legacy-valid') THEN RAISE EXCEPTION 'Normal deschedule destroyed shared reservation'; END IF;
 r:=release_treatment_session_for_booking(s1,'legacy-valid','2030-02-04');
 IF r->>'status'<>'liberado' OR (r->>'appointment_preserved')::boolean IS NOT TRUE
 OR NOT EXISTS(SELECT 1 FROM agendamentos WHERE id='legacy-valid')
 OR NOT EXISTS(SELECT 1 FROM treatment_sessions WHERE id=s1 AND status='pendente_agendamento' AND appointment_id IS NULL AND scheduled_date IS NULL AND session_number=1)
 OR NOT EXISTS(SELECT 1 FROM treatment_sessions WHERE id=s2 AND appointment_id='legacy-valid') THEN RAISE EXCEPTION 'Shared reservation not preserved'; END IF;
 SELECT count(*) INTO n FROM action_logs WHERE acao='regularizar_sessao_para_agendar';
 PERFORM release_treatment_session_for_booking(s1,NULL,NULL);
 IF (SELECT count(*) FROM action_logs WHERE acao='regularizar_sessao_para_agendar')<>n THEN RAISE EXCEPTION 'Duplicate audit'; END IF;
 r:=schedule_treatment_session_checked(s1,'00000000-0000-0000-0000-000000000001',NULL,
 '{"id":"resolution-new","paciente_nome":"TESTE","profissional_nome":"TESTE","paciente_id":"patient","profissional_id":"22222222-2222-2222-2222-222222222222","unidade_id":"u","data":"2031-01-07","hora":"08:00","status":"confirmado","tipo":"Sessão de Tratamento","origem":"recepcao"}',false,false,'Regularização');
 IF r->>'status'<>'agendado' THEN RAISE EXCEPTION 'Booking denied: %',r; END IF;
 PERFORM release_treatment_session_for_booking(s1,'resolution-new','2031-01-07');
 IF EXISTS(SELECT 1 FROM agendamentos WHERE id='resolution-new') THEN RAISE EXCEPTION 'Exclusive reservation not removed'; END IF;
 failed:=false;
 BEGIN PERFORM release_treatment_session_for_booking(s1,'stale','2031-01-07'); EXCEPTION WHEN serialization_failure THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Stale operation accepted'; END IF;
 SELECT id INTO s1 FROM treatment_sessions WHERE session_number=4;
 PERFORM release_treatment_session_for_booking(s1,NULL,'2030-02-04');
 IF (SELECT scheduled_date FROM treatment_sessions WHERE id=s1) IS NOT NULL THEN RAISE EXCEPTION 'Pending duplicate not cleared'; END IF;
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('test.auth_uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
INSERT INTO agendamentos(id,paciente_id,profissional_id,unidade_id,data,hora,status)
 SELECT 'clinical-reservation','patient',professional_id,'u',scheduled_date,'08:00','confirmado' FROM treatment_sessions WHERE session_number=1;
UPDATE treatment_sessions SET status='agendada',appointment_id='clinical-reservation' WHERE session_number=1;
INSERT INTO prontuarios(agendamento_id) VALUES('clinical-reservation');
DO $$ DECLARE s treatment_sessions%ROWTYPE; failed boolean:=false; BEGIN
 SELECT * INTO s FROM treatment_sessions WHERE session_number=1;
 BEGIN PERFORM release_treatment_session_for_booking(s.id,s.appointment_id,s.scheduled_date); EXCEPTION WHEN check_violation THEN failed:=true; END;
 IF NOT failed OR NOT EXISTS(SELECT 1 FROM treatment_sessions WHERE id=s.id AND appointment_id='clinical-reservation') THEN RAISE EXCEPTION 'Clinical history changed'; END IF;
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('test.auth_uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
INSERT INTO agendamentos(id,paciente_id,profissional_id,unidade_id,data,hora,status)
 SELECT 'rollback-reservation','patient',professional_id,'u',scheduled_date,'08:00','confirmado' FROM treatment_sessions WHERE session_number=1;
UPDATE treatment_sessions SET status='agendada',appointment_id='rollback-reservation' WHERE session_number=1;
CREATE FUNCTION test_resolution_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.acao='regularizar_sessao_para_agendar' THEN RAISE EXCEPTION 'Injected audit error'; END IF; RETURN NEW; END $$;
CREATE TRIGGER test_resolution_audit BEFORE INSERT ON action_logs FOR EACH ROW EXECUTE FUNCTION test_resolution_audit_failure();
DO $$ DECLARE s treatment_sessions%ROWTYPE; failed boolean:=false; BEGIN
 SELECT * INTO s FROM treatment_sessions WHERE session_number=1;
 BEGIN PERFORM release_treatment_session_for_booking(s.id,s.appointment_id,s.scheduled_date); EXCEPTION WHEN raise_exception THEN failed:=true; END;
 IF NOT failed OR NOT EXISTS(SELECT 1 FROM treatment_sessions WHERE id=s.id AND appointment_id='rollback-reservation') OR NOT EXISTS(SELECT 1 FROM agendamentos WHERE id='rollback-reservation') THEN RAISE EXCEPTION 'Partial release'; END IF;
END $$;
ROLLBACK;

-- ISOLATED FIXTURE ONLY: all data below is rolled back. Never run in production.
BEGIN;
SELECT set_config('test.auth_uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
DO $$
DECLARE original jsonb; after_rows jsonb; result jsonb; failed boolean; logs_before integer;
 cid uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
 UPDATE agendamentos SET unidade_id='legacy-other-unit' WHERE id='legacy-valid';
 IF NOT EXISTS(SELECT 1 FROM unnest(treatment_cycle_integrity_issues(cid)) issue WHERE issue LIKE 'Vínculo%') THEN RAISE EXCEPTION 'Missing legacy link divergence in fixture'; END IF;
 SELECT jsonb_agg(to_jsonb(s) ORDER BY id) INTO original FROM treatment_sessions s WHERE cycle_id=cid;
 SELECT count(*) INTO logs_before FROM action_logs;
 result := save_treatment_cycle_plan(jsonb_build_object('id',cid,'total_sessions',8),ARRAY['2031-01-07']::date[],'Continuidade clínica',7);
 SET CONSTRAINTS trg_guard_treatment_plan_count IMMEDIATE;
 SELECT jsonb_agg(to_jsonb(s) ORDER BY id) INTO after_rows FROM treatment_sessions s WHERE cycle_id=cid AND session_number<=7;
 IF original IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'Historical sessions changed'; END IF;
 IF (SELECT count(*) FROM treatment_sessions WHERE cycle_id=cid)<>7 OR (result->>'added_sessions')::integer<>1 THEN RAISE EXCEPTION 'Incorrect append'; END IF;
 IF (SELECT count(*) FROM action_logs)<>logs_before+1 THEN RAISE EXCEPTION 'Missing or duplicate audit'; END IF;
 IF NOT EXISTS(SELECT 1 FROM treatment_sessions WHERE cycle_id=cid AND session_number=8 AND status='pendente_agendamento' AND appointment_id IS NULL) THEN RAISE EXCEPTION 'Unexpected booking'; END IF;
 RAISE NOTICE 'PASS: professional extends own legacy cycle, preserving all old rows, one audit, pending booking';
END $$;
ROLLBACK;

BEGIN;
SELECT set_config('test.auth_uid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true);
DO $$
DECLARE cid uuid := '00000000-0000-0000-0000-000000000001'; failed boolean; old_count integer;
BEGIN
 SELECT count(*) INTO old_count FROM treatment_sessions WHERE cycle_id=cid;
 failed:=false;
 BEGIN
  PERFORM save_treatment_cycle_plan(jsonb_build_object('id',cid,'total_sessions',8),ARRAY['2031-01-07']::date[],'Justificativa',7);
  UPDATE treatment_sessions SET clinical_notes='Historical edit hidden in extension' WHERE cycle_id=cid AND session_number=1;
  SET CONSTRAINTS trg_guard_treatment_plan_count IMMEDIATE;
 EXCEPTION WHEN check_violation THEN failed:=true; END;
 IF NOT failed OR (SELECT count(*) FROM treatment_sessions WHERE cycle_id=cid)<>old_count OR (SELECT total_sessions FROM treatment_cycles WHERE id=cid)<>7 THEN RAISE EXCEPTION 'Atomic rollback failed'; END IF;
 RAISE NOTICE 'PASS: changing history during append is rejected and rolls back the complete extension';
 failed:=false;
 BEGIN
  PERFORM save_treatment_cycle_plan(jsonb_build_object('id',cid,'total_sessions',8),ARRAY['2030-02-04']::date[],'Duplicada',7);
 EXCEPTION WHEN check_violation THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Duplicate date accepted'; END IF;
 RAISE NOTICE 'PASS: duplicate active date remains rejected';
 failed:=false;
 BEGIN
  PERFORM save_treatment_cycle_plan(jsonb_build_object('id',cid,'total_sessions',9),ARRAY['2031-01-07']::date[],'Concorrência',8);
 EXCEPTION WHEN serialization_failure THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Stale expected total accepted'; END IF;
 RAISE NOTICE 'PASS: stale/concurrent total is rejected';
 failed:=false;
 BEGIN
  UPDATE treatment_cycles SET total_sessions=8 WHERE id=cid;
  SET CONSTRAINTS trg_guard_treatment_plan_count IMMEDIATE;
 EXCEPTION WHEN check_violation THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Incomplete append accepted'; END IF;
 RAISE NOTICE 'PASS: total cannot increase without the corresponding new sessions';
END $$;
ROLLBACK;

BEGIN;
SELECT set_config('test.auth_uid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true);
DO $$
DECLARE cid uuid := '00000000-0000-0000-0000-000000000099'; failed boolean; c jsonb;
BEGIN
 c:=jsonb_build_object('id',cid,'patient_id','patient','professional_id','22222222-2222-2222-2222-222222222222','unit_id','u','total_sessions',1,'treatment_type','TESTE','frequency','mensal','start_date','2031-01-07');
 failed:=false;
 BEGIN
  PERFORM save_treatment_cycle_plan(c,ARRAY['2031-01-07']::date[],NULL,0);
  DELETE FROM treatment_sessions WHERE cycle_id=cid;
  SET CONSTRAINTS trg_guard_treatment_plan_count IMMEDIATE;
 EXCEPTION WHEN check_violation THEN failed:=true; END;
 IF NOT failed OR EXISTS(SELECT 1 FROM treatment_cycles WHERE id=cid) THEN RAISE EXCEPTION 'New incomplete cycle bypassed integrity'; END IF;
 RAISE NOTICE 'PASS: newly created plans retain complete integrity and rollback';
END $$;
ROLLBACK;

BEGIN;
SELECT set_config('test.auth_uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
DO $$
DECLARE cid uuid := '00000000-0000-0000-0000-000000000001'; failed boolean;
BEGIN
 PERFORM save_treatment_cycle_plan(jsonb_build_object('id',cid,'total_sessions',8),ARRAY['2031-01-07']::date[],'Primeiro acréscimo',7);
 PERFORM save_treatment_cycle_plan(jsonb_build_object('id',cid,'total_sessions',9),ARRAY['2031-01-14']::date[],'Segundo acréscimo',8);
 SET CONSTRAINTS trg_guard_treatment_plan_count IMMEDIATE;
 IF (SELECT count(*) FROM treatment_sessions WHERE cycle_id=cid)<>8 THEN RAISE EXCEPTION 'Repeated append failed'; END IF;
 RAISE NOTICE 'PASS: repeated extensions preserve the first transaction baseline';
 failed:=false;
 BEGIN
  PERFORM save_treatment_cycle_plan(jsonb_build_object('id','00000000-0000-0000-0000-000000000098','patient_id','patient','professional_id','11111111-1111-1111-1111-111111111111','unit_id','u','total_sessions',1,'start_date','2031-01-07','frequency','mensal','treatment_type','TESTE'),ARRAY['2031-01-07']::date[],NULL,0);
 EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Other professional allowed'; END IF;
 RAISE NOTICE 'PASS: professional cannot manage another professional';
 failed:=false;
 BEGIN
  PERFORM save_treatment_cycle_plan(jsonb_build_object('id','00000000-0000-0000-0000-000000000097','patient_id','patient','professional_id','22222222-2222-2222-2222-222222222222','unit_id','other','total_sessions',1,'start_date','2031-01-07','frequency','mensal','treatment_type','TESTE'),ARRAY['2031-01-07']::date[],NULL,0);
 EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Other unit allowed'; END IF;
 RAISE NOTICE 'PASS: unit isolation remains enforced';
END $$;
ROLLBACK;

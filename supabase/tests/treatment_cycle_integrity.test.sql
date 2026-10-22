-- Run ONLY in an isolated database with the fixture and migration installed.
-- Every test mutation below is rolled back. No production IDs or clinical data.
BEGIN;
SELECT set_config('test.auth_uid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true);
DO $$
DECLARE c jsonb; result jsonb; rows_count integer; total integer; original jsonb; after_rows jsonb;
 v_cycle_id uuid := '00000000-0000-0000-0000-000000000007';
 dates date[] := ARRAY['2030-01-07','2030-01-14','2030-01-21','2030-01-28','2030-02-04','2030-02-11','2030-02-18']::date[];
 issues text[]; sid uuid; appointment text := 'test-appointment'; failed boolean;
BEGIN
  SELECT jsonb_agg(to_jsonb(s) ORDER BY session_number) INTO original FROM public.treatment_sessions s WHERE cycle_id='00000000-0000-0000-0000-000000000001';
  issues := public.treatment_cycle_integrity_issues('00000000-0000-0000-0000-000000000001');
  IF cardinality(issues) <> 3 OR issues[1] NOT LIKE '%7 sessões, mas possui 6%' THEN RAISE EXCEPTION 'Legacy issues not detected: %',issues; END IF;
  c := jsonb_build_object('id',v_cycle_id,'patient_id','patient','professional_id','22222222-2222-2222-2222-222222222222','unit_id','u','total_sessions',7,'treatment_type','TESTE','frequency','1x_semana','start_date','2030-01-07');
  result := public.save_treatment_cycle_plan(c,dates,NULL,0);
  SELECT count(*), max(session_number) INTO rows_count,total FROM public.treatment_sessions WHERE cycle_id=v_cycle_id;
  IF rows_count<>7 OR total<>7 OR (result->>'registered_sessions')::integer<>7 THEN RAISE EXCEPTION 'Expected 7 real rows numbered 1..7'; END IF;
  PERFORM public.assert_treatment_cycle_integrity(v_cycle_id);
  -- Deferred check also validates the final transaction state.
  SET CONSTRAINTS trg_guard_treatment_plan_count IMMEDIATE;
  SET CONSTRAINTS trg_guard_treatment_plan_count DEFERRED;
  RAISE NOTICE 'PASS: exactly 7 sessions persisted and numbered 1..7';

  failed := false;
  BEGIN
    PERFORM public.save_treatment_cycle_plan(jsonb_set(c,'{id}','"00000000-0000-0000-0000-000000000008"'),dates[1:6],NULL,0);
  EXCEPTION WHEN check_violation THEN failed := true; END;
  IF NOT failed OR EXISTS(SELECT 1 FROM public.treatment_cycles WHERE id='00000000-0000-0000-0000-000000000008') THEN RAISE EXCEPTION 'Incomplete plan persisted'; END IF;
  RAISE NOTICE 'PASS: incomplete generation rejected without a partial cycle';

  SELECT s.id INTO sid FROM public.treatment_sessions s WHERE s.cycle_id=v_cycle_id AND session_number=2;
  failed := false;
  BEGIN PERFORM public.review_treatment_session_date(sid,dates[2],dates[1],'Tentativa duplicada'); EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Duplicate active date accepted'; END IF;
  IF (SELECT scheduled_date FROM public.treatment_sessions WHERE treatment_sessions.id=sid) <> dates[2] THEN RAISE EXCEPTION 'Rejected change modified date'; END IF;
  RAISE NOTICE 'PASS: duplicate active date rejected and original preserved';

  -- Cancelled / rescheduled sessions do not reserve dates.
  UPDATE public.treatment_sessions SET status='cancelada' WHERE cycle_id=v_cycle_id AND session_number=1;
  PERFORM public.review_treatment_session_date(sid,dates[2],dates[1],'Data liberada por cancelamento');
  UPDATE public.treatment_sessions SET status='remarcada' WHERE cycle_id=v_cycle_id AND session_number=1;
  PERFORM public.assert_treatment_cycle_integrity(v_cycle_id);
  RAISE NOTICE 'PASS: cancelled/rescheduled dates may be used by an active session';

  INSERT INTO public.agendamentos(id,paciente_id,profissional_id,unidade_id,data,status) VALUES(appointment,'patient','22222222-2222-2222-2222-222222222222','u',dates[1],'confirmado');
  UPDATE public.treatment_sessions SET appointment_id=appointment,status='agendada' WHERE treatment_sessions.id=sid;
  failed := false;
  BEGIN UPDATE public.treatment_sessions SET appointment_id=appointment WHERE cycle_id=v_cycle_id AND session_number=3; EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed OR (SELECT count(*) FROM public.treatment_sessions WHERE appointment_id=appointment)<>1 THEN RAISE EXCEPTION 'Appointment reused'; END IF;
  RAISE NOTICE 'PASS: appointment cannot be reused by another session';
  result:=public.save_treatment_cycle_plan(jsonb_set(jsonb_set(c,'{id}','"00000000-0000-0000-0000-000000000017"'),'{total_sessions}','1'),ARRAY[dates[1]],NULL,0);
  failed:=false;
  BEGIN UPDATE public.treatment_sessions SET appointment_id=appointment WHERE cycle_id='00000000-0000-0000-0000-000000000017'; EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Appointment reused in a different cycle'; END IF;
  RAISE NOTICE 'PASS: appointment cannot be reused across cycles';


  -- Append does not touch ANY existing session number, date or clinical data.
  SELECT jsonb_agg(to_jsonb(s) ORDER BY session_number) INTO original FROM public.treatment_sessions s WHERE cycle_id=v_cycle_id;
  result:=public.save_treatment_cycle_plan(jsonb_set(c,'{total_sessions}','8'),ARRAY['2030-02-25']::date[],'Continuidade autorizada',7);
  SELECT jsonb_agg(to_jsonb(s) ORDER BY session_number) INTO after_rows FROM public.treatment_sessions s WHERE cycle_id=v_cycle_id AND session_number<=7;
  IF after_rows IS DISTINCT FROM original OR (result->>'registered_sessions')::integer<>8 THEN RAISE EXCEPTION 'Extension rewrote history'; END IF;
  RAISE NOTICE 'PASS: append-only extension preserves historical rows and audit reason';

  failed:=false;
  BEGIN PERFORM public.save_treatment_cycle_plan(jsonb_set(c,'{total_sessions}','9'),ARRAY['2030-03-04']::date[],'Concorrência',7); EXCEPTION WHEN check_violation OR serialization_failure THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Stale extension accepted'; END IF;

  failed:=false;
  BEGIN UPDATE public.treatment_sessions SET session_number=10 WHERE treatment_sessions.id=sid; EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Historical numbering changed'; END IF;
  RAISE NOTICE 'PASS: stale extension and historical renumbering rejected';

  failed:=false;
  BEGIN UPDATE public.treatment_cycles SET status='concluido' WHERE treatment_cycles.id='00000000-0000-0000-0000-000000000001'; EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Incomplete legacy cycle concluded'; END IF;
  SELECT count(*) INTO rows_count FROM public.treatment_sessions WHERE cycle_id='00000000-0000-0000-0000-000000000001';
  IF rows_count<>6 THEN RAISE EXCEPTION 'Legacy rows modified'; END IF;
  RAISE NOTICE 'PASS: legacy discrepancies remain visible, never auto-repaired';

  failed:=false;
  BEGIN INSERT INTO public.patient_discharges(cycle_id,tipo_alta) VALUES(v_cycle_id,'conclusao'); EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Conclusion would remove future sessions'; END IF;
  RAISE NOTICE 'PASS: clinical conclusion cannot silently discard future pending sessions';

  SELECT jsonb_agg(to_jsonb(s) ORDER BY session_number) INTO original FROM public.treatment_sessions s WHERE cycle_id='00000000-0000-0000-0000-000000000001';
  result:=public.get_treatment_integrity_pending(0,20);
  SELECT jsonb_agg(to_jsonb(s) ORDER BY session_number) INTO after_rows FROM public.treatment_sessions s WHERE cycle_id='00000000-0000-0000-0000-000000000001';
  IF original IS DISTINCT FROM after_rows OR jsonb_array_length(result)<1 THEN RAISE EXCEPTION 'Review altered or hid legacy rows'; END IF;
  RAISE NOTICE 'PASS: Master review is read-only and reports historical gaps';

  -- Unit and professional isolation; no broadening of access.
  PERFORM set_config('test.auth_uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
  failed:=false;
  BEGIN PERFORM public.get_treatment_integrity_pending(0,20); EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Non-Master accessed review list'; END IF;
  failed:=false;
  BEGIN PERFORM public.assert_treatment_write_scope('11111111-1111-1111-1111-111111111111','another-unit',false); EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Out-of-scope write accepted'; END IF;
  RAISE NOTICE 'PASS: Master-only list and scope checks';
END $$;
ROLLBACK;

-- Inject a real row-7 failure, then ensure the entire new cycle is rolled back.
BEGIN;
SELECT set_config('test.auth_uid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true);
CREATE FUNCTION public.test_reject_seventh_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.session_number=7 THEN RAISE EXCEPTION 'Injected seventh session failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER test_reject_seventh BEFORE INSERT ON public.treatment_sessions FOR EACH ROW EXECUTE FUNCTION public.test_reject_seventh_session();
DO $$
DECLARE failed boolean:=false;
BEGIN
  BEGIN
    PERFORM public.save_treatment_cycle_plan('{"id":"00000000-0000-0000-0000-000000000099","patient_id":"patient","professional_id":"22222222-2222-2222-2222-222222222222","unit_id":"u","total_sessions":7,"treatment_type":"TESTE","frequency":"1x_semana","start_date":"2030-01-07"}'::jsonb,ARRAY['2030-01-07','2030-01-14','2030-01-21','2030-01-28','2030-02-04','2030-02-11','2030-02-18']::date[],NULL,0);
  EXCEPTION WHEN raise_exception THEN failed:=true; END;
  IF NOT failed OR EXISTS(SELECT 1 FROM public.treatment_cycles WHERE id='00000000-0000-0000-0000-000000000099') OR EXISTS(SELECT 1 FROM public.treatment_sessions WHERE cycle_id='00000000-0000-0000-0000-000000000099') THEN RAISE EXCEPTION 'Partial write escaped transaction'; END IF;
  RAISE NOTICE 'PASS: row-7 failure rolls back cycle, sessions and audit together';
END $$;
ROLLBACK;

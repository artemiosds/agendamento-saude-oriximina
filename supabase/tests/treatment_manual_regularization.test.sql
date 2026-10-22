-- Isolated, fictitious data only. The transaction is always rolled back.
BEGIN;
SELECT set_config('test.auth_uid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true);
DO $$
DECLARE target public.treatment_sessions%ROWTYPE; kept_before jsonb; kept_after jsonb; appointment_before jsonb; result jsonb; failed boolean; number_count integer; unique_count integer; missing_id uuid;
BEGIN
  SELECT * INTO target FROM public.treatment_sessions WHERE cycle_id='00000000-0000-0000-0000-000000000001' AND session_number=4;
  SELECT to_jsonb(s) INTO kept_before FROM public.treatment_sessions s WHERE cycle_id=target.cycle_id AND session_number=3;
  SELECT to_jsonb(a) INTO appointment_before FROM public.agendamentos a WHERE id='legacy-valid';
  failed:=false;
  BEGIN PERFORM public.clear_duplicate_treatment_session_date(target.id,target.scheduled_date,'Conferência humana',false); EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Date cleared without confirmation'; END IF;
  failed:=false;
  BEGIN PERFORM public.clear_duplicate_treatment_session_date(target.id,target.scheduled_date,'',true); EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Date cleared without reason'; END IF;
  result:=public.clear_duplicate_treatment_session_date(target.id,target.scheduled_date,'Conferido vínculo válido da sessão 3',true);
  IF NOT EXISTS(SELECT 1 FROM public.treatment_sessions WHERE id=target.id AND scheduled_date IS NULL AND status='pendente_agendamento' AND appointment_id IS NULL) THEN RAISE EXCEPTION 'Target missing or not awaiting appointment'; END IF;
  SELECT to_jsonb(s) INTO kept_after FROM public.treatment_sessions s WHERE cycle_id=target.cycle_id AND session_number=3;
  IF kept_before IS DISTINCT FROM kept_after OR appointment_before IS DISTINCT FROM (SELECT to_jsonb(a) FROM public.agendamentos a WHERE id='legacy-valid') THEN RAISE EXCEPTION 'Protected session or appointment changed'; END IF;
  IF result->>'message' NOT LIKE '%sessão nº 4%sessão nº 3%' THEN RAISE EXCEPTION 'Missing clear protected-session message'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.action_logs WHERE entidade_id=target.id::text AND acao='retirar_data_duplicada' AND detalhes->>'motivo_alteracao'<>'' AND detalhes->'valor_anterior' IS NOT NULL AND detalhes->'valor_novo' IS NOT NULL) THEN RAISE EXCEPTION 'Missing audit'; END IF;

  -- Another old discrepancy (missing row 7) cannot block rescheduling row 4.
  PERFORM public.review_treatment_session_date(target.id,NULL,'2030-02-11','Nova data escolhida pelo profissional');
  IF (SELECT scheduled_date FROM public.treatment_sessions WHERE id=target.id)<>'2030-02-11'::date THEN RAISE EXCEPTION 'Manual date failed'; END IF;
  failed:=false;
  BEGIN PERFORM public.review_treatment_session_date(target.id,'2030-02-11','2030-02-04','Tentativa duplicada'); EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Duplicate active date accepted'; END IF;

  result:=public.restore_missing_treatment_session(target.cycle_id,7,NULL,'Sessão faltante conferida individualmente',true);
  missing_id:=(result->'session'->>'id')::uuid;
  result:=public.restore_missing_treatment_session(target.cycle_id,7,NULL,'Repetição após resposta de rede incerta',true);
  IF result->>'status'<>'already_exists' OR (result->'session'->>'id')::uuid<>missing_id THEN RAISE EXCEPTION 'Retry duplicated missing row'; END IF;
  SELECT count(*),count(DISTINCT session_number) INTO number_count,unique_count FROM public.treatment_sessions WHERE cycle_id=target.cycle_id;
  IF number_count<>7 OR unique_count<>7 THEN RAISE EXCEPTION 'Expected exactly 7 sessions numbered 1..7'; END IF;
  result:=public.schedule_treatment_session_checked(missing_id,target.cycle_id,NULL,
    '{"id":"new-manual-7","paciente_id":"patient","paciente_nome":"PACIENTE FICTÍCIO","profissional_id":"22222222-2222-2222-2222-222222222222","profissional_nome":"PROFISSIONAL TESTE","unidade_id":"u","data":"2030-03-04","hora":"09:00","status":"confirmado","tipo":"Sessão de Tratamento","origem":"profissional"}'::jsonb,false,false,'Data escolhida e confirmada pelo profissional');
  IF result->>'status'<>'agendado' OR NOT EXISTS(SELECT 1 FROM public.treatment_sessions WHERE id=missing_id AND appointment_id='new-manual-7' AND scheduled_date='2030-03-04' AND status='agendada') THEN RAISE EXCEPTION 'Undated session booking was not atomic: %',result; END IF;
  result:=public.reschedule_treatment_session_with_room(missing_id,target.cycle_id,'2030-03-04','new-manual-7','2030-03-11','10:00',false,false,'Sala e data conferidas','sala-teste');
  IF result->>'status'<>'remarcado' OR (SELECT sala_id FROM public.agendamentos WHERE id='new-manual-7')<>'sala-teste' OR (SELECT scheduled_date FROM public.treatment_sessions WHERE id=missing_id)<>'2030-03-11'::date THEN RAISE EXCEPTION 'Reschedule did not preserve room/date atomically'; END IF;
  PERFORM public.assert_treatment_cycle_integrity(target.cycle_id);

  -- Same patient/day across cycles and professionals is not a cycle date duplicate.
  PERFORM public.save_treatment_cycle_plan('{"id":"00000000-0000-0000-0000-000000000021","patient_id":"patient","professional_id":"22222222-2222-2222-2222-222222222222","unit_id":"u","total_sessions":1,"treatment_type":"TESTE","frequency":"manual","start_date":"2030-02-04"}'::jsonb,ARRAY['2030-02-04']::date[],NULL,0);
  PERFORM public.save_treatment_cycle_plan('{"id":"00000000-0000-0000-0000-000000000022","patient_id":"patient","professional_id":"11111111-1111-1111-1111-111111111111","unit_id":"u","total_sessions":1,"treatment_type":"OUTRA ESPECIALIDADE","frequency":"manual","start_date":"2030-02-04"}'::jsonb,ARRAY['2030-02-04']::date[],NULL,0);
  PERFORM public.assert_treatment_cycle_integrity('00000000-0000-0000-0000-000000000021');
  PERFORM public.assert_treatment_cycle_integrity('00000000-0000-0000-0000-000000000022');
  PERFORM set_config('test.auth_uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
  result:=public.get_treatment_cycles_scoped(1,50,'11111111-1111-1111-1111-111111111111',NULL,NULL,NULL,false,false);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'cycles') item WHERE item->>'professional_id'<>'22222222-2222-2222-2222-222222222222') THEN RAISE EXCEPTION 'Professional saw someone else records'; END IF;
  failed:=false;
  BEGIN PERFORM public.get_treatment_cycles_scoped(1,20,NULL,NULL,NULL,NULL,false,true); EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Non-Master used integrity filter'; END IF;
  failed:=false;
  BEGIN PERFORM public.restore_missing_treatment_session('00000000-0000-0000-0000-000000000022',1,NULL,'Tentativa fora do escopo',true); EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Professional changed another professional cycle'; END IF;
  PERFORM set_config('test.auth_uid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true);
  INSERT INTO public.treatment_cycles(id,patient_id,professional_id,unit_id,total_sessions)
    VALUES('00000000-0000-0000-0000-000000000099','patient','22222222-2222-2222-2222-222222222222','another-unit',1);
  UPDATE public.funcionarios SET usuario='master.unidade' WHERE auth_user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  result:=public.get_treatment_cycles_scoped(1,50,NULL,'another-unit',NULL,NULL,false,true);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'cycles') item WHERE item->>'unit_id'<>'u') THEN RAISE EXCEPTION 'Unit Master escaped unit scope'; END IF;
  UPDATE public.funcionarios SET usuario='admin.sms' WHERE auth_user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  result:=public.get_treatment_cycles_scoped(1,50,NULL,'another-unit',NULL,NULL,false,true);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'cycles') item WHERE item->>'unit_id'='another-unit') THEN RAISE EXCEPTION 'admin.sms global filter unavailable'; END IF;
  RAISE NOTICE 'PASS: manual confirmation, audit, preserved valid booking, exact 7, idempotent missing row, NULL booking, cross-cycle/professional same day, scoped filter';
END $$;
ROLLBACK;

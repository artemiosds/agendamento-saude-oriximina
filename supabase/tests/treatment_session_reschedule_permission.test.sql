-- Run with a database administrator connection. Fixtures and writes are rolled back.
BEGIN;
DO $test$
<<fixture>>
DECLARE
  actor_auth uuid := gen_random_uuid();
  outsider_auth uuid := gen_random_uuid();
  professional text := gen_random_uuid()::text;
  unit_id text := 'qa-remarc-' || gen_random_uuid()::text;
  patient_id text := 'qa-remarc-' || gen_random_uuid()::text;
  appointment_id text := 'qa-remarc-' || gen_random_uuid()::text;
  cycle_id uuid := gen_random_uuid();
  session_id uuid := gen_random_uuid();
  first_date date := date_trunc('week', now() AT TIME ZONE 'America/Fortaleza')::date + 28;
  result jsonb;
BEGIN
  IF has_function_privilege('authenticated', 'public.treatment_manual_capacity_override_matches(text,text,text,text,text,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.treatment_manual_capacity_override_matches(text,text,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'The trigger helper must stay private';
  END IF;

  INSERT INTO public.unidades(id,nome) VALUES (unit_id,'Unidade fictícia de teste');
  INSERT INTO public.funcionarios(id,auth_user_id,nome,usuario,email,role,unidade_id,ativo)
  VALUES (professional::uuid,actor_auth,'Profissional fictício',actor_auth::text,actor_auth::text || '@example.invalid','profissional',unit_id,true),
    (gen_random_uuid(),outsider_auth,'Profissional fictício de outra unidade',outsider_auth::text,
     outsider_auth::text || '@example.invalid','profissional',unit_id || '-outra',true);
  INSERT INTO public.pacientes(id,nome,unidade_id) VALUES (patient_id,'Paciente fictício',unit_id);
  INSERT INTO public.disponibilidades(id,profissional_id,unidade_id,data_inicio,data_fim,hora_inicio,hora_fim)
  VALUES ('qa-remarc-' || gen_random_uuid()::text,professional,unit_id,first_date,first_date + 3,'08:00','12:00');
  INSERT INTO public.treatment_cycles(id,patient_id,professional_id,unit_id,start_date) VALUES (cycle_id,patient_id,professional,unit_id,first_date);
  INSERT INTO public.treatment_sessions(id,cycle_id,patient_id,professional_id,scheduled_date,status)
  VALUES (session_id,cycle_id,patient_id,professional,first_date,'pendente_agendamento');

  PERFORM set_config('request.jwt.claim.sub',actor_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor_auth,'role','authenticated')::text,true);
  PERFORM set_config('role','authenticated',true);
  IF auth.uid() IS DISTINCT FROM actor_auth OR current_user <> 'authenticated' THEN
    RAISE EXCEPTION 'Test must call the RPCs as the authenticated role';
  END IF;

  result := public.schedule_treatment_session_checked(session_id,cycle_id,first_date,
    jsonb_build_object('id',appointment_id,'paciente_id',patient_id,'paciente_nome','Paciente fictício',
      'profissional_id',professional,'profissional_nome','Profissional fictício','unidade_id',unit_id,
      'data',first_date,'hora','08:00','status','confirmado','tipo','Sessão de Tratamento','origem','recepcao'),
    false,false,'Teste de agendamento');
  IF result->>'status' IS DISTINCT FROM 'agendado' THEN RAISE EXCEPTION 'Scheduling failed: %', result->>'reason'; END IF;

  result := public.reschedule_treatment_session_checked(session_id,cycle_id,first_date,appointment_id,
    first_date + 1,'09:00',true,false,'Teste de remarcação');
  IF result->>'status' IS DISTINCT FROM 'remarcado'
    OR result#>>'{appointment,id}' IS DISTINCT FROM appointment_id
    OR result#>>'{session,appointment_id}' IS DISTINCT FROM appointment_id
    OR result#>>'{appointment,data}' IS DISTINCT FROM (first_date + 1)::text
    OR result#>>'{session,scheduled_date}' IS DISTINCT FROM (first_date + 1)::text
    OR result#>>'{appointment,hora}' IS DISTINCT FROM '09:00' THEN
    RAISE EXCEPTION 'Ordinary reschedule did not update both linked records: %', result->>'reason';
  END IF;

  result := public.reschedule_treatment_session_with_room(session_id,cycle_id,first_date + 1,appointment_id,
    first_date + 2,'10:00',true,false,'Teste de sala','sala-ficticia');
  IF result->>'status' IS DISTINCT FROM 'remarcado'
    OR result#>>'{appointment,sala_id}' IS DISTINCT FROM 'sala-ficticia' THEN
    RAISE EXCEPTION 'Room reschedule failed: %', result->>'reason';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',outsider_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider_auth,'role','authenticated')::text,true);
  BEGIN
    PERFORM public.reschedule_treatment_session_checked(session_id,cycle_id,first_date + 2,appointment_id,
      first_date + 3,'10:30',true,false,'Teste de outra unidade');
    RAISE EXCEPTION 'Cross-unit reschedule was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM IS DISTINCT FROM 'Fora do escopo de unidade' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub',actor_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor_auth,'role','authenticated')::text,true);

  result := public.reschedule_treatment_session_checked(session_id,cycle_id,first_date + 1,appointment_id,
    first_date + 3,'10:30',true,false,'Teste de formulário desatualizado');
  IF result->>'reason' IS DISTINCT FROM 'sessao_alterada' THEN RAISE EXCEPTION 'Stale reschedule was not rejected'; END IF;

  result := public.reschedule_treatment_session_checked(session_id,cycle_id,first_date + 2,appointment_id,
    first_date + 7,'08:00',true,false,'Teste sem disponibilidade');
  IF result->>'reason' IS DISTINCT FROM 'no_availability' THEN RAISE EXCEPTION 'Ordinary capacity guard failed: %', result->>'reason'; END IF;
  result := public.reschedule_treatment_session_checked(session_id,cycle_id,first_date + 2,appointment_id,
    first_date + 7,'08:00',true,true,'Teste de encaixe autorizado');
  IF result->>'status' IS DISTINCT FROM 'remarcado' THEN RAISE EXCEPTION 'Authorized manual reschedule failed: %', result->>'reason'; END IF;

  PERFORM set_config('role','none',true);
  IF NOT EXISTS (SELECT FROM public.agendamentos a WHERE a.id=appointment_id AND a.data=first_date + 7 AND a.hora='08:00' AND a.sala_id='sala-ficticia')
    OR NOT EXISTS (SELECT FROM public.treatment_sessions s WHERE s.id=session_id AND s.appointment_id=fixture.appointment_id AND s.scheduled_date=first_date + 7)
    OR (SELECT count(*) FROM public.action_logs l WHERE l.entidade_id=session_id::text AND l.acao='remarcar_sessao') <> 3
    OR NOT EXISTS (SELECT FROM public.action_logs l WHERE l.entidade_id=session_id::text AND l.acao='remarcacao_encaixe_manual_tratamento') THEN
    RAISE EXCEPTION 'Missing database state or reschedule audit';
  END IF;

  PERFORM set_config('role','authenticated',true);
  result := public.unschedule_treatment_session(session_id,cycle_id,appointment_id,first_date + 7);
  IF result->>'status' IS DISTINCT FROM 'desmarcado' THEN RAISE EXCEPTION 'Unscheduling failed: %', result->>'reason'; END IF;
  PERFORM set_config('role','none',true);
  IF EXISTS (SELECT FROM public.agendamentos a WHERE a.id=appointment_id)
    OR NOT EXISTS (SELECT FROM public.treatment_sessions s WHERE s.id=session_id AND s.status='pendente_agendamento' AND s.appointment_id IS NULL) THEN
    RAISE EXCEPTION 'Unscheduling did not release the appointment and its session link';
  END IF;

  PERFORM set_config('test.reschedule_verified', 'true', true);
END $test$;
SELECT current_setting('test.reschedule_verified',true)::boolean AS reschedule_verified;
ROLLBACK;

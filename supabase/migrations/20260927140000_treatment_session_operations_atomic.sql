-- Atomic individual scheduling operations for Treatment Management.
-- Prepared for review only: do not apply to a database in this phase.
BEGIN;

CREATE FUNCTION public.schedule_treatment_session(
  p_session_id uuid,
  p_cycle_id uuid,
  p_expected_session_date date,
  p_appointment jsonb,
  p_check_patient_conflict boolean
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_staff record;
  v_role text;
  v_permission boolean;
  v_session record;
  v_cycle record;
  v_appointment public.agendamentos%ROWTYPE;
  v_id text;
  v_new_date date;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;
  SELECT f.id, f.role, f.usuario, f.unidade_id
    INTO v_staff FROM public.funcionarios f
   WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE = '42501'; END IF;

  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role
    WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao' WHEN 'coordenador' THEN 'gestao'
    WHEN 'recepção' THEN 'recepcao' WHEN 'tecnico' THEN 'triagem'
    WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  IF nullif(v_role, '') IS NULL THEN RAISE EXCEPTION 'Perfil não identificado' USING ERRCODE = '42501'; END IF;
  IF v_role <> 'master' THEN
    SELECT chosen.can_execute INTO v_permission FROM (
      SELECT pu.can_execute, 1 AS rank FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento'
         AND pu.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT pu.can_execute, 2 FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento' AND pu.unidade_id = ''
      UNION ALL SELECT p.can_execute, 3 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento'
         AND p.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT p.can_execute, 4 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento' AND p.unidade_id = ''
    ) chosen ORDER BY chosen.rank LIMIT 1;
    IF v_permission IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Sem permissão para agendar sessões de tratamento' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','nao_encontrado','reason','sessao'); END IF;
  SELECT c.* INTO v_cycle FROM public.treatment_cycles c WHERE c.id = p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','vinculo_inconsistente','reason','ciclo_ausente'); END IF;
  IF v_session.cycle_id IS DISTINCT FROM p_cycle_id
     OR v_session.patient_id IS DISTINCT FROM v_cycle.patient_id
     OR v_session.professional_id IS DISTINCT FROM v_cycle.professional_id
     OR v_cycle.status <> 'em_andamento' THEN
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','ciclo_sessao');
  END IF;
  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND
     (nullif(v_staff.unidade_id, '') IS NULL AND v_role <> 'master'
       OR nullif(v_staff.unidade_id, '') IS NOT NULL AND v_cycle.unit_id <> v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'profissional' AND v_cycle.professional_id <> v_staff.id::text THEN
    RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE = '42501';
  END IF;
  IF v_session.status = 'agendada' AND v_session.appointment_id IS NOT NULL THEN
    SELECT a.* INTO v_appointment FROM public.agendamentos a WHERE a.id = v_session.appointment_id FOR UPDATE;
    IF FOUND AND v_appointment.paciente_id IS NOT DISTINCT FROM v_session.patient_id
       AND v_appointment.profissional_id IS NOT DISTINCT FROM v_session.professional_id
       AND v_appointment.unidade_id IS NOT DISTINCT FROM v_cycle.unit_id
       AND v_appointment.data IS NOT DISTINCT FROM v_session.scheduled_date
       AND v_appointment.data IS NOT DISTINCT FROM nullif(p_appointment->>'data','')::date
       AND v_appointment.hora IS NOT DISTINCT FROM p_appointment->>'hora'
       AND v_appointment.status = 'confirmado' THEN
      RETURN jsonb_build_object('status','ja_agendado','session',to_jsonb(v_session),'appointment',to_jsonb(v_appointment));
    END IF;
    IF FOUND THEN RETURN jsonb_build_object('status','estado_protegido','reason','sessao_ja_vinculada'); END IF;
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','agendamento_ausente');
  END IF;
  IF v_session.status <> 'pendente_agendamento' OR v_session.appointment_id IS NOT NULL
     OR v_session.scheduled_date IS DISTINCT FROM p_expected_session_date THEN
    RETURN jsonb_build_object('status','estado_protegido','reason','sessao_alterada');
  END IF;

  v_id := nullif(p_appointment->>'id', '');
  v_new_date := nullif(p_appointment->>'data','')::date;
  IF v_id IS NULL OR p_appointment->>'status' IS DISTINCT FROM 'confirmado'
     OR p_appointment->>'paciente_id' IS DISTINCT FROM v_cycle.patient_id
     OR p_appointment->>'profissional_id' IS DISTINCT FROM v_cycle.professional_id
     OR p_appointment->>'unidade_id' IS DISTINCT FROM v_cycle.unit_id
     OR v_new_date IS NULL
     OR nullif(p_appointment->>'hora','') IS NULL THEN
    RETURN jsonb_build_object('status','payload_invalido','reason','agendamento');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_cycle.patient_id || '|' || v_new_date::text || '|' || (p_appointment->>'hora'), 0));
  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
     WHERE a.paciente_id = v_cycle.patient_id
       AND (p_check_patient_conflict IS TRUE OR a.profissional_id = v_cycle.professional_id)
       AND a.data = v_new_date AND a.hora = p_appointment->>'hora'
       AND a.status NOT IN ('cancelado','falta','remarcado')
  ) THEN RETURN jsonb_build_object('status','duplicado','reason','horario_ocupado'); END IF;

  INSERT INTO public.agendamentos (
    id,paciente_id,paciente_nome,unidade_id,sala_id,setor_id,profissional_id,profissional_nome,
    data,hora,status,tipo,observacoes,origem,google_event_id,sync_status,criado_por,prioridade_perfil
  ) VALUES (
    v_id,v_cycle.patient_id,p_appointment->>'paciente_nome',v_cycle.unit_id,
    coalesce(p_appointment->>'sala_id',''),coalesce(p_appointment->>'setor_id',''),
    v_cycle.professional_id,p_appointment->>'profissional_nome',v_new_date,
    p_appointment->>'hora','confirmado',p_appointment->>'tipo',coalesce(p_appointment->>'observacoes',''),
    coalesce(p_appointment->>'origem','recepcao'),coalesce(p_appointment->>'google_event_id',''),
    coalesce(p_appointment->>'sync_status','pendente'),coalesce(p_appointment->>'criado_por',''),'normal'
  ) RETURNING * INTO v_appointment;

  UPDATE public.treatment_sessions s
     SET appointment_id = v_id, status = 'agendada', scheduled_date = v_new_date
   WHERE s.id = p_session_id AND s.cycle_id = p_cycle_id AND s.status = 'pendente_agendamento'
     AND s.appointment_id IS NULL AND s.scheduled_date = p_expected_session_date;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Sessão alterada durante o agendamento' USING ERRCODE = '40001'; END IF;
  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id = p_session_id;
  RETURN jsonb_build_object('status','agendado','session',to_jsonb(v_session),'appointment',to_jsonb(v_appointment));
END;
$function$;

CREATE FUNCTION public.reschedule_treatment_session(
  p_session_id uuid,
  p_cycle_id uuid,
  p_expected_session_date date,
  p_expected_appointment_id text,
  p_new_date date,
  p_new_time text DEFAULT NULL,
  p_check_patient_conflict boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_staff record;
  v_role text;
  v_permission boolean;
  v_session record;
  v_cycle record;
  v_appointment public.agendamentos%ROWTYPE;
  v_rows integer;
  v_blocked boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501'; END IF;
  SELECT f.id,f.role,f.usuario,f.unidade_id INTO v_staff FROM public.funcionarios f
   WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE = '42501'; END IF;
  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao' WHEN 'coordenador' THEN 'gestao' WHEN 'recepção' THEN 'recepcao'
    WHEN 'tecnico' THEN 'triagem' WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  IF nullif(v_role,'') IS NULL THEN RAISE EXCEPTION 'Perfil não identificado' USING ERRCODE='42501'; END IF;
  IF v_role NOT IN ('master','profissional') THEN
    SELECT chosen.can_execute INTO v_permission FROM (
      SELECT pu.can_execute,1 AS rank FROM public.permissoes_usuario pu WHERE pu.user_id=v_staff.id::text
        AND pu.modulo='tratamento' AND pu.unidade_id=coalesce(v_staff.unidade_id,'') AND coalesce(v_staff.unidade_id,'')<>''
      UNION ALL SELECT pu.can_execute,2 FROM public.permissoes_usuario pu WHERE pu.user_id=v_staff.id::text AND pu.modulo='tratamento' AND pu.unidade_id=''
      UNION ALL SELECT p.can_execute,3 FROM public.permissoes p WHERE p.perfil IN (v_role,lower(trim(v_staff.role)))
        AND p.modulo='tratamento' AND p.unidade_id=coalesce(v_staff.unidade_id,'') AND coalesce(v_staff.unidade_id,'')<>''
      UNION ALL SELECT p.can_execute,4 FROM public.permissoes p WHERE p.perfil IN (v_role,lower(trim(v_staff.role))) AND p.modulo='tratamento' AND p.unidade_id=''
    ) chosen ORDER BY chosen.rank LIMIT 1;
    IF v_permission IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Sem permissão para remarcar sessões de tratamento' USING ERRCODE='42501'; END IF;
  END IF;

  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','nao_encontrado','reason','sessao'); END IF;
  SELECT c.* INTO v_cycle FROM public.treatment_cycles c WHERE c.id=p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','vinculo_inconsistente','reason','ciclo_ausente'); END IF;
  IF v_session.cycle_id IS DISTINCT FROM p_cycle_id OR v_session.patient_id IS DISTINCT FROM v_cycle.patient_id
     OR v_session.professional_id IS DISTINCT FROM v_cycle.professional_id THEN
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','ciclo_sessao');
  END IF;
  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND
     (nullif(v_staff.unidade_id,'') IS NULL AND v_role <> 'master'
       OR nullif(v_staff.unidade_id,'') IS NOT NULL AND v_cycle.unit_id <> v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE='42501';
  END IF;
  IF v_role='profissional' AND v_cycle.professional_id<>v_staff.id::text THEN RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE='42501'; END IF;
  IF v_session.scheduled_date IS DISTINCT FROM p_expected_session_date OR v_session.appointment_id IS DISTINCT FROM p_expected_appointment_id THEN
    RETURN jsonb_build_object('status','conflito','reason','sessao_alterada');
  END IF;
  IF v_role NOT IN ('master','profissional') AND (v_cycle.status <> 'em_andamento' OR v_session.status NOT IN ('agendada','pendente_agendamento')) THEN
    RETURN jsonb_build_object('status','estado_protegido','reason','sessao_nao_remarcavel');
  END IF;
  IF v_role NOT IN ('master','profissional') THEN
    SELECT public.is_date_blocked(p_new_date,v_cycle.professional_id,v_cycle.unit_id) INTO v_blocked;
    IF v_blocked IS DISTINCT FROM false THEN RETURN jsonb_build_object('status','data_bloqueada','reason','indisponivel'); END IF;
  END IF;
  IF p_check_patient_conflict AND p_new_time IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_cycle.patient_id || '|' || p_new_date::text || '|' || p_new_time, 0));
  END IF;
  IF p_check_patient_conflict AND p_new_time IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.agendamentos a WHERE a.paciente_id=v_cycle.patient_id AND a.data=p_new_date
      AND a.hora=p_new_time AND a.status NOT IN ('cancelado','falta','remarcado')
      AND a.id IS DISTINCT FROM p_expected_appointment_id
  ) THEN RETURN jsonb_build_object('status','duplicado','reason','paciente_em_outro_horario'); END IF;

  IF p_expected_appointment_id IS NOT NULL THEN
    SELECT a.* INTO v_appointment FROM public.agendamentos a WHERE a.id=p_expected_appointment_id FOR UPDATE;
    IF NOT FOUND OR v_appointment.paciente_id IS DISTINCT FROM v_session.patient_id
       OR v_appointment.profissional_id IS DISTINCT FROM v_session.professional_id
       OR v_appointment.unidade_id IS DISTINCT FROM v_cycle.unit_id
       OR v_appointment.data IS DISTINCT FROM v_session.scheduled_date THEN
      RETURN jsonb_build_object('status','vinculo_inconsistente','reason','agendamento');
    END IF;
  ELSIF v_session.status <> 'pendente_agendamento' AND v_role NOT IN ('master','profissional') THEN
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','agendamento_ausente');
  END IF;

  UPDATE public.treatment_sessions s SET scheduled_date=p_new_date
   WHERE s.id=p_session_id AND s.cycle_id=p_cycle_id AND s.scheduled_date=p_expected_session_date
     AND s.appointment_id IS NOT DISTINCT FROM p_expected_appointment_id AND s.status=v_session.status;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'Sessão alterada durante a remarcação' USING ERRCODE='40001'; END IF;
  IF p_expected_appointment_id IS NOT NULL THEN
    UPDATE public.agendamentos a SET data=p_new_date, hora=coalesce(p_new_time,a.hora)
     WHERE a.id=p_expected_appointment_id AND a.data=p_expected_session_date
       AND a.paciente_id=v_session.patient_id AND a.profissional_id=v_session.professional_id AND a.unidade_id=v_cycle.unit_id;
    GET DIAGNOSTICS v_rows=ROW_COUNT;
    IF v_rows<>1 THEN RAISE EXCEPTION 'Agendamento alterado durante a remarcação' USING ERRCODE='40001'; END IF;
    SELECT a.* INTO v_appointment FROM public.agendamentos a WHERE a.id=p_expected_appointment_id;
  END IF;
  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id=p_session_id;
  RETURN jsonb_build_object('status','remarcado','session',to_jsonb(v_session),
    'appointment',CASE WHEN p_expected_appointment_id IS NULL THEN NULL ELSE to_jsonb(v_appointment) END);
END;
$function$;

CREATE FUNCTION public.unschedule_treatment_session(
  p_session_id uuid,
  p_cycle_id uuid,
  p_expected_appointment_id text,
  p_expected_session_date date
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_staff record;
  v_role text;
  v_permission boolean;
  v_session record;
  v_cycle record;
  v_appointment public.agendamentos%ROWTYPE;
  v_deleted_id text;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE='42501'; END IF;
  SELECT f.id,f.role,f.usuario,f.unidade_id INTO v_staff FROM public.funcionarios f
   WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE='42501'; END IF;
  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao' WHEN 'coordenador' THEN 'gestao' WHEN 'recepção' THEN 'recepcao'
    WHEN 'tecnico' THEN 'triagem' WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  IF nullif(v_role,'') IS NULL THEN RAISE EXCEPTION 'Perfil não identificado' USING ERRCODE='42501'; END IF;
  IF v_role <> 'master' THEN
    SELECT chosen.can_execute INTO v_permission FROM (
      SELECT pu.can_execute,1 AS rank FROM public.permissoes_usuario pu WHERE pu.user_id=v_staff.id::text
        AND pu.modulo='tratamento' AND pu.unidade_id=coalesce(v_staff.unidade_id,'') AND coalesce(v_staff.unidade_id,'')<>''
      UNION ALL SELECT pu.can_execute,2 FROM public.permissoes_usuario pu WHERE pu.user_id=v_staff.id::text AND pu.modulo='tratamento' AND pu.unidade_id=''
      UNION ALL SELECT p.can_execute,3 FROM public.permissoes p WHERE p.perfil IN (v_role,lower(trim(v_staff.role)))
        AND p.modulo='tratamento' AND p.unidade_id=coalesce(v_staff.unidade_id,'') AND coalesce(v_staff.unidade_id,'')<>''
      UNION ALL SELECT p.can_execute,4 FROM public.permissoes p WHERE p.perfil IN (v_role,lower(trim(v_staff.role))) AND p.modulo='tratamento' AND p.unidade_id=''
    ) chosen ORDER BY chosen.rank LIMIT 1;
    IF v_permission IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Sem permissão para desmarcar sessões de tratamento' USING ERRCODE='42501'; END IF;
  END IF;

  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','nao_encontrado','reason','sessao'); END IF;
  SELECT c.* INTO v_cycle FROM public.treatment_cycles c WHERE c.id=p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','vinculo_inconsistente','reason','ciclo_ausente'); END IF;
  IF v_session.cycle_id IS DISTINCT FROM p_cycle_id OR v_session.patient_id IS DISTINCT FROM v_cycle.patient_id
     OR v_session.professional_id IS DISTINCT FROM v_cycle.professional_id THEN
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','ciclo_sessao');
  END IF;
  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND
     (nullif(v_staff.unidade_id,'') IS NULL AND v_role <> 'master'
       OR nullif(v_staff.unidade_id,'') IS NOT NULL AND v_cycle.unit_id <> v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE='42501';
  END IF;
  IF v_role='profissional' AND v_cycle.professional_id<>v_staff.id::text THEN RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE='42501'; END IF;
  IF v_cycle.status <> 'em_andamento' OR v_session.status <> 'agendada' THEN
    RETURN jsonb_build_object('status','estado_protegido','reason','sessao_nao_desmarcavel');
  END IF;
  IF p_expected_appointment_id IS NULL OR v_session.appointment_id IS DISTINCT FROM p_expected_appointment_id
     OR v_session.scheduled_date IS DISTINCT FROM p_expected_session_date THEN
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','vinculo_ausente_ou_alterado');
  END IF;
  SELECT a.* INTO v_appointment FROM public.agendamentos a WHERE a.id=p_expected_appointment_id FOR UPDATE;
  IF NOT FOUND OR v_appointment.paciente_id IS DISTINCT FROM v_session.patient_id
     OR v_appointment.profissional_id IS DISTINCT FROM v_session.professional_id
     OR v_appointment.unidade_id IS DISTINCT FROM v_cycle.unit_id
     OR v_appointment.data IS DISTINCT FROM v_session.scheduled_date THEN
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','agendamento');
  END IF;

  DELETE FROM public.agendamentos a WHERE a.id=p_expected_appointment_id
    AND a.paciente_id=v_session.patient_id AND a.profissional_id=v_session.professional_id
    AND a.unidade_id=v_cycle.unit_id AND a.data=v_session.scheduled_date
  RETURNING a.id INTO v_deleted_id;
  IF v_deleted_id IS NULL THEN RAISE EXCEPTION 'Agendamento alterado durante a desmarcação' USING ERRCODE='40001'; END IF;
  UPDATE public.treatment_sessions s SET status='pendente_agendamento', appointment_id=NULL
   WHERE s.id=p_session_id AND s.cycle_id=p_cycle_id AND s.status='agendada'
     AND s.appointment_id=p_expected_appointment_id AND s.scheduled_date=p_expected_session_date;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'Sessão alterada durante a desmarcação' USING ERRCODE='40001'; END IF;
  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id=p_session_id;
  RETURN jsonb_build_object('status','desmarcado','session',to_jsonb(v_session),'appointment_id',v_deleted_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.schedule_treatment_session(uuid,uuid,date,jsonb,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reschedule_treatment_session(uuid,uuid,date,text,date,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unschedule_treatment_session(uuid,uuid,text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_treatment_session(uuid,uuid,date,jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_treatment_session(uuid,uuid,date,text,date,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unschedule_treatment_session(uuid,uuid,text,date) TO authenticated;

COMMIT;

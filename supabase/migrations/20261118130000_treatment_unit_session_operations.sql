-- Permit authorized session operations across cycles in the same unit; keep plan ownership unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.assert_treatment_write_scope(p_professional_id text, p_unit_id text, p_manage boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_staff record; v_role text; v_permission boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT f.id, f.nome, f.role, f.usuario, f.unidade_id
    INTO v_staff
    FROM public.funcionarios f
   WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE = '42501';
  END IF;

  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role
    WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao' WHEN 'coordenador' THEN 'gestao'
    WHEN 'recepção' THEN 'recepcao' WHEN 'tecnico' THEN 'triagem'
    WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  IF nullif(v_role, '') IS NULL THEN
    RAISE EXCEPTION 'Perfil não identificado' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('master','profissional') THEN
    SELECT chosen.allowed INTO v_permission FROM (
      SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN pu.can_delete ELSE pu.can_execute END AS allowed, 1 AS rank FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento'
         AND pu.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN pu.can_delete ELSE pu.can_execute END, 2 FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento' AND pu.unidade_id = ''
      UNION ALL SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN p.can_delete ELSE p.can_execute END, 3 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento'
         AND p.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN p.can_delete ELSE p.can_execute END, 4 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento' AND p.unidade_id = ''
    ) chosen ORDER BY chosen.rank LIMIT 1;
    IF v_permission IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Sem permissão para agendar sessões de tratamento' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND
     (nullif(v_staff.unidade_id, '') IS NULL OR p_unit_id IS DISTINCT FROM v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE = '42501';
  END IF;
  IF p_manage AND v_role = 'profissional' AND p_professional_id <> v_staff.id::text THEN
    RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE = '42501';
  END IF;
  IF nullif(p_unit_id, '') IS NULL OR NOT EXISTS (SELECT 1 FROM public.funcionarios WHERE id::text = p_professional_id AND ativo IS TRUE) THEN
    RAISE EXCEPTION 'Profissional ou unidade inválida' USING ERRCODE = '23514';
  END IF;
  RETURN to_jsonb(v_staff);
END $function$;

CREATE OR REPLACE FUNCTION public.get_treatment_cycles_scoped(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_professional_id text DEFAULT NULL::text, p_unit_id text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_only_own_professional boolean DEFAULT false, p_integrity_only boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor public.funcionarios%ROWTYPE;
  v_offset integer;
  v_cycles jsonb;
  v_user_id text;
  v_search_digits text;
BEGIN
  SELECT * INTO v_actor FROM public.funcionarios WHERE auth_user_id=auth.uid() AND ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado.' USING ERRCODE='42501'; END IF;
  IF p_integrity_only AND lower(trim(v_actor.role))<>'master' THEN RAISE EXCEPTION 'Filtro exclusivo do Master.' USING ERRCODE='42501'; END IF;
  -- Professionals see all cycles in their unit; unit scope is applied below.
  IF v_actor.usuario IS DISTINCT FROM 'admin.sms' THEN
    IF nullif(v_actor.unidade_id,'') IS NULL THEN RAISE EXCEPTION 'Unidade não identificada.' USING ERRCODE='42501'; END IF;
    p_unit_id:=v_actor.unidade_id;
  END IF;
  p_page_size:=greatest(1,least(coalesce(p_page_size,20),50));
  v_offset := GREATEST(0, (p_page - 1) * p_page_size);
  v_search_digits := regexp_replace(p_search, '\D', '', 'g');

  IF p_only_own_professional THEN
    SELECT (f.id)::text INTO v_user_id
    FROM funcionarios f
    WHERE f.auth_user_id = auth.uid() AND f.ativo = true
    LIMIT 1;
  END IF;

  WITH base AS (
    SELECT c.*, p.nome AS paciente_nome, f.nome AS professional_nome
    FROM treatment_cycles c
    LEFT JOIN pacientes p ON p.id = c.patient_id
    LEFT JOIN funcionarios f ON f.id::text = c.professional_id
    WHERE
      (p_professional_id IS NULL OR p_professional_id = '' OR p_professional_id = 'all' OR c.professional_id = p_professional_id)
      AND (p_unit_id IS NULL OR p_unit_id = '' OR p_unit_id = 'all' OR c.unit_id = p_unit_id)
      AND (
        p_status IS NULL OR p_status = '' OR p_status = 'all'
        OR (p_status != 'aguardando_agendamento' AND c.status = p_status)
        OR (p_status = 'aguardando_agendamento' AND EXISTS (
          SELECT 1 FROM treatment_sessions ts
          WHERE ts.cycle_id = c.id AND ts.status = 'pendente_agendamento'
        ))
      )
      AND (NOT p_integrity_only OR cardinality(public.treatment_cycle_integrity_issues(c.id))>0)
      AND (NOT p_only_own_professional OR (v_user_id IS NOT NULL AND c.professional_id = v_user_id))
      AND (
        p_search IS NULL OR p_search = '' OR
        unaccent(p.nome) ILIKE unaccent('%' || p_search || '%') OR
        (v_search_digits <> '' AND p.cpf ILIKE '%' || v_search_digits || '%') OR
        (v_search_digits <> '' AND p.cns ILIKE '%' || v_search_digits || '%') OR
        unaccent(c.treatment_type) ILIKE unaccent('%' || p_search || '%') OR
        unaccent(f.nome) ILIKE unaccent('%' || p_search || '%')
      )
  ),
  counted AS (
    SELECT COUNT(*) AS total FROM base
  ),
  page AS (
    SELECT b.*
    FROM base b
    ORDER BY b.created_at DESC
    LIMIT p_page_size OFFSET v_offset
  ),
  with_stats AS (
    SELECT
      pg.*,
      COALESCE((
        SELECT COUNT(*) FROM treatment_sessions ts
        WHERE ts.cycle_id = pg.id AND ts.status = 'pendente_agendamento'
      ), 0) AS pending_ag,
      COALESCE((
        SELECT COUNT(*) FROM treatment_sessions ts
        WHERE ts.cycle_id = pg.id AND ts.status IN ('paciente_faltou', 'falta')
      ), 0) AS faltas
    FROM page pg
  )
  SELECT jsonb_build_object(
    'total', (SELECT total FROM counted),
    'page', p_page,
    'page_size', p_page_size,
    'cycles', COALESCE(jsonb_agg(to_jsonb(with_stats.*)), '[]'::jsonb)
  )
  INTO v_cycles
  FROM with_stats;

  RETURN v_cycles;
END;
$function$;

CREATE OR REPLACE FUNCTION public.schedule_treatment_session(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
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
  v_blocked boolean;
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
  IF v_role NOT IN ('master','profissional') THEN
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
     (nullif(v_staff.unidade_id, '') IS NULL OR v_cycle.unit_id IS DISTINCT FROM v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE = '42501';
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
  IF extract(isodow FROM v_new_date) = 7 OR
     (extract(isodow FROM v_new_date) = 6 AND NOT coalesce(v_cycle.custom_data->'weekdays' @> '[6]'::jsonb, false)) THEN
    RETURN jsonb_build_object('status','data_bloqueada','reason','fim_de_semana');
  END IF;
  SELECT public.is_date_blocked(v_new_date,v_cycle.professional_id,v_cycle.unit_id) INTO v_blocked;
  IF v_blocked IS DISTINCT FROM false OR
     public.check_internal_slot_availability(v_cycle.professional_id, v_cycle.unit_id,
       v_new_date, p_appointment->>'hora')->>'reason' = 'date_blocked' THEN
    RETURN jsonb_build_object('status','data_bloqueada','reason','bloqueio_oficial');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_cycle.patient_id || '|' || v_new_date::text || '|' || (p_appointment->>'hora'), 0));
  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
     WHERE a.paciente_id = v_cycle.patient_id

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
     AND s.appointment_id IS NULL AND s.scheduled_date IS NOT DISTINCT FROM p_expected_session_date;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Sessão alterada durante o agendamento' USING ERRCODE = '40001'; END IF;
  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id = p_session_id;
  RETURN jsonb_build_object('status','agendado','session',to_jsonb(v_session),'appointment',to_jsonb(v_appointment));
END;
$function$;

CREATE OR REPLACE FUNCTION public.unschedule_treatment_session(p_session_id uuid, p_cycle_id uuid, p_expected_appointment_id text, p_expected_session_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
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
  IF v_role NOT IN ('master','profissional') THEN
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
     (nullif(v_staff.unidade_id, '') IS NULL OR v_cycle.unit_id IS DISTINCT FROM v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE = '42501';
  END IF;
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

  IF EXISTS(SELECT 1 FROM public.treatment_sessions other WHERE other.appointment_id=p_expected_appointment_id AND other.id<>p_session_id) THEN
    RETURN jsonb_build_object('status','vinculo_compartilhado','reason','use_liberar_para_agendar');
  END IF;
  IF v_appointment.status NOT IN ('confirmado','agendado','pendente')
     OR EXISTS(SELECT 1 FROM public.prontuarios WHERE agendamento_id=p_expected_appointment_id)
     OR EXISTS(SELECT 1 FROM public.atendimentos WHERE agendamento_id=p_expected_appointment_id)
     OR EXISTS(SELECT 1 FROM public.triage_records WHERE agendamento_id=p_expected_appointment_id)
     OR EXISTS(SELECT 1 FROM public.fila_espera WHERE id=p_expected_appointment_id) THEN
    RAISE EXCEPTION 'Paciente já recebido ou com registro clínico. A reserva foi preservada.' USING ERRCODE='23514';
  END IF;

  -- Unlink first in this same transaction; the Agenda deletion trigger must
  -- not process an operation already handled by the canonical deschedule RPC.
  UPDATE public.treatment_sessions s SET status='pendente_agendamento', appointment_id=NULL
   WHERE s.id=p_session_id AND s.cycle_id=p_cycle_id AND s.status='agendada'
     AND s.appointment_id=p_expected_appointment_id AND s.scheduled_date=p_expected_session_date;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'Sessão alterada durante a desmarcação' USING ERRCODE='40001'; END IF;
  DELETE FROM public.agendamentos a WHERE a.id=p_expected_appointment_id
    AND a.paciente_id=v_session.patient_id AND a.profissional_id=v_session.professional_id
    AND a.unidade_id=v_cycle.unit_id AND a.data=v_session.scheduled_date
  RETURNING a.id INTO v_deleted_id;
  IF v_deleted_id IS NULL THEN RAISE EXCEPTION 'Agendamento alterado durante a desmarcação' USING ERRCODE='40001'; END IF;
  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id=p_session_id;
  RETURN jsonb_build_object('status','desmarcado','session',to_jsonb(v_session),'appointment_id',v_deleted_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reschedule_treatment_session(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text DEFAULT NULL::text, p_check_patient_conflict boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_staff record;
  v_role text;
  v_permission boolean;
  v_session record;
  v_cycle record;
  v_appointment public.agendamentos%ROWTYPE;
  v_new_time text;
  v_check jsonb;
  v_manual_override boolean := false;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501'; END IF;
  SELECT f.id, f.role, f.usuario, f.unidade_id INTO v_staff
    FROM public.funcionarios f WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE = '42501'; END IF;

  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao' WHEN 'coordenador' THEN 'gestao'
    WHEN 'recepção' THEN 'recepcao' WHEN 'tecnico' THEN 'triagem'
    WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  IF nullif(v_role, '') IS NULL THEN RAISE EXCEPTION 'Perfil não identificado' USING ERRCODE = '42501'; END IF;

  IF v_role NOT IN ('master', 'profissional') THEN
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
      RAISE EXCEPTION 'Sem permissão para remarcar sessões de tratamento' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'nao_encontrado', 'reason', 'sessao'); END IF;
  SELECT c.* INTO v_cycle FROM public.treatment_cycles c WHERE c.id = p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'ciclo_ausente'); END IF;
  IF v_session.cycle_id IS DISTINCT FROM p_cycle_id OR v_session.patient_id IS DISTINCT FROM v_cycle.patient_id
     OR v_session.professional_id IS DISTINCT FROM v_cycle.professional_id THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'ciclo_sessao');
  END IF;
  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND
     (nullif(v_staff.unidade_id, '') IS NULL OR v_cycle.unit_id IS DISTINCT FROM v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE = '42501';
  END IF;
  IF v_cycle.status <> 'em_andamento' OR v_session.status <> 'agendada' OR v_session.appointment_id IS NULL THEN
    RETURN jsonb_build_object('status', 'estado_protegido', 'reason', 'sessao_nao_remarcavel');
  END IF;
  IF v_session.scheduled_date IS DISTINCT FROM p_expected_session_date
     OR v_session.appointment_id IS DISTINCT FROM p_expected_appointment_id THEN
    RETURN jsonb_build_object('status', 'conflito', 'reason', 'sessao_alterada');
  END IF;
  IF p_new_date IS NULL OR p_new_date < (now() AT TIME ZONE 'America/Fortaleza')::date THEN
    RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', 'data_invalida');
  END IF;

  IF extract(isodow FROM p_new_date) = 7 OR
     (extract(isodow FROM p_new_date) = 6 AND NOT coalesce(v_cycle.custom_data->'weekdays' @> '[6]'::jsonb, false)) THEN
    RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', 'fim_de_semana');
  END IF;

  SELECT a.* INTO v_appointment FROM public.agendamentos a
   WHERE a.id = p_expected_appointment_id FOR UPDATE;
  IF NOT FOUND OR v_appointment.paciente_id IS DISTINCT FROM v_session.patient_id
     OR v_appointment.profissional_id IS DISTINCT FROM v_session.professional_id
     OR v_appointment.unidade_id IS DISTINCT FROM v_cycle.unit_id
     OR v_appointment.data IS DISTINCT FROM v_session.scheduled_date
     OR v_appointment.status IN ('cancelado', 'falta', 'remarcado') THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'agendamento');
  END IF;

  v_new_time := coalesce(nullif(btrim(p_new_time), ''), v_appointment.hora);
  IF v_new_time IS NULL OR v_new_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN
    RETURN jsonb_build_object('status', 'payload_invalido', 'reason', 'horario');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_cycle.professional_id || '|' || v_cycle.unit_id || '|' || p_new_date::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_cycle.patient_id || '|' || p_new_date::text || '|' || v_new_time, 0));
  PERFORM 1 FROM public.disponibilidades d WHERE d.profissional_id = v_cycle.professional_id
    AND d.unidade_id = v_cycle.unit_id AND p_new_date BETWEEN d.data_inicio AND d.data_fim FOR SHARE OF d;

  v_check := public.check_internal_slot_availability(v_cycle.professional_id, v_cycle.unit_id,
    p_new_date, v_new_time, p_expected_appointment_id);
  v_manual_override := public.treatment_manual_capacity_override_matches(
    p_expected_appointment_id, v_cycle.patient_id, v_cycle.professional_id, v_cycle.unit_id,
    'Sessão de Tratamento', v_appointment.origem
  );
  IF coalesce((v_check->>'available')::boolean, false) IS DISTINCT FROM TRUE THEN
    IF v_check->>'reason' = 'date_blocked' THEN
      RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', 'bloqueio_oficial');
    END IF;
    IF NOT v_manual_override OR coalesce(v_check->>'reason', '') NOT IN
      ('no_availability', 'outside_grid', 'availability_conflict', 'day_full', 'turno_full', 'hour_full') THEN
      RETURN jsonb_build_object('status',
        CASE WHEN v_check->>'reason' IN ('day_full', 'hour_full', 'turno_full', 'external_reservation')
          THEN 'capacidade_esgotada' ELSE 'sem_disponibilidade' END,
        'reason', coalesce(v_check->>'reason', 'indisponivel'));
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.agendamentos a WHERE a.paciente_id = v_cycle.patient_id

       AND a.data = p_new_date AND a.hora = v_new_time
       AND a.status NOT IN ('cancelado', 'falta', 'remarcado')
       AND a.id IS DISTINCT FROM p_expected_appointment_id) THEN
    RETURN jsonb_build_object('status', 'duplicado', 'reason', 'horario_ocupado');
  END IF;

  UPDATE public.agendamentos a SET data = p_new_date, hora = v_new_time
   WHERE a.id = p_expected_appointment_id AND a.paciente_id = v_session.patient_id
     AND a.profissional_id = v_session.professional_id AND a.unidade_id = v_cycle.unit_id
     AND a.data = p_expected_session_date AND a.status NOT IN ('cancelado', 'falta', 'remarcado');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Agendamento alterado durante a remarcação' USING ERRCODE = '40001'; END IF;

  UPDATE public.treatment_sessions s SET scheduled_date = p_new_date
   WHERE s.id = p_session_id AND s.cycle_id = p_cycle_id AND s.status = 'agendada'
     AND s.appointment_id = p_expected_appointment_id AND s.scheduled_date = p_expected_session_date;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Sessão alterada durante a remarcação' USING ERRCODE = '40001'; END IF;

  SELECT a.* INTO v_appointment FROM public.agendamentos a WHERE a.id = p_expected_appointment_id;
  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id = p_session_id;
  RETURN jsonb_build_object('status', 'remarcado', 'session', to_jsonb(v_session), 'appointment', to_jsonb(v_appointment));
END;
$function$;

CREATE OR REPLACE FUNCTION public.schedule_treatment_session_manual_capacity(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_staff public.funcionarios%ROWTYPE;
  v_cycle public.treatment_cycles%ROWTYPE;
  v_check jsonb;
  v_result jsonb;
  v_manual_override boolean;
  v_bypass_reason text;
  v_weekday integer;
BEGIN
  SELECT * INTO v_staff FROM public.funcionarios
   WHERE auth_user_id = auth.uid() AND ativo IS TRUE
     AND lower(trim(role)) IN ('profissional', 'master');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Somente o profissional ou Master pode fazer encaixe manual de tratamento'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cycle FROM public.treatment_cycles WHERE id = p_cycle_id;
  IF NOT FOUND OR v_cycle.status IS DISTINCT FROM 'em_andamento'
     OR (v_staff.usuario IS DISTINCT FROM 'admin.sms'
         AND (nullif(v_staff.unidade_id, '') IS NULL OR v_staff.unidade_id IS DISTINCT FROM v_cycle.unit_id))
  THEN
    RAISE EXCEPTION 'Fora do escopo do tratamento' USING ERRCODE = '42501';
  END IF;

  IF p_appointment->>'tipo' IS DISTINCT FROM 'Sessão de Tratamento'
     OR p_appointment->>'origem' IS DISTINCT FROM 'recepcao'
     OR nullif(p_appointment->>'id', '') IS NULL
     OR coalesce(p_appointment->>'hora', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     OR (p_appointment->>'data')::date < (now() AT TIME ZONE 'America/Fortaleza')::date
  THEN
    RETURN jsonb_build_object('status', 'payload_invalido', 'reason', 'agendamento_manual');
  END IF;

  v_weekday := extract(isodow FROM (p_appointment->>'data')::date)::integer;
  IF v_weekday = 7 OR (v_weekday = 6 AND NOT coalesce(v_cycle.custom_data->'weekdays' @> '[6]'::jsonb, false)) THEN
    RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', 'fim_de_semana');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_cycle.professional_id || '|' || v_cycle.unit_id || '|' || (p_appointment->>'data'), 0));
  v_check := public.check_internal_slot_availability(v_cycle.professional_id, v_cycle.unit_id,
    (p_appointment->>'data')::date, p_appointment->>'hora');
  v_manual_override := coalesce((v_check->>'available')::boolean, false) IS NOT TRUE
    OR coalesce((v_check->>'manual_time')::boolean, false);
  v_bypass_reason := coalesce(
    nullif(pg_catalog.btrim(current_setting('app.treatment_manual_capacity_reason', true)), ''),
    'Encaixe autorizado pelo profissional / Continuidade do cuidado multiprofissional'
  );

  IF v_check->>'reason' = 'date_blocked' THEN
    RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', 'bloqueio_oficial');
  END IF;
  IF v_check->>'reason' = 'invalid_hour' THEN
    RETURN jsonb_build_object('status', 'sem_disponibilidade', 'reason', 'invalid_hour');
  END IF;
  IF v_manual_override
     AND NOT coalesce((v_check->>'manual_time')::boolean, false)
     AND coalesce(v_check->>'reason', '') NOT IN
       ('no_availability', 'outside_grid', 'availability_conflict', 'day_full', 'turno_full', 'hour_full')
  THEN
    RETURN jsonb_build_object('status', 'sem_disponibilidade',
      'reason', coalesce(v_check->>'reason', 'indisponibilidade_nao_identificada'));
  END IF;

  PERFORM pg_catalog.set_config('app.treatment_manual_capacity_reason', v_bypass_reason, true);
  PERFORM pg_catalog.set_config('app.treatment_manual_capacity_override', 'on', true);
  PERFORM pg_catalog.set_config('app.treatment_manual_session_id', p_session_id::text, true);
  PERFORM pg_catalog.set_config('app.treatment_manual_appointment_id', p_appointment->>'id', true);

  v_result := public.schedule_treatment_session(
    p_session_id, p_cycle_id, p_expected_session_date, p_appointment, p_check_patient_conflict
  );

  PERFORM pg_catalog.set_config('app.treatment_manual_capacity_override', 'off', true);
  IF v_manual_override AND v_result->>'status' = 'agendado' THEN
    INSERT INTO public.action_logs(user_id, user_nome, role, unidade_id, acao, entidade, entidade_id,
      detalhes, agendamento_id, paciente_id, profissional_id)
    VALUES(v_staff.id::text, v_staff.nome, v_staff.role, v_cycle.unit_id, 'encaixe_manual_tratamento',
      'treatment_session', p_session_id::text,
      pg_catalog.jsonb_build_object('motivo_alteracao', v_bypass_reason,
        'data', p_appointment->>'data', 'hora', p_appointment->>'hora',
        'capacity', v_check, 'cycle_id', p_cycle_id),
      p_appointment->>'id', v_cycle.patient_id, v_cycle.professional_id);
  END IF;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reschedule_treatment_session_manual_capacity(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_staff public.funcionarios%ROWTYPE;
  v_cycle public.treatment_cycles%ROWTYPE;
  v_check jsonb;
  v_result jsonb;
  v_manual_override boolean;
  v_bypass_reason text;
  v_weekday integer;
BEGIN
  SELECT * INTO v_staff FROM public.funcionarios
   WHERE auth_user_id = auth.uid() AND ativo IS TRUE AND lower(trim(role)) IN ('profissional', 'master');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Somente o profissional ou Master pode fazer encaixe manual de tratamento'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cycle FROM public.treatment_cycles WHERE id = p_cycle_id;
  IF NOT FOUND OR v_cycle.status IS DISTINCT FROM 'em_andamento'
     OR (v_staff.usuario IS DISTINCT FROM 'admin.sms'
         AND (nullif(v_staff.unidade_id, '') IS NULL OR v_staff.unidade_id IS DISTINCT FROM v_cycle.unit_id))
  THEN
    RAISE EXCEPTION 'Fora do escopo do tratamento' USING ERRCODE = '42501';
  END IF;

  IF nullif(p_expected_appointment_id, '') IS NULL
     OR p_new_date IS NULL
     OR p_new_date < (now() AT TIME ZONE 'America/Fortaleza')::date
     OR coalesce(p_new_time, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  THEN
    RETURN jsonb_build_object('status', 'payload_invalido', 'reason', 'agendamento_manual');
  END IF;

  v_weekday := extract(isodow FROM p_new_date)::integer;
  IF v_weekday = 7 OR (v_weekday = 6 AND NOT coalesce(v_cycle.custom_data->'weekdays' @> '[6]'::jsonb, false)) THEN
    RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', 'fim_de_semana');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_cycle.professional_id || '|' || v_cycle.unit_id || '|' || p_new_date::text, 0));
  v_check := public.check_internal_slot_availability(v_cycle.professional_id, v_cycle.unit_id,
    p_new_date, p_new_time, p_expected_appointment_id);
  v_manual_override := coalesce((v_check->>'available')::boolean, false) IS NOT TRUE
    OR coalesce((v_check->>'manual_time')::boolean, false);
  v_bypass_reason := coalesce(
    nullif(pg_catalog.btrim(current_setting('app.treatment_manual_capacity_reason', true)), ''),
    'Encaixe autorizado pelo profissional / Continuidade do cuidado multiprofissional'
  );

  IF v_check->>'reason' = 'date_blocked' THEN
    RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', 'bloqueio_oficial');
  END IF;
  IF v_check->>'reason' = 'invalid_hour' THEN
    RETURN jsonb_build_object('status', 'sem_disponibilidade', 'reason', 'invalid_hour');
  END IF;
  IF v_manual_override
     AND NOT coalesce((v_check->>'manual_time')::boolean, false)
     AND coalesce(v_check->>'reason', '') NOT IN
       ('no_availability', 'outside_grid', 'availability_conflict', 'day_full', 'turno_full', 'hour_full')
  THEN
    RETURN jsonb_build_object('status', 'sem_disponibilidade',
      'reason', coalesce(v_check->>'reason', 'indisponibilidade_nao_identificada'));
  END IF;

  PERFORM pg_catalog.set_config('app.treatment_manual_capacity_reason', v_bypass_reason, true);
  PERFORM pg_catalog.set_config('app.treatment_manual_capacity_override', 'on', true);
  PERFORM pg_catalog.set_config('app.treatment_manual_session_id', p_session_id::text, true);
  PERFORM pg_catalog.set_config('app.treatment_manual_appointment_id', p_expected_appointment_id, true);
  v_result := public.reschedule_treatment_session(
    p_session_id, p_cycle_id, p_expected_session_date, p_expected_appointment_id,
    p_new_date, p_new_time, p_check_patient_conflict
  );
  PERFORM pg_catalog.set_config('app.treatment_manual_capacity_override', 'off', true);

  IF v_manual_override AND v_result->>'status' = 'remarcado' THEN
    INSERT INTO public.action_logs(user_id, user_nome, role, unidade_id, acao, entidade, entidade_id,
      detalhes, agendamento_id, paciente_id, profissional_id)
    VALUES(v_staff.id::text, v_staff.nome, v_staff.role, v_cycle.unit_id,
      'remarcacao_encaixe_manual_tratamento', 'treatment_session', p_session_id::text,
      pg_catalog.jsonb_build_object('motivo_alteracao', v_bypass_reason, 'data', p_new_date,
        'hora', p_new_time, 'capacity', v_check, 'cycle_id', p_cycle_id),
      p_expected_appointment_id, v_cycle.patient_id, v_cycle.professional_id);
  END IF;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.treatment_manual_capacity_override_matches(p_appointment_id text, p_patient_id text, p_professional_id text, p_unit_id text, p_type text, p_origin text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_staff public.funcionarios%ROWTYPE;
  v_session public.treatment_sessions%ROWTYPE;
  v_cycle public.treatment_cycles%ROWTYPE;
BEGIN
  IF current_setting('app.treatment_manual_capacity_override', true) IS DISTINCT FROM 'on'
     OR current_setting('app.treatment_manual_appointment_id', true) IS DISTINCT FROM p_appointment_id
     OR p_type IS DISTINCT FROM 'Sessão de Tratamento'
     OR p_origin IS DISTINCT FROM 'recepcao' THEN RETURN false; END IF;
  SELECT * INTO v_staff FROM public.funcionarios
   WHERE auth_user_id = auth.uid() AND ativo IS TRUE AND lower(trim(role)) IN ('profissional','master');
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_session FROM public.treatment_sessions
   WHERE id::text = current_setting('app.treatment_manual_session_id', true);
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_cycle FROM public.treatment_cycles WHERE id = v_session.cycle_id;
  IF NOT FOUND OR v_cycle.status IS DISTINCT FROM 'em_andamento'
     OR v_cycle.patient_id IS DISTINCT FROM p_patient_id
     OR v_cycle.professional_id IS DISTINCT FROM p_professional_id
     OR v_cycle.unit_id IS DISTINCT FROM p_unit_id
     OR v_session.patient_id IS DISTINCT FROM p_patient_id
     OR v_session.professional_id IS DISTINCT FROM p_professional_id
     OR (v_session.appointment_id IS NOT NULL AND v_session.appointment_id IS DISTINCT FROM p_appointment_id)
     OR (v_staff.usuario IS DISTINCT FROM 'admin.sms'
         AND (nullif(v_staff.unidade_id, '') IS NULL OR v_staff.unidade_id IS DISTINCT FROM p_unit_id))
  THEN RETURN false; END IF;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.schedule_treatment_session_checked(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  s public.treatment_sessions%ROWTYPE;
  c public.treatment_cycles%ROWTYPE;
  actor jsonb;
  result jsonb;
  reason_value text;
BEGIN
  SELECT * INTO s FROM public.treatment_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sessão não encontrada.' USING ERRCODE = '23503'; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id = p_cycle_id FOR UPDATE;
  actor := public.assert_treatment_write_scope(c.professional_id, c.unit_id, false);
  IF s.cycle_id IS DISTINCT FROM c.id OR s.scheduled_date IS DISTINCT FROM p_expected_session_date THEN
    RAISE EXCEPTION 'A sessão mudou. Atualize o ciclo.' USING ERRCODE = '40001';
  END IF;

  reason_value := coalesce(nullif(btrim(p_reason), ''), 'Encaixe autorizado pelo profissional / Continuidade do cuidado multiprofissional');
  PERFORM set_config('app.treatment_change_reason', reason_value, true);
  PERFORM set_config('app.treatment_manual_capacity_reason', reason_value, true);
  IF p_manual_capacity THEN
    result := public.schedule_treatment_session_manual_capacity(
      p_session_id, p_cycle_id, p_expected_session_date, p_appointment, p_check_patient_conflict
    );
  ELSE
    result := public.schedule_treatment_session_batch(
      p_session_id, p_cycle_id, p_expected_session_date, p_appointment, p_check_patient_conflict
    );
  END IF;

  IF result->>'status' = 'agendado' THEN
    INSERT INTO public.action_logs(user_id, user_nome, role, unidade_id, acao, entidade, entidade_id,
      modulo, paciente_id, profissional_id, detalhes)
    VALUES(actor->>'id', actor->>'nome', actor->>'role', c.unit_id, 'agendar_sessao',
      'treatment_session', s.id::text, 'tratamentos', c.patient_id, c.professional_id,
      jsonb_build_object('motivo_alteracao', reason_value, 'ciclo', c.id, 'sessao', s.id,
        'valor_anterior', to_jsonb(s), 'valor_novo', result->'session'));
  END IF;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reschedule_treatment_session_checked(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  result jsonb;
  c public.treatment_cycles%ROWTYPE;
  actor jsonb;
  reason_value text;
BEGIN
  SELECT * INTO c FROM public.treatment_cycles WHERE id = p_cycle_id;
  actor := public.assert_treatment_write_scope(c.professional_id, c.unit_id, false);
  reason_value := coalesce(nullif(btrim(p_reason), ''), 'Encaixe autorizado pelo profissional / Continuidade do cuidado multiprofissional');
  PERFORM set_config('app.treatment_change_reason', reason_value, true);
  PERFORM set_config('app.treatment_manual_capacity_reason', reason_value, true);

  IF p_manual_capacity THEN
    result := public.reschedule_treatment_session_manual_capacity(
      p_session_id, p_cycle_id, p_expected_session_date, p_expected_appointment_id,
      p_new_date, p_new_time, p_check_patient_conflict
    );
  ELSE
    result := public.reschedule_treatment_session(
      p_session_id, p_cycle_id, p_expected_session_date, p_expected_appointment_id,
      p_new_date, p_new_time, p_check_patient_conflict
    );
  END IF;

  IF result->>'status' = 'remarcado' THEN
    INSERT INTO public.action_logs(user_id, user_nome, role, unidade_id, acao, entidade, entidade_id,
      modulo, paciente_id, profissional_id, detalhes)
    VALUES(actor->>'id', actor->>'nome', actor->>'role', c.unit_id, 'remarcar_sessao',
      'treatment_session', p_session_id::text, 'tratamentos', c.patient_id, c.professional_id,
      jsonb_build_object('motivo_alteracao', reason_value,
        'data_anterior', p_expected_session_date, 'data_nova', p_new_date));
  END IF;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reschedule_treatment_session_with_room(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text, p_new_room_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  result jsonb;
  previous_room text;
  appointment public.agendamentos%ROWTYPE;
  c public.treatment_cycles%ROWTYPE;
  actor jsonb;
  reason_value text;
BEGIN
  reason_value := coalesce(nullif(btrim(p_reason), ''), 'Encaixe autorizado pelo profissional / Continuidade do cuidado multiprofissional');
  result := public.reschedule_treatment_session_checked(
    p_session_id, p_cycle_id, p_expected_session_date, p_expected_appointment_id,
    p_new_date, p_new_time, p_check_patient_conflict, p_manual_capacity, reason_value
  );
  IF result->>'status' = 'remarcado' THEN
    SELECT * INTO c FROM public.treatment_cycles WHERE id = p_cycle_id;
    actor := public.assert_treatment_write_scope(c.professional_id, c.unit_id, false);
    SELECT sala_id INTO previous_room FROM public.agendamentos WHERE id = p_expected_appointment_id;
    UPDATE public.agendamentos SET sala_id = p_new_room_id
     WHERE id = p_expected_appointment_id RETURNING * INTO appointment;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Agendamento não encontrado; remarcação revertida.' USING ERRCODE = '40001';
    END IF;
    result := jsonb_set(result, '{appointment}', to_jsonb(appointment));
    IF previous_room IS DISTINCT FROM p_new_room_id THEN
      INSERT INTO public.action_logs(user_id, user_nome, role, unidade_id, acao, entidade, entidade_id,
        modulo, paciente_id, profissional_id, detalhes)
      VALUES(actor->>'id', actor->>'nome', actor->>'role', c.unit_id, 'alterar_sala_sessao',
        'treatment_session', p_session_id::text, 'tratamentos', c.patient_id, c.professional_id,
        jsonb_build_object('motivo_alteracao', reason_value, 'ciclo', c.id, 'sessao', p_session_id,
          'valor_anterior', previous_room, 'valor_novo', p_new_room_id));
    END IF;
  END IF;
  RETURN result;
END;
$function$;

COMMIT;

-- Allows the cycle's professional and scoped Masters to use the existing
-- treatment-only capacity override for individual and batch session operations.
-- Official blocks, cycle ownership, unit scope, weekends, and duplicate checks remain enforced.
BEGIN;

CREATE OR REPLACE FUNCTION public.schedule_treatment_session_manual_capacity(
  p_session_id uuid,
  p_cycle_id uuid,
  p_expected_session_date date,
  p_appointment jsonb,
  p_check_patient_conflict boolean
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
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
         AND ((nullif(v_staff.unidade_id, '') IS NULL AND lower(trim(v_staff.role)) <> 'master')
           OR (nullif(v_staff.unidade_id, '') IS NOT NULL AND v_staff.unidade_id IS DISTINCT FROM v_cycle.unit_id)))
     OR (lower(trim(v_staff.role)) = 'profissional' AND v_staff.id::text IS DISTINCT FROM v_cycle.professional_id)
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
    'Motivo não informado (campo opcional).'
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

CREATE OR REPLACE FUNCTION public.reschedule_treatment_session_manual_capacity(
  p_session_id uuid,
  p_cycle_id uuid,
  p_expected_session_date date,
  p_expected_appointment_id text,
  p_new_date date,
  p_new_time text,
  p_check_patient_conflict boolean
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
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
         AND ((nullif(v_staff.unidade_id, '') IS NULL AND lower(trim(v_staff.role)) <> 'master')
           OR (nullif(v_staff.unidade_id, '') IS NOT NULL AND v_staff.unidade_id IS DISTINCT FROM v_cycle.unit_id)))
     OR (lower(trim(v_staff.role)) = 'profissional' AND v_staff.id::text IS DISTINCT FROM v_cycle.professional_id)
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
    'Motivo não informado (campo opcional).'
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

CREATE OR REPLACE FUNCTION public.schedule_treatment_session_checked(
  p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb,
  p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text
) RETURNS jsonb
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

  reason_value := coalesce(nullif(btrim(p_reason), ''), 'Motivo não informado (campo opcional).');
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

CREATE OR REPLACE FUNCTION public.reschedule_treatment_session_checked(
  p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text,
  p_new_date date, p_new_time text, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text
) RETURNS jsonb
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
  reason_value := coalesce(nullif(btrim(p_reason), ''), 'Motivo não informado (campo opcional).');
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

CREATE OR REPLACE FUNCTION public.reschedule_treatment_session_with_room(
  p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text,
  p_new_date date, p_new_time text, p_check_patient_conflict boolean, p_manual_capacity boolean,
  p_reason text, p_new_room_id text
) RETURNS jsonb
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
  reason_value := coalesce(nullif(btrim(p_reason), ''), 'Motivo não informado (campo opcional).');
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

CREATE OR REPLACE FUNCTION public.reschedule_treatment_session(
  p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text,
  p_new_date date, p_new_time text DEFAULT NULL::text, p_check_patient_conflict boolean DEFAULT false
) RETURNS jsonb
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
  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND (
      (nullif(v_staff.unidade_id, '') IS NULL AND v_role <> 'master')
      OR (nullif(v_staff.unidade_id, '') IS NOT NULL AND v_cycle.unit_id <> v_staff.unidade_id)) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'profissional' AND v_cycle.professional_id <> v_staff.id::text THEN
    RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE = '42501';
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
       AND (p_check_patient_conflict IS TRUE OR a.profissional_id = v_cycle.professional_id)
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

REVOKE ALL ON FUNCTION public.schedule_treatment_session_checked(uuid, uuid, date, jsonb, boolean, boolean, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_treatment_session_checked(uuid, uuid, date, jsonb, boolean, boolean, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.reschedule_treatment_session_checked(uuid, uuid, date, text, date, text, boolean, boolean, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_treatment_session_checked(uuid, uuid, date, text, date, text, boolean, boolean, text)
  TO authenticated;

COMMIT;

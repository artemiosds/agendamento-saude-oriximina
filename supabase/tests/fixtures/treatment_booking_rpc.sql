-- Availability is stubbed only in this isolated fixture; production uses its existing calendar RPC.
CREATE TABLE public.disponibilidades(profissional_id text, unidade_id text, data_inicio date, data_fim date);
CREATE FUNCTION public.check_internal_slot_availability(text,text,date,text,text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"available":true}'::jsonb $$;
-- Current batch RPC copied for isolated integration tests; not a production migration.
CREATE OR REPLACE FUNCTION public.schedule_treatment_session_batch(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_session record;
  v_cycle record;
  v_date date;
  v_time time;
  v_blocked boolean;
  v_lock_key bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT s.id, s.cycle_id, s.patient_id, s.professional_id, s.status,
         s.scheduled_date, s.appointment_id
    INTO v_session
    FROM public.treatment_sessions s
   WHERE s.id = p_session_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'nao_encontrado', 'reason', 'sessao');
  END IF;

  SELECT c.id, c.patient_id, c.professional_id, c.unit_id, c.status
    INTO v_cycle
    FROM public.treatment_cycles c
   WHERE c.id = p_cycle_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'ciclo_ausente');
  END IF;

  -- Idempotent retries do not need to revalidate a booking that is already committed.
  IF v_session.status = 'agendada' AND v_session.appointment_id IS NOT NULL THEN
    RETURN public.schedule_treatment_session(
      p_session_id, p_cycle_id, p_expected_session_date, p_appointment, p_check_patient_conflict
    );
  END IF;

  IF v_session.cycle_id IS DISTINCT FROM p_cycle_id
     OR v_session.patient_id IS DISTINCT FROM v_cycle.patient_id
     OR v_session.professional_id IS DISTINCT FROM v_cycle.professional_id
     OR v_cycle.status <> 'em_andamento'
     OR v_session.status <> 'pendente_agendamento'
     OR v_session.appointment_id IS NOT NULL
     OR v_session.scheduled_date IS DISTINCT FROM p_expected_session_date THEN
    RETURN jsonb_build_object('status', 'estado_protegido', 'reason', 'sessao_alterada');
  END IF;

  v_date := nullif(p_appointment->>'data', '')::date;
  v_time := substring(coalesce(p_appointment->>'hora', ''), 1, 5)::time;
  IF v_date IS NULL OR v_time IS NULL THEN
    RETURN jsonb_build_object('status', 'payload_invalido', 'reason', 'data_hora');
  END IF;

  -- Serialize batch reservations by professional/unit/day.
  v_lock_key := pg_catalog.hashtextextended(
    v_cycle.professional_id || '|' || v_cycle.unit_id || '|' || v_date::text, 0
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);

  IF extract(isodow FROM v_date) IN (6, 7) THEN
    RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', 'fim_de_semana');
  END IF;
  SELECT public.is_date_blocked(v_date, v_cycle.professional_id, v_cycle.unit_id)
    INTO v_blocked;
  IF v_blocked IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', 'bloqueio_integral');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bloqueios b
     WHERE v_date BETWEEN b.data_inicio AND b.data_fim
       AND ((coalesce(b.unidade_id, '') = '' AND coalesce(b.profissional_id, '') = '')
         OR (b.unidade_id = v_cycle.unit_id AND coalesce(b.profissional_id, '') = '')
         OR b.profissional_id = v_cycle.professional_id)
       AND (b.dia_inteiro IS TRUE OR coalesce(b.hora_inicio, '') = ''
         OR (v_time >= b.hora_inicio::time
             AND v_time < coalesce(nullif(b.hora_fim, ''), '23:59')::time))
  ) THEN
    RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', 'bloqueio_de_horario');
  END IF;

  -- Capacidade e grade nao bloqueiam mais a equipe interna: a sessao e gravada
  -- pela funcao transacional, que mantem as validacoes de paciente duplicado.
  RETURN public.schedule_treatment_session(
    p_session_id, p_cycle_id, p_expected_session_date, p_appointment, p_check_patient_conflict
  );
END;
$function$;
-- Existing production reschedule RPC, exercised against fictitious records only.
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
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT f.id, f.role, f.usuario, f.unidade_id
    INTO v_staff
    FROM public.funcionarios f
   WHERE f.auth_user_id = auth.uid()
     AND f.ativo IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE = '42501';
  END IF;

  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role
    WHEN 'gestão' THEN 'gestao'
    WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao'
    WHEN 'coordenador' THEN 'gestao'
    WHEN 'recepção' THEN 'recepcao'
    WHEN 'tecnico' THEN 'triagem'
    WHEN 'tecnico_enfermagem' THEN 'enfermagem'
    ELSE v_role
  END;

  IF nullif(v_role, '') IS NULL THEN
    RAISE EXCEPTION 'Perfil não identificado' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('master', 'profissional') THEN
    SELECT chosen.can_execute
      INTO v_permission
      FROM (
        SELECT pu.can_execute, 1 AS rank
          FROM public.permissoes_usuario pu
         WHERE pu.user_id = v_staff.id::text
           AND pu.modulo = 'tratamento'
           AND pu.unidade_id = coalesce(v_staff.unidade_id, '')
           AND coalesce(v_staff.unidade_id, '') <> ''
        UNION ALL
        SELECT pu.can_execute, 2
          FROM public.permissoes_usuario pu
         WHERE pu.user_id = v_staff.id::text
           AND pu.modulo = 'tratamento'
           AND pu.unidade_id = ''
        UNION ALL
        SELECT p.can_execute, 3
          FROM public.permissoes p
         WHERE p.perfil IN (v_role, lower(trim(v_staff.role)))
           AND p.modulo = 'tratamento'
           AND p.unidade_id = coalesce(v_staff.unidade_id, '')
           AND coalesce(v_staff.unidade_id, '') <> ''
        UNION ALL
        SELECT p.can_execute, 4
          FROM public.permissoes p
         WHERE p.perfil IN (v_role, lower(trim(v_staff.role)))
           AND p.modulo = 'tratamento'
           AND p.unidade_id = ''
      ) chosen
     ORDER BY chosen.rank
     LIMIT 1;

    IF v_permission IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Sem permissão para remarcar sessões de tratamento'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT s.*
    INTO v_session
    FROM public.treatment_sessions s
   WHERE s.id = p_session_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'nao_encontrado', 'reason', 'sessao');
  END IF;

  SELECT c.*
    INTO v_cycle
    FROM public.treatment_cycles c
   WHERE c.id = p_cycle_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'ciclo_ausente');
  END IF;

  IF v_session.cycle_id IS DISTINCT FROM p_cycle_id
     OR v_session.patient_id IS DISTINCT FROM v_cycle.patient_id
     OR v_session.professional_id IS DISTINCT FROM v_cycle.professional_id THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'ciclo_sessao');
  END IF;

  IF v_staff.usuario IS DISTINCT FROM 'admin.sms'
     AND (
       (nullif(v_staff.unidade_id, '') IS NULL AND v_role <> 'master')
       OR (nullif(v_staff.unidade_id, '') IS NOT NULL
           AND v_cycle.unit_id <> v_staff.unidade_id)
     ) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE = '42501';
  END IF;

  IF v_role = 'profissional'
     AND v_cycle.professional_id <> v_staff.id::text THEN
    RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE = '42501';
  END IF;

  IF v_cycle.status <> 'em_andamento'
     OR v_session.status <> 'agendada'
     OR v_session.appointment_id IS NULL THEN
    RETURN jsonb_build_object('status', 'estado_protegido', 'reason', 'sessao_nao_remarcavel');
  END IF;

  IF v_session.scheduled_date IS DISTINCT FROM p_expected_session_date
     OR v_session.appointment_id IS DISTINCT FROM p_expected_appointment_id THEN
    RETURN jsonb_build_object('status', 'conflito', 'reason', 'sessao_alterada');
  END IF;

  IF p_new_date IS NULL
     OR p_new_date < (now() AT TIME ZONE 'America/Fortaleza')::date THEN
    RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', 'data_invalida');
  END IF;

  IF extract(isodow FROM p_new_date) IN (6, 7) THEN
    RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', 'fim_de_semana');
  END IF;

  SELECT a.*
    INTO v_appointment
    FROM public.agendamentos a
   WHERE a.id = p_expected_appointment_id
   FOR UPDATE;

  IF NOT FOUND
     OR v_appointment.paciente_id IS DISTINCT FROM v_session.patient_id
     OR v_appointment.profissional_id IS DISTINCT FROM v_session.professional_id
     OR v_appointment.unidade_id IS DISTINCT FROM v_cycle.unit_id
     OR v_appointment.data IS DISTINCT FROM v_session.scheduled_date
     OR v_appointment.status IN ('cancelado', 'falta', 'remarcado') THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'agendamento');
  END IF;

  v_new_time := coalesce(nullif(btrim(p_new_time), ''), v_appointment.hora);

  IF v_new_time IS NULL
     OR v_new_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN
    RETURN jsonb_build_object('status', 'payload_invalido', 'reason', 'horario');
  END IF;

  -- Mesmas chaves de concorrência usadas pelo agendamento e pela capacidade externa.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_cycle.professional_id || '|' || v_cycle.unit_id || '|' || p_new_date::text,
      0
    )
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_cycle.patient_id || '|' || p_new_date::text || '|' || v_new_time,
      0
    )
  );

  -- Impede que uma alteração concorrente da grade invalide a checagem durante a operação.
  PERFORM 1
    FROM public.disponibilidades d
   WHERE d.profissional_id = v_cycle.professional_id
     AND d.unidade_id = v_cycle.unit_id
     AND p_new_date BETWEEN d.data_inicio AND d.data_fim
   FOR SHARE OF d;

  v_check := public.check_internal_slot_availability(
    v_cycle.professional_id,
    v_cycle.unit_id,
    p_new_date,
    v_new_time,
    p_expected_appointment_id
  );

  IF coalesce((v_check->>'available')::boolean, false) IS DISTINCT FROM TRUE THEN
    IF v_check->>'reason' = 'date_blocked' THEN
      RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', v_check->>'reason');
    END IF;

    RETURN jsonb_build_object(
      'status',
      CASE
        WHEN v_check->>'reason' IN ('day_full', 'hour_full', 'turno_full', 'external_reservation')
          THEN 'capacidade_esgotada'
        ELSE 'sem_disponibilidade'
      END,
      'reason',
      coalesce(v_check->>'reason', 'indisponivel')
    );
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.agendamentos a
     WHERE a.paciente_id = v_cycle.patient_id
       AND (p_check_patient_conflict IS TRUE
            OR a.profissional_id = v_cycle.professional_id)
       AND a.data = p_new_date
       AND a.hora = v_new_time
       AND a.status NOT IN ('cancelado', 'falta', 'remarcado')
       AND a.id IS DISTINCT FROM p_expected_appointment_id
  ) THEN
    RETURN jsonb_build_object('status', 'duplicado', 'reason', 'horario_ocupado');
  END IF;

  UPDATE public.agendamentos a
     SET data = p_new_date,
         hora = v_new_time
   WHERE a.id = p_expected_appointment_id
     AND a.paciente_id = v_session.patient_id
     AND a.profissional_id = v_session.professional_id
     AND a.unidade_id = v_cycle.unit_id
     AND a.data = p_expected_session_date
     AND a.status NOT IN ('cancelado', 'falta', 'remarcado');

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Agendamento alterado durante a remarcação' USING ERRCODE = '40001';
  END IF;

  UPDATE public.treatment_sessions s
     SET scheduled_date = p_new_date
   WHERE s.id = p_session_id
     AND s.cycle_id = p_cycle_id
     AND s.status = 'agendada'
     AND s.appointment_id = p_expected_appointment_id
     AND s.scheduled_date = p_expected_session_date;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Sessão alterada durante a remarcação' USING ERRCODE = '40001';
  END IF;

  SELECT a.*
    INTO v_appointment
    FROM public.agendamentos a
   WHERE a.id = p_expected_appointment_id;

  SELECT s.*
    INTO v_session
    FROM public.treatment_sessions s
   WHERE s.id = p_session_id;

  RETURN jsonb_build_object(
    'status', 'remarcado',
    'session', to_jsonb(v_session),
    'appointment', to_jsonb(v_appointment)
  );
END;
$function$
;

-- Strict, transaction-scoped validation for bulk treatment scheduling.
-- The regular single-session operation remains unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.schedule_treatment_session_batch(
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
  v_session record;
  v_cycle record;
  v_date date;
  v_time time;
  v_slot record;
  v_matching boolean := false;
  v_valid_grid boolean := false;
  v_blocked boolean;
  v_duration integer;
  v_day_count integer;
  v_hour_count integer;
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

  -- Serialize batch reservations by professional/unit/day, including capacity checks.
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

  FOR v_slot IN
    SELECT d.*
      FROM public.disponibilidades d
     WHERE d.profissional_id = v_cycle.professional_id
       AND d.unidade_id = v_cycle.unit_id
       AND v_date BETWEEN d.data_inicio AND d.data_fim
       AND extract(dow FROM v_date)::integer = ANY(d.dias_semana)
       AND v_time >= d.hora_inicio::time AND v_time < d.hora_fim::time
     ORDER BY d.id
     FOR SHARE OF d
  LOOP
    v_matching := true;
    IF v_slot.vagas_por_hora = 0 THEN
      IF v_time <> v_slot.hora_inicio::time THEN CONTINUE; END IF;
      v_valid_grid := true;
      SELECT count(*) INTO v_day_count
        FROM public.agendamentos a
       WHERE a.profissional_id = v_cycle.professional_id
         AND a.unidade_id = v_cycle.unit_id AND a.data = v_date
         AND a.hora::time >= v_slot.hora_inicio::time
         AND a.hora::time < v_slot.hora_fim::time
         AND a.status NOT IN ('cancelado', 'falta', 'remarcado');
    ELSE
      v_duration := greatest(coalesce(nullif(v_slot.duracao_consulta, 0), 30), 15);
      IF mod(extract(epoch FROM (v_time - v_slot.hora_inicio::time))::integer, v_duration * 60) <> 0
         OR extract(epoch FROM (v_slot.hora_fim::time - v_time)) < v_duration * 60 THEN
        CONTINUE;
      END IF;
      v_valid_grid := true;
      SELECT count(*) INTO v_day_count
        FROM public.agendamentos a
       WHERE a.profissional_id = v_cycle.professional_id
         AND a.unidade_id = v_cycle.unit_id AND a.data = v_date
         AND a.status NOT IN ('cancelado', 'falta', 'remarcado');
      SELECT count(*) INTO v_hour_count
        FROM public.agendamentos a
       WHERE a.profissional_id = v_cycle.professional_id
         AND a.unidade_id = v_cycle.unit_id AND a.data = v_date
         AND left(a.hora, 3) = left(p_appointment->>'hora', 3)
         AND a.status NOT IN ('cancelado', 'falta', 'remarcado');
      IF v_hour_count >= v_slot.vagas_por_hora THEN CONTINUE; END IF;
    END IF;

    IF v_day_count < v_slot.vagas_por_dia THEN
      RETURN public.schedule_treatment_session(
        p_session_id, p_cycle_id, p_expected_session_date, p_appointment, p_check_patient_conflict
      );
    END IF;
  END LOOP;

  IF NOT v_matching THEN
    RETURN jsonb_build_object('status', 'sem_disponibilidade', 'reason', 'sem_grade_para_data_hora');
  END IF;
  IF NOT v_valid_grid THEN
    RETURN jsonb_build_object('status', 'sem_disponibilidade', 'reason', 'fora_da_grade');
  END IF;
  RETURN jsonb_build_object('status', 'capacidade_esgotada', 'reason', 'limite_diario_ou_turno');
END;
$function$;

REVOKE ALL ON FUNCTION public.schedule_treatment_session_batch(uuid, uuid, date, jsonb, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_treatment_session_batch(uuid, uuid, date, jsonb, boolean)
  TO authenticated;

COMMIT;

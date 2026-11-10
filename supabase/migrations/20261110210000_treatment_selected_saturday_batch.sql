-- Preserve the active batch scheduler's permission and conflict checks; allow Saturday only when chosen in the cycle.
BEGIN;
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

  SELECT c.id, c.patient_id, c.professional_id, c.unit_id, c.status, c.custom_data
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

  IF extract(isodow FROM v_date) = 7 OR (extract(isodow FROM v_date) = 6 AND NOT coalesce(v_cycle.custom_data->'weekdays' @> '[6]'::jsonb, false)) THEN
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
COMMIT;

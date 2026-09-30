-- Permite escolher qualquer minuto dentro de uma disponibilidade cadastrada por turno.
-- Preserva bloqueios por horário, limites de capacidade, reservas externas e grades por hora.
BEGIN;
CREATE OR REPLACE FUNCTION public.check_internal_slot_availability(
  p_profissional_id text, p_unidade_id text, p_data date, p_hora text,
  p_exclude_agendamento_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_slot public.disponibilidades%ROWTYPE;
  v_hora time;
  v_total integer;
  v_internal integer;
  v_external integer;
  v_hour_count integer;
  v_reservation_requested integer := 0;
  v_reservation integer := 0;
  v_availability_count integer;
  v_matching_count integer;
  v_capacity integer;
  v_duration integer;
BEGIN
  IF p_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN
    RETURN jsonb_build_object('available', false, 'reason', 'invalid_hour');
  END IF;
  v_hora := p_hora::time;
  IF public.is_date_blocked(p_data, p_profissional_id, p_unidade_id) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'date_blocked');
  END IF;
  IF EXISTS (SELECT 1 FROM public.bloqueios b
    WHERE p_data BETWEEN b.data_inicio AND b.data_fim
      AND ((coalesce(b.unidade_id, '') = '' AND coalesce(b.profissional_id, '') = '')
        OR (b.unidade_id = p_unidade_id AND coalesce(b.profissional_id, '') = '')
        OR b.profissional_id = p_profissional_id)
      AND (b.dia_inteiro = true OR coalesce(b.hora_inicio, '') = ''
        OR (v_hora >= b.hora_inicio::time AND
            v_hora < coalesce(nullif(b.hora_fim, ''), '23:59')::time))) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'date_blocked');
  END IF;

  SELECT count(*) INTO v_matching_count FROM public.disponibilidades d
  WHERE d.profissional_id = p_profissional_id AND d.unidade_id = p_unidade_id
    AND p_data BETWEEN d.data_inicio AND d.data_fim
    AND extract(dow FROM p_data)::integer = ANY(d.dias_semana)
    AND v_hora >= d.hora_inicio::time AND v_hora < d.hora_fim::time;
  IF v_matching_count = 0 THEN RETURN jsonb_build_object('available', false, 'reason', 'no_availability'); END IF;
  IF v_matching_count > 1 THEN RETURN jsonb_build_object('available', false, 'reason', 'ambiguous_availability'); END IF;

  SELECT d.* INTO v_slot FROM public.disponibilidades d
  WHERE d.profissional_id = p_profissional_id AND d.unidade_id = p_unidade_id
    AND p_data BETWEEN d.data_inicio AND d.data_fim
    AND extract(dow FROM p_data)::integer = ANY(d.dias_semana)
    AND v_hora >= d.hora_inicio::time AND v_hora < d.hora_fim::time
  ORDER BY d.id LIMIT 1;

  IF v_slot.vagas_por_hora > 0 THEN
    v_duration := coalesce(nullif(v_slot.duracao_consulta, 0), 30);
    IF mod(extract(epoch FROM (v_hora - v_slot.hora_inicio::time))::numeric,
           (v_duration * 60)::numeric) <> 0
       OR extract(epoch FROM (v_slot.hora_fim::time - v_hora)) < v_duration * 60 THEN
      RETURN jsonb_build_object('available', false, 'reason', 'outside_grid');
    END IF;
  END IF;

  SELECT count(*) INTO v_availability_count FROM public.disponibilidades d
  WHERE d.profissional_id = p_profissional_id AND d.unidade_id = p_unidade_id
    AND p_data BETWEEN d.data_inicio AND d.data_fim
    AND extract(dow FROM p_data)::integer = ANY(d.dias_semana);

  SELECT coalesce(sum(q.vagas_total), 0)::integer INTO v_reservation_requested
  FROM public.quotas_externas q
  WHERE q.ativo = true AND q.profissional_interno_id::text = p_profissional_id
    AND q.unidade_id = p_unidade_id
    AND q.periodo_inicio = p_data AND q.periodo_fim = p_data
    AND q.vagas_total > 0 AND q.vagas_usadas BETWEEN 0 AND q.vagas_total
    AND q.turno IN ('manha', 'tarde', 'noite', 'integral', 'personalizado')
    AND (q.dia_semana IS NULL OR q.dia_semana = extract(dow FROM p_data)::integer)
    AND ((q.turno = 'integral' AND v_availability_count = 1)
      OR (q.turno <> 'integral' AND q.horario_inicio IS NOT NULL AND q.horario_fim IS NOT NULL
        AND q.horario_inicio::time = v_slot.hora_inicio::time
        AND q.horario_fim::time = v_slot.hora_fim::time));

  v_capacity := greatest(0, v_slot.vagas_por_dia);
  v_reservation := least(v_capacity, v_reservation_requested);
  SELECT count(*) FILTER (WHERE a.origem = 'externo'),
         count(*) FILTER (WHERE a.origem IS DISTINCT FROM 'externo')
    INTO v_external, v_internal
  FROM public.agendamentos a
  WHERE a.profissional_id = p_profissional_id AND a.unidade_id = p_unidade_id
    AND a.data = p_data AND a.status NOT IN ('cancelado', 'falta')
    AND a.id IS DISTINCT FROM p_exclude_agendamento_id
    AND (v_slot.vagas_por_hora > 0 OR
      (a.hora >= v_slot.hora_inicio AND a.hora < v_slot.hora_fim));
  v_total := v_external + v_internal;

  IF v_total >= v_capacity THEN
    RETURN jsonb_build_object('available', false,
      'reason', CASE WHEN v_slot.vagas_por_hora = 0 THEN 'turno_full' ELSE 'day_full' END,
      'capacity', v_capacity, 'internal', v_internal, 'external', v_external,
      'external_reservation', v_reservation, 'reservation_conflict', v_reservation_requested > v_capacity);
  END IF;
  IF v_internal >= greatest(0, v_capacity - v_reservation) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'external_reservation',
      'capacity', v_capacity, 'internal', v_internal, 'external', v_external,
      'external_reservation', v_reservation, 'external_reservation_remaining', greatest(0, v_reservation - v_external),
      'reservation_conflict', v_reservation_requested > v_capacity);
  END IF;
  IF v_slot.vagas_por_hora > 0 THEN
    SELECT count(*) INTO v_hour_count FROM public.agendamentos a
    WHERE a.profissional_id = p_profissional_id AND a.unidade_id = p_unidade_id
      AND a.data = p_data AND a.status NOT IN ('cancelado', 'falta')
      AND a.id IS DISTINCT FROM p_exclude_agendamento_id
      AND left(a.hora, 3) = left(p_hora, 3);
    IF v_hour_count >= v_slot.vagas_por_hora THEN
      RETURN jsonb_build_object('available', false, 'reason', 'hour_full');
    END IF;
  END IF;
  RETURN jsonb_build_object('available', true, 'capacity', v_capacity,
    'internal', v_internal, 'external', v_external, 'external_reservation', v_reservation,
    'internal_available', greatest(0, v_capacity - v_reservation - v_internal),
    'total_available', greatest(0, v_capacity - v_total),
    'reservation_conflict', v_reservation_requested > v_capacity);
END;
$$;

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
REVOKE ALL ON FUNCTION public.check_internal_slot_availability(text, text, date, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_internal_slot_availability(text, text, date, text, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.schedule_treatment_session_batch(uuid, uuid, date, jsonb, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_treatment_session_batch(uuid, uuid, date, jsonb, boolean)
  TO authenticated;

COMMIT;

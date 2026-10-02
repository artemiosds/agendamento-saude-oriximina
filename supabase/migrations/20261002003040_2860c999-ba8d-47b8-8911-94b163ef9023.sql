CREATE OR REPLACE FUNCTION public.check_internal_slot_availability(p_profissional_id text, p_unidade_id text, p_data date, p_hora text, p_exclude_agendamento_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_off_grid boolean := false;
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
  IF v_matching_count <> 1 THEN
    RETURN jsonb_build_object('available', true, 'reason', 'manual_time', 'manual_time', true);
  END IF;

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
      v_off_grid := true;
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

  -- Capacidade esgotada nao bloqueia mais a equipe interna: retorna disponivel
  -- com aviso de excesso para a tela pedir confirmacao de encaixe.
  IF v_total >= v_capacity THEN
    RETURN jsonb_build_object('available', true, 'capacity_exceeded', true,
      'reason', CASE WHEN v_slot.vagas_por_hora = 0 THEN 'turno_full' ELSE 'day_full' END,
      'capacity', v_capacity, 'internal', v_internal, 'external', v_external,
      'external_reservation', v_reservation, 'reservation_conflict', v_reservation_requested > v_capacity);
  END IF;
  IF v_internal >= greatest(0, v_capacity - v_reservation) THEN
    RETURN jsonb_build_object('available', true, 'capacity_exceeded', true, 'reason', 'external_reservation',
      'capacity', v_capacity, 'internal', v_internal, 'external', v_external,
      'external_reservation', v_reservation, 'external_reservation_remaining', greatest(0, v_reservation - v_external),
      'reservation_conflict', v_reservation_requested > v_capacity);
  END IF;
  IF v_slot.vagas_por_hora > 0 AND NOT v_off_grid THEN
    SELECT count(*) INTO v_hour_count FROM public.agendamentos a
    WHERE a.profissional_id = p_profissional_id AND a.unidade_id = p_unidade_id
      AND a.data = p_data AND a.status NOT IN ('cancelado', 'falta')
      AND a.id IS DISTINCT FROM p_exclude_agendamento_id
      AND left(a.hora, 3) = left(p_hora, 3);
    IF v_hour_count >= v_slot.vagas_por_hora THEN
      RETURN jsonb_build_object('available', true, 'capacity_exceeded', true, 'reason', 'hour_full',
        'capacity', v_capacity, 'internal', v_internal, 'external', v_external);
    END IF;
  END IF;
  RETURN jsonb_build_object('available', true, 'capacity', v_capacity,
    'internal', v_internal, 'external', v_external, 'external_reservation', v_reservation,
    'internal_available', greatest(0, v_capacity - v_reservation - v_internal),
    'total_available', greatest(0, v_capacity - v_total),
    'manual_time', v_off_grid,
    'reservation_conflict', v_reservation_requested > v_capacity);
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_external_shared_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_slot public.disponibilidades%ROWTYPE;
  v_count integer;
  v_hour_count integer;
  v_matching integer := 0;
  v_valid_grid boolean := false;
  v_duration integer;
  v_master boolean;
  v_hora time;
  v_treatment_override boolean;
  v_internal boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.origem = 'externo' OR nullif(OLD.agendado_por_externo, '') IS NOT NULL THEN
      RAISE EXCEPTION 'Agendamento externo vinculado não pode ser excluído diretamente';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.origem = 'externo' THEN
    IF (NEW.paciente_id, NEW.profissional_id, NEW.unidade_id, NEW.data, NEW.hora,
        NEW.agendado_por_externo, NEW.origem) IS DISTINCT FROM
       (OLD.paciente_id, OLD.profissional_id, OLD.unidade_id, OLD.data, OLD.hora,
        OLD.agendado_por_externo, OLD.origem) THEN
      RAISE EXCEPTION 'Agendamento externo vinculado: solicite revisão ao Master';
    END IF;
    IF OLD.status <> 'cancelado' AND NEW.status = 'cancelado'
       AND current_setting('app.external_booking_rpc', true) IS DISTINCT FROM 'cancel' THEN
      RAISE EXCEPTION 'Cancelamento externo exige a função transacional';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.origem <> 'externo' AND NEW.origem = 'externo' THEN
    RAISE EXCEPTION 'Conversão direta para agendamento externo não permitida';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.origem = 'externo'
     AND current_setting('app.external_booking_rpc', true) IS DISTINCT FROM 'create' THEN
    RAISE EXCEPTION 'Agendamento externo exige a função transacional';
  END IF;
  IF NEW.status IN ('cancelado', 'falta') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status NOT IN ('cancelado', 'falta')
     AND (NEW.profissional_id, NEW.unidade_id, NEW.data, NEW.hora) IS NOT DISTINCT FROM
         (OLD.profissional_id, OLD.unidade_id, OLD.data, OLD.hora) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    NEW.profissional_id || '|' || NEW.unidade_id || '|' || NEW.data::text, 0));
  v_internal := NEW.origem IS DISTINCT FROM 'externo';
  IF v_internal AND NOT EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.profissional_id = NEW.profissional_id AND a.unidade_id = NEW.unidade_id
      AND a.data = NEW.data AND a.origem = 'externo'
      AND a.status NOT IN ('cancelado', 'falta')
  ) THEN RETURN NEW; END IF;

  SELECT EXISTS (SELECT 1 FROM public.funcionarios f
    WHERE f.auth_user_id = auth.uid() AND f.role = 'master' AND f.ativo) INTO v_master;
  IF v_master AND v_internal THEN RETURN NEW; END IF;
  IF NEW.hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN
    RAISE EXCEPTION 'Horário inválido';
  END IF;
  v_hora := NEW.hora::time;
  v_treatment_override := public.treatment_manual_capacity_override_matches(
    NEW.id, NEW.paciente_id, NEW.profissional_id, NEW.unidade_id, NEW.tipo, NEW.origem);
  IF public.is_date_blocked(NEW.data, NEW.profissional_id, NEW.unidade_id) THEN
    RAISE EXCEPTION 'Data bloqueada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bloqueios b
    WHERE NEW.data BETWEEN b.data_inicio AND b.data_fim
      AND ((coalesce(b.unidade_id, '') = '' AND coalesce(b.profissional_id, '') = '')
        OR (b.unidade_id = NEW.unidade_id AND coalesce(b.profissional_id, '') = '')
        OR b.profissional_id = NEW.profissional_id)
      AND (b.dia_inteiro = true OR coalesce(b.hora_inicio, '') = ''
        OR (v_hora >= b.hora_inicio::time AND
            v_hora < coalesce(nullif(b.hora_fim, ''), '23:59')::time))) THEN
    RAISE EXCEPTION 'Horário bloqueado';
  END IF;

  -- Equipe interna pode encaixar mesmo com capacidade esgotada; feriados e
  -- bloqueios acima continuam valendo. A partir daqui vale apenas o fluxo externo.
  IF v_internal THEN RETURN NEW; END IF;

  FOR v_slot IN SELECT d.* FROM public.disponibilidades d
    WHERE d.profissional_id = NEW.profissional_id AND d.unidade_id = NEW.unidade_id
      AND NEW.data BETWEEN d.data_inicio AND d.data_fim
      AND extract(dow FROM NEW.data)::integer = ANY(d.dias_semana)
      AND v_hora >= d.hora_inicio::time AND v_hora < d.hora_fim::time
    ORDER BY d.id FOR SHARE OF d
  LOOP
    v_matching := v_matching + 1;
    IF v_slot.vagas_por_hora = 0 THEN
      IF v_hora <> v_slot.hora_inicio::time AND NOT v_treatment_override AND NOT v_internal THEN CONTINUE; END IF;
    ELSE
      v_duration := coalesce(nullif(v_slot.duracao_consulta, 0), 30);
      IF v_duration <= 0 THEN RAISE EXCEPTION 'Duração da disponibilidade inválida'; END IF;
      IF NOT v_internal AND (mod(extract(epoch FROM (v_hora - v_slot.hora_inicio::time))::numeric,
             (v_duration * 60)::numeric) <> 0
         OR extract(epoch FROM (v_slot.hora_fim::time - v_hora)) < v_duration * 60) THEN
        CONTINUE;
      END IF;
    END IF;
    v_valid_grid := true;
    SELECT count(*) INTO v_count FROM public.agendamentos a
    WHERE a.id <> NEW.id AND a.profissional_id = NEW.profissional_id
      AND a.unidade_id = NEW.unidade_id AND a.data = NEW.data
      AND a.status NOT IN ('cancelado', 'falta')
      AND (v_slot.vagas_por_hora <> 0 OR
           (a.hora >= v_slot.hora_inicio AND a.hora < v_slot.hora_fim));
    IF v_count >= v_slot.vagas_por_dia AND NOT v_treatment_override THEN RAISE EXCEPTION 'Capacidade da data ou turno esgotada'; END IF;

    IF v_slot.vagas_por_hora > 0 THEN
      SELECT count(*) INTO v_hour_count FROM public.agendamentos a
      WHERE a.id <> NEW.id AND a.profissional_id = NEW.profissional_id
        AND a.unidade_id = NEW.unidade_id AND a.data = NEW.data
        AND a.status NOT IN ('cancelado', 'falta')
        AND left(a.hora, 3) = left(NEW.hora, 3);
      IF v_hour_count >= v_slot.vagas_por_hora AND NOT v_treatment_override THEN RAISE EXCEPTION 'Capacidade do horário esgotada'; END IF;
    END IF;
  END LOOP;
  IF v_matching = 0 THEN RAISE EXCEPTION 'Sem disponibilidade para a unidade, data e horário'; END IF;
  IF NOT v_valid_grid THEN RAISE EXCEPTION 'Horário fora da grade da disponibilidade'; END IF;
  RETURN NEW;
END;
$function$;

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
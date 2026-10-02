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
  IF v_slot.vagas_por_hora > 0 AND NOT v_off_grid THEN
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
    'manual_time', v_off_grid,
    'reservation_conflict', v_reservation_requested > v_capacity);
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_external_shared_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF v_internal THEN RETURN NEW; END IF;
  IF v_matching = 0 THEN RAISE EXCEPTION 'Sem disponibilidade para a unidade, data e horário'; END IF;
  IF NOT v_valid_grid THEN RAISE EXCEPTION 'Horário fora da grade da disponibilidade'; END IF;
  RETURN NEW;
END;
$$;
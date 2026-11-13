-- Separate the regular reception lane from authorized external quotas.
-- No table, column, data or permission changes. Existing audits and transactional quotas remain intact.
BEGIN;

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
  IF v_matching_count > 1 THEN
    RETURN jsonb_build_object('available', false, 'reason', 'availability_conflict');
  END IF;
  IF v_matching_count = 0 THEN
    -- Horário digitado livremente ainda usa o limite regular da grade do dia.
    SELECT count(*) INTO v_availability_count FROM public.disponibilidades d
    WHERE d.profissional_id = p_profissional_id AND d.unidade_id = p_unidade_id
      AND p_data BETWEEN d.data_inicio AND d.data_fim
      AND extract(dow FROM p_data)::integer = ANY(d.dias_semana);
    IF v_availability_count <> 1 THEN
      RETURN jsonb_build_object('available', false, 'reason', 'no_availability');
    END IF;
    v_off_grid := true;
  END IF;

  SELECT d.* INTO v_slot FROM public.disponibilidades d
  WHERE d.profissional_id = p_profissional_id AND d.unidade_id = p_unidade_id
    AND p_data BETWEEN d.data_inicio AND d.data_fim
    AND extract(dow FROM p_data)::integer = ANY(d.dias_semana)
    AND (v_off_grid OR (v_hora >= d.hora_inicio::time AND v_hora < d.hora_fim::time))
  ORDER BY d.id LIMIT 1;

  IF v_off_grid AND v_slot.vagas_por_hora = 0 THEN
    RETURN jsonb_build_object('available', false, 'reason', 'outside_grid');
  END IF;
  IF v_slot.vagas_por_hora > 0 AND NOT v_off_grid THEN
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
  v_reservation := v_reservation_requested;
  SELECT count(*) FILTER (WHERE a.origem = 'externo'),
         count(*) FILTER (WHERE a.origem IS DISTINCT FROM 'externo')
    INTO v_external, v_internal
  FROM public.agendamentos a
  WHERE a.profissional_id = p_profissional_id AND a.unidade_id = p_unidade_id
    AND a.data = p_data AND a.status NOT IN ('cancelado', 'falta')
    AND a.id IS DISTINCT FROM p_exclude_agendamento_id
    AND (v_off_grid OR v_slot.vagas_por_hora > 0 OR
      (a.hora >= v_slot.hora_inicio AND a.hora < v_slot.hora_fim));
  v_total := v_external + v_internal;

  -- A grade limita apenas o balcão. As cotas externas são direitos separados.
  IF v_internal >= v_capacity THEN
    RETURN jsonb_build_object('available', false,
      'reason', CASE WHEN v_slot.vagas_por_hora = 0 THEN 'turno_full' ELSE 'day_full' END,
      'capacity', v_capacity, 'internal', v_internal, 'external', v_external,
      'external_reservation', v_reservation);
  END IF;
  IF v_slot.vagas_por_hora > 0 AND NOT v_off_grid THEN
    SELECT count(*) INTO v_hour_count FROM public.agendamentos a
    WHERE a.profissional_id = p_profissional_id AND a.unidade_id = p_unidade_id
      AND a.data = p_data AND a.status NOT IN ('cancelado', 'falta')
      AND a.id IS DISTINCT FROM p_exclude_agendamento_id
      AND a.origem IS DISTINCT FROM 'externo'
      AND left(a.hora, 3) = left(p_hora, 3);
    IF v_hour_count >= v_slot.vagas_por_hora THEN
      RETURN jsonb_build_object('available', false, 'reason', 'hour_full',
        'capacity', v_capacity, 'internal', v_internal, 'external', v_external);
    END IF;
  END IF;
  RETURN jsonb_build_object('available', true, 'capacity', v_capacity,
    'internal', v_internal, 'external', v_external, 'external_reservation', v_reservation,
    'internal_available', greatest(0, v_capacity - v_internal),
    'total_available', greatest(0, v_capacity - v_internal),
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
  v_quota_authorized boolean;
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
  SELECT EXISTS (SELECT 1 FROM public.funcionarios f
    WHERE f.auth_user_id = auth.uid() AND f.role = 'master' AND f.ativo
      AND (f.usuario = 'admin.sms' OR f.unidade_id = NEW.unidade_id)) INTO v_master;
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

  -- O Master ultrapassa o teto da recepção apenas na unidade autorizada.
  -- Feriados e bloqueios continuam protegidos para todos.
  IF v_master AND v_internal THEN RETURN NEW; END IF;
  IF NOT v_internal AND TG_OP = 'INSERT' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.quotas_externas q
      JOIN public.profissionais_externos e ON e.id = q.profissional_externo_id
      WHERE q.id::text = current_setting('app.external_booking_quota_id', true)
        AND e.auth_user_id = auth.uid() AND e.ativo AND q.ativo
        AND q.profissional_interno_id::text = NEW.profissional_id
        AND q.unidade_id = NEW.unidade_id
        AND NEW.data BETWEEN q.periodo_inicio AND q.periodo_fim
        AND q.vagas_usadas < q.vagas_total
        AND (q.dia_semana IS NULL OR q.dia_semana = extract(dow FROM NEW.data)::integer)
        AND (q.turno = 'integral' OR
          (v_hora >= q.horario_inicio AND v_hora < q.horario_fim))
    ) INTO v_quota_authorized;
    IF NOT coalesce(v_quota_authorized, false) THEN
      RAISE EXCEPTION 'Cota externa não autorizada para este agendamento';
    END IF;
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
      AND a.origem IS DISTINCT FROM 'externo'
      AND (v_slot.vagas_por_hora <> 0 OR
           (a.hora >= v_slot.hora_inicio AND a.hora < v_slot.hora_fim));
    IF v_internal AND v_count >= v_slot.vagas_por_dia AND NOT v_treatment_override THEN
      RAISE EXCEPTION 'Capacidade da data ou turno esgotada';
    END IF;

    IF v_internal AND v_slot.vagas_por_hora > 0 THEN
      SELECT count(*) INTO v_hour_count FROM public.agendamentos a
      WHERE a.id <> NEW.id AND a.profissional_id = NEW.profissional_id
        AND a.unidade_id = NEW.unidade_id AND a.data = NEW.data
        AND a.status NOT IN ('cancelado', 'falta')
        AND a.origem IS DISTINCT FROM 'externo'
        AND left(a.hora, 3) = left(NEW.hora, 3);
      IF v_hour_count >= v_slot.vagas_por_hora AND NOT v_treatment_override THEN RAISE EXCEPTION 'Capacidade do horário esgotada'; END IF;
    END IF;
  END LOOP;
  IF v_internal AND v_matching = 0 THEN RETURN NEW; END IF;
  IF v_matching = 0 THEN RAISE EXCEPTION 'Sem disponibilidade para a unidade, data e horário'; END IF;
  IF NOT v_valid_grid THEN RAISE EXCEPTION 'Horário fora da grade da disponibilidade'; END IF;
  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.guard_external_specific_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_check jsonb; v_master boolean;
BEGIN
  IF NEW.origem = 'externo' OR NEW.status IN ('cancelado', 'falta') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND (NEW.profissional_id, NEW.unidade_id, NEW.data, NEW.hora)
       IS NOT DISTINCT FROM (OLD.profissional_id, OLD.unidade_id, OLD.data, OLD.hora)
     AND OLD.status NOT IN ('cancelado', 'falta') THEN
    -- Mudanças clínicas entre estados que já ocupavam vaga não reconsomem capacidade.
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    NEW.profissional_id || '|' || NEW.unidade_id || '|' || NEW.data::text, 0));
  SELECT EXISTS (SELECT 1 FROM public.funcionarios f
    WHERE f.auth_user_id = auth.uid() AND f.ativo AND f.role = 'master'
      AND (f.usuario = 'admin.sms' OR f.unidade_id = NEW.unidade_id)) INTO v_master;
  IF v_master THEN RETURN NEW; END IF;
  v_check := public.check_internal_slot_availability(NEW.profissional_id, NEW.unidade_id, NEW.data, NEW.hora,
    CASE WHEN TG_OP = 'UPDATE' THEN NEW.id ELSE NULL END);
  IF coalesce((v_check->>'available')::boolean, false) IS DISTINCT FROM true
     AND NOT (v_check->>'reason' IN ('day_full','turno_full','hour_full')
       AND public.treatment_manual_capacity_override_matches(
         NEW.id, NEW.paciente_id, NEW.profissional_id, NEW.unidade_id, NEW.tipo, NEW.origem)) THEN
    RAISE EXCEPTION 'Agendamento interno bloqueado: %', coalesce(v_check->>'reason', 'capacidade_indisponivel')
      USING ERRCODE = 'P0001', DETAIL = v_check::text;
  END IF;
  RETURN NEW;
END;
$$;

-- External professionals have an active quota and booking authorization.
-- The appointment is therefore confirmed on creation. Patient arrival remains
-- a separate reception check-in transition on the appointment date.
CREATE OR REPLACE FUNCTION public.create_external_appointment(
  p_cota_id uuid, p_paciente_id text, p_data date, p_hora text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user public.profissionais_externos%ROWTYPE;
  v_quota public.quotas_externas%ROWTYPE;
  v_prof public.funcionarios%ROWTYPE;
  v_patient public.pacientes%ROWTYPE;
  v_uuid uuid;
  v_id text;
  v_used integer;
  v_time time;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT * INTO v_user FROM public.profissionais_externos
    WHERE auth_user_id = auth.uid() AND ativo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profissional externo inativo ou não encontrado'; END IF;
  IF p_cota_id IS NULL OR p_paciente_id IS NULL OR p_data IS NULL OR p_hora IS NULL THEN
    RAISE EXCEPTION 'Dados obrigatórios ausentes';
  END IF;
  SELECT * INTO v_quota FROM public.quotas_externas WHERE id = p_cota_id FOR UPDATE;
  IF NOT FOUND OR v_quota.profissional_externo_id <> v_user.id THEN
    RAISE EXCEPTION 'Cota não pertence ao profissional externo';
  END IF;
  IF v_quota.ativo IS DISTINCT FROM true THEN RAISE EXCEPTION 'Cota inativa'; END IF;
  IF coalesce(btrim(v_quota.unidade_id), '') = '' THEN RAISE EXCEPTION 'Cota sem unidade; solicite correção ao Master'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.unidades u WHERE u.id = v_quota.unidade_id AND u.ativo) THEN
    RAISE EXCEPTION 'Unidade da cota indisponível';
  END IF;
  IF p_data < current_date OR p_data NOT BETWEEN v_quota.periodo_inicio AND v_quota.periodo_fim THEN
    RAISE EXCEPTION 'Data fora do período da cota';
  END IF;
  IF v_quota.dia_semana IS NOT NULL AND v_quota.dia_semana <> extract(dow FROM p_data)::integer THEN
    RAISE EXCEPTION 'Dia da semana incompatível com a cota';
  END IF;
  IF v_quota.turno IS NULL OR v_quota.turno NOT IN ('manha', 'tarde', 'noite', 'integral', 'personalizado') THEN
    RAISE EXCEPTION 'Turno da cota inválido; solicite correção ao Master';
  END IF;
  IF p_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN
    RAISE EXCEPTION 'Horário inválido';
  END IF;
  v_time := p_hora::time;
  IF v_quota.turno IS DISTINCT FROM 'integral' THEN
    IF v_quota.horario_inicio IS NULL OR v_quota.horario_fim IS NULL
       OR v_quota.horario_inicio >= v_quota.horario_fim THEN
      RAISE EXCEPTION 'Horários da cota inválidos; solicite correção ao Master';
    END IF;
    IF v_time < v_quota.horario_inicio OR v_time >= v_quota.horario_fim THEN
      RAISE EXCEPTION 'Horário fora da faixa da cota';
    END IF;
  END IF;
  SELECT * INTO v_prof FROM public.funcionarios
    WHERE id = v_quota.profissional_interno_id AND ativo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profissional interno indisponível'; END IF;
  SELECT * INTO v_patient FROM public.pacientes WHERE id = p_paciente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paciente não encontrado'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_prof.id::text || '|' || v_quota.unidade_id || '|' || p_data::text, 0));
  IF EXISTS (SELECT 1 FROM public.agendamentos a
    WHERE a.paciente_id = v_patient.id AND a.profissional_id = v_prof.id::text
      AND a.unidade_id = v_quota.unidade_id AND a.data = p_data AND a.hora = p_hora
      AND a.status NOT IN ('cancelado', 'falta')) THEN
    RAISE EXCEPTION 'Paciente já possui agendamento nesse horário';
  END IF;
  IF v_quota.vagas_total <= 0 THEN RAISE EXCEPTION 'Cota sem vagas'; END IF;
  SELECT count(*) INTO v_used FROM public.agendamentos_externos
    WHERE cota_id = v_quota.id AND status <> 'cancelado';
  IF v_used <> v_quota.vagas_usadas THEN
    RAISE EXCEPTION 'Contador da cota divergente; solicite revisão ao Master';
  END IF;
  IF v_used >= v_quota.vagas_total THEN RAISE EXCEPTION 'Cota esgotada'; END IF;

  v_uuid := gen_random_uuid();
  v_id := 'ag_' || v_uuid::text;
  PERFORM set_config('app.external_booking_rpc', 'create', true);
  PERFORM set_config('app.external_booking_quota_id', v_quota.id::text, true);
  INSERT INTO public.agendamentos
    (id, paciente_id, paciente_nome, unidade_id, profissional_id, profissional_nome,
     data, hora, tipo, status, origem, criado_por, agendado_por_externo, observacoes)
  VALUES (v_id, v_patient.id, v_patient.nome, v_quota.unidade_id,
    v_prof.id::text, v_prof.nome, p_data, p_hora, 'Consulta', 'confirmado',
    'externo', v_user.id::text, v_user.id::text, 'Agendado por ' || v_user.nome);
  INSERT INTO public.agendamentos_externos
    (id, paciente_id, profissional_externo_id, profissional_interno_id,
     unidade_id, cota_id, data, horario, turno, status)
  VALUES (v_uuid, v_patient.id, v_user.id, v_prof.id, v_quota.unidade_id,
    v_quota.id, p_data, v_time, v_quota.turno, 'confirmado');
  UPDATE public.quotas_externas SET vagas_usadas = vagas_usadas + 1 WHERE id = v_quota.id;
  INSERT INTO public.action_logs (user_id, user_nome, role, unidade_id, acao, entidade,
    entidade_id, modulo, agendamento_id, paciente_id, profissional_id, detalhes)
  VALUES (v_user.id::text, v_user.nome, 'externo', v_quota.unidade_id,
    'criar_agendamento_externo', 'agendamento', v_id, 'agenda', v_id,
    v_patient.id, v_prof.id::text, jsonb_build_object('cota_id', v_quota.id));
  PERFORM set_config('app.external_booking_quota_id', '', true);
  PERFORM set_config('app.external_booking_rpc', '', true);
  RETURN jsonb_build_object('id', v_id);
END;
$$;


COMMIT;

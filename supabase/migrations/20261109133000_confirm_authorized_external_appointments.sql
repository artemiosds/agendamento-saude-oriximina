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
  RETURN jsonb_build_object('id', v_id);
END;
$$;


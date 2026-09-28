-- Prepared only. Apply after isolated integration tests and an explicit release decision.
-- The pair is linked by exact equality: agendamentos.id = 'ag_' || agendamentos_externos.id.
-- This is a transactional invariant, not a declarative foreign key.

-- External logins may still have table grants through authenticated. Restrictive RLS
-- closes every permissive policy (including patient/staff policies) for direct writes.
DROP POLICY IF EXISTS "External insert agendamentos" ON public.agendamentos;
DROP POLICY IF EXISTS "External cancel own agendamentos" ON public.agendamentos;
CREATE POLICY "External bookings use atomic RPC for insert"
  ON public.agendamentos AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT EXISTS (SELECT 1 FROM public.profissionais_externos e WHERE e.auth_user_id = auth.uid()));
CREATE POLICY "External bookings use atomic RPC for update"
  ON public.agendamentos AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT EXISTS (SELECT 1 FROM public.profissionais_externos e WHERE e.auth_user_id = auth.uid()))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM public.profissionais_externos e WHERE e.auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Externos podem criar seus agendamentos" ON public.agendamentos_externos;
DROP POLICY IF EXISTS "Externos podem atualizar seus agendamentos" ON public.agendamentos_externos;
CREATE POLICY "External quotas use atomic RPC for update"
  ON public.quotas_externas AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT EXISTS (SELECT 1 FROM public.profissionais_externos e WHERE e.auth_user_id = auth.uid()))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM public.profissionais_externos e WHERE e.auth_user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.guard_external_quota_counter()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.vagas_usadas <> 0 THEN
    RAISE EXCEPTION 'Uma nova cota deve iniciar com zero vagas usadas';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.vagas_usadas IS DISTINCT FROM OLD.vagas_usadas AND
     current_setting('app.external_booking_rpc', true) IS DISTINCT FROM 'create' AND
     current_setting('app.external_booking_rpc', true) IS DISTINCT FROM 'cancel' THEN
    RAISE EXCEPTION 'O contador da cota é controlado pelo servidor';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.vagas_usadas > 0 AND
     (NEW.unidade_id IS DISTINCT FROM OLD.unidade_id OR
      NEW.profissional_interno_id IS DISTINCT FROM OLD.profissional_interno_id OR
      NEW.profissional_externo_id IS DISTINCT FROM OLD.profissional_externo_id) THEN
    RAISE EXCEPTION 'Cota com agendamentos vinculados não pode mudar de unidade ou titular';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_external_quota_counter ON public.quotas_externas;
CREATE TRIGGER trg_external_quota_counter BEFORE INSERT OR UPDATE ON public.quotas_externas
  FOR EACH ROW EXECUTE FUNCTION public.guard_external_quota_counter();
REVOKE ALL ON FUNCTION public.guard_external_quota_counter() FROM PUBLIC, anon, authenticated;

-- This guard serializes all writers of the same professional/unit/date. It checks
-- total capacity whenever an external appointment is involved; existing internal
-- only workflows retain their previous behavior. Master remains the sole role
-- allowed to exceed capacity, as already confirmed by the Agenda creation flow.
CREATE OR REPLACE FUNCTION public.guard_external_shared_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_slot public.disponibilidades%ROWTYPE;
  v_count integer;
  v_hour_count integer;
  v_matching integer := 0;
  v_master boolean;
  v_hora time;
BEGIN
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
  IF NEW.origem <> 'externo' AND NOT EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.profissional_id = NEW.profissional_id AND a.unidade_id = NEW.unidade_id
      AND a.data = NEW.data AND a.origem = 'externo'
      AND a.status NOT IN ('cancelado', 'falta')
  ) THEN RETURN NEW; END IF;

  SELECT EXISTS (SELECT 1 FROM public.funcionarios f
    WHERE f.auth_user_id = auth.uid() AND f.role = 'master' AND f.ativo) INTO v_master;
  IF v_master AND NEW.origem <> 'externo' THEN RETURN NEW; END IF;
  IF NEW.hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN
    RAISE EXCEPTION 'Horário inválido';
  END IF;
  v_hora := NEW.hora::time;
  IF public.is_date_blocked(NEW.data, NEW.profissional_id, NEW.unidade_id) THEN
    RAISE EXCEPTION 'Data bloqueada';
  END IF;

  FOR v_slot IN SELECT d.* FROM public.disponibilidades d
    WHERE d.profissional_id = NEW.profissional_id AND d.unidade_id = NEW.unidade_id
      AND NEW.data BETWEEN d.data_inicio AND d.data_fim
      AND extract(dow FROM NEW.data)::integer = ANY(d.dias_semana)
      AND v_hora >= d.hora_inicio::time AND v_hora < d.hora_fim::time
    ORDER BY d.id FOR SHARE OF d
  LOOP
    v_matching := v_matching + 1;
    SELECT count(*) INTO v_count FROM public.agendamentos a
    WHERE a.id <> NEW.id AND a.profissional_id = NEW.profissional_id
      AND a.unidade_id = NEW.unidade_id AND a.data = NEW.data
      AND a.status NOT IN ('cancelado', 'falta')
      AND (v_slot.vagas_por_hora <> 0 OR
           (a.hora >= v_slot.hora_inicio AND a.hora < v_slot.hora_fim));
    IF v_count >= v_slot.vagas_por_dia THEN RAISE EXCEPTION 'Capacidade da data ou turno esgotada'; END IF;

    IF v_slot.vagas_por_hora > 0 THEN
      SELECT count(*) INTO v_hour_count FROM public.agendamentos a
      WHERE a.id <> NEW.id AND a.profissional_id = NEW.profissional_id
        AND a.unidade_id = NEW.unidade_id AND a.data = NEW.data
        AND a.status NOT IN ('cancelado', 'falta')
        AND left(a.hora, 3) = left(NEW.hora, 3);
      IF v_hour_count >= v_slot.vagas_por_hora THEN RAISE EXCEPTION 'Capacidade do horário esgotada'; END IF;
    END IF;
  END LOOP;
  IF v_matching = 0 THEN RAISE EXCEPTION 'Sem disponibilidade para a unidade, data e horário'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_external_shared_capacity ON public.agendamentos;
CREATE TRIGGER trg_external_shared_capacity BEFORE INSERT OR UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.guard_external_shared_capacity();
REVOKE ALL ON FUNCTION public.guard_external_shared_capacity() FROM PUBLIC, anon, authenticated;

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
    v_prof.id::text, v_prof.nome, p_data, p_hora, 'Consulta', 'pendente',
    'externo', v_user.id::text, v_user.id::text, 'Agendado por ' || v_user.nome);
  INSERT INTO public.agendamentos_externos
    (id, paciente_id, profissional_externo_id, profissional_interno_id,
     unidade_id, cota_id, data, horario, turno, status)
  VALUES (v_uuid, v_patient.id, v_user.id, v_prof.id, v_quota.unidade_id,
    v_quota.id, p_data, v_time, v_quota.turno, 'pendente');
  UPDATE public.quotas_externas SET vagas_usadas = vagas_usadas + 1 WHERE id = v_quota.id;
  INSERT INTO public.action_logs (user_id, user_nome, role, unidade_id, acao, entidade,
    entidade_id, modulo, agendamento_id, paciente_id, profissional_id, detalhes)
  VALUES (v_user.id::text, v_user.nome, 'externo', v_quota.unidade_id,
    'criar_agendamento_externo', 'agendamento', v_id, 'agenda', v_id,
    v_patient.id, v_prof.id::text, jsonb_build_object('cota_id', v_quota.id));
  RETURN jsonb_build_object('id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_external_appointment(p_agendamento_id text, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user public.profissionais_externos%ROWTYPE;
  v_appt public.agendamentos%ROWTYPE;
  v_aux public.agendamentos_externos%ROWTYPE;
  v_quota public.quotas_externas%ROWTYPE;
  v_uuid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  IF coalesce(length(btrim(p_motivo)), 0) < 3 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento'; END IF;
  SELECT * INTO v_user FROM public.profissionais_externos
    WHERE auth_user_id = auth.uid() AND ativo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profissional externo inativo ou não encontrado'; END IF;
  SELECT * INTO v_appt FROM public.agendamentos WHERE id = p_agendamento_id FOR UPDATE;
  IF NOT FOUND OR v_appt.origem <> 'externo' OR
     v_appt.agendado_por_externo <> v_user.id::text OR v_appt.criado_por <> v_user.id::text THEN
    RAISE EXCEPTION 'Agendamento externo não encontrado para este usuário';
  END IF;
  IF p_agendamento_id !~ '^ag_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Vínculo externo inválido; solicite revisão ao Master';
  END IF;
  v_uuid := substring(p_agendamento_id FROM 4)::uuid;
  SELECT * INTO v_aux FROM public.agendamentos_externos WHERE id = v_uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo externo ausente; solicite revisão ao Master'; END IF;
  IF v_aux.profissional_externo_id IS DISTINCT FROM v_user.id
     OR v_aux.paciente_id IS DISTINCT FROM v_appt.paciente_id
     OR v_aux.profissional_interno_id::text IS DISTINCT FROM v_appt.profissional_id
     OR v_aux.unidade_id IS DISTINCT FROM v_appt.unidade_id
     OR v_aux.data IS DISTINCT FROM v_appt.data
     OR v_aux.horario IS DISTINCT FROM v_appt.hora::time THEN
    RAISE EXCEPTION 'Vínculo externo divergente; solicite revisão ao Master';
  END IF;
  IF v_appt.status = 'cancelado' AND v_aux.status = 'cancelado' THEN
    RETURN jsonb_build_object('id', v_appt.id, 'already_cancelled', true);
  END IF;
  SELECT * INTO v_quota FROM public.quotas_externas WHERE id = v_aux.cota_id FOR UPDATE;
  IF NOT FOUND OR v_quota.profissional_externo_id IS DISTINCT FROM v_user.id OR
     v_quota.profissional_interno_id IS DISTINCT FROM v_aux.profissional_interno_id OR
     v_quota.unidade_id IS DISTINCT FROM v_aux.unidade_id THEN
    RAISE EXCEPTION 'Cota vinculada divergente; solicite revisão ao Master';
  END IF;
  IF v_appt.status NOT IN ('pendente', 'confirmado', 'confirmado_chegada')
     OR v_aux.status = 'cancelado' THEN
    RAISE EXCEPTION 'Estado incompatível com cancelamento; solicite revisão ao Master';
  END IF;
  IF v_quota.vagas_usadas <= 0 THEN RAISE EXCEPTION 'Contador da cota divergente; solicite revisão ao Master'; END IF;
  PERFORM set_config('app.external_booking_rpc', 'cancel', true);
  UPDATE public.agendamentos SET status = 'cancelado' WHERE id = v_appt.id;
  UPDATE public.agendamentos_externos SET status = 'cancelado' WHERE id = v_aux.id;
  UPDATE public.quotas_externas SET vagas_usadas = vagas_usadas - 1 WHERE id = v_quota.id;
  INSERT INTO public.action_logs (user_id, user_nome, role, unidade_id, acao, entidade,
    entidade_id, modulo, agendamento_id, paciente_id, profissional_id, before, after, detalhes)
  VALUES (v_user.id::text, v_user.nome, 'externo', v_quota.unidade_id,
    'cancelar_agendamento_externo', 'agendamento', v_appt.id, 'agenda', v_appt.id,
    v_appt.paciente_id, v_appt.profissional_id,
    jsonb_build_object('status', v_appt.status, 'vagas_usadas', v_quota.vagas_usadas),
    jsonb_build_object('status', 'cancelado', 'vagas_usadas', v_quota.vagas_usadas - 1),
    jsonb_build_object('cota_id', v_quota.id, 'motivo_alteracao', btrim(p_motivo)));
  RETURN jsonb_build_object('id', v_appt.id, 'already_cancelled', false);
END;
$$;
REVOKE ALL ON FUNCTION public.create_external_appointment(uuid, text, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_external_appointment(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_external_appointment(uuid, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_external_appointment(text, text) TO authenticated;

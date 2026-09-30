-- PREPARED ONLY: do not apply before integrated acceptance.
-- Period quotas remain total limits. Only same-day quotas can reserve capacity.

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
  ELSIF v_hora <> v_slot.hora_inicio::time THEN
    RETURN jsonb_build_object('available', false, 'reason', 'outside_grid');
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
REVOKE ALL ON FUNCTION public.check_internal_slot_availability(text, text, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_internal_slot_availability(text, text, date, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_external_specific_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_check jsonb;
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
  IF current_setting('app.master_capacity_override', true) = 'on' THEN RETURN NEW; END IF;
  v_check := public.check_internal_slot_availability(NEW.profissional_id, NEW.unidade_id, NEW.data, NEW.hora,
    CASE WHEN TG_OP = 'UPDATE' THEN NEW.id ELSE NULL END);
  IF coalesce((v_check->>'available')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Agendamento interno bloqueado: %', coalesce(v_check->>'reason', 'capacidade_indisponivel')
      USING ERRCODE = 'P0001', DETAIL = v_check::text;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_external_specific_reservation ON public.agendamentos;
CREATE TRIGGER trg_external_specific_reservation BEFORE INSERT OR UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.guard_external_specific_reservation();
REVOKE ALL ON FUNCTION public.guard_external_specific_reservation() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_internal_appointment_with_override(
  p_payload jsonb, p_motivo_alteracao text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_staff public.funcionarios%ROWTYPE; v_row public.agendamentos%ROWTYPE; v_check jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT * INTO v_staff FROM public.funcionarios WHERE auth_user_id = auth.uid() AND ativo LIMIT 1;
  IF NOT FOUND OR lower(btrim(v_staff.role)) <> 'master' THEN RAISE EXCEPTION 'Somente Master pode autorizar encaixe'; END IF;
  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND v_staff.unidade_id IS DISTINCT FROM p_payload->>'unidade_id' THEN
    RAISE EXCEPTION 'Master sem acesso à unidade do encaixe' USING ERRCODE='42501';
  END IF;
  IF coalesce(length(btrim(p_motivo_alteracao)), 0) < 3 THEN RAISE EXCEPTION 'Informe o motivo do encaixe'; END IF;
  IF coalesce(p_payload->>'origem', '') = 'externo' THEN RAISE EXCEPTION 'Origem externa não permitida nesta função'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    (p_payload->>'profissional_id') || '|' || (p_payload->>'unidade_id') || '|' || (p_payload->>'data'), 0));
  v_check := public.check_internal_slot_availability(p_payload->>'profissional_id', p_payload->>'unidade_id',
    (p_payload->>'data')::date, p_payload->>'hora');
  PERFORM set_config('app.master_capacity_override', 'on', true);
  INSERT INTO public.agendamentos (id,paciente_id,paciente_nome,unidade_id,sala_id,setor_id,
    profissional_id,profissional_nome,data,hora,status,tipo,observacoes,origem,criado_por,prioridade_perfil)
  VALUES (p_payload->>'id',p_payload->>'paciente_id',p_payload->>'paciente_nome',p_payload->>'unidade_id',
    nullif(p_payload->>'sala_id',''),nullif(p_payload->>'setor_id',''),p_payload->>'profissional_id',
    p_payload->>'profissional_nome',(p_payload->>'data')::date,p_payload->>'hora',
    coalesce(nullif(p_payload->>'status',''),'confirmado'),p_payload->>'tipo',coalesce(p_payload->>'observacoes',''),
    coalesce(nullif(p_payload->>'origem',''),'recepcao'),v_staff.id::text,'normal') RETURNING * INTO v_row;
  INSERT INTO public.action_logs (user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,
    agendamento_id,paciente_id,profissional_id,after,detalhes)
  VALUES (v_staff.id::text,v_staff.nome,v_staff.role,v_row.unidade_id,'encaixe_master','agendamento',v_row.id,
    'agenda',v_row.id,v_row.paciente_id,v_row.profissional_id,to_jsonb(v_row),
    jsonb_build_object('motivo_alteracao',btrim(p_motivo_alteracao),'capacidade',v_check));
  RETURN jsonb_build_object('id',v_row.id,'created',true);
END;
$$;
REVOKE ALL ON FUNCTION public.create_internal_appointment_with_override(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_internal_appointment_with_override(jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_external_quota_admin_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.external_quota_admin_rpc', true) = 'on'
     OR current_setting('app.external_booking_rpc', true) IN ('create','cancel') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Alteração de cota exige a função administrativa auditada' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS trg_external_quota_admin_write ON public.quotas_externas;
CREATE TRIGGER trg_external_quota_admin_write BEFORE INSERT OR UPDATE OR DELETE ON public.quotas_externas
  FOR EACH ROW EXECUTE FUNCTION public.guard_external_quota_admin_write();
REVOKE ALL ON FUNCTION public.guard_external_quota_admin_write() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.manage_external_quota(
  p_action text, p_quota_id uuid, p_payload jsonb, p_motivo_alteracao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_staff public.funcionarios%ROWTYPE; v_old public.quotas_externas%ROWTYPE;
  v_new public.quotas_externas%ROWTYPE; v_unit text; v_profile text; v_authorized boolean := false;
  v_profissional_id uuid; v_active boolean; v_start date; v_end date; v_turn text;
  v_start_time time; v_end_time time; v_total integer;
  v_matching_availability integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT * INTO v_staff FROM public.funcionarios WHERE auth_user_id = auth.uid() AND ativo LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado'; END IF;
  IF p_action NOT IN ('create','update','toggle','delete') THEN RAISE EXCEPTION 'Ação inválida'; END IF;
  IF p_action <> 'create' THEN
    SELECT * INTO v_old FROM public.quotas_externas WHERE id = p_quota_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cota não encontrada'; END IF;
  END IF;
  v_unit := coalesce(nullif(p_payload->>'unidade_id',''), v_old.unidade_id);
  v_profile := CASE lower(btrim(v_staff.role)) WHEN 'coordenador' THEN 'gestao' WHEN 'coordenacao' THEN 'gestao'
    WHEN 'gestor' THEN 'gestao' WHEN 'gestão' THEN 'gestao' WHEN 'recepção' THEN 'recepcao'
    ELSE lower(btrim(v_staff.role)) END;
  IF v_profile = 'master' AND (v_staff.usuario = 'admin.sms' OR v_staff.unidade_id = v_unit) THEN v_authorized := true;
  ELSIF v_staff.unidade_id = v_unit THEN
    SELECT coalesce(
      (SELECT pu.can_edit FROM public.permissoes_usuario pu WHERE pu.user_id=v_staff.id::text
       AND pu.modulo='usuarios' AND pu.unidade_id IN ('',v_unit)
       ORDER BY (pu.unidade_id=v_unit) DESC LIMIT 1),
      (SELECT p.can_edit FROM public.permissoes p WHERE p.perfil IN (v_profile,lower(btrim(v_staff.role)))
       AND p.modulo='usuarios' AND p.unidade_id IN ('',v_unit)
       ORDER BY (p.unidade_id=v_unit) DESC,(p.perfil=v_profile) DESC LIMIT 1),false) INTO v_authorized;
  END IF;
  IF NOT v_authorized THEN RAISE EXCEPTION 'Sem permissão para alterar cotas nesta unidade' USING ERRCODE='42501'; END IF;
  IF p_action <> 'create' AND coalesce(length(btrim(p_motivo_alteracao)),0) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo da alteração';
  END IF;
  IF p_action IN ('create','update') THEN
    v_profissional_id := coalesce(nullif(p_payload->>'profissional_interno_id','')::uuid, v_old.profissional_interno_id);
    v_active := coalesce(nullif(p_payload->>'ativo','')::boolean, v_old.ativo, true);
    v_start := coalesce(nullif(p_payload->>'periodo_inicio','')::date, v_old.periodo_inicio);
    v_end := coalesce(nullif(p_payload->>'periodo_fim','')::date, v_old.periodo_fim);
    v_turn := coalesce(nullif(p_payload->>'turno',''), v_old.turno);
    v_start_time := coalesce(nullif(p_payload->>'horario_inicio','')::time, v_old.horario_inicio);
    v_end_time := coalesce(nullif(p_payload->>'horario_fim','')::time, v_old.horario_fim);
    v_total := coalesce(nullif(p_payload->>'vagas_total','')::integer, v_old.vagas_total);
    IF v_active AND (coalesce(btrim(v_unit),'')='' OR v_profissional_id IS NULL OR v_total <= 0
       OR v_start IS NULL OR v_end IS NULL OR v_start > v_end
       OR v_turn NOT IN ('manha','tarde','noite','integral','personalizado')
       OR (v_turn <> 'integral' AND (v_start_time IS NULL OR v_end_time IS NULL OR v_start_time >= v_end_time))) THEN
      RAISE EXCEPTION 'Configuração ativa da cota é inválida';
    END IF;
    IF v_active AND NOT EXISTS (SELECT 1 FROM public.unidades u WHERE u.id=v_unit AND u.ativo) THEN
      RAISE EXCEPTION 'Unidade da cota indisponível';
    END IF;
    IF v_active AND NOT EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id=v_profissional_id AND f.ativo) THEN
      RAISE EXCEPTION 'Profissional interno indisponível';
    END IF;
    IF v_active AND NOT EXISTS (SELECT 1 FROM public.disponibilidades d
      WHERE d.profissional_id=v_profissional_id::text AND d.unidade_id=v_unit) THEN
      RAISE EXCEPTION 'Profissional sem disponibilidade nesta unidade';
    END IF;
    IF v_active AND v_start = v_end THEN
      SELECT count(*) INTO v_matching_availability
      FROM public.disponibilidades d
      WHERE d.profissional_id = v_profissional_id::text AND d.unidade_id = v_unit
        AND v_start BETWEEN d.data_inicio AND d.data_fim
        AND extract(dow FROM v_start)::integer = ANY(d.dias_semana)
        AND ((v_turn = 'integral' AND NOT EXISTS (
          SELECT 1 FROM public.disponibilidades other
          WHERE other.profissional_id = v_profissional_id::text AND other.unidade_id = v_unit
            AND v_start BETWEEN other.data_inicio AND other.data_fim
            AND extract(dow FROM v_start)::integer = ANY(other.dias_semana)
            AND other.id <> d.id))
          OR (v_turn <> 'integral' AND d.hora_inicio::time = v_start_time AND d.hora_fim::time = v_end_time));
      IF v_matching_availability <> 1 THEN
        RAISE EXCEPTION 'Reserva de data específica não corresponde a uma disponibilidade inequívoca';
      END IF;
    END IF;
  END IF;
  PERFORM set_config('app.external_quota_admin_rpc','on',true);
  IF p_action = 'create' THEN
    INSERT INTO public.quotas_externas (profissional_externo_id,profissional_interno_id,unidade_id,
      vagas_total,vagas_usadas,periodo_inicio,periodo_fim,turno,horario_inicio,horario_fim,especialidade,ativo)
    VALUES ((p_payload->>'profissional_externo_id')::uuid,(p_payload->>'profissional_interno_id')::uuid,
      v_unit,(p_payload->>'vagas_total')::integer,0,(p_payload->>'periodo_inicio')::date,
      (p_payload->>'periodo_fim')::date,p_payload->>'turno',nullif(p_payload->>'horario_inicio','')::time,
      nullif(p_payload->>'horario_fim','')::time,p_payload->>'especialidade',true) RETURNING * INTO v_new;
  ELSIF p_action = 'update' THEN
    IF v_old.vagas_usadas > 0 AND v_unit IS DISTINCT FROM v_old.unidade_id THEN RAISE EXCEPTION 'Cota utilizada não pode mudar de unidade'; END IF;
    IF (p_payload->>'vagas_total')::integer < v_old.vagas_usadas THEN RAISE EXCEPTION 'Total menor que vagas usadas'; END IF;
    UPDATE public.quotas_externas SET unidade_id=v_unit,vagas_total=(p_payload->>'vagas_total')::integer,
      periodo_inicio=(p_payload->>'periodo_inicio')::date,periodo_fim=(p_payload->>'periodo_fim')::date,
      turno=p_payload->>'turno',horario_inicio=nullif(p_payload->>'horario_inicio','')::time,
      horario_fim=nullif(p_payload->>'horario_fim','')::time,ativo=(p_payload->>'ativo')::boolean
      WHERE id=p_quota_id RETURNING * INTO v_new;
  ELSIF p_action = 'toggle' THEN
    UPDATE public.quotas_externas SET ativo=(p_payload->>'ativo')::boolean WHERE id=p_quota_id RETURNING * INTO v_new;
  ELSE
    IF v_old.vagas_usadas > 0 THEN UPDATE public.quotas_externas SET ativo=false WHERE id=p_quota_id RETURNING * INTO v_new;
    ELSE DELETE FROM public.quotas_externas WHERE id=p_quota_id; v_new := v_old; END IF;
  END IF;
  INSERT INTO public.action_logs (user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,before,after,detalhes)
  VALUES (v_staff.id::text,v_staff.nome,v_staff.role,v_unit,p_action||'_external_quota','quotas_externas',
    coalesce(p_quota_id,v_new.id)::text,'usuarios',CASE WHEN p_action='create' THEN NULL ELSE to_jsonb(v_old) END,
    CASE WHEN p_action='delete' AND v_old.vagas_usadas=0 THEN NULL ELSE to_jsonb(v_new) END,
    jsonb_build_object('motivo_alteracao',nullif(btrim(p_motivo_alteracao),'')));
  RETURN jsonb_build_object('id',coalesce(p_quota_id,v_new.id),'action',p_action);
END;
$$;
REVOKE ALL ON FUNCTION public.manage_external_quota(text, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_external_quota(text, uuid, jsonb, text) TO authenticated;

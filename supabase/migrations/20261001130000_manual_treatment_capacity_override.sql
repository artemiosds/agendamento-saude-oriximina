-- Only a manual treatment-session operation by its professional or a scoped Master
-- may exceed capacity. The existing transactional session/Agenda RPCs remain the writer.
BEGIN;

CREATE OR REPLACE FUNCTION public.treatment_manual_capacity_override_matches(
  p_appointment_id text, p_patient_id text, p_professional_id text,
  p_unit_id text, p_type text, p_origin text
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_staff public.funcionarios%ROWTYPE;
  v_session public.treatment_sessions%ROWTYPE;
  v_cycle public.treatment_cycles%ROWTYPE;
BEGIN
  IF current_setting('app.treatment_manual_capacity_override', true) IS DISTINCT FROM 'on'
     OR current_setting('app.treatment_manual_appointment_id', true) IS DISTINCT FROM p_appointment_id
     OR p_type IS DISTINCT FROM 'Sessão de Tratamento'
     OR p_origin IS DISTINCT FROM 'recepcao' THEN RETURN false; END IF;
  SELECT * INTO v_staff FROM public.funcionarios
   WHERE auth_user_id = auth.uid() AND ativo IS TRUE AND lower(trim(role)) IN ('profissional','master');
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_session FROM public.treatment_sessions
   WHERE id::text = current_setting('app.treatment_manual_session_id', true);
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_cycle FROM public.treatment_cycles WHERE id = v_session.cycle_id;
  IF NOT FOUND OR v_cycle.status IS DISTINCT FROM 'em_andamento'
     OR v_cycle.patient_id IS DISTINCT FROM p_patient_id
     OR v_cycle.professional_id IS DISTINCT FROM p_professional_id
     OR v_cycle.unit_id IS DISTINCT FROM p_unit_id
     OR v_session.patient_id IS DISTINCT FROM p_patient_id
     OR v_session.professional_id IS DISTINCT FROM p_professional_id
     OR (v_session.appointment_id IS NOT NULL AND v_session.appointment_id IS DISTINCT FROM p_appointment_id)
     OR (v_staff.usuario IS DISTINCT FROM 'admin.sms'
         AND ((nullif(v_staff.unidade_id,'') IS NULL AND lower(trim(v_staff.role)) <> 'master')
           OR (nullif(v_staff.unidade_id,'') IS NOT NULL AND v_staff.unidade_id IS DISTINCT FROM p_unit_id)))
     OR (lower(trim(v_staff.role)) = 'profissional' AND v_staff.id::text IS DISTINCT FROM p_professional_id)
  THEN RETURN false; END IF;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.treatment_manual_capacity_override_matches(text,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.schedule_treatment_session_manual_capacity(
  p_session_id uuid, p_cycle_id uuid, p_expected_session_date date,
  p_appointment jsonb, p_check_patient_conflict boolean
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  v_staff public.funcionarios%ROWTYPE;
  v_cycle public.treatment_cycles%ROWTYPE;
  v_check jsonb;
  v_result jsonb;
  v_capacity boolean;
BEGIN
  SELECT * INTO v_staff FROM public.funcionarios
   WHERE auth_user_id = auth.uid() AND ativo IS TRUE AND lower(trim(role)) IN ('profissional','master');
  IF NOT FOUND THEN RAISE EXCEPTION 'Somente o profissional ou Master pode fazer encaixe manual de tratamento' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_cycle FROM public.treatment_cycles WHERE id=p_cycle_id;
  IF NOT FOUND OR v_cycle.status IS DISTINCT FROM 'em_andamento'
     OR (v_staff.usuario IS DISTINCT FROM 'admin.sms'
         AND ((nullif(v_staff.unidade_id,'') IS NULL AND lower(trim(v_staff.role)) <> 'master')
           OR (nullif(v_staff.unidade_id,'') IS NOT NULL AND v_staff.unidade_id IS DISTINCT FROM v_cycle.unit_id)))
     OR (lower(trim(v_staff.role))='profissional' AND v_staff.id::text IS DISTINCT FROM v_cycle.professional_id)
  THEN RAISE EXCEPTION 'Fora do escopo do tratamento' USING ERRCODE='42501'; END IF;
  IF p_appointment->>'tipo' IS DISTINCT FROM 'Sessão de Tratamento'
     OR p_appointment->>'origem' IS DISTINCT FROM 'recepcao'
     OR nullif(p_appointment->>'id','') IS NULL
     OR (p_appointment->>'data')::date < (now() AT TIME ZONE 'America/Fortaleza')::date
  THEN RETURN jsonb_build_object('status','payload_invalido','reason','agendamento_manual'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_cycle.professional_id || '|' || v_cycle.unit_id || '|' || (p_appointment->>'data'), 0));
  v_check := public.check_internal_slot_availability(v_cycle.professional_id, v_cycle.unit_id,
    (p_appointment->>'data')::date, p_appointment->>'hora');
  v_capacity := (v_check->>'reason') IN ('day_full','turno_full','hour_full');
  -- An internal encaixe must never consume an external professional's reserved place.
  IF coalesce(v_capacity,false) AND EXISTS (
    SELECT 1 FROM public.quotas_externas q
     WHERE q.ativo IS TRUE AND q.profissional_interno_id::text=v_cycle.professional_id
       AND q.unidade_id=v_cycle.unit_id AND q.periodo_inicio=(p_appointment->>'data')::date
       AND q.periodo_fim=(p_appointment->>'data')::date AND q.vagas_usadas<q.vagas_total
  ) THEN RETURN jsonb_build_object('status','capacidade_esgotada','reason','reserva_externa_ativa'); END IF;
  IF coalesce((v_check->>'available')::boolean,false) IS NOT TRUE AND NOT coalesce(v_capacity,false) THEN
    RETURN jsonb_build_object('status','sem_disponibilidade','reason',v_check->>'reason');
  END IF;
  PERFORM pg_catalog.set_config('app.treatment_manual_capacity_override','on',true);
  PERFORM pg_catalog.set_config('app.treatment_manual_session_id',p_session_id::text,true);
  PERFORM pg_catalog.set_config('app.treatment_manual_appointment_id',p_appointment->>'id',true);
  v_result := public.schedule_treatment_session(p_session_id,p_cycle_id,p_expected_session_date,
    p_appointment,p_check_patient_conflict);
  PERFORM pg_catalog.set_config('app.treatment_manual_capacity_override','off',true);
  IF coalesce(v_capacity,false) AND v_result->>'status'='agendado' THEN
    INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,
      detalhes,agendamento_id,paciente_id,profissional_id)
    VALUES(v_staff.id::text,v_staff.nome,v_staff.role,v_cycle.unit_id,'encaixe_manual_tratamento',
      'treatment_session',p_session_id::text,
      pg_catalog.jsonb_build_object('capacity',v_check,'cycle_id',p_cycle_id),
      p_appointment->>'id',v_cycle.patient_id,v_cycle.professional_id);
  END IF;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reschedule_treatment_session_manual_capacity(
  p_session_id uuid, p_cycle_id uuid, p_expected_session_date date,
  p_expected_appointment_id text, p_new_date date, p_new_time text,
  p_check_patient_conflict boolean
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  v_staff public.funcionarios%ROWTYPE;
  v_cycle public.treatment_cycles%ROWTYPE;
  v_check jsonb;
  v_result jsonb;
  v_capacity boolean;
BEGIN
  SELECT * INTO v_staff FROM public.funcionarios
   WHERE auth_user_id=auth.uid() AND ativo IS TRUE AND lower(trim(role)) IN ('profissional','master');
  IF NOT FOUND THEN RAISE EXCEPTION 'Somente o profissional ou Master pode fazer encaixe manual de tratamento' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_cycle FROM public.treatment_cycles WHERE id=p_cycle_id;
  IF NOT FOUND OR v_cycle.status IS DISTINCT FROM 'em_andamento'
     OR (v_staff.usuario IS DISTINCT FROM 'admin.sms'
         AND ((nullif(v_staff.unidade_id,'') IS NULL AND lower(trim(v_staff.role)) <> 'master')
           OR (nullif(v_staff.unidade_id,'') IS NOT NULL AND v_staff.unidade_id IS DISTINCT FROM v_cycle.unit_id)))
     OR (lower(trim(v_staff.role))='profissional' AND v_staff.id::text IS DISTINCT FROM v_cycle.professional_id)
  THEN RAISE EXCEPTION 'Fora do escopo do tratamento' USING ERRCODE='42501'; END IF;
  IF nullif(p_expected_appointment_id,'') IS NULL OR p_new_date < (now() AT TIME ZONE 'America/Fortaleza')::date
     OR nullif(p_new_time,'') IS NULL THEN
    RETURN jsonb_build_object('status','payload_invalido','reason','agendamento_manual');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_cycle.professional_id || '|' || v_cycle.unit_id || '|' || p_new_date::text, 0));
  v_check := public.check_internal_slot_availability(v_cycle.professional_id,v_cycle.unit_id,
    p_new_date,p_new_time,p_expected_appointment_id);
  v_capacity := (v_check->>'reason') IN ('day_full','turno_full','hour_full');
  IF coalesce(v_capacity,false) AND EXISTS (
    SELECT 1 FROM public.quotas_externas q
     WHERE q.ativo IS TRUE AND q.profissional_interno_id::text=v_cycle.professional_id
       AND q.unidade_id=v_cycle.unit_id AND q.periodo_inicio=p_new_date
       AND q.periodo_fim=p_new_date AND q.vagas_usadas<q.vagas_total
  ) THEN RETURN jsonb_build_object('status','capacidade_esgotada','reason','reserva_externa_ativa'); END IF;
  IF coalesce((v_check->>'available')::boolean,false) IS NOT TRUE AND NOT coalesce(v_capacity,false) THEN
    RETURN jsonb_build_object('status','sem_disponibilidade','reason',v_check->>'reason');
  END IF;
  PERFORM pg_catalog.set_config('app.treatment_manual_capacity_override','on',true);
  PERFORM pg_catalog.set_config('app.treatment_manual_session_id',p_session_id::text,true);
  PERFORM pg_catalog.set_config('app.treatment_manual_appointment_id',p_expected_appointment_id,true);
  v_result := public.reschedule_treatment_session(p_session_id,p_cycle_id,p_expected_session_date,
    p_expected_appointment_id,p_new_date,p_new_time,p_check_patient_conflict);
  PERFORM pg_catalog.set_config('app.treatment_manual_capacity_override','off',true);
  IF coalesce(v_capacity,false) AND v_result->>'status'='remarcado' THEN
    INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,
      detalhes,agendamento_id,paciente_id,profissional_id)
    VALUES(v_staff.id::text,v_staff.nome,v_staff.role,v_cycle.unit_id,'remarcacao_encaixe_manual_tratamento',
      'treatment_session',p_session_id::text,
      pg_catalog.jsonb_build_object('capacity',v_check,'cycle_id',p_cycle_id),
      p_expected_appointment_id,v_cycle.patient_id,v_cycle.professional_id);
  END IF;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.schedule_treatment_session_manual_capacity(uuid,uuid,date,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.schedule_treatment_session_manual_capacity(uuid,uuid,date,jsonb,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.reschedule_treatment_session_manual_capacity(uuid,uuid,date,text,date,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reschedule_treatment_session_manual_capacity(uuid,uuid,date,text,date,text,boolean) TO authenticated;

-- The two existing capacity triggers are redefined below with a scoped exception.

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
      IF v_hora <> v_slot.hora_inicio::time AND NOT v_treatment_override THEN CONTINUE; END IF;
    ELSE
      v_duration := coalesce(nullif(v_slot.duracao_consulta, 0), 30);
      IF v_duration <= 0 THEN RAISE EXCEPTION 'Duração da disponibilidade inválida'; END IF;
      IF mod(extract(epoch FROM (v_hora - v_slot.hora_inicio::time))::numeric,
             (v_duration * 60)::numeric) <> 0
         OR extract(epoch FROM (v_slot.hora_fim::time - v_hora)) < v_duration * 60 THEN
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
$$;

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

COMMIT;

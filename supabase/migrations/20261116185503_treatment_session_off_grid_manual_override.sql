-- Allow scoped Master/professional treatment sessions outside the regular availability grid.
-- Official date/time blocks, weekend selection, duplicate checks, unit scope and audit remain enforced.
BEGIN;

CREATE OR REPLACE FUNCTION public.schedule_treatment_session_manual_capacity(
  p_session_id uuid, p_cycle_id uuid, p_expected_session_date date,
  p_appointment jsonb, p_check_patient_conflict boolean
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  v_staff public.funcionarios%ROWTYPE;
  v_cycle public.treatment_cycles%ROWTYPE;
  v_check jsonb;
  v_result jsonb;
  v_manual_override boolean;
  v_bypass_reason text;
  v_weekday integer;
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
     OR coalesce(p_appointment->>'hora','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     OR (p_appointment->>'data')::date < (now() AT TIME ZONE 'America/Fortaleza')::date
  THEN RETURN jsonb_build_object('status','payload_invalido','reason','agendamento_manual'); END IF;
  v_weekday := extract(isodow FROM (p_appointment->>'data')::date)::integer;
  IF v_weekday = 7 OR (v_weekday = 6 AND NOT coalesce(v_cycle.custom_data->'weekdays' @> '[6]'::jsonb, false)) THEN
    RETURN jsonb_build_object('status','data_bloqueada','reason','fim_de_semana');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_cycle.professional_id || '|' || v_cycle.unit_id || '|' || (p_appointment->>'data'), 0));
  v_check := public.check_internal_slot_availability(v_cycle.professional_id, v_cycle.unit_id,
    (p_appointment->>'data')::date, p_appointment->>'hora');
  v_manual_override := coalesce((v_check->>'available')::boolean,false) IS NOT TRUE
    OR coalesce((v_check->>'manual_time')::boolean,false);
  v_bypass_reason := nullif(pg_catalog.btrim(current_setting('app.treatment_manual_capacity_reason', true)), '');
  IF v_check->>'reason' = 'date_blocked' THEN
    RETURN jsonb_build_object('status','data_bloqueada','reason','bloqueio_oficial');
  END IF;
  IF v_check->>'reason' = 'invalid_hour' THEN
    RETURN jsonb_build_object('status','sem_disponibilidade','reason','invalid_hour');
  END IF;
  IF v_manual_override
     AND NOT coalesce((v_check->>'manual_time')::boolean,false)
     AND coalesce(v_check->>'reason','') NOT IN ('no_availability','outside_grid','availability_conflict','day_full','turno_full','hour_full') THEN
    RETURN jsonb_build_object('status','sem_disponibilidade','reason',coalesce(v_check->>'reason','indisponibilidade_nao_identificada'));
  END IF;
  IF v_manual_override AND v_bypass_reason IS NULL THEN
    RETURN jsonb_build_object('status','payload_invalido','reason','justificativa_obrigatoria');
  END IF;
  PERFORM pg_catalog.set_config('app.treatment_manual_capacity_override','on',true);
  PERFORM pg_catalog.set_config('app.treatment_manual_session_id',p_session_id::text,true);
  PERFORM pg_catalog.set_config('app.treatment_manual_appointment_id',p_appointment->>'id',true);
  v_result := public.schedule_treatment_session(p_session_id,p_cycle_id,p_expected_session_date,
    p_appointment,p_check_patient_conflict);
  PERFORM pg_catalog.set_config('app.treatment_manual_capacity_override','off',true);
  IF coalesce(v_manual_override,false) AND v_result->>'status'='agendado' THEN
    INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,
      detalhes,agendamento_id,paciente_id,profissional_id)
    VALUES(v_staff.id::text,v_staff.nome,v_staff.role,v_cycle.unit_id,'encaixe_manual_tratamento',
      'treatment_session',p_session_id::text,
      pg_catalog.jsonb_build_object('motivo_alteracao',v_bypass_reason,'data',p_appointment->>'data',
        'hora',p_appointment->>'hora','capacity',v_check,'cycle_id',p_cycle_id),
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
  v_manual_override boolean;
  v_bypass_reason text;
  v_weekday integer;
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
     OR coalesce(p_new_time,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RETURN jsonb_build_object('status','payload_invalido','reason','agendamento_manual');
  END IF;
  v_weekday := extract(isodow FROM p_new_date)::integer;
  IF v_weekday = 7 OR (v_weekday = 6 AND NOT coalesce(v_cycle.custom_data->'weekdays' @> '[6]'::jsonb, false)) THEN
    RETURN jsonb_build_object('status','data_bloqueada','reason','fim_de_semana');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_cycle.professional_id || '|' || v_cycle.unit_id || '|' || p_new_date::text, 0));
  v_check := public.check_internal_slot_availability(v_cycle.professional_id,v_cycle.unit_id,
    p_new_date,p_new_time,p_expected_appointment_id);
  v_manual_override := coalesce((v_check->>'available')::boolean,false) IS NOT TRUE
    OR coalesce((v_check->>'manual_time')::boolean,false);
  v_bypass_reason := nullif(pg_catalog.btrim(current_setting('app.treatment_manual_capacity_reason', true)), '');
  IF v_check->>'reason' = 'date_blocked' THEN
    RETURN jsonb_build_object('status','data_bloqueada','reason','bloqueio_oficial');
  END IF;
  IF v_check->>'reason' = 'invalid_hour' THEN
    RETURN jsonb_build_object('status','sem_disponibilidade','reason','invalid_hour');
  END IF;
  IF v_manual_override
     AND NOT coalesce((v_check->>'manual_time')::boolean,false)
     AND coalesce(v_check->>'reason','') NOT IN ('no_availability','outside_grid','availability_conflict','day_full','turno_full','hour_full') THEN
    RETURN jsonb_build_object('status','sem_disponibilidade','reason',coalesce(v_check->>'reason','indisponibilidade_nao_identificada'));
  END IF;
  IF v_manual_override AND v_bypass_reason IS NULL THEN
    RETURN jsonb_build_object('status','payload_invalido','reason','justificativa_obrigatoria');
  END IF;
  PERFORM pg_catalog.set_config('app.treatment_manual_capacity_override','on',true);
  PERFORM pg_catalog.set_config('app.treatment_manual_session_id',p_session_id::text,true);
  PERFORM pg_catalog.set_config('app.treatment_manual_appointment_id',p_expected_appointment_id,true);
  v_result := public.reschedule_treatment_session(p_session_id,p_cycle_id,p_expected_session_date,
    p_expected_appointment_id,p_new_date,p_new_time,p_check_patient_conflict);
  PERFORM pg_catalog.set_config('app.treatment_manual_capacity_override','off',true);
  IF coalesce(v_manual_override,false) AND v_result->>'status'='remarcado' THEN
    INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,
      detalhes,agendamento_id,paciente_id,profissional_id)
    VALUES(v_staff.id::text,v_staff.nome,v_staff.role,v_cycle.unit_id,'remarcacao_encaixe_manual_tratamento',
      'treatment_session',p_session_id::text,
      pg_catalog.jsonb_build_object('motivo_alteracao',v_bypass_reason,'data',p_new_date,
        'hora',p_new_time,'capacity',v_check,'cycle_id',p_cycle_id),
      p_expected_appointment_id,v_cycle.patient_id,v_cycle.professional_id);
  END IF;
  RETURN v_result;
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
     AND NOT (v_check->>'reason' IN ('day_full','turno_full','hour_full','no_availability','outside_grid','availability_conflict')
       AND public.treatment_manual_capacity_override_matches(
         NEW.id, NEW.paciente_id, NEW.profissional_id, NEW.unidade_id, NEW.tipo, NEW.origem)) THEN
    RAISE EXCEPTION 'Agendamento interno bloqueado: %', coalesce(v_check->>'reason', 'capacidade_indisponivel')
      USING ERRCODE = 'P0001', DETAIL = v_check::text;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_treatment_session_checked(p_session_id uuid,p_cycle_id uuid,p_expected_session_date date,p_appointment jsonb,p_check_patient_conflict boolean,p_manual_capacity boolean,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.treatment_sessions%ROWTYPE; c public.treatment_cycles%ROWTYPE; actor jsonb; result jsonb; new_date date;
BEGIN
  SELECT * INTO s FROM public.treatment_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sessão não encontrada.' USING ERRCODE='23503'; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id=p_cycle_id FOR UPDATE;
  actor:=public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
  IF s.cycle_id IS DISTINCT FROM c.id OR s.scheduled_date IS DISTINCT FROM p_expected_session_date THEN RAISE EXCEPTION 'A sessão mudou. Atualize o ciclo.' USING ERRCODE='40001'; END IF;
  new_date:=nullif(p_appointment->>'data','')::date;
  IF new_date IS DISTINCT FROM s.scheduled_date AND nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo da alteração da data.' USING ERRCODE='23514'; END IF;
  PERFORM set_config('app.treatment_change_reason',coalesce(nullif(btrim(p_reason),''),'Agendamento confirmado manualmente'),true);
  PERFORM set_config('app.treatment_manual_capacity_reason',coalesce(nullif(btrim(p_reason),''),''),true);
  IF p_manual_capacity THEN
    result:=public.schedule_treatment_session_manual_capacity(p_session_id,p_cycle_id,p_expected_session_date,p_appointment,p_check_patient_conflict);
  ELSE
    result:=public.schedule_treatment_session_batch(p_session_id,p_cycle_id,p_expected_session_date,p_appointment,p_check_patient_conflict);
  END IF;
  IF result->>'status'='agendado' THEN
    INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
      VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'agendar_sessao','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,jsonb_build_object('motivo_alteracao',coalesce(p_reason,'Agendamento confirmado manualmente'),'ciclo',c.id,'sessao',s.id,'valor_anterior',to_jsonb(s),'valor_novo',result->'session'));
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.reschedule_treatment_session_checked(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb; c public.treatment_cycles%ROWTYPE; actor jsonb;
BEGIN
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Informe a justificativa da remarcação.' USING ERRCODE = '23514'; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id = p_cycle_id;
  actor := public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
  PERFORM set_config('app.treatment_change_reason',btrim(p_reason),true);
  PERFORM set_config('app.treatment_manual_capacity_reason',btrim(p_reason),true);
  IF p_manual_capacity THEN
    result := public.reschedule_treatment_session_manual_capacity(p_session_id,p_cycle_id,p_expected_session_date,p_expected_appointment_id,p_new_date,p_new_time,p_check_patient_conflict);
  ELSE
    result := public.reschedule_treatment_session(p_session_id,p_cycle_id,p_expected_session_date,p_expected_appointment_id,p_new_date,p_new_time,p_check_patient_conflict);
  END IF;
  IF result->>'status' = 'remarcado' THEN
    -- The trigger validates the target session; unrelated historical gaps must not freeze this action.
    INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
      VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'remarcar_sessao','treatment_session',p_session_id::text,'tratamentos',c.patient_id,c.professional_id,jsonb_build_object('motivo_alteracao',btrim(p_reason),'data_anterior',p_expected_session_date,'data_nova',p_new_date));
  END IF;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.schedule_treatment_session_manual_capacity(uuid,uuid,date,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_treatment_session_manual_capacity(uuid,uuid,date,jsonb,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.reschedule_treatment_session_manual_capacity(uuid,uuid,date,text,date,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_treatment_session_manual_capacity(uuid,uuid,date,text,date,text,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.schedule_treatment_session_checked(uuid,uuid,date,jsonb,boolean,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_treatment_session_checked(uuid,uuid,date,jsonb,boolean,boolean,text) TO authenticated;
REVOKE ALL ON FUNCTION public.reschedule_treatment_session_checked(uuid,uuid,date,text,date,text,boolean,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_treatment_session_checked(uuid,uuid,date,text,date,text,boolean,boolean,text) TO authenticated;

COMMIT;

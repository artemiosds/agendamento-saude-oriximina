-- Allow only scoped Master/professional treatment operations to exceed regular capacity.
-- Official date/time blocks, cycle weekend rules, configured availability, duplicate checks,
-- unit scope and existing action_logs auditing remain enforced by the existing RPC chain.
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
  v_capacity boolean;
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
  v_capacity := (v_check->>'reason') IN ('day_full','turno_full','hour_full');
  IF coalesce((v_check->>'available')::boolean,false) IS NOT TRUE AND NOT coalesce(v_capacity,false) THEN
    IF v_check->>'reason' = 'date_blocked' THEN
      RETURN jsonb_build_object('status','data_bloqueada','reason','bloqueio_oficial');
    END IF;
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
     OR nullif(p_new_time,'') IS NULL THEN
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
  v_capacity := (v_check->>'reason') IN ('day_full','turno_full','hour_full');
  IF coalesce((v_check->>'available')::boolean,false) IS NOT TRUE AND NOT coalesce(v_capacity,false) THEN
    IF v_check->>'reason' = 'date_blocked' THEN
      RETURN jsonb_build_object('status','data_bloqueada','reason','bloqueio_oficial');
    END IF;
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

REVOKE ALL ON FUNCTION public.schedule_treatment_session_manual_capacity(uuid,uuid,date,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_treatment_session_manual_capacity(uuid,uuid,date,jsonb,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.reschedule_treatment_session_manual_capacity(uuid,uuid,date,text,date,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_treatment_session_manual_capacity(uuid,uuid,date,text,date,text,boolean) TO authenticated;

COMMIT;

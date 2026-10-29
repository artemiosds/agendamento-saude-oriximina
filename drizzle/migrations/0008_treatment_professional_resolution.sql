-- Explicit, scoped professional actions only. No historical backfill.

CREATE OR REPLACE FUNCTION public.assert_treatment_write_scope(p_professional_id text, p_unit_id text, p_manage boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_staff record; v_role text; v_permission boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT f.id, f.nome, f.role, f.usuario, f.unidade_id
    INTO v_staff
    FROM public.funcionarios f
   WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE = '42501';
  END IF;

  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role
    WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao' WHEN 'coordenador' THEN 'gestao'
    WHEN 'recepção' THEN 'recepcao' WHEN 'tecnico' THEN 'triagem'
    WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  IF nullif(v_role, '') IS NULL THEN
    RAISE EXCEPTION 'Perfil não identificado' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('master','profissional') THEN
    SELECT chosen.allowed INTO v_permission FROM (
      SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN pu.can_delete ELSE pu.can_execute END AS allowed, 1 AS rank FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento'
         AND pu.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN pu.can_delete ELSE pu.can_execute END, 2 FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento' AND pu.unidade_id = ''
      UNION ALL SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN p.can_delete ELSE p.can_execute END, 3 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento'
         AND p.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN p.can_delete ELSE p.can_execute END, 4 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento' AND p.unidade_id = ''
    ) chosen ORDER BY chosen.rank LIMIT 1;
    IF v_permission IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Sem permissão para agendar sessões de tratamento' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND
     (nullif(v_staff.unidade_id, '') IS NULL AND v_role <> 'master'
       OR nullif(v_staff.unidade_id, '') IS NOT NULL AND p_unit_id <> v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'profissional' AND p_professional_id <> v_staff.id::text THEN
    RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE = '42501';
  END IF;
  IF nullif(p_unit_id, '') IS NULL OR NOT EXISTS (SELECT 1 FROM public.funcionarios WHERE id::text = p_professional_id AND ativo IS TRUE) THEN
    RAISE EXCEPTION 'Profissional ou unidade inválida' USING ERRCODE = '23514';
  END IF;
  RETURN to_jsonb(v_staff);
END $function$
;

CREATE OR REPLACE FUNCTION public.schedule_treatment_session(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_staff record;
  v_role text;
  v_permission boolean;
  v_session record;
  v_cycle record;
  v_appointment public.agendamentos%ROWTYPE;
  v_id text;
  v_new_date date;
  v_blocked boolean;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;
  SELECT f.id, f.role, f.usuario, f.unidade_id
    INTO v_staff FROM public.funcionarios f
   WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE = '42501'; END IF;

  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role
    WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao' WHEN 'coordenador' THEN 'gestao'
    WHEN 'recepção' THEN 'recepcao' WHEN 'tecnico' THEN 'triagem'
    WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  IF nullif(v_role, '') IS NULL THEN RAISE EXCEPTION 'Perfil não identificado' USING ERRCODE = '42501'; END IF;
  IF v_role NOT IN ('master','profissional') THEN
    SELECT chosen.can_execute INTO v_permission FROM (
      SELECT pu.can_execute, 1 AS rank FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento'
         AND pu.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT pu.can_execute, 2 FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento' AND pu.unidade_id = ''
      UNION ALL SELECT p.can_execute, 3 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento'
         AND p.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT p.can_execute, 4 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento' AND p.unidade_id = ''
    ) chosen ORDER BY chosen.rank LIMIT 1;
    IF v_permission IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Sem permissão para agendar sessões de tratamento' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','nao_encontrado','reason','sessao'); END IF;
  SELECT c.* INTO v_cycle FROM public.treatment_cycles c WHERE c.id = p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','vinculo_inconsistente','reason','ciclo_ausente'); END IF;
  IF v_session.cycle_id IS DISTINCT FROM p_cycle_id
     OR v_session.patient_id IS DISTINCT FROM v_cycle.patient_id
     OR v_session.professional_id IS DISTINCT FROM v_cycle.professional_id
     OR v_cycle.status <> 'em_andamento' THEN
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','ciclo_sessao');
  END IF;
  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND
     (nullif(v_staff.unidade_id, '') IS NULL AND v_role <> 'master'
       OR nullif(v_staff.unidade_id, '') IS NOT NULL AND v_cycle.unit_id <> v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'profissional' AND v_cycle.professional_id <> v_staff.id::text THEN
    RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE = '42501';
  END IF;
  IF v_session.status = 'agendada' AND v_session.appointment_id IS NOT NULL THEN
    SELECT a.* INTO v_appointment FROM public.agendamentos a WHERE a.id = v_session.appointment_id FOR UPDATE;
    IF FOUND AND v_appointment.paciente_id IS NOT DISTINCT FROM v_session.patient_id
       AND v_appointment.profissional_id IS NOT DISTINCT FROM v_session.professional_id
       AND v_appointment.unidade_id IS NOT DISTINCT FROM v_cycle.unit_id
       AND v_appointment.data IS NOT DISTINCT FROM v_session.scheduled_date
       AND v_appointment.data IS NOT DISTINCT FROM nullif(p_appointment->>'data','')::date
       AND v_appointment.hora IS NOT DISTINCT FROM p_appointment->>'hora'
       AND v_appointment.status = 'confirmado' THEN
      RETURN jsonb_build_object('status','ja_agendado','session',to_jsonb(v_session),'appointment',to_jsonb(v_appointment));
    END IF;
    IF FOUND THEN RETURN jsonb_build_object('status','estado_protegido','reason','sessao_ja_vinculada'); END IF;
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','agendamento_ausente');
  END IF;
  IF v_session.status <> 'pendente_agendamento' OR v_session.appointment_id IS NOT NULL
     OR v_session.scheduled_date IS DISTINCT FROM p_expected_session_date THEN
    RETURN jsonb_build_object('status','estado_protegido','reason','sessao_alterada');
  END IF;

  v_id := nullif(p_appointment->>'id', '');
  v_new_date := nullif(p_appointment->>'data','')::date;
  IF v_id IS NULL OR p_appointment->>'status' IS DISTINCT FROM 'confirmado'
     OR p_appointment->>'paciente_id' IS DISTINCT FROM v_cycle.patient_id
     OR p_appointment->>'profissional_id' IS DISTINCT FROM v_cycle.professional_id
     OR p_appointment->>'unidade_id' IS DISTINCT FROM v_cycle.unit_id
     OR v_new_date IS NULL
     OR nullif(p_appointment->>'hora','') IS NULL THEN
    RETURN jsonb_build_object('status','payload_invalido','reason','agendamento');
  END IF;
  IF v_role NOT IN ('master','profissional') THEN
    SELECT public.is_date_blocked(v_new_date,v_cycle.professional_id,v_cycle.unit_id) INTO v_blocked;
    IF v_blocked IS DISTINCT FROM false THEN
      RETURN jsonb_build_object('status','data_bloqueada','reason','indisponivel');
    END IF;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_cycle.patient_id || '|' || v_new_date::text || '|' || (p_appointment->>'hora'), 0));
  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
     WHERE a.paciente_id = v_cycle.patient_id
       AND (p_check_patient_conflict IS TRUE OR a.profissional_id = v_cycle.professional_id)
       AND a.data = v_new_date AND a.hora = p_appointment->>'hora'
       AND a.status NOT IN ('cancelado','falta','remarcado')
  ) THEN RETURN jsonb_build_object('status','duplicado','reason','horario_ocupado'); END IF;

  INSERT INTO public.agendamentos (
    id,paciente_id,paciente_nome,unidade_id,sala_id,setor_id,profissional_id,profissional_nome,
    data,hora,status,tipo,observacoes,origem,google_event_id,sync_status,criado_por,prioridade_perfil
  ) VALUES (
    v_id,v_cycle.patient_id,p_appointment->>'paciente_nome',v_cycle.unit_id,
    coalesce(p_appointment->>'sala_id',''),coalesce(p_appointment->>'setor_id',''),
    v_cycle.professional_id,p_appointment->>'profissional_nome',v_new_date,
    p_appointment->>'hora','confirmado',p_appointment->>'tipo',coalesce(p_appointment->>'observacoes',''),
    coalesce(p_appointment->>'origem','recepcao'),coalesce(p_appointment->>'google_event_id',''),
    coalesce(p_appointment->>'sync_status','pendente'),coalesce(p_appointment->>'criado_por',''),'normal'
  ) RETURNING * INTO v_appointment;

  UPDATE public.treatment_sessions s
     SET appointment_id = v_id, status = 'agendada', scheduled_date = v_new_date
   WHERE s.id = p_session_id AND s.cycle_id = p_cycle_id AND s.status = 'pendente_agendamento'
     AND s.appointment_id IS NULL AND s.scheduled_date IS NOT DISTINCT FROM p_expected_session_date;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Sessão alterada durante o agendamento' USING ERRCODE = '40001'; END IF;
  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id = p_session_id;
  RETURN jsonb_build_object('status','agendado','session',to_jsonb(v_session),'appointment',to_jsonb(v_appointment));
END;
$function$
;

-- Definer is required to detect ALL claims (including other cycles hidden by RLS).
-- Authorization is checked before reading the appointment; only the chosen session is released.
CREATE OR REPLACE FUNCTION public.release_treatment_session_for_booking(
 p_session_id uuid, p_expected_appointment_id text, p_expected_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.treatment_sessions%ROWTYPE; c public.treatment_cycles%ROWTYPE;
 a public.agendamentos%ROWTYPE; actor jsonb; shared boolean:=false; found_appointment boolean:=false;
 old_reason text; changed integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.treatment_sessions WHERE id=p_session_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sessão não encontrada.' USING ERRCODE='23503'; END IF;
 SELECT * INTO c FROM public.treatment_cycles WHERE id=s.cycle_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE='23503'; END IF;
 actor:=public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
 IF s.patient_id IS DISTINCT FROM c.patient_id OR s.professional_id IS DISTINCT FROM c.professional_id THEN
  RAISE EXCEPTION 'Paciente ou profissional divergente do ciclo.' USING ERRCODE='23514'; END IF;
 IF c.status NOT IN ('em_andamento','ativo') OR s.status NOT IN ('agendada','pendente_agendamento') THEN
  RAISE EXCEPTION 'Sessão encerrada: o histórico clínico foi preservado.' USING ERRCODE='23514'; END IF;
 IF s.appointment_id IS DISTINCT FROM p_expected_appointment_id OR s.scheduled_date IS DISTINCT FROM p_expected_date THEN
  RAISE EXCEPTION 'A sessão mudou. Atualize o ciclo antes de confirmar.' USING ERRCODE='40001'; END IF;
 IF s.appointment_id IS NULL AND s.scheduled_date IS NULL AND s.status='pendente_agendamento' THEN
  RETURN jsonb_build_object('status','liberado','appointment_preserved',false); END IF;
 IF nullif(btrim(s.procedure_done),'') IS NOT NULL OR nullif(btrim(s.clinical_notes),'') IS NOT NULL THEN
  RAISE EXCEPTION 'Sessão com conteúdo clínico: use a revisão do atendimento; nenhum registro foi removido.' USING ERRCODE='23514'; END IF;
 IF s.appointment_id IS NOT NULL THEN
  SELECT * INTO a FROM public.agendamentos WHERE id=s.appointment_id FOR UPDATE;
  found_appointment:=FOUND;
  SELECT EXISTS(SELECT 1 FROM public.treatment_sessions t WHERE t.appointment_id=s.appointment_id AND t.id<>s.id) INTO shared;
  IF EXISTS(SELECT 1 FROM public.prontuarios WHERE agendamento_id=s.appointment_id)
    OR EXISTS(SELECT 1 FROM public.atendimentos WHERE agendamento_id=s.appointment_id) THEN
   RAISE EXCEPTION 'Há registro clínico neste agendamento; nenhum dado foi alterado.' USING ERRCODE='23514'; END IF;
  IF found_appointment THEN
   IF a.paciente_id IS DISTINCT FROM c.patient_id OR a.profissional_id IS DISTINCT FROM c.professional_id OR a.unidade_id IS DISTINCT FROM c.unit_id THEN
    RAISE EXCEPTION 'Reserva de outro paciente, profissional ou unidade: revisão administrativa necessária.' USING ERRCODE='23514'; END IF;
   IF a.status NOT IN ('confirmado','agendado','pendente')
     OR EXISTS(SELECT 1 FROM public.triage_records WHERE agendamento_id=a.id)
     OR EXISTS(SELECT 1 FROM public.fila_espera WHERE id=a.id) THEN
    RAISE EXCEPTION 'Paciente já recebido ou em fluxo clínico. A reserva não foi excluída.' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 old_reason:=coalesce(current_setting('app.treatment_change_reason',true),'');
 PERFORM set_config('app.treatment_change_reason','Regularização manual: sessão liberada para novo agendamento',true);
 UPDATE public.treatment_sessions SET appointment_id=NULL,scheduled_date=NULL,status='pendente_agendamento' WHERE id=s.id;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Sessão alterada durante a operação.' USING ERRCODE='40001'; END IF;
 -- Shared reservations belong to the remaining session and must NEVER be deleted here.
 IF found_appointment AND NOT shared THEN
  DELETE FROM public.agendamentos WHERE id=a.id;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'Reserva alterada durante a operação.' USING ERRCODE='40001'; END IF;
 END IF;
 INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
 VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'regularizar_sessao_para_agendar','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,
  jsonb_build_object('valor_anterior',to_jsonb(s),'numero_preservado',s.session_number,'agendamento_preservado',shared AND found_appointment,'agendamento_excluido',found_appointment AND NOT shared,'motivo','Liberação manual confirmada pelo profissional/Master; sessão e número preservados'));
 PERFORM set_config('app.treatment_change_reason',old_reason,true);
 RETURN jsonb_build_object('status','liberado','appointment_preserved',shared AND found_appointment);
END $$;
REVOKE ALL ON FUNCTION public.release_treatment_session_for_booking(uuid,text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.release_treatment_session_for_booking(uuid,text,date) TO authenticated;
NOTIFY pgrst,'reload schema';

CREATE OR REPLACE FUNCTION public.link_existing_treatment_session_appointment(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_staff record;
  v_role text;
  v_permission boolean;
  v_session record;
  v_cycle record;
  v_appointment public.agendamentos%ROWTYPE;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT f.id, f.role, f.usuario, f.unidade_id
    INTO v_staff
    FROM public.funcionarios f
   WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE = '42501';
  END IF;

  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role
    WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao' WHEN 'coordenador' THEN 'gestao'
    WHEN 'recepção' THEN 'recepcao' WHEN 'tecnico' THEN 'triagem'
    WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  IF nullif(v_role, '') IS NULL THEN
    RAISE EXCEPTION 'Perfil não identificado' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('master','profissional') THEN
    SELECT chosen.can_execute INTO v_permission FROM (
      SELECT pu.can_execute, 1 AS rank FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento'
         AND pu.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT pu.can_execute, 2 FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento' AND pu.unidade_id = ''
      UNION ALL SELECT p.can_execute, 3 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento'
         AND p.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT p.can_execute, 4 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento' AND p.unidade_id = ''
    ) chosen ORDER BY chosen.rank LIMIT 1;
    IF v_permission IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Sem permissão para agendar sessões de tratamento' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT s.* INTO v_session
    FROM public.treatment_sessions s
   WHERE s.id = p_session_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'nao_encontrado', 'reason', 'sessao');
  END IF;

  SELECT c.* INTO v_cycle
    FROM public.treatment_cycles c
   WHERE c.id = p_cycle_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'ciclo_ausente');
  END IF;
  IF v_session.cycle_id IS DISTINCT FROM p_cycle_id
     OR v_session.patient_id IS DISTINCT FROM v_cycle.patient_id
     OR v_session.professional_id IS DISTINCT FROM v_cycle.professional_id
     OR v_cycle.status <> 'em_andamento' THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'ciclo_sessao');
  END IF;

  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND
     (nullif(v_staff.unidade_id, '') IS NULL AND v_role <> 'master'
       OR nullif(v_staff.unidade_id, '') IS NOT NULL AND v_cycle.unit_id <> v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'profissional' AND v_cycle.professional_id <> v_staff.id::text THEN
    RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE = '42501';
  END IF;
  IF p_appointment_id IS NULL OR p_expected_session_date IS NULL THEN
    RETURN jsonb_build_object('status', 'payload_invalido', 'reason', 'vinculo');
  END IF;

  SELECT a.* INTO v_appointment
    FROM public.agendamentos a
   WHERE a.id = p_appointment_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'agendamento_ausente');
  END IF;
  IF v_appointment.paciente_id IS DISTINCT FROM v_session.patient_id
     OR v_appointment.profissional_id IS DISTINCT FROM v_session.professional_id
     OR v_appointment.unidade_id IS DISTINCT FROM v_cycle.unit_id
     OR v_appointment.data IS DISTINCT FROM p_expected_session_date
     OR v_appointment.status IN ('cancelado', 'falta', 'remarcado') THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'agendamento_divergente');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.treatment_sessions other_session
     WHERE other_session.appointment_id = p_appointment_id
       AND other_session.id <> p_session_id
  ) THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'agendamento_ja_vinculado');
  END IF;

  -- Idempotent retry: report the existing valid link without writing again.
  IF v_session.status = 'agendada' AND v_session.appointment_id = p_appointment_id
     AND v_session.scheduled_date = p_expected_session_date THEN
    RETURN jsonb_build_object('status', 'ja_agendado', 'session', to_jsonb(v_session), 'appointment', to_jsonb(v_appointment));
  END IF;
  IF v_session.status <> 'pendente_agendamento' OR v_session.appointment_id IS NOT NULL
     OR v_session.scheduled_date IS DISTINCT FROM p_expected_session_date THEN
    RETURN jsonb_build_object('status', 'estado_protegido', 'reason', 'sessao_alterada');
  END IF;

  UPDATE public.treatment_sessions s
     SET appointment_id = p_appointment_id, status = 'agendada'
   WHERE s.id = p_session_id AND s.cycle_id = p_cycle_id
     AND s.status = 'pendente_agendamento' AND s.appointment_id IS NULL
     AND s.scheduled_date = p_expected_session_date;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Sessão alterada durante o vínculo' USING ERRCODE = '40001';
  END IF;

  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id = p_session_id;
  RETURN jsonb_build_object('status', 'ja_agendado', 'session', to_jsonb(v_session), 'appointment', to_jsonb(v_appointment));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.unschedule_treatment_session(p_session_id uuid, p_cycle_id uuid, p_expected_appointment_id text, p_expected_session_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_staff record;
  v_role text;
  v_permission boolean;
  v_session record;
  v_cycle record;
  v_appointment public.agendamentos%ROWTYPE;
  v_deleted_id text;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE='42501'; END IF;
  SELECT f.id,f.role,f.usuario,f.unidade_id INTO v_staff FROM public.funcionarios f
   WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE='42501'; END IF;
  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao' WHEN 'coordenador' THEN 'gestao' WHEN 'recepção' THEN 'recepcao'
    WHEN 'tecnico' THEN 'triagem' WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  IF nullif(v_role,'') IS NULL THEN RAISE EXCEPTION 'Perfil não identificado' USING ERRCODE='42501'; END IF;
  IF v_role NOT IN ('master','profissional') THEN
    SELECT chosen.can_execute INTO v_permission FROM (
      SELECT pu.can_execute,1 AS rank FROM public.permissoes_usuario pu WHERE pu.user_id=v_staff.id::text
        AND pu.modulo='tratamento' AND pu.unidade_id=coalesce(v_staff.unidade_id,'') AND coalesce(v_staff.unidade_id,'')<>''
      UNION ALL SELECT pu.can_execute,2 FROM public.permissoes_usuario pu WHERE pu.user_id=v_staff.id::text AND pu.modulo='tratamento' AND pu.unidade_id=''
      UNION ALL SELECT p.can_execute,3 FROM public.permissoes p WHERE p.perfil IN (v_role,lower(trim(v_staff.role)))
        AND p.modulo='tratamento' AND p.unidade_id=coalesce(v_staff.unidade_id,'') AND coalesce(v_staff.unidade_id,'')<>''
      UNION ALL SELECT p.can_execute,4 FROM public.permissoes p WHERE p.perfil IN (v_role,lower(trim(v_staff.role))) AND p.modulo='tratamento' AND p.unidade_id=''
    ) chosen ORDER BY chosen.rank LIMIT 1;
    IF v_permission IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Sem permissão para desmarcar sessões de tratamento' USING ERRCODE='42501'; END IF;
  END IF;

  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','nao_encontrado','reason','sessao'); END IF;
  SELECT c.* INTO v_cycle FROM public.treatment_cycles c WHERE c.id=p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','vinculo_inconsistente','reason','ciclo_ausente'); END IF;
  IF v_session.cycle_id IS DISTINCT FROM p_cycle_id OR v_session.patient_id IS DISTINCT FROM v_cycle.patient_id
     OR v_session.professional_id IS DISTINCT FROM v_cycle.professional_id THEN
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','ciclo_sessao');
  END IF;
  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND
     (nullif(v_staff.unidade_id,'') IS NULL AND v_role <> 'master'
       OR nullif(v_staff.unidade_id,'') IS NOT NULL AND v_cycle.unit_id <> v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE='42501';
  END IF;
  IF v_role='profissional' AND v_cycle.professional_id<>v_staff.id::text THEN RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE='42501'; END IF;
  IF v_cycle.status <> 'em_andamento' OR v_session.status <> 'agendada' THEN
    RETURN jsonb_build_object('status','estado_protegido','reason','sessao_nao_desmarcavel');
  END IF;
  IF p_expected_appointment_id IS NULL OR v_session.appointment_id IS DISTINCT FROM p_expected_appointment_id
     OR v_session.scheduled_date IS DISTINCT FROM p_expected_session_date THEN
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','vinculo_ausente_ou_alterado');
  END IF;
  SELECT a.* INTO v_appointment FROM public.agendamentos a WHERE a.id=p_expected_appointment_id FOR UPDATE;
  IF NOT FOUND OR v_appointment.paciente_id IS DISTINCT FROM v_session.patient_id
     OR v_appointment.profissional_id IS DISTINCT FROM v_session.professional_id
     OR v_appointment.unidade_id IS DISTINCT FROM v_cycle.unit_id
     OR v_appointment.data IS DISTINCT FROM v_session.scheduled_date THEN
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','agendamento');
  END IF;

  IF EXISTS(SELECT 1 FROM public.treatment_sessions other WHERE other.appointment_id=p_expected_appointment_id AND other.id<>p_session_id) THEN
    RETURN jsonb_build_object('status','vinculo_compartilhado','reason','use_liberar_para_agendar');
  END IF;
  IF v_appointment.status NOT IN ('confirmado','agendado','pendente')
     OR EXISTS(SELECT 1 FROM public.prontuarios WHERE agendamento_id=p_expected_appointment_id)
     OR EXISTS(SELECT 1 FROM public.atendimentos WHERE agendamento_id=p_expected_appointment_id)
     OR EXISTS(SELECT 1 FROM public.triage_records WHERE agendamento_id=p_expected_appointment_id)
     OR EXISTS(SELECT 1 FROM public.fila_espera WHERE id=p_expected_appointment_id) THEN
    RAISE EXCEPTION 'Paciente já recebido ou com registro clínico. A reserva foi preservada.' USING ERRCODE='23514';
  END IF;

  -- Unlink first in this same transaction; the Agenda deletion trigger must
  -- not process an operation already handled by the canonical deschedule RPC.
  UPDATE public.treatment_sessions s SET status='pendente_agendamento', appointment_id=NULL
   WHERE s.id=p_session_id AND s.cycle_id=p_cycle_id AND s.status='agendada'
     AND s.appointment_id=p_expected_appointment_id AND s.scheduled_date=p_expected_session_date;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'Sessão alterada durante a desmarcação' USING ERRCODE='40001'; END IF;
  DELETE FROM public.agendamentos a WHERE a.id=p_expected_appointment_id
    AND a.paciente_id=v_session.patient_id AND a.profissional_id=v_session.professional_id
    AND a.unidade_id=v_cycle.unit_id AND a.data=v_session.scheduled_date
  RETURNING a.id INTO v_deleted_id;
  IF v_deleted_id IS NULL THEN RAISE EXCEPTION 'Agendamento alterado durante a desmarcação' USING ERRCODE='40001'; END IF;
  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id=p_session_id;
  RETURN jsonb_build_object('status','desmarcado','session',to_jsonb(v_session),'appointment_id',v_deleted_id);
END;
$function$
;

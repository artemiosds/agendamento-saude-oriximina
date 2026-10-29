-- Scoped recovery of non-clinical orphan sessions. No global backfill.
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
  IF v_role <> 'master' THEN
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

-- SECURITY DEFINER is limited to proving absence across RLS; scope/permission
-- validation is mandatory before any session is inspected or changed.
CREATE OR REPLACE FUNCTION public.recover_missing_treatment_appointments(p_cycle_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.treatment_cycles%ROWTYPE; s public.treatment_sessions%ROWTYPE; actor jsonb;
 recovered jsonb:='[]'::jsonb; old_reason text;
BEGIN
 SELECT * INTO c FROM public.treatment_cycles WHERE id=p_cycle_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE='23503'; END IF;
 actor:=public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
 IF c.status NOT IN ('em_andamento','ativo','concluido') THEN RETURN jsonb_build_object('recovered_ids',recovered); END IF;
 old_reason:=coalesce(current_setting('app.treatment_change_reason',true),'');
 FOR s IN SELECT * FROM public.treatment_sessions ts WHERE ts.cycle_id=c.id AND ts.status='agendada'
   AND ts.appointment_id IS NOT NULL AND ts.patient_id=c.patient_id AND ts.professional_id=c.professional_id
   AND NOT EXISTS(SELECT 1 FROM public.agendamentos a WHERE a.id=ts.appointment_id)
   AND NOT EXISTS(SELECT 1 FROM public.prontuarios p WHERE p.agendamento_id=ts.appointment_id)
   AND NOT EXISTS(SELECT 1 FROM public.atendimentos a WHERE a.agendamento_id=ts.appointment_id)
   ORDER BY ts.id FOR UPDATE
 LOOP
  PERFORM set_config('app.treatment_change_reason','Agendamento vinculado ausente; sessão não realizada liberada para novo agendamento',true);
  UPDATE public.treatment_sessions SET appointment_id=NULL,status='pendente_agendamento',scheduled_date=NULL WHERE id=s.id;
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
   VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'liberar_sessao_agendamento_ausente','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,
   jsonb_build_object('agendamento_anterior',s.appointment_id,'data_anterior',s.scheduled_date,'numero_sessao',s.session_number,'status_anterior',s.status,'status_novo','pendente_agendamento','motivo_alteracao','Agendamento ausente no banco; liberação restrita ao ciclo aberto pelo usuário autorizado'));
  recovered:=recovered || jsonb_build_array(s.id);
 END LOOP;
 PERFORM set_config('app.treatment_change_reason',old_reason,true);
 RETURN jsonb_build_object('recovered_ids',recovered);
END $$;
REVOKE ALL ON FUNCTION public.recover_missing_treatment_appointments(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recover_missing_treatment_appointments(uuid) TO authenticated;

-- A normal deletion releases only the sessions linked to that exact appointment.
-- Any error rolls the appointment deletion and session changes back together.
CREATE OR REPLACE FUNCTION public.release_treatment_sessions_before_appointment_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.treatment_sessions%ROWTYPE; c public.treatment_cycles%ROWTYPE; actor jsonb; old_reason text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.treatment_sessions WHERE appointment_id=OLD.id) THEN RETURN OLD; END IF;
 IF EXISTS(SELECT 1 FROM public.treatment_sessions WHERE appointment_id=OLD.id AND status IN ('realizada','concluida','concluido','presente','compareceu','falta','paciente_faltou'))
   OR EXISTS(SELECT 1 FROM public.prontuarios WHERE agendamento_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.atendimentos WHERE agendamento_id=OLD.id) THEN
  RAISE EXCEPTION 'Agendamento com registro clínico: histórico preservado. Não é possível excluí-lo.' USING ERRCODE='23514';
 END IF;
 old_reason:=coalesce(current_setting('app.treatment_change_reason',true),'');
 FOR s IN SELECT * FROM public.treatment_sessions WHERE appointment_id=OLD.id AND status IN ('agendada','pendente_agendamento') ORDER BY id FOR UPDATE LOOP
  SELECT * INTO c FROM public.treatment_cycles WHERE id=s.cycle_id FOR UPDATE;
  actor:=public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
  IF s.patient_id IS DISTINCT FROM c.patient_id OR s.professional_id IS DISTINCT FROM c.professional_id
    OR OLD.paciente_id IS DISTINCT FROM c.patient_id OR OLD.profissional_id IS DISTINCT FROM c.professional_id OR OLD.unidade_id IS DISTINCT FROM c.unit_id THEN
   RAISE EXCEPTION 'Vínculo divergente: a exclusão não alterou a sessão nem o agendamento.' USING ERRCODE='23514';
  END IF;
  PERFORM set_config('app.treatment_change_reason','Exclusão do agendamento: sessão liberada para novo agendamento',true);
  UPDATE public.treatment_sessions SET appointment_id=NULL,status='pendente_agendamento',scheduled_date=NULL WHERE id=s.id;
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
   VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'liberar_sessao_apos_exclusao_agenda','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,
   jsonb_build_object('agendamento_anterior',OLD.id,'data_anterior',s.scheduled_date,'numero_sessao',s.session_number,'status_novo','pendente_agendamento','motivo_alteracao','Exclusão explícita pela Agenda; sessão e numeração preservadas'));
 END LOOP;
 PERFORM set_config('app.treatment_change_reason',old_reason,true);
 RETURN OLD;
END $$;
CREATE OR REPLACE TRIGGER trg_release_treatment_before_appointment_delete BEFORE DELETE ON public.agendamentos
 FOR EACH ROW EXECUTE FUNCTION public.release_treatment_sessions_before_appointment_delete();
REVOKE ALL ON FUNCTION public.release_treatment_sessions_before_appointment_delete() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.release_treatment_sessions_before_appointment_delete() TO authenticated;

-- An undated, unlinked pending session is a valid state awaiting scheduling.
CREATE OR REPLACE FUNCTION public.treatment_cycle_integrity_issues(p_cycle_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE c public.treatment_cycles%ROWTYPE; n integer; unique_numbers integer; first_number integer; last_number integer; issues text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO c FROM public.treatment_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado' USING ERRCODE = '23503'; END IF;
  SELECT count(*), count(DISTINCT session_number), min(session_number), max(session_number) INTO n, unique_numbers, first_number, last_number FROM public.treatment_sessions WHERE cycle_id = c.id;
  IF n <> c.total_sessions OR c.total_sessions < 1 THEN
    issues := array_append(issues, format('Quantidade %s: ciclo previsto para %s sessões, mas possui %s registradas.', CASE WHEN n < c.total_sessions THEN 'incompleta' ELSE 'inconsistente' END, c.total_sessions, n));
  END IF;
  IF n <> c.total_sessions OR unique_numbers <> n OR first_number IS DISTINCT FROM 1 OR last_number IS DISTINCT FROM c.total_sessions THEN issues := array_append(issues, 'Numeração inconsistente: há sessões com sequência incompleta.'); END IF;
  IF EXISTS (SELECT 1 FROM public.treatment_sessions s WHERE s.cycle_id = c.id AND s.status NOT IN ('cancelada','remarcada') AND s.scheduled_date IS NOT NULL GROUP BY s.scheduled_date HAVING count(*) > 1) THEN
    issues := array_append(issues, 'Data duplicada: duas sessões ativas deste ciclo estão previstas para a mesma data.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.treatment_sessions s JOIN public.treatment_sessions other ON other.appointment_id = s.appointment_id AND other.id <> s.id WHERE s.cycle_id = c.id AND s.appointment_id IS NOT NULL) THEN
    issues := array_append(issues, 'Agendamento já vinculado a outra sessão deste ciclo ou de outro ciclo.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.treatment_sessions s LEFT JOIN public.agendamentos a ON a.id = s.appointment_id WHERE s.cycle_id = c.id AND
    (s.patient_id IS DISTINCT FROM c.patient_id OR s.professional_id IS DISTINCT FROM c.professional_id OR nullif(c.unit_id,'') IS NULL
     OR (s.appointment_id IS NOT NULL AND (a.id IS NULL OR a.paciente_id IS DISTINCT FROM c.patient_id OR a.profissional_id IS DISTINCT FROM c.professional_id OR a.unidade_id IS DISTINCT FROM c.unit_id OR a.data IS DISTINCT FROM s.scheduled_date)))) THEN
    issues := array_append(issues, 'Vínculo com paciente, profissional, unidade ou data divergente — revisão necessária.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.treatment_sessions WHERE cycle_id=c.id AND scheduled_date IS NULL AND status NOT IN ('cancelada','remarcada') AND NOT (status = 'pendente_agendamento' AND appointment_id IS NULL)) THEN
    issues:=array_append(issues,'Sessão sem data — aguarda nova marcação manual.');
  END IF;
  RETURN issues;
END $function$

;

-- Make the new RPC visible to API schema caches after deployment.
NOTIFY pgrst, 'reload schema';

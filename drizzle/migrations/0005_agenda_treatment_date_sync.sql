-- Atomic Agenda edits; existing Treatment scheduling RPCs are left unchanged.
CREATE OR REPLACE FUNCTION public.update_agenda_treatment_appointment(p_id text, p_patch jsonb, p_expected jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.agendamentos%ROWTYPE; proposed public.agendamentos%ROWTYPE;
 s public.treatment_sessions%ROWTYPE; c public.treatment_cycles%ROWTYPE; actor jsonb;
 linked boolean; previous_reason text; moved boolean; changed integer;
BEGIN
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN
  ('data','hora','profissional_id','profissional_nome','tipo','observacoes','status','sala_id','hora_chegada','google_event_id','sync_status','lembrete_24h_enviado_em','lembrete_proximo_enviado_em')) THEN
  RAISE EXCEPTION 'Campos inválidos na edição da Agenda.' USING ERRCODE='23514';
 END IF;
 IF (SELECT count(*) FROM public.treatment_sessions WHERE appointment_id=p_id)>1 THEN
  RAISE EXCEPTION 'Este agendamento possui múltiplas sessões vinculadas. Confira os vínculos antes de remarcar.' USING ERRCODE='23514';
 END IF;
 SELECT * INTO s FROM public.treatment_sessions WHERE appointment_id=p_id FOR UPDATE;
 linked:=FOUND;
 IF linked THEN
  SELECT * INTO c FROM public.treatment_cycles WHERE id=s.cycle_id FOR UPDATE;
  actor:=public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
 END IF;
 SELECT * INTO a FROM public.agendamentos WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado ou sem acesso.' USING ERRCODE='42501'; END IF;
 IF NOT linked AND EXISTS(SELECT 1 FROM public.treatment_sessions WHERE appointment_id=p_id) THEN
  RAISE EXCEPTION 'O vínculo mudou. Atualize a Agenda e tente novamente.' USING ERRCODE='40001';
 END IF;
 IF p_expected IS NOT NULL AND (a.data::text IS DISTINCT FROM p_expected->>'data' OR a.hora IS DISTINCT FROM p_expected->>'hora'
   OR a.profissional_id IS DISTINCT FROM p_expected->>'profissional_id') THEN
  RAISE EXCEPTION 'O agendamento mudou em outro terminal. Atualize a Agenda.' USING ERRCODE='40001';
 END IF;
 proposed:=jsonb_populate_record(a,p_patch);
 moved:=proposed.data IS DISTINCT FROM a.data OR proposed.hora IS DISTINCT FROM a.hora;
 IF linked THEN
  IF s.patient_id IS DISTINCT FROM c.patient_id OR s.professional_id IS DISTINCT FROM c.professional_id
   OR a.paciente_id IS DISTINCT FROM c.patient_id OR a.profissional_id IS DISTINCT FROM c.professional_id OR a.unidade_id IS DISTINCT FROM c.unit_id
   OR proposed.profissional_id IS DISTINCT FROM c.professional_id THEN
   RAISE EXCEPTION 'Paciente, profissional ou unidade do vínculo divergem. Nenhum registro foi alterado.' USING ERRCODE='23514';
  END IF;
  IF (moved OR s.scheduled_date IS DISTINCT FROM proposed.data) AND
    (s.status NOT IN ('agendada','pendente_agendamento') OR a.status IN ('concluido','em_atendimento','cancelado','falta','remarcado')) THEN
   RAISE EXCEPTION 'Esta sessão possui estado clínico protegido. A data não foi alterada.' USING ERRCODE='23514';
  END IF;
 END IF;
 UPDATE public.agendamentos SET data=proposed.data,hora=proposed.hora,profissional_id=proposed.profissional_id,
 profissional_nome=proposed.profissional_nome,tipo=proposed.tipo,observacoes=proposed.observacoes,status=proposed.status,
 sala_id=proposed.sala_id,hora_chegada=proposed.hora_chegada,google_event_id=proposed.google_event_id,sync_status=proposed.sync_status,
 lembrete_24h_enviado_em=proposed.lembrete_24h_enviado_em,lembrete_proximo_enviado_em=proposed.lembrete_proximo_enviado_em WHERE id=p_id;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Sem permissão para atualizar este agendamento.' USING ERRCODE='42501'; END IF;
 IF linked AND (moved OR s.scheduled_date IS DISTINCT FROM proposed.data) THEN
  previous_reason:=coalesce(current_setting('app.treatment_change_reason',true),'');
  PERFORM set_config('app.treatment_change_reason','Remarcação pela Agenda com sincronização da sessão vinculada',true);
  UPDATE public.treatment_sessions SET scheduled_date=proposed.data WHERE id=s.id;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'Sem permissão para sincronizar a sessão. Nenhuma alteração foi salva.' USING ERRCODE='42501'; END IF;
  PERFORM set_config('app.treatment_change_reason',previous_reason,true);
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
   VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'sincronizar_sessao_pela_agenda','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,
    jsonb_build_object('agendamento_id',p_id,'data_anterior_sessao',s.scheduled_date,'data_anterior_agenda',a.data,'data_nova',proposed.data,'hora_anterior',a.hora,'hora_nova',proposed.hora,'motivo_alteracao','Edição explícita pela Agenda'));
 END IF;
 RETURN jsonb_build_object('id',p_id,'session_id',CASE WHEN linked THEN s.id ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.update_agenda_treatment_appointment(text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_agenda_treatment_appointment(text,jsonb,jsonb) TO authenticated;

-- Explicit, individually confirmed alignment of a pre-existing date mismatch.
CREATE OR REPLACE FUNCTION public.align_treatment_session_to_agenda(p_session_id uuid,p_expected_date date,p_appointment_id text,p_expected_agenda_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE s public.treatment_sessions%ROWTYPE; a public.agendamentos%ROWTYPE; c public.treatment_cycles%ROWTYPE; result jsonb;
BEGIN
 SELECT * INTO s FROM public.treatment_sessions WHERE id=p_session_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sessão não encontrada.' USING ERRCODE='23503'; END IF;
 SELECT * INTO c FROM public.treatment_cycles WHERE id=s.cycle_id FOR UPDATE;
 PERFORM public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
 IF s.appointment_id IS DISTINCT FROM p_appointment_id OR s.scheduled_date IS DISTINCT FROM p_expected_date OR p_expected_agenda_date IS NULL THEN
  RAISE EXCEPTION 'O vínculo mudou. Recarregue a sessão.' USING ERRCODE='40001';
 END IF;
 SELECT * INTO a FROM public.agendamentos WHERE id=p_appointment_id FOR UPDATE;
 IF NOT FOUND OR a.data IS DISTINCT FROM p_expected_agenda_date THEN
  RAISE EXCEPTION 'O agendamento mudou ou não foi encontrado. Recarregue os dados.' USING ERRCODE='40001';
 END IF;
 result:=public.update_agenda_treatment_appointment(a.id,jsonb_build_object('data',a.data),jsonb_build_object('data',a.data,'hora',a.hora,'profissional_id',a.profissional_id));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.align_treatment_session_to_agenda(uuid,date,text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.align_treatment_session_to_agenda(uuid,date,text,date) TO authenticated;

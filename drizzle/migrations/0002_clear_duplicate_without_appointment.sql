CREATE OR REPLACE FUNCTION public.clear_duplicate_treatment_session_date(p_session_id uuid, p_expected_date date, p_reason text, p_confirmed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE s public.treatment_sessions%ROWTYPE; c public.treatment_cycles%ROWTYPE; kept public.treatment_sessions%ROWTYPE; actor jsonb; message text;
BEGIN
  IF p_confirmed IS DISTINCT FROM true OR nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Confirme a regularização e informe motivo_alteracao.' USING ERRCODE='23514'; END IF;
  SELECT * INTO s FROM public.treatment_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sessão não encontrada.' USING ERRCODE='23503'; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id=s.cycle_id FOR UPDATE;
  actor:=public.assert_treatment_write_scope(c.professional_id,c.unit_id,true);
  IF s.scheduled_date IS DISTINCT FROM p_expected_date THEN RAISE EXCEPTION 'A sessão mudou. Recarregue.' USING ERRCODE='40001'; END IF;
  IF s.status<>'pendente_agendamento' OR s.appointment_id IS NOT NULL OR c.status<>'em_andamento' OR s.scheduled_date IS NULL THEN RAISE EXCEPTION 'Somente sessão pendente, sem agendamento próprio e com data pode ser regularizada.' USING ERRCODE='23514'; END IF;
  SELECT other.* INTO kept FROM public.treatment_sessions other JOIN public.agendamentos a ON a.id=other.appointment_id
    WHERE other.cycle_id=c.id AND other.id<>s.id AND other.scheduled_date=s.scheduled_date
      AND other.status NOT IN ('cancelada','remarcada') AND a.status NOT IN ('cancelado','falta','remarcado')
      AND a.paciente_id=c.patient_id AND a.profissional_id=c.professional_id AND a.unidade_id=c.unit_id AND a.data=other.scheduled_date
    ORDER BY other.session_number LIMIT 1;
  IF NOT FOUND THEN
    -- Nenhuma sessão da data tem agendamento: a de menor número mantém a data; só as de número maior podem ser liberadas.
    IF EXISTS (SELECT 1 FROM public.treatment_sessions o WHERE o.cycle_id=c.id AND o.id<>s.id AND o.scheduled_date=s.scheduled_date AND o.status NOT IN ('cancelada','remarcada') AND o.appointment_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Há vínculo de agendamento a conferir nesta data antes de regularizar.' USING ERRCODE='23514';
    END IF;
    SELECT o.* INTO kept FROM public.treatment_sessions o
      WHERE o.cycle_id=c.id AND o.id<>s.id AND o.scheduled_date=s.scheduled_date AND o.status NOT IN ('cancelada','remarcada') AND o.session_number<s.session_number
      ORDER BY o.session_number LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Esta é a sessão que mantém a data. Libere a outra sessão duplicada.' USING ERRCODE='23514'; END IF;
  END IF;
  PERFORM set_config('app.treatment_change_reason',btrim(p_reason),true);
  UPDATE public.treatment_sessions SET scheduled_date=NULL,status='pendente_agendamento' WHERE id=s.id;
  message:=format('Data duplicada removida da sessão nº %s. O dia %s permanece com a sessão nº %s. Esta sessão aguarda uma nova data.',s.session_number,to_char(s.scheduled_date,'DD/MM/YYYY'),kept.session_number);
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
    VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'retirar_data_duplicada','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,
      jsonb_build_object('motivo_alteracao',btrim(p_reason),'ciclo',c.id,'sessao',s.id,'data_anterior',s.scheduled_date,'estado_anterior',s.status,'estado_novo','pendente_agendamento','valor_anterior',to_jsonb(s),'valor_novo',jsonb_build_object('scheduled_date',NULL,'status','pendente_agendamento','appointment_id',NULL),'sessao_protegida',kept.id,'agendamento_protegido',kept.appointment_id,'mensagem',message));
  RETURN jsonb_build_object('message',message,'session_id',s.id,'protected_session_id',kept.id);
END $function$;
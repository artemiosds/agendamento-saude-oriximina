CREATE OR REPLACE FUNCTION public.concluir_atendimento_master(p_agendamento_id text, p_user_id text, p_user_nome text, p_hora_termino text, p_procedimento text, p_cid text, p_obs text DEFAULT NULL::text, p_is_master boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prof_id text;
  v_prof_nome text;
  v_paciente_id text;
  v_paciente_nome text;
  v_status text;
  v_unidade text;
  v_iniciado_em timestamptz;
BEGIN
  SELECT profissional_id, profissional_nome, paciente_id, paciente_nome, status, unidade_id, iniciado_em
    INTO v_prof_id, v_prof_nome, v_paciente_id, v_paciente_nome, v_status, v_unidade, v_iniciado_em
    FROM public.agendamentos WHERE id = p_agendamento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'agendamento_nao_encontrado';
  END IF;
  IF v_status = 'concluido' THEN
    RAISE EXCEPTION 'ja_concluido';
  END IF;
  IF NOT p_is_master AND v_prof_id <> p_user_id THEN
    RAISE EXCEPTION 'nao_autorizado';
  END IF;

  UPDATE public.agendamentos
     SET status = 'concluido',
         concluido_em = now(),
         concluido_por_id = p_user_id,
         concluido_por_nome = p_user_nome,
         concluido_por_master = p_is_master AND (v_prof_id <> p_user_id),
         procedimento_concluido = NULLIF(p_procedimento,''),
         cid_concluido = NULLIF(p_cid,''),
         obs_conclusao = COALESCE(p_obs,''),
         iniciado_em = COALESCE(iniciado_em, now()),
         atualizado_em = now()
   WHERE id = p_agendamento_id;

  INSERT INTO public.notification_logs (canal, evento, payload, status, criado_em)
  VALUES ('sistema','atendimento_concluido_master',
    jsonb_build_object(
      'agendamento_id', p_agendamento_id,
      'paciente_id', v_paciente_id,
      'paciente_nome', v_paciente_nome,
      'profissional_executor_id', v_prof_id,
      'profissional_executor_nome', v_prof_nome,
      'concluido_por_id', p_user_id,
      'concluido_por_nome', p_user_nome,
      'concluido_por_master', (p_is_master AND (v_prof_id <> p_user_id)),
      'unidade_id', v_unidade,
      'hora_termino', p_hora_termino,
      'procedimento', COALESCE(p_procedimento,''),
      'cid', COALESCE(p_cid,''),
      'observacao', COALESCE(p_obs,'')
    ), 'pendente', now());

  RETURN jsonb_build_object('ok', true, 'agendamento_id', p_agendamento_id);
END;
$function$;
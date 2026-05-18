CREATE OR REPLACE FUNCTION public.concluir_atendimento_master(
  p_agendamento_id uuid,
  p_user_id uuid,
  p_user_nome text,
  p_hora_termino text,
  p_procedimento text,
  p_cid text,
  p_obs text,
  p_is_master boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof_id uuid;
  v_prof_nome text;
  v_paciente_id uuid;
  v_paciente_nome text;
  v_status text;
  v_unidade uuid;
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
         procedimento_concluido = NULLIF(p_procedimento, ''),
         cid_concluido = NULLIF(p_cid, ''),
         obs_conclusao = COALESCE(p_obs,''),
         iniciado_em = COALESCE(iniciado_em, now()),
         atualizado_em = now()
   WHERE id = p_agendamento_id;

  INSERT INTO public.notification_logs (
    canal, evento, destinatario, conteudo, status, unidade_id, paciente_id, criado_em
  ) VALUES (
    'sistema',
    'atendimento_concluido_master',
    COALESCE(v_prof_nome, ''),
    json_build_object(
      'agendamento_id', p_agendamento_id,
      'paciente', v_paciente_nome,
      'profissional', v_prof_nome,
      'concluido_por', p_user_nome,
      'master', p_is_master AND (v_prof_id <> p_user_id),
      'hora_termino', p_hora_termino,
      'procedimento', NULLIF(p_procedimento,''),
      'cid', NULLIF(p_cid,''),
      'obs', p_obs
    )::text,
    'registrado',
    v_unidade,
    v_paciente_id,
    now()
  );
END;
$$;

-- Adicionar colunas para controle de atendimentos pelo Master
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS iniciado_em timestamptz,
  ADD COLUMN IF NOT EXISTS concluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS concluido_por_id text,
  ADD COLUMN IF NOT EXISTS concluido_por_nome text,
  ADD COLUMN IF NOT EXISTS concluido_por_master boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS procedimento_concluido text,
  ADD COLUMN IF NOT EXISTS cid_concluido text,
  ADD COLUMN IF NOT EXISTS obs_conclusao text;

CREATE INDEX IF NOT EXISTS idx_agendamentos_em_atendimento_iniciado
  ON public.agendamentos (iniciado_em)
  WHERE status = 'em_atendimento';

-- Conclui o atendimento (silenciosamente) gravando dados obrigatórios para BPA/produção
CREATE OR REPLACE FUNCTION public.concluir_atendimento_master(
  p_agendamento_id text,
  p_user_id text,
  p_user_nome text,
  p_hora_termino text,
  p_procedimento text,
  p_cid text,
  p_obs text DEFAULT NULL,
  p_is_master boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF COALESCE(p_procedimento,'') = '' OR COALESCE(p_cid,'') = '' THEN
    RAISE EXCEPTION 'procedimento_e_cid_obrigatorios';
  END IF;

  UPDATE public.agendamentos
     SET status = 'concluido',
         concluido_em = now(),
         concluido_por_id = p_user_id,
         concluido_por_nome = p_user_nome,
         concluido_por_master = p_is_master AND (v_prof_id <> p_user_id),
         procedimento_concluido = p_procedimento,
         cid_concluido = p_cid,
         obs_conclusao = COALESCE(p_obs,''),
         iniciado_em = COALESCE(iniciado_em, now()),
         atualizado_em = now()
   WHERE id = p_agendamento_id;

  -- Log silencioso (não notifica profissional). Canal = 'sistema' apenas para auditoria.
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
      'procedimento', p_procedimento,
      'cid', p_cid,
      'observacao', COALESCE(p_obs,'')
    ), 'pendente', now());

  RETURN jsonb_build_object('ok', true, 'agendamento_id', p_agendamento_id);
END;
$$;

-- Lista atendimentos em aberto há X minutos
CREATE OR REPLACE FUNCTION public.get_atendimentos_pendentes_master(
  p_unidade_id text DEFAULT NULL,
  p_minutos int DEFAULT 60
)
RETURNS TABLE (
  id text,
  paciente_id text,
  paciente_nome text,
  profissional_id text,
  profissional_nome text,
  unidade_id text,
  data date,
  hora text,
  iniciado_em timestamptz,
  minutos_aberto int
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.paciente_id, a.paciente_nome, a.profissional_id, a.profissional_nome,
         a.unidade_id, a.data, a.hora, a.iniciado_em,
         EXTRACT(EPOCH FROM (now() - COALESCE(a.iniciado_em, (a.data::timestamp + a.hora::interval))))/60 ::int AS minutos_aberto
    FROM public.agendamentos a
   WHERE a.status = 'em_atendimento'
     AND (p_unidade_id IS NULL OR p_unidade_id = '' OR a.unidade_id = p_unidade_id)
     AND COALESCE(a.iniciado_em, (a.data::timestamp + a.hora::interval)) < now() - make_interval(mins => p_minutos)
   ORDER BY iniciado_em NULLS FIRST;
$$;

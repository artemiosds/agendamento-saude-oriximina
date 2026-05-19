
-- ============================================================
-- 1. PACIENTES — exceções administrativas
-- ============================================================
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS is_tfd boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS possui_ordem_judicial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_excecao_bloqueio text,
  ADD COLUMN IF NOT EXISTS observacao_tfd_ordem_judicial text,
  ADD COLUMN IF NOT EXISTS data_marcacao_excecao timestamptz,
  ADD COLUMN IF NOT EXISTS marcado_por uuid;

CREATE INDEX IF NOT EXISTS idx_pacientes_excecao_bloqueio
  ON public.pacientes (id)
  WHERE is_tfd = true OR possui_ordem_judicial = true;

-- ============================================================
-- 2. AGENDAMENTOS — tipo de falta + liberação
-- ============================================================
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS tipo_falta text,
  ADD COLUMN IF NOT EXISTS falta_justificativa text,
  ADD COLUMN IF NOT EXISTS falta_liberada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS liberada_em timestamptz,
  ADD COLUMN IF NOT EXISTS liberada_por uuid,
  ADD COLUMN IF NOT EXISTS motivo_liberacao text;

CREATE INDEX IF NOT EXISTS idx_agendamentos_paciente_falta
  ON public.agendamentos (paciente_id)
  WHERE status = 'falta';

-- ============================================================
-- 3. TREATMENT_SESSIONS — espelha estrutura
-- ============================================================
ALTER TABLE public.treatment_sessions
  ADD COLUMN IF NOT EXISTS tipo_falta text,
  ADD COLUMN IF NOT EXISTS falta_justificativa text,
  ADD COLUMN IF NOT EXISTS falta_liberada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS liberada_em timestamptz,
  ADD COLUMN IF NOT EXISTS liberada_por uuid,
  ADD COLUMN IF NOT EXISTS motivo_liberacao text;

-- ============================================================
-- 4. FUNÇÃO ATUALIZAR_STATUS_FALTA — reescrita
-- ============================================================
CREATE OR REPLACE FUNCTION public.atualizar_status_falta(p_paciente_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg jsonb;
  v_unidade text;
  v_limite_alerta int := 2;
  v_limite_bloqueio int := 4;
  v_canal_sistema boolean := true;
  v_canal_whatsapp boolean := false;
  v_total int := 0;
  v_faltas_ag int := 0;
  v_faltas_sess int := 0;
  v_novo_status text;
  v_paciente_nome text;
  v_profissional_id text;
  v_already_blocked boolean;
  v_is_tfd boolean;
  v_ordem_judicial boolean;
BEGIN
  SELECT configuracoes->'config_fluxo_faltas' INTO v_cfg
    FROM public.system_config WHERE id = 'default';

  IF v_cfg IS NOT NULL THEN
    v_limite_alerta   := COALESCE((v_cfg->>'limite_alerta')::int, v_limite_alerta);
    v_limite_bloqueio := COALESCE((v_cfg->>'limite_bloqueio')::int, v_limite_bloqueio);
    v_canal_sistema   := COALESCE((v_cfg->>'canal_sistema')::boolean, v_canal_sistema);
    v_canal_whatsapp  := COALESCE((v_cfg->>'canal_whatsapp')::boolean, v_canal_whatsapp);
  END IF;

  SELECT nome,
         COALESCE(is_tfd, false),
         COALESCE(possui_ordem_judicial, false)
    INTO v_paciente_nome, v_is_tfd, v_ordem_judicial
    FROM public.pacientes WHERE id = p_paciente_id;
  IF v_paciente_nome IS NULL THEN
    RETURN jsonb_build_object('error','paciente_nao_encontrado');
  END IF;

  -- Conta APENAS faltas injustificadas e não liberadas
  SELECT COUNT(*) INTO v_faltas_ag FROM public.agendamentos
    WHERE paciente_id = p_paciente_id
      AND status = 'falta'
      AND COALESCE(tipo_falta, 'injustificada') = 'injustificada'
      AND COALESCE(falta_liberada, false) = false;

  SELECT COUNT(*) INTO v_faltas_sess FROM public.treatment_sessions
    WHERE patient_id = p_paciente_id
      AND status IN ('falta','paciente_faltou')
      AND COALESCE(tipo_falta, 'injustificada') = 'injustificada'
      AND COALESCE(falta_liberada, false) = false;

  v_total := v_faltas_ag + v_faltas_sess;

  -- Exceção administrativa: nunca bloqueia
  IF v_is_tfd OR v_ordem_judicial THEN
    v_novo_status := 'REGULAR';
  ELSIF v_total >= v_limite_bloqueio THEN
    v_novo_status := 'BLOQUEADO';
  ELSIF v_total >= v_limite_alerta THEN
    v_novo_status := 'FALTOSO';
  ELSE
    v_novo_status := 'REGULAR';
  END IF;

  SELECT (status_falta = 'BLOQUEADO') INTO v_already_blocked
    FROM public.pacientes WHERE id = p_paciente_id;

  UPDATE public.pacientes
     SET total_faltas = v_total,
         status_falta = v_novo_status
   WHERE id = p_paciente_id;

  SELECT unidade_id, profissional_id
    INTO v_unidade, v_profissional_id
    FROM public.agendamentos
   WHERE paciente_id = p_paciente_id
   ORDER BY data DESC, hora DESC
   LIMIT 1;

  -- Se saiu de bloqueado (por liberação ou exceção), libera fila
  IF v_novo_status <> 'BLOQUEADO' AND COALESCE(v_already_blocked, false) THEN
    UPDATE public.fila_espera
       SET status = 'atendido',
           hora_chamada = COALESCE(hora_chamada, to_char(now(),'HH24:MI'))
     WHERE paciente_id = p_paciente_id
       AND origem_cadastro = 'BLOQUEIO_FALTA'
       AND status IN ('aguardando','chamado');
  END IF;

  IF v_novo_status = 'BLOQUEADO' AND NOT COALESCE(v_already_blocked, false) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.fila_espera
      WHERE paciente_id = p_paciente_id
        AND origem_cadastro = 'BLOQUEIO_FALTA'
        AND status IN ('aguardando','chamado')
    ) THEN
      INSERT INTO public.fila_espera (
        id, paciente_id, paciente_nome, unidade_id, profissional_id,
        prioridade, status, posicao, origem_cadastro, criado_por, criado_em
      ) VALUES (
        gen_random_uuid()::text,
        p_paciente_id, v_paciente_nome, COALESCE(v_unidade,''), COALESCE(v_profissional_id,''),
        'normal', 'aguardando',
        COALESCE((SELECT MAX(posicao)+1 FROM public.fila_espera WHERE unidade_id = COALESCE(v_unidade,'')), 1),
        'BLOQUEIO_FALTA', 'sistema', now()
      );
    END IF;

    INSERT INTO public.notification_logs (canal, evento, payload, status, criado_em)
    VALUES ('sistema','paciente_bloqueado',
      jsonb_build_object(
        'paciente_id', p_paciente_id,
        'paciente_nome', v_paciente_nome,
        'profissional_id', v_profissional_id,
        'unidade_id', v_unidade,
        'total_faltas', v_total,
        'limite', v_limite_bloqueio,
        'canal_whatsapp', v_canal_whatsapp,
        'mensagem', format('O paciente %s foi BLOQUEADO por excesso de faltas injustificadas e encaminhado para a lista de espera.', v_paciente_nome)
      ),'pendente', now());
  ELSIF v_novo_status = 'FALTOSO' THEN
    INSERT INTO public.notification_logs (canal, evento, payload, status, criado_em)
    VALUES ('sistema','paciente_faltoso',
      jsonb_build_object(
        'paciente_id', p_paciente_id,
        'paciente_nome', v_paciente_nome,
        'profissional_id', v_profissional_id,
        'unidade_id', v_unidade,
        'total_faltas', v_total,
        'limite', v_limite_alerta,
        'mensagem', format('O paciente %s atingiu %s faltas injustificadas e foi marcado como FALTOSO.', v_paciente_nome, v_total)
      ),'pendente', now());
  END IF;

  RETURN jsonb_build_object(
    'paciente_id', p_paciente_id,
    'total', v_total,
    'status', v_novo_status,
    'is_tfd', v_is_tfd,
    'ordem_judicial', v_ordem_judicial,
    'limite_alerta', v_limite_alerta,
    'limite_bloqueio', v_limite_bloqueio
  );
END;
$function$;

-- ============================================================
-- 5. FUNÇÃO LIBERAR_FALTA
-- ============================================================
CREATE OR REPLACE FUNCTION public.liberar_falta(
  p_paciente_id text,
  p_agendamento_id text DEFAULT NULL,
  p_session_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_user_nome text DEFAULT NULL,
  p_all boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int := 0;
  v_paciente_nome text;
  v_status jsonb;
BEGIN
  IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN
    RAISE EXCEPTION 'motivo_obrigatorio';
  END IF;

  SELECT nome INTO v_paciente_nome FROM public.pacientes WHERE id = p_paciente_id;
  IF v_paciente_nome IS NULL THEN
    RAISE EXCEPTION 'paciente_nao_encontrado';
  END IF;

  IF p_all THEN
    UPDATE public.agendamentos
       SET falta_liberada = true,
           liberada_em = now(),
           liberada_por = p_user_id,
           motivo_liberacao = p_motivo
     WHERE paciente_id = p_paciente_id
       AND status = 'falta'
       AND COALESCE(tipo_falta,'injustificada') = 'injustificada'
       AND COALESCE(falta_liberada,false) = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE public.treatment_sessions
       SET falta_liberada = true,
           liberada_em = now(),
           liberada_por = p_user_id,
           motivo_liberacao = p_motivo
     WHERE patient_id = p_paciente_id
       AND status IN ('falta','paciente_faltou')
       AND COALESCE(tipo_falta,'injustificada') = 'injustificada'
       AND COALESCE(falta_liberada,false) = false;
  ELSIF p_agendamento_id IS NOT NULL THEN
    UPDATE public.agendamentos
       SET falta_liberada = true,
           liberada_em = now(),
           liberada_por = p_user_id,
           motivo_liberacao = p_motivo
     WHERE id = p_agendamento_id AND status = 'falta';
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_session_id IS NOT NULL THEN
    UPDATE public.treatment_sessions
       SET falta_liberada = true,
           liberada_em = now(),
           liberada_por = p_user_id,
           motivo_liberacao = p_motivo
     WHERE id = p_session_id AND status IN ('falta','paciente_faltou');
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    -- Libera somente a última falta injustificada do paciente
    UPDATE public.agendamentos a
       SET falta_liberada = true,
           liberada_em = now(),
           liberada_por = p_user_id,
           motivo_liberacao = p_motivo
     WHERE a.id = (
       SELECT id FROM public.agendamentos
        WHERE paciente_id = p_paciente_id
          AND status = 'falta'
          AND COALESCE(tipo_falta,'injustificada') = 'injustificada'
          AND COALESCE(falta_liberada,false) = false
        ORDER BY data DESC, hora DESC
        LIMIT 1
     );
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  INSERT INTO public.notification_logs (canal, evento, payload, status, criado_em)
  VALUES ('sistema','falta_liberada',
    jsonb_build_object(
      'paciente_id', p_paciente_id,
      'paciente_nome', v_paciente_nome,
      'agendamento_id', p_agendamento_id,
      'session_id', p_session_id,
      'liberadas', v_count,
      'liberar_todas', p_all,
      'motivo', p_motivo,
      'liberado_por_id', p_user_id,
      'liberado_por_nome', p_user_nome,
      'mensagem', format('%s liberou %s falta(s) do paciente %s. Motivo: %s',
        COALESCE(p_user_nome,'(usuário)'), v_count, v_paciente_nome, p_motivo)
    ),'pendente', now());

  v_status := public.atualizar_status_falta(p_paciente_id);

  RETURN jsonb_build_object('ok', true, 'liberadas', v_count, 'status', v_status);
END;
$$;

-- ============================================================
-- 6. FUNÇÃO SET_EXCECAO_BLOQUEIO
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_excecao_bloqueio(
  p_paciente_id text,
  p_is_tfd boolean,
  p_ordem_judicial boolean,
  p_motivo text DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_user_nome text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_tfd boolean;
  v_old_oj boolean;
  v_paciente_nome text;
  v_status jsonb;
BEGIN
  SELECT nome, COALESCE(is_tfd,false), COALESCE(possui_ordem_judicial,false)
    INTO v_paciente_nome, v_old_tfd, v_old_oj
    FROM public.pacientes WHERE id = p_paciente_id;
  IF v_paciente_nome IS NULL THEN
    RAISE EXCEPTION 'paciente_nao_encontrado';
  END IF;

  IF (p_is_tfd OR p_ordem_judicial) AND (p_motivo IS NULL OR length(trim(p_motivo)) = 0) THEN
    RAISE EXCEPTION 'motivo_obrigatorio';
  END IF;

  UPDATE public.pacientes
     SET is_tfd = COALESCE(p_is_tfd, false),
         possui_ordem_judicial = COALESCE(p_ordem_judicial, false),
         motivo_excecao_bloqueio = CASE WHEN p_is_tfd OR p_ordem_judicial THEN p_motivo ELSE NULL END,
         observacao_tfd_ordem_judicial = p_observacao,
         data_marcacao_excecao = CASE WHEN p_is_tfd OR p_ordem_judicial THEN now() ELSE NULL END,
         marcado_por = CASE WHEN p_is_tfd OR p_ordem_judicial THEN p_user_id ELSE NULL END
   WHERE id = p_paciente_id;

  -- Auditoria por flag alterada
  IF v_old_tfd IS DISTINCT FROM COALESCE(p_is_tfd,false) THEN
    INSERT INTO public.notification_logs (canal, evento, payload, status, criado_em)
    VALUES ('sistema',
      CASE WHEN p_is_tfd THEN 'paciente_tfd_marcado' ELSE 'paciente_tfd_desmarcado' END,
      jsonb_build_object(
        'paciente_id', p_paciente_id,
        'paciente_nome', v_paciente_nome,
        'valor_anterior', v_old_tfd,
        'valor_novo', COALESCE(p_is_tfd,false),
        'motivo', p_motivo,
        'observacao', p_observacao,
        'usuario_id', p_user_id,
        'usuario_nome', p_user_nome,
        'mensagem', format('%s %s o paciente %s como TFD.',
          COALESCE(p_user_nome,'(usuário)'),
          CASE WHEN p_is_tfd THEN 'marcou' ELSE 'desmarcou' END,
          v_paciente_nome)
      ),'pendente', now());
  END IF;

  IF v_old_oj IS DISTINCT FROM COALESCE(p_ordem_judicial,false) THEN
    INSERT INTO public.notification_logs (canal, evento, payload, status, criado_em)
    VALUES ('sistema',
      CASE WHEN p_ordem_judicial THEN 'paciente_ordem_judicial_marcado' ELSE 'paciente_ordem_judicial_desmarcado' END,
      jsonb_build_object(
        'paciente_id', p_paciente_id,
        'paciente_nome', v_paciente_nome,
        'valor_anterior', v_old_oj,
        'valor_novo', COALESCE(p_ordem_judicial,false),
        'motivo', p_motivo,
        'observacao', p_observacao,
        'usuario_id', p_user_id,
        'usuario_nome', p_user_nome,
        'mensagem', format('%s %s o paciente %s como Ordem Judicial.',
          COALESCE(p_user_nome,'(usuário)'),
          CASE WHEN p_ordem_judicial THEN 'marcou' ELSE 'desmarcou' END,
          v_paciente_nome)
      ),'pendente', now());
  END IF;

  v_status := public.atualizar_status_falta(p_paciente_id);
  RETURN jsonb_build_object('ok', true, 'status', v_status);
END;
$$;

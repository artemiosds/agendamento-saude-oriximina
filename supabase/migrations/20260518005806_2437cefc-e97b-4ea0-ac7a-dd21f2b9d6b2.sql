
-- Colunas de controle de faltas em pacientes
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS total_faltas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS faltas_consecutivas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_falta text NOT NULL DEFAULT 'REGULAR';

CREATE INDEX IF NOT EXISTS idx_pacientes_status_falta ON public.pacientes (status_falta);

-- Função: atualizar status do paciente com base nas faltas
CREATE OR REPLACE FUNCTION public.atualizar_status_falta(p_paciente_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  -- Pega configuração global do system_config
  SELECT configuracoes->'config_fluxo_faltas' INTO v_cfg
  FROM public.system_config WHERE id = 'default';

  IF v_cfg IS NOT NULL THEN
    v_limite_alerta   := COALESCE((v_cfg->>'limite_alerta')::int, v_limite_alerta);
    v_limite_bloqueio := COALESCE((v_cfg->>'limite_bloqueio')::int, v_limite_bloqueio);
    v_canal_sistema   := COALESCE((v_cfg->>'canal_sistema')::boolean, v_canal_sistema);
    v_canal_whatsapp  := COALESCE((v_cfg->>'canal_whatsapp')::boolean, v_canal_whatsapp);
  END IF;

  SELECT nome INTO v_paciente_nome FROM public.pacientes WHERE id = p_paciente_id;
  IF v_paciente_nome IS NULL THEN
    RETURN jsonb_build_object('error','paciente_nao_encontrado');
  END IF;

  -- Conta faltas
  SELECT COUNT(*) INTO v_faltas_ag FROM public.agendamentos
    WHERE paciente_id = p_paciente_id AND status = 'falta';

  SELECT COUNT(*) INTO v_faltas_sess FROM public.treatment_sessions
    WHERE patient_id = p_paciente_id AND status IN ('falta','paciente_faltou');

  v_total := v_faltas_ag + v_faltas_sess;

  IF v_total >= v_limite_bloqueio THEN
    v_novo_status := 'BLOQUEADO';
  ELSIF v_total >= v_limite_alerta THEN
    v_novo_status := 'FALTOSO';
  ELSE
    v_novo_status := 'REGULAR';
  END IF;

  -- Verifica se já estava bloqueado para evitar duplicar fila
  SELECT (status_falta = 'BLOQUEADO') INTO v_already_blocked
    FROM public.pacientes WHERE id = p_paciente_id;

  UPDATE public.pacientes
     SET total_faltas = v_total,
         status_falta = v_novo_status
   WHERE id = p_paciente_id;

  -- Pega último profissional/unidade do paciente para vincular notificações e fila
  SELECT unidade_id, profissional_id
    INTO v_unidade, v_profissional_id
    FROM public.agendamentos
   WHERE paciente_id = p_paciente_id
   ORDER BY data DESC, hora DESC
   LIMIT 1;

  -- Bloqueio: insere na fila se ainda não estiver
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
        'mensagem', format('O paciente %s foi BLOQUEADO por excesso de faltas e encaminhado para a lista de espera.', v_paciente_nome)
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
        'mensagem', format('O paciente %s atingiu %s faltas e foi marcado como FALTOSO.', v_paciente_nome, v_total)
      ),'pendente', now());
  END IF;

  RETURN jsonb_build_object(
    'paciente_id', p_paciente_id,
    'total', v_total,
    'status', v_novo_status,
    'limite_alerta', v_limite_alerta,
    'limite_bloqueio', v_limite_bloqueio
  );
END;
$$;

-- Função: resetar faltas (sem audit)
CREATE OR REPLACE FUNCTION public.resetar_faltas_paciente(p_paciente_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pacientes
     SET total_faltas = 0,
         faltas_consecutivas = 0,
         status_falta = 'REGULAR'
   WHERE id = p_paciente_id;

  UPDATE public.fila_espera
     SET status = 'atendido',
         hora_chamada = COALESCE(hora_chamada, to_char(now(),'HH24:MI'))
   WHERE paciente_id = p_paciente_id
     AND origem_cadastro = 'BLOQUEIO_FALTA'
     AND status IN ('aguardando','chamado');
END;
$$;

-- Função: desbloquear com log
CREATE OR REPLACE FUNCTION public.desbloquear_paciente_faltas(p_paciente_id text, p_user_id uuid DEFAULT NULL, p_user_nome text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text;
BEGIN
  SELECT nome INTO v_nome FROM public.pacientes WHERE id = p_paciente_id;
  PERFORM public.resetar_faltas_paciente(p_paciente_id);

  INSERT INTO public.notification_logs (canal, evento, payload, status, criado_em)
  VALUES ('sistema','paciente_desbloqueado',
    jsonb_build_object(
      'paciente_id', p_paciente_id,
      'paciente_nome', v_nome,
      'desbloqueado_por_id', p_user_id,
      'desbloqueado_por_nome', p_user_nome,
      'mensagem', format('Paciente %s desbloqueado manualmente por %s', COALESCE(v_nome,'(sem nome)'), COALESCE(p_user_nome,'(usuário)'))
    ),'pendente', now());
END;
$$;

-- Backfill: recomputa para todos pacientes que têm alguma falta
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT pid FROM (
      SELECT paciente_id::text AS pid FROM public.agendamentos WHERE status='falta' AND paciente_id IS NOT NULL
      UNION
      SELECT patient_id::text FROM public.treatment_sessions WHERE status IN ('falta','paciente_faltou') AND patient_id IS NOT NULL
    ) x
  LOOP
    PERFORM public.atualizar_status_falta(r.pid);
  END LOOP;
END $$;

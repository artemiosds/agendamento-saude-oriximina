-- Tabela para armazenar o status de faltas por vínculo (Paciente + Profissional)
CREATE TABLE IF NOT EXISTS public.paciente_profissional_status (
    paciente_id TEXT NOT NULL,
    profissional_id TEXT NOT NULL,
    total_faltas INTEGER DEFAULT 0,
    status_falta TEXT DEFAULT 'REGULAR', -- 'REGULAR', 'FALTOSO', 'BLOQUEADO'
    ultima_falta DATE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (paciente_id, profissional_id)
);

-- Habilitar RLS
ALTER TABLE public.paciente_profissional_status ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS simples (acesso total para autenticados, seguindo padrão do projeto)
CREATE POLICY "Acesso total para autenticados" ON public.paciente_profissional_status
    FOR ALL USING (auth.role() = 'authenticated');

-- Função refatorada para calcular status por profissional
CREATE OR REPLACE FUNCTION public.atualizar_status_falta(
    p_paciente_id text,
    p_profissional_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cfg jsonb;
  v_limite_alerta int := 2;
  v_limite_bloqueio int := 4;
  v_is_tfd boolean;
  v_ordem_judicial boolean;
  v_paciente_nome text;
  
  -- Cursores para iterar sobre profissionais se p_profissional_id for NULL
  curr_prof RECORD;
  
  -- Variáveis de contagem
  v_faltas_ag int := 0;
  v_faltas_sess int := 0;
  v_total int := 0;
  v_novo_status text;
  v_ultima_falta date;
  
  v_res jsonb := '[]'::jsonb;
BEGIN
  -- 1. Carregar configurações
  SELECT configuracoes->'config_fluxo_faltas' INTO v_cfg
    FROM public.system_config WHERE id = 'default';

  IF v_cfg IS NOT NULL THEN
    v_limite_alerta   := COALESCE((v_cfg->>'limite_alerta')::int, v_limite_alerta);
    v_limite_bloqueio := COALESCE((v_cfg->>'limite_bloqueio')::int, v_limite_bloqueio);
  END IF;

  -- 2. Verificar isenção global do paciente
  SELECT nome, COALESCE(is_tfd, false), COALESCE(possui_ordem_judicial, false)
    INTO v_paciente_nome, v_is_tfd, v_ordem_judicial
    FROM public.pacientes WHERE id = p_paciente_id;
    
  IF v_paciente_nome IS NULL THEN
    RETURN jsonb_build_object('error','paciente_nao_encontrado');
  END IF;

  -- 3. Se um profissional específico foi passado, atualiza apenas ele.
  --    Caso contrário, busca todos os profissionais com quem o paciente tem faltas.
  FOR curr_prof IN 
    SELECT DISTINCT profissional_id FROM (
      SELECT profissional_id FROM public.agendamentos WHERE paciente_id = p_paciente_id AND status = 'falta'
      UNION
      SELECT professional_id FROM public.treatment_sessions WHERE patient_id = p_paciente_id AND status IN ('falta','paciente_faltou')
      UNION 
      SELECT p_profissional_id WHERE p_profissional_id IS NOT NULL
    ) t WHERE profissional_id IS NOT NULL
  LOOP
    -- Se p_profissional_id foi passado, ignora os outros no loop
    IF p_profissional_id IS NOT NULL AND curr_prof.profissional_id <> p_profissional_id THEN
      CONTINUE;
    END IF;

    -- Contagem por profissional
    SELECT COUNT(*), MAX(data) INTO v_faltas_ag, v_ultima_falta 
      FROM public.agendamentos
     WHERE paciente_id = p_paciente_id
       AND profissional_id = curr_prof.profissional_id
       AND status = 'falta'
       AND COALESCE(tipo_falta, 'injustificada') = 'injustificada'
       AND COALESCE(falta_liberada, false) = false;

    SELECT COUNT(*), MAX(scheduled_date::date) INTO v_faltas_sess, v_ultima_falta
      FROM public.treatment_sessions
     WHERE patient_id = p_paciente_id
       AND professional_id = curr_prof.profissional_id
       AND status IN ('falta','paciente_faltou')
       AND COALESCE(tipo_falta, 'injustificada') = 'injustificada'
       AND COALESCE(falta_liberada, false) = false;

    v_total := v_faltas_ag + v_faltas_sess;

    -- Lógica de status (respeita isenção global)
    IF v_is_tfd OR v_ordem_judicial THEN
      v_novo_status := 'REGULAR';
    ELSIF v_total >= v_limite_bloqueio THEN
      v_novo_status := 'BLOQUEADO';
    ELSIF v_total >= v_limite_alerta THEN
      v_novo_status := 'FALTOSO';
    ELSE
      v_novo_status := 'REGULAR';
    END IF;

    -- Upsert na tabela de status por profissional
    INSERT INTO public.paciente_profissional_status (
      paciente_id, profissional_id, total_faltas, status_falta, ultima_falta, updated_at
    ) VALUES (
      p_paciente_id, curr_prof.profissional_id, v_total, v_novo_status, v_ultima_falta, now()
    ) ON CONFLICT (paciente_id, profissional_id) DO UPDATE SET
      total_faltas = EXCLUDED.total_faltas,
      status_falta = EXCLUDED.status_falta,
      ultima_falta = EXCLUDED.ultima_falta,
      updated_at = now();

    v_res := v_res || jsonb_build_object(
      'profissional_id', curr_prof.profissional_id,
      'total', v_total,
      'status', v_novo_status
    );
  END LOOP;

  -- 4. Atualizar também o status global no cadastro do paciente (opcional, mas bom para compatibilidade)
  --    O status global será o "pior" status entre os profissionais, ou REGULAR se isento.
  IF v_is_tfd OR v_ordem_judicial THEN
      v_novo_status := 'REGULAR';
  ELSE
      SELECT COALESCE(MAX(CASE 
          WHEN status_falta = 'BLOQUEADO' THEN 3 
          WHEN status_falta = 'FALTOSO' THEN 2 
          ELSE 1 END), 1) INTO v_total
      FROM public.paciente_profissional_status
      WHERE paciente_id = p_paciente_id;
      
      v_novo_status := CASE WHEN v_total = 3 THEN 'BLOQUEADO' WHEN v_total = 2 THEN 'FALTOSO' ELSE 'REGULAR' END;
  END IF;

  UPDATE public.pacientes 
     SET status_falta = v_novo_status,
         total_faltas = (SELECT COALESCE(SUM(total_faltas), 0) FROM public.paciente_profissional_status WHERE paciente_id = p_paciente_id)
   WHERE id = p_paciente_id;

  RETURN jsonb_build_object('ok', true, 'viculos', v_res, 'status_global', v_novo_status);
END;
$$;

-- Refatorar liberar_falta para suportar profissional_id
CREATE OR REPLACE FUNCTION public.liberar_falta(
    p_paciente_id text, 
    p_agendamento_id text DEFAULT NULL, 
    p_session_id uuid DEFAULT NULL, 
    p_motivo text DEFAULT NULL, 
    p_user_id uuid DEFAULT NULL, 
    p_user_nome text DEFAULT NULL, 
    p_all boolean DEFAULT false,
    p_profissional_id text DEFAULT NULL
)
 RETURNS jsonb
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
    -- Se passou profissional, libera apenas dele. Senão libera tudo (Master).
    UPDATE public.agendamentos
       SET falta_liberada = true,
           liberada_em = now(),
           liberada_por = p_user_id,
           motivo_liberacao = p_motivo
     WHERE paciente_id = p_paciente_id
       AND (p_profissional_id IS NULL OR profissional_id = p_profissional_id)
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
       AND (p_profissional_id IS NULL OR professional_id = p_profissional_id)
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
    -- Libera somente a última falta injustificada do paciente NO CONTEXTO do profissional (se informado)
    UPDATE public.agendamentos a
       SET falta_liberada = true,
           liberada_em = now(),
           liberada_por = p_user_id,
           motivo_liberacao = p_motivo
     WHERE a.id = (
       SELECT id FROM public.agendamentos
        WHERE paciente_id = p_paciente_id
          AND (p_profissional_id IS NULL OR profissional_id = p_profissional_id)
          AND status = 'falta'
          AND COALESCE(tipo_falta,'injustificada') = 'injustificada'
          AND COALESCE(falta_liberada,false) = false
        ORDER BY data DESC, hora DESC
        LIMIT 1
     );
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  -- Log de auditoria
  INSERT INTO public.notification_logs (canal, evento, payload, status, criado_em)
  VALUES ('sistema','falta_liberada',
    jsonb_build_object(
      'paciente_id', p_paciente_id,
      'profissional_id', p_profissional_id,
      'liberadas', v_count,
      'motivo', p_motivo,
      'liberado_por_nome', p_user_nome
    ),'pendente', now());

  -- Recalcula status
  v_status := public.atualizar_status_falta(p_paciente_id, p_profissional_id);

  RETURN jsonb_build_object('ok', true, 'liberadas', v_count, 'status', v_status);
END;
$$;

-- Trigger para automatizar o recálculo ao mudar status para 'falta'
CREATE OR REPLACE FUNCTION public.trg_atualizar_falta_after_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        -- Agendamentos
        IF TG_TABLE_NAME = 'agendamentos' THEN
            IF NEW.status = 'falta' OR OLD.status = 'falta' THEN
                PERFORM public.atualizar_status_falta(NEW.paciente_id, NEW.profissional_id);
            END IF;
        -- Sessões de Tratamento
        ELSIF TG_TABLE_NAME = 'treatment_sessions' THEN
            IF NEW.status IN ('falta','paciente_faltou') OR OLD.status IN ('falta','paciente_faltou') THEN
                PERFORM public.atualizar_status_falta(NEW.patient_id, NEW.professional_id);
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar triggers
DROP TRIGGER IF EXISTS trg_ag_falta_change ON public.agendamentos;
CREATE TRIGGER trg_ag_falta_change
AFTER INSERT OR UPDATE ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.trg_atualizar_falta_after_change();

DROP TRIGGER IF EXISTS trg_sess_falta_change ON public.treatment_sessions;
CREATE TRIGGER trg_sess_falta_change
AFTER INSERT OR UPDATE ON public.treatment_sessions
FOR EACH ROW EXECUTE FUNCTION public.trg_atualizar_falta_after_change();

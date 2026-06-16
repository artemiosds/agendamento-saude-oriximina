
-- ============================================================
-- FASE 1: Hardening do módulo WhatsApp Business (com cleanup)
-- ============================================================

-- 0) Limpeza prévia: cancela duplicatas históricas em whatsapp_queue
--    Mantém apenas a linha mais recente por (paciente_id, agendamento_id, evento) entre status ativos.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY paciente_id, agendamento_id, evento
           ORDER BY criado_em DESC, id DESC
         ) AS rn
    FROM public.whatsapp_queue
   WHERE status IN ('pendente','processando','enviado')
)
UPDATE public.whatsapp_queue q
   SET status = 'cancelado',
       motivo_bloqueio = COALESCE(NULLIF(q.motivo_bloqueio,''),'') || ' [auto-dedup migration]'
  FROM ranked r
 WHERE q.id = r.id AND r.rn > 1;

-- 1) ALTER whatsapp_templates
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS nome_interno text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'utility',
  ADD COLUMN IF NOT EXISTS evento text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'rascunho',
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'evolution',
  ADD COLUMN IF NOT EXISTS provider_template_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS idioma text NOT NULL DEFAULT 'pt_BR',
  ADD COLUMN IF NOT EXISTS variaveis_permitidas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS permite_envio_fora_24h boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_categoria_check;
  ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_categoria_check
    CHECK (categoria IN ('utility','service','authentication','marketing'));
  ALTER TABLE public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_status_check;
  ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_status_check
    CHECK (status IN ('rascunho','pendente_aprovacao','aprovado','rejeitado','inativo'));
END $$;

-- 2) ALTER whatsapp_queue
ALTER TABLE public.whatsapp_queue
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS provider_message_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS error_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.whatsapp_queue DROP CONSTRAINT IF EXISTS whatsapp_queue_status_check;
  ALTER TABLE public.whatsapp_queue ADD CONSTRAINT whatsapp_queue_status_check
    CHECK (status IN ('pendente','processando','enviado','entregue','lido','erro','bloqueado','cancelado','ignorado'));
END $$;

-- Índice único parcial anti-duplicidade
CREATE UNIQUE INDEX IF NOT EXISTS uniq_whatsapp_queue_dedup
  ON public.whatsapp_queue (paciente_id, agendamento_id, evento)
  WHERE status IN ('pendente','processando','enviado','entregue','lido');

CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_priority
  ON public.whatsapp_queue (priority DESC, agendado_para ASC)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_provider_msg
  ON public.whatsapp_queue (provider_message_id) WHERE provider_message_id <> '';

-- 3) ALTER whatsapp_event_config
ALTER TABLE public.whatsapp_event_config
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS antecedencia_minutos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impedir_duplicidade boolean NOT NULL DEFAULT true;

-- 4) NOVA: whatsapp_conversations (janela 24h e opt-out por telefone)
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  phone text PRIMARY KEY,
  paciente_id text NOT NULL DEFAULT '',
  last_patient_message_at timestamptz,
  last_outbound_at timestamptz,
  opted_out boolean NOT NULL DEFAULT false,
  opted_out_at timestamptz,
  opted_out_reason text NOT NULL DEFAULT '',
  human_handoff boolean NOT NULL DEFAULT false,
  human_handoff_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_conversations TO authenticated;
GRANT ALL ON public.whatsapp_conversations TO service_role;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read whatsapp_conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Staff manage whatsapp_conversations" ON public.whatsapp_conversations;
CREATE POLICY "Staff read whatsapp_conversations" ON public.whatsapp_conversations
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff manage whatsapp_conversations" ON public.whatsapp_conversations
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());
DROP TRIGGER IF EXISTS trg_whatsapp_conversations_updated ON public.whatsapp_conversations;
CREATE TRIGGER trg_whatsapp_conversations_updated
  BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();
CREATE INDEX IF NOT EXISTS idx_whatsapp_conv_paciente ON public.whatsapp_conversations(paciente_id);

CREATE OR REPLACE FUNCTION public.is_whatsapp_24h_window_open(p_phone text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_conversations
    WHERE phone = p_phone
      AND last_patient_message_at IS NOT NULL
      AND last_patient_message_at >= now() - interval '24 hours'
      AND COALESCE(opted_out,false) = false
  );
$$;

-- 5) NOVA: whatsapp_inbound_messages
CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  paciente_id text NOT NULL DEFAULT '',
  paciente_nome text NOT NULL DEFAULT '',
  agendamento_id text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  intent text NOT NULL DEFAULT 'livre',
  provider text NOT NULL DEFAULT 'evolution',
  provider_message_id text NOT NULL DEFAULT '',
  recebido_em timestamptz NOT NULL DEFAULT now(),
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_inbound_messages TO authenticated;
GRANT ALL ON public.whatsapp_inbound_messages TO service_role;
ALTER TABLE public.whatsapp_inbound_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read whatsapp_inbound" ON public.whatsapp_inbound_messages;
DROP POLICY IF EXISTS "Staff manage whatsapp_inbound" ON public.whatsapp_inbound_messages;
CREATE POLICY "Staff read whatsapp_inbound" ON public.whatsapp_inbound_messages
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff manage whatsapp_inbound" ON public.whatsapp_inbound_messages
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());
CREATE INDEX IF NOT EXISTS idx_wa_inbound_phone ON public.whatsapp_inbound_messages(phone, recebido_em DESC);
CREATE INDEX IF NOT EXISTS idx_wa_inbound_pending ON public.whatsapp_inbound_messages(processed, recebido_em) WHERE processed = false;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_inbound_messages DROP CONSTRAINT IF EXISTS whatsapp_inbound_intent_check;
  ALTER TABLE public.whatsapp_inbound_messages ADD CONSTRAINT whatsapp_inbound_intent_check
    CHECK (intent IN ('confirmar','remarcar','atendente','sair','livre'));
END $$;

-- 6) NOVA: whatsapp_health_snapshots
CREATE TABLE IF NOT EXISTS public.whatsapp_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  provider text NOT NULL DEFAULT 'evolution',
  unidade_id text NOT NULL DEFAULT '',
  enviadas integer NOT NULL DEFAULT 0,
  entregues integer NOT NULL DEFAULT 0,
  lidas integer NOT NULL DEFAULT 0,
  falhas integer NOT NULL DEFAULT 0,
  respostas integer NOT NULL DEFAULT 0,
  rejeicoes_template integer NOT NULL DEFAULT 0,
  pendentes integer NOT NULL DEFAULT 0,
  pausadas integer NOT NULL DEFAULT 0,
  taxa_erro numeric(5,2) NOT NULL DEFAULT 0,
  taxa_resposta numeric(5,2) NOT NULL DEFAULT 0,
  taxa_confirmacao numeric(5,2) NOT NULL DEFAULT 0,
  status_conexao text NOT NULL DEFAULT 'desconhecido',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_health_snapshots TO authenticated;
GRANT ALL ON public.whatsapp_health_snapshots TO service_role;
ALTER TABLE public.whatsapp_health_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read whatsapp_health" ON public.whatsapp_health_snapshots;
DROP POLICY IF EXISTS "Master manage whatsapp_health" ON public.whatsapp_health_snapshots;
CREATE POLICY "Staff read whatsapp_health" ON public.whatsapp_health_snapshots
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Master manage whatsapp_health" ON public.whatsapp_health_snapshots
  FOR ALL TO authenticated USING (has_staff_role('master')) WITH CHECK (has_staff_role('master'));
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wa_health_day ON public.whatsapp_health_snapshots(snapshot_date, provider, unidade_id);

-- 7) Circuit breaker
ALTER TABLE public.whatsapp_connection_status
  ADD COLUMN IF NOT EXISTS fila_pausada_ate timestamptz,
  ADD COLUMN IF NOT EXISTS fila_pausada_motivo text NOT NULL DEFAULT '';

-- 8) Função enqueue
CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_message(
  p_paciente_id text,
  p_paciente_nome text,
  p_telefone text,
  p_evento text,
  p_template_id uuid,
  p_payload jsonb,
  p_agendamento_id text DEFAULT '',
  p_unidade_id text DEFAULT '',
  p_priority integer DEFAULT 50,
  p_agendado_para timestamptz DEFAULT now(),
  p_provider text DEFAULT 'evolution'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_opted_out boolean := false;
  v_tpl record;
  v_window_open boolean;
  v_mensagem text := '';
BEGIN
  -- Regra 1: opt-out
  SELECT COALESCE(opted_out,false) INTO v_opted_out
    FROM public.whatsapp_conversations WHERE phone = p_telefone;
  IF v_opted_out THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'opted_out', 'status', 'ignorado');
  END IF;

  -- Regra 2: template aprovado
  IF p_template_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'template_required');
  END IF;
  SELECT * INTO v_tpl FROM public.whatsapp_templates WHERE id = p_template_id;
  IF v_tpl IS NULL OR v_tpl.ativo = false OR v_tpl.status <> 'aprovado' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'template_not_approved');
  END IF;

  -- Regra 3: janela 24h
  v_window_open := public.is_whatsapp_24h_window_open(p_telefone);
  IF NOT v_window_open AND COALESCE(v_tpl.permite_envio_fora_24h,false) = false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'outside_24h_window_and_template_not_allowed', 'status', 'bloqueado');
  END IF;

  v_mensagem := COALESCE(v_tpl.mensagem, '');

  -- Regra 4: anti-duplicidade (via índice único parcial)
  INSERT INTO public.whatsapp_queue (
    paciente_id, paciente_nome, telefone, evento, mensagem, prioridade, agendado_para,
    status, unidade_id, agendamento_id, metadados, provider, category,
    template_id, payload_json, priority
  ) VALUES (
    COALESCE(p_paciente_id,''), COALESCE(p_paciente_nome,''), p_telefone, p_evento, v_mensagem,
    CASE WHEN p_priority >= 80 THEN 'alta' WHEN p_priority >= 40 THEN 'media' ELSE 'baixa' END,
    p_agendado_para, 'pendente', COALESCE(p_unidade_id,''), COALESCE(p_agendamento_id,''),
    '{}'::jsonb, p_provider, COALESCE(v_tpl.categoria,'utility'),
    p_template_id, COALESCE(p_payload,'{}'::jsonb), p_priority
  )
  ON CONFLICT ON CONSTRAINT uniq_whatsapp_queue_dedup DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate');
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- 9) Função register_whatsapp_inbound
CREATE OR REPLACE FUNCTION public.register_whatsapp_inbound(
  p_phone text,
  p_body text,
  p_provider text DEFAULT 'evolution',
  p_provider_message_id text DEFAULT '',
  p_raw jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_norm text := upper(btrim(COALESCE(p_body,'')));
  v_intent text := 'livre';
  v_id uuid;
  v_paciente_id text := '';
  v_paciente_nome text := '';
BEGIN
  SELECT id, nome INTO v_paciente_id, v_paciente_nome
    FROM public.pacientes
    WHERE regexp_replace(COALESCE(telefone,''), '\D','','g') = regexp_replace(p_phone,'\D','','g')
    LIMIT 1;

  IF v_norm IN ('1','CONFIRMAR','CONFIRMO','SIM') THEN v_intent := 'confirmar';
  ELSIF v_norm IN ('2','REMARCAR','REMARCACAO','REMARCAÇÃO') THEN v_intent := 'remarcar';
  ELSIF v_norm IN ('3','ATENDENTE','RECEPCAO','RECEPÇÃO','FALAR') THEN v_intent := 'atendente';
  ELSIF v_norm IN ('SAIR','PARAR','CANCELAR','STOP','UNSUBSCRIBE') THEN v_intent := 'sair';
  END IF;

  INSERT INTO public.whatsapp_conversations (phone, paciente_id, last_patient_message_at, human_handoff, human_handoff_at)
  VALUES (p_phone, COALESCE(v_paciente_id,''), now(),
          (v_intent IN ('atendente','livre')), CASE WHEN v_intent IN ('atendente','livre') THEN now() END)
  ON CONFLICT (phone) DO UPDATE SET
    last_patient_message_at = EXCLUDED.last_patient_message_at,
    paciente_id = CASE WHEN EXCLUDED.paciente_id <> '' THEN EXCLUDED.paciente_id ELSE whatsapp_conversations.paciente_id END,
    human_handoff = whatsapp_conversations.human_handoff OR EXCLUDED.human_handoff,
    human_handoff_at = COALESCE(whatsapp_conversations.human_handoff_at, EXCLUDED.human_handoff_at),
    updated_at = now();

  IF v_intent = 'sair' THEN
    UPDATE public.whatsapp_conversations
       SET opted_out = true, opted_out_at = now(), opted_out_reason = 'patient_request', updated_at = now()
     WHERE phone = p_phone;
  END IF;

  INSERT INTO public.whatsapp_inbound_messages
    (phone, paciente_id, paciente_nome, body, intent, provider, provider_message_id, raw)
  VALUES (p_phone, COALESCE(v_paciente_id,''), COALESCE(v_paciente_nome,''), COALESCE(p_body,''),
          v_intent, p_provider, COALESCE(p_provider_message_id,''), COALESCE(p_raw,'{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'intent', v_intent, 'paciente_id', v_paciente_id);
END;
$$;

-- 10) Seed templates iniciais (rascunho)
INSERT INTO public.whatsapp_templates
  (unidade_id, tipo, mensagem, nome_interno, categoria, evento, status, provider, idioma, variaveis_permitidas, permite_envio_fora_24h, ativo)
VALUES
  ('', 'confirmacao',
   E'Olá, {{nome}}. Aqui é da Secretaria Municipal de Saúde de Oriximiná.\n\nTemos um atendimento registrado para você no {{unidade}}, dia {{data}} às {{hora}}.\n\nResponda:\n1 - Confirmar presença\n2 - Solicitar remarcação\n3 - Falar com a recepção',
   'confirmacao_agendamento_v1','utility','agendamento_criado','rascunho','evolution','pt_BR',
   '["nome","unidade","data","hora"]'::jsonb, true, true),
  ('', 'lembrete_24h',
   E'Olá, {{nome}}. Lembramos do seu atendimento no {{unidade}} amanhã, {{data}}, às {{hora}}.\n\nResponda 1 para confirmar ou 2 para solicitar remarcação.',
   'lembrete_24h_v1','utility','lembrete_24h','rascunho','evolution','pt_BR',
   '["nome","unidade","data","hora"]'::jsonb, true, true),
  ('', 'lembrete_2h',
   E'Olá, {{nome}}. Seu atendimento no {{unidade}} está previsto para hoje às {{hora}}.\n\nSe possível, chegue com antecedência para organização do atendimento.\n\nPara falar com a recepção, responda 3.',
   'lembrete_2h_v1','utility','lembrete_2h','rascunho','evolution','pt_BR',
   '["nome","unidade","hora"]'::jsonb, true, true),
  ('', 'remarcacao',
   E'Olá, {{nome}}. Seu atendimento foi remarcado para {{data}} às {{hora}}, no {{unidade}}.\n\nResponda 1 para confirmar ou 2 para solicitar nova remarcação.',
   'remarcacao_v1','utility','remarcacao','rascunho','evolution','pt_BR',
   '["nome","unidade","data","hora"]'::jsonb, true, true),
  ('', 'cancelamento',
   E'Olá, {{nome}}. Informamos que o atendimento previsto para {{data}} às {{hora}}, no {{unidade}}, foi cancelado.\n\nA unidade poderá entrar em contato para nova orientação.',
   'cancelamento_v1','utility','cancelamento','rascunho','evolution','pt_BR',
   '["nome","unidade","data","hora"]'::jsonb, true, true),
  ('', 'vaga_disponivel',
   E'Olá, {{nome}}. Existe uma possibilidade de antecipação do seu atendimento no {{unidade}}.\n\nResponda 1 se tiver interesse ou 2 se preferir manter o agendamento atual.',
   'vaga_disponivel_v1','utility','vaga_disponivel','rascunho','evolution','pt_BR',
   '["nome","unidade"]'::jsonb, true, true)
ON CONFLICT (unidade_id, tipo) DO UPDATE SET
  nome_interno = EXCLUDED.nome_interno,
  categoria = EXCLUDED.categoria,
  evento = EXCLUDED.evento,
  variaveis_permitidas = EXCLUDED.variaveis_permitidas,
  permite_envio_fora_24h = EXCLUDED.permite_envio_fora_24h,
  updated_at = now();

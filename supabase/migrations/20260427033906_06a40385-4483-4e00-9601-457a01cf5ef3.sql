-- =====================================================
-- 1. Fila de mensagens WhatsApp
-- =====================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_message_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  paciente_id TEXT NOT NULL DEFAULT '',
  paciente_nome TEXT NOT NULL DEFAULT '',
  telefone TEXT NOT NULL DEFAULT '',
  mensagem TEXT NOT NULL DEFAULT '',
  tipo_mensagem TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente',
  -- Vínculos opcionais
  agendamento_id TEXT NOT NULL DEFAULT '',
  atendimento_id TEXT NOT NULL DEFAULT '',
  sessao_id TEXT NOT NULL DEFAULT '',
  procedimento_id TEXT NOT NULL DEFAULT '',
  -- Validade
  data_evento DATE,
  hora_evento TEXT NOT NULL DEFAULT '',
  validade_ate TIMESTAMPTZ,
  -- Tentativas
  tentativas INTEGER NOT NULL DEFAULT 0,
  max_tentativas INTEGER NOT NULL DEFAULT 5,
  ultimo_erro TEXT NOT NULL DEFAULT '',
  motivo_expiracao TEXT NOT NULL DEFAULT '',
  -- Deduplicação
  dedup_key TEXT NOT NULL DEFAULT '',
  -- Payload original para debug
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_em TIMESTAMPTZ,
  expirado_em TIMESTAMPTZ,
  proxima_tentativa_em TIMESTAMPTZ,
  unidade_id TEXT NOT NULL DEFAULT ''
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_wmq_status ON public.whatsapp_message_queue(status);
CREATE INDEX IF NOT EXISTS idx_wmq_dedup ON public.whatsapp_message_queue(dedup_key) WHERE dedup_key <> '';
CREATE INDEX IF NOT EXISTS idx_wmq_proxima ON public.whatsapp_message_queue(proxima_tentativa_em) WHERE status IN ('pendente','falha_temporaria');
CREATE INDEX IF NOT EXISTS idx_wmq_validade ON public.whatsapp_message_queue(validade_ate);
CREATE INDEX IF NOT EXISTS idx_wmq_agendamento ON public.whatsapp_message_queue(agendamento_id) WHERE agendamento_id <> '';

-- RLS
ALTER TABLE public.whatsapp_message_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read whatsapp_message_queue"
  ON public.whatsapp_message_queue FOR SELECT
  TO authenticated
  USING (is_staff_member());

CREATE POLICY "Staff insert whatsapp_message_queue"
  ON public.whatsapp_message_queue FOR INSERT
  TO authenticated
  WITH CHECK (is_staff_member());

CREATE POLICY "Staff update whatsapp_message_queue"
  ON public.whatsapp_message_queue FOR UPDATE
  TO authenticated
  USING (is_staff_member())
  WITH CHECK (is_staff_member());

CREATE POLICY "Staff delete whatsapp_message_queue"
  ON public.whatsapp_message_queue FOR DELETE
  TO authenticated
  USING (has_staff_role('master'));

-- Trigger updated_at
CREATE TRIGGER trg_wmq_updated_at
  BEFORE UPDATE ON public.whatsapp_message_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

-- =====================================================
-- 2. Status da conexão Evolution
-- =====================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_connection_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'desconhecido', -- conectado, desconectado, conectando, qrcode, erro
  last_check_at TIMESTAMPTZ,
  last_connected_at TIMESTAMPTZ,
  last_disconnected_at TIMESTAMPTZ,
  last_success_send_at TIMESTAMPTZ,
  last_error TEXT NOT NULL DEFAULT '',
  last_error_at TIMESTAMPTZ,
  reconnect_attempts INTEGER NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wcs_instance ON public.whatsapp_connection_status(instance_name);

ALTER TABLE public.whatsapp_connection_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read whatsapp_connection_status"
  ON public.whatsapp_connection_status FOR SELECT
  TO authenticated
  USING (is_staff_member());

CREATE POLICY "Staff manage whatsapp_connection_status"
  ON public.whatsapp_connection_status FOR ALL
  TO authenticated
  USING (is_staff_member())
  WITH CHECK (is_staff_member());

CREATE TRIGGER trg_wcs_updated_at
  BEFORE UPDATE ON public.whatsapp_connection_status
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();
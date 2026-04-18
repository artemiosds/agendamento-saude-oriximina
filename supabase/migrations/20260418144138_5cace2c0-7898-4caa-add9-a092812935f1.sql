
-- ============================================================
-- 1. CONFIGURAÇÃO POR UNIDADE
-- ============================================================
CREATE TABLE public.whatsapp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id text NOT NULL UNIQUE,
  whatsapp_ativo boolean NOT NULL DEFAULT true,
  -- Limites por paciente
  max_msgs_paciente_dia integer NOT NULL DEFAULT 5,
  max_msgs_paciente_semana integer NOT NULL DEFAULT 10,
  intervalo_minimo_minutos integer NOT NULL DEFAULT 10,
  -- Delays anti-ban
  delay_aleatorio_min_seg integer NOT NULL DEFAULT 5,
  delay_aleatorio_max_seg integer NOT NULL DEFAULT 30,
  limite_global_por_minuto integer NOT NULL DEFAULT 20,
  -- Janela de envio
  horario_inicio text NOT NULL DEFAULT '08:00',
  horario_fim text NOT NULL DEFAULT '18:00',
  dias_permitidos integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5], -- 0=dom..6=sab
  -- Compliance
  modo_estrito boolean NOT NULL DEFAULT true,
  respeitar_opt_out boolean NOT NULL DEFAULT true,
  bloquear_sem_interacao_previa boolean NOT NULL DEFAULT false,
  -- Auditoria
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_whatsapp_config_updated
  BEFORE UPDATE ON public.whatsapp_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read whatsapp_config"
  ON public.whatsapp_config FOR SELECT TO authenticated
  USING (is_staff_member());

CREATE POLICY "Master manage whatsapp_config"
  ON public.whatsapp_config FOR ALL TO authenticated
  USING (has_staff_role('master'))
  WITH CHECK (has_staff_role('master'));


-- ============================================================
-- 2. CONFIGURAÇÃO POR EVENTO × UNIDADE
-- ============================================================
CREATE TABLE public.whatsapp_event_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id text NOT NULL,
  evento text NOT NULL, -- 'agendamento_criado', 'lembrete_24h', 'lembrete_2h', 'cancelamento', 'remarcacao', 'falta', 'lista_espera', 'vaga_disponivel'
  ativo boolean NOT NULL DEFAULT true,
  template_mensagem text NOT NULL DEFAULT '',
  delay_envio_min integer NOT NULL DEFAULT 0,
  horario_personalizado text NOT NULL DEFAULT '',
  limite_por_paciente integer NOT NULL DEFAULT 1,
  prioridade text NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta')),
  exigir_confirmacao boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(unidade_id, evento)
);

CREATE TRIGGER trg_whatsapp_event_config_updated
  BEFORE UPDATE ON public.whatsapp_event_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

ALTER TABLE public.whatsapp_event_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read whatsapp_event_config"
  ON public.whatsapp_event_config FOR SELECT TO authenticated
  USING (is_staff_member());

CREATE POLICY "Master manage whatsapp_event_config"
  ON public.whatsapp_event_config FOR ALL TO authenticated
  USING (has_staff_role('master'))
  WITH CHECK (has_staff_role('master'));


-- ============================================================
-- 3. CONSENTIMENTOS (opt-in / opt-out / interação detectada)
-- ============================================================
CREATE TABLE public.whatsapp_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id text NOT NULL,
  telefone text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('opt_in','opt_out','interaction')),
  origem text NOT NULL DEFAULT 'cadastro', -- 'cadastro' | 'webhook' | 'portal' | 'manual'
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por text NOT NULL DEFAULT ''
);

CREATE INDEX idx_whatsapp_consents_paciente_tipo
  ON public.whatsapp_consents(paciente_id, tipo, criado_em DESC);

CREATE INDEX idx_whatsapp_consents_telefone
  ON public.whatsapp_consents(telefone, tipo, criado_em DESC);

ALTER TABLE public.whatsapp_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read whatsapp_consents"
  ON public.whatsapp_consents FOR SELECT TO authenticated
  USING (is_staff_member());

CREATE POLICY "Staff insert whatsapp_consents"
  ON public.whatsapp_consents FOR INSERT TO authenticated
  WITH CHECK (is_staff_member());


-- ============================================================
-- 4. FILA DE ENVIO
-- ============================================================
CREATE TABLE public.whatsapp_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id text NOT NULL DEFAULT '',
  paciente_nome text NOT NULL DEFAULT '',
  telefone text NOT NULL,
  evento text NOT NULL,
  mensagem text NOT NULL,
  prioridade text NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta')),
  agendado_para timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','processando','enviado','erro','bloqueado','cancelado')),
  tentativas integer NOT NULL DEFAULT 0,
  motivo_erro text NOT NULL DEFAULT '',
  motivo_bloqueio text NOT NULL DEFAULT '',
  unidade_id text NOT NULL DEFAULT '',
  agendamento_id text NOT NULL DEFAULT '',
  metadados jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_whatsapp_queue_updated
  BEFORE UPDATE ON public.whatsapp_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

CREATE INDEX idx_whatsapp_queue_status_agendado
  ON public.whatsapp_queue(status, agendado_para)
  WHERE status IN ('pendente','processando');

CREATE INDEX idx_whatsapp_queue_paciente
  ON public.whatsapp_queue(paciente_id, criado_em DESC);

CREATE INDEX idx_whatsapp_queue_telefone
  ON public.whatsapp_queue(telefone, criado_em DESC);

ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read whatsapp_queue"
  ON public.whatsapp_queue FOR SELECT TO authenticated
  USING (is_staff_member());

CREATE POLICY "Staff insert whatsapp_queue"
  ON public.whatsapp_queue FOR INSERT TO authenticated
  WITH CHECK (is_staff_member());

CREATE POLICY "Staff update whatsapp_queue"
  ON public.whatsapp_queue FOR UPDATE TO authenticated
  USING (is_staff_member())
  WITH CHECK (is_staff_member());

CREATE POLICY "Master delete whatsapp_queue"
  ON public.whatsapp_queue FOR DELETE TO authenticated
  USING (has_staff_role('master'));


-- ============================================================
-- 5. ÍNDICE EM notification_logs (controle de janela diária/semanal)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_notification_logs_telefone_criado
  ON public.notification_logs(destinatario_telefone, criado_em DESC)
  WHERE destinatario_telefone IS NOT NULL AND destinatario_telefone <> '';

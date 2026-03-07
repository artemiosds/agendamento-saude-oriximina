-- Configuração persistente do sistema
CREATE TABLE IF NOT EXISTS public.system_config (
  id text PRIMARY KEY DEFAULT 'default',
  configuracoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users read system config" ON public.system_config;
CREATE POLICY "Auth users read system config"
ON public.system_config
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Auth users manage system config" ON public.system_config;
CREATE POLICY "Auth users manage system config"
ON public.system_config
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

INSERT INTO public.system_config (id, configuracoes)
VALUES ('default', '{
  "whatsapp": {"ativo": false, "provedor": "zapi", "token": "", "numero": "", "notificacoes": {"confirmacao": true, "lembrete24h": true, "lembrete2h": true, "remarcacao": true, "cancelamento": true}},
  "googleCalendar": {"conectado": false, "criarEvento": true, "atualizarRemarcar": true, "removerCancelar": true, "enviarEmail": true},
  "filaEspera": {"modoEncaixe": "assistido"},
  "templates": {
    "confirmacao": "Olá {nome}! Sua consulta foi agendada para {data} às {hora} na {unidade}. Profissional: {profissional}.",
    "lembrete": "Lembrete: Sua consulta é em {data} às {hora} na {unidade} com {profissional}."
  },
  "webhook": {"ativo": true, "url": "https://hook.us2.make.com/hxkbabk6af5xbc79rxf9klp9m7wzf3l2", "status": "ativo"}
}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Auditoria de ações
CREATE TABLE IF NOT EXISTS public.action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT '',
  user_nome text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  unidade_id text NOT NULL DEFAULT '',
  acao text NOT NULL,
  entidade text NOT NULL,
  entidade_id text NOT NULL DEFAULT '',
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.action_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users read action logs" ON public.action_logs;
CREATE POLICY "Auth users read action logs"
ON public.action_logs
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Auth users insert action logs" ON public.action_logs;
CREATE POLICY "Auth users insert action logs"
ON public.action_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Aprimoramentos de agendamento inteligente + lembretes
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS prioridade_perfil text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS lembrete_24h_enviado_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS lembrete_proximo_enviado_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone NOT NULL DEFAULT now();

ALTER TABLE public.fila_espera
  ADD COLUMN IF NOT EXISTS prioridade_perfil text NOT NULL DEFAULT 'normal';

CREATE INDEX IF NOT EXISTS idx_agendamentos_data_prof_status
  ON public.agendamentos (data, profissional_id, status);

CREATE INDEX IF NOT EXISTS idx_fila_espera_status_unidade_prof
  ON public.fila_espera (status, unidade_id, profissional_id);

CREATE INDEX IF NOT EXISTS idx_action_logs_created_at
  ON public.action_logs (created_at DESC);

-- Trigger de atualização de timestamp
CREATE OR REPLACE FUNCTION public.set_updated_at_now()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_system_config_updated_at ON public.system_config;
CREATE TRIGGER trg_system_config_updated_at
BEFORE UPDATE ON public.system_config
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_now();

CREATE OR REPLACE FUNCTION public.set_agendamento_updated_at_now()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamentos_updated_at ON public.agendamentos;
CREATE TRIGGER trg_agendamentos_updated_at
BEFORE UPDATE ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION public.set_agendamento_updated_at_now();
-- Adicionar colunas de consentimento e interação à tabela de pacientes
ALTER TABLE public.pacientes 
ADD COLUMN IF NOT EXISTS whatsapp_opt_in_operational BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS whatsapp_opt_in_marketing BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS whatsapp_opt_in_waiting_list BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS whatsapp_has_prior_interaction BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS whatsapp_consent_proof JSONB;

-- Atualizar logs de notificação para incluir dados de auditoria
ALTER TABLE public.notification_logs
ADD COLUMN IF NOT EXISTS prior_interaction BOOLEAN,
ADD COLUMN IF NOT EXISTS opt_in_status TEXT,
ADD COLUMN IF NOT EXISTS window_24h BOOLEAN,
ADD COLUMN IF NOT EXISTS category TEXT, -- 'utility' ou 'marketing'
ADD COLUMN IF NOT EXISTS template_id UUID;

-- Adicionar categoria na fila do WhatsApp
ALTER TABLE public.whatsapp_queue
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'utility';

-- Adicionar campo max_msgs_paciente_semana caso não exista na whatsapp_config
ALTER TABLE public.whatsapp_config
ADD COLUMN IF NOT EXISTS max_msgs_paciente_semana INTEGER DEFAULT 10;

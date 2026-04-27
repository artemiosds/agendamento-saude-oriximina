
ALTER TABLE public.clinica_config
  ADD COLUMN IF NOT EXISTS uazapi_server_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS uazapi_admin_token text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS uazapi_instance text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS uazapi_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_provider_active text NOT NULL DEFAULT 'evolution';

ALTER TABLE public.clinica_config
  DROP CONSTRAINT IF EXISTS clinica_config_provider_check;
ALTER TABLE public.clinica_config
  ADD CONSTRAINT clinica_config_provider_check
  CHECK (whatsapp_provider_active IN ('evolution','uazapigo'));

ALTER TABLE public.whatsapp_queue
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'evolution';

ALTER TABLE public.notification_logs
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'evolution';

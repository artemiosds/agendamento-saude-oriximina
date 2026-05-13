CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_action_logs_paciente_nome ON public.action_logs USING gin (paciente_nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_action_logs_profissional_nome ON public.action_logs USING gin (profissional_nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_action_logs_acao_legivel ON public.action_logs USING gin (acao_legivel gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_action_logs_user_nome ON public.action_logs USING gin (user_nome gin_trgm_ops);

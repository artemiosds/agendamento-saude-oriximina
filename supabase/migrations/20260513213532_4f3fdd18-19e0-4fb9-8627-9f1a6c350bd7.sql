-- Enhance the action_logs table with specialized columns
ALTER TABLE public.action_logs 
ADD COLUMN IF NOT EXISTS acao_legivel TEXT,
ADD COLUMN IF NOT EXISTS tipo_evento TEXT, -- criacao, edicao, exclusao, visualizacao, login, erro, etc.
ADD COLUMN IF NOT EXISTS origem TEXT, -- pagina, modal, automacao, edge function
ADD COLUMN IF NOT EXISTS paciente_id TEXT,
ADD COLUMN IF NOT EXISTS paciente_nome TEXT,
ADD COLUMN IF NOT EXISTS profissional_id TEXT,
ADD COLUMN IF NOT EXISTS profissional_nome TEXT,
ADD COLUMN IF NOT EXISTS agendamento_id TEXT,
ADD COLUMN IF NOT EXISTS prontuario_id TEXT,
ADD COLUMN IF NOT EXISTS documento_id TEXT,
ADD COLUMN IF NOT EXISTS unidade_nome TEXT,
ADD COLUMN IF NOT EXISTS before JSONB,
ADD COLUMN IF NOT EXISTS after JSONB,
ADD COLUMN IF NOT EXISTS changes JSONB,
ADD COLUMN IF NOT EXISTS campos_alterados TEXT[],
ADD COLUMN IF NOT EXISTS resumo_alteracao TEXT,
ADD COLUMN IF NOT EXISTS user_agent TEXT,
ADD COLUMN IF NOT EXISTS navegador TEXT,
ADD COLUMN IF NOT EXISTS sistema_operacional TEXT,
ADD COLUMN IF NOT EXISTS dispositivo TEXT,
ADD COLUMN IF NOT EXISTS rota TEXT,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS error_code TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Create indexes for performance on the most filtered columns
CREATE INDEX IF NOT EXISTS idx_action_logs_created_at ON public.action_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_logs_user_id ON public.action_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_modulo ON public.action_logs(modulo);
CREATE INDEX IF NOT EXISTS idx_action_logs_paciente_id ON public.action_logs(paciente_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_profissional_id ON public.action_logs(profissional_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_unidade_id ON public.action_logs(unidade_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_status ON public.action_logs(status);
CREATE INDEX IF NOT EXISTS idx_action_logs_acao ON public.action_logs(acao);
CREATE INDEX IF NOT EXISTS idx_action_logs_entidade_id ON public.action_logs(entidade_id);

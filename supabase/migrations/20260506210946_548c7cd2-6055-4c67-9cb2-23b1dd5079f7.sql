-- Adicionar coluna granular_actions na tabela permissoes
ALTER TABLE public.permissoes 
ADD COLUMN IF NOT EXISTS granular_actions JSONB DEFAULT '{}'::jsonb;

-- Adicionar coluna granular_actions na tabela permissoes_usuario
ALTER TABLE public.permissoes_usuario 
ADD COLUMN IF NOT EXISTS granular_actions JSONB DEFAULT '{}'::jsonb;

-- Atualizar índices ou constraints se necessário (opcional)
COMMENT ON COLUMN public.permissoes.granular_actions IS 'Armazena permissões detalhadas do módulo em formato JSON (ex: {"finalizar": true})';
COMMENT ON COLUMN public.permissoes_usuario.granular_actions IS 'Armazena exceções de permissões detalhadas do usuário em formato JSON';

-- Add new columns to 'permissoes' (by profile)
ALTER TABLE public.permissoes 
ADD COLUMN IF NOT EXISTS can_print BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_export BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_attach BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_sign BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_approve BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_cancel BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_configure BOOLEAN DEFAULT false;

-- Add new columns to 'permissoes_usuario' (individual overrides)
ALTER TABLE public.permissoes_usuario 
ADD COLUMN IF NOT EXISTS can_print BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_export BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_attach BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_sign BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_approve BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_cancel BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_configure BOOLEAN DEFAULT false;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_permissoes_perfil_unidade ON public.permissoes(perfil, unidade_id);
CREATE INDEX IF NOT EXISTS idx_permissoes_usuario_user_unidade ON public.permissoes_usuario(user_id, unidade_id);

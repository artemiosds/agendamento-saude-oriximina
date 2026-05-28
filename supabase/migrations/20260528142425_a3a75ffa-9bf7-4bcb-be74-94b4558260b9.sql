ALTER TABLE public.prontuarios 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'finalizado';

-- Adicionar índice para performance em buscas por status
CREATE INDEX IF NOT EXISTS idx_prontuarios_status ON public.prontuarios(status);

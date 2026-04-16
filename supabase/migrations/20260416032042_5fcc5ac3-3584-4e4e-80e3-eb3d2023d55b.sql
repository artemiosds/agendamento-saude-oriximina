
-- Add unidade_id to pacientes
ALTER TABLE public.pacientes
ADD COLUMN IF NOT EXISTS unidade_id text NOT NULL DEFAULT '';

-- Index for unit-based filtering
CREATE INDEX IF NOT EXISTS idx_pacientes_unidade_id ON public.pacientes (unidade_id);

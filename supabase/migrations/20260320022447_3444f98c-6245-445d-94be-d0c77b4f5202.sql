-- Add nome_mae (mother's name) to pacientes table
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS nome_mae text NOT NULL DEFAULT '';

-- Create index on nome_mae for search
CREATE INDEX IF NOT EXISTS idx_pacientes_nome_mae ON public.pacientes (nome_mae);

-- Ensure indexes exist for CNS and CPF search performance
CREATE INDEX IF NOT EXISTS idx_pacientes_cns ON public.pacientes (cns);
CREATE INDEX IF NOT EXISTS idx_pacientes_cpf ON public.pacientes (cpf);
CREATE INDEX IF NOT EXISTS idx_pacientes_nome ON public.pacientes (nome);
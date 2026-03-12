
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS descricao_clinica text NOT NULL DEFAULT '';
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS cid text NOT NULL DEFAULT '';

ALTER TABLE public.fila_espera ADD COLUMN IF NOT EXISTS descricao_clinica text NOT NULL DEFAULT '';
ALTER TABLE public.fila_espera ADD COLUMN IF NOT EXISTS cid text NOT NULL DEFAULT '';

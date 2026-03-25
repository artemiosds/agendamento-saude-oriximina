
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS especialidade_destino text NOT NULL DEFAULT '';
ALTER TABLE public.fila_espera ADD COLUMN IF NOT EXISTS especialidade_destino text NOT NULL DEFAULT '';

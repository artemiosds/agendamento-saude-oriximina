ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS naturalidade text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS naturalidade_uf text NOT NULL DEFAULT '';
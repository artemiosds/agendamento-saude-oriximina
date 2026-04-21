-- Adiciona código SIGTAP oficial ao catálogo interno de procedimentos
ALTER TABLE public.procedimentos
  ADD COLUMN IF NOT EXISTS codigo_sigtap text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_procedimentos_codigo_sigtap
  ON public.procedimentos(codigo_sigtap)
  WHERE codigo_sigtap <> '';
-- Extend medications table with extra clinical/stock fields and search index
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS nome_comercial text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS forma_farmaceutica text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS concentracao text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS codigo_rename text,
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'comum',
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS estoque_quantidade integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_minimo integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_unidade text NOT NULL DEFAULT 'unidades',
  ADD COLUMN IF NOT EXISTS estoque_localizacao text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS estoque_controlado boolean NOT NULL DEFAULT false;

-- Unique on codigo_rename when set (allows multiple NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_medications_codigo_rename
  ON public.medications (codigo_rename)
  WHERE codigo_rename IS NOT NULL AND codigo_rename <> '';

-- Trigram GIN index for fast search across multiple columns
CREATE INDEX IF NOT EXISTS idx_medications_busca_trgm
  ON public.medications
  USING GIN (
    (coalesce(nome,'') || ' ' || coalesce(nome_comercial,'') || ' ' || coalesce(principio_ativo,'') || ' ' || coalesce(classe_terapeutica,'')) gin_trgm_ops
  );

-- Common filter index
CREATE INDEX IF NOT EXISTS idx_medications_classe ON public.medications (classe_terapeutica);
CREATE INDEX IF NOT EXISTS idx_medications_tipo ON public.medications (tipo);
CREATE INDEX IF NOT EXISTS idx_medications_origem ON public.medications (origem);
CREATE INDEX IF NOT EXISTS idx_medications_ativo ON public.medications (ativo);
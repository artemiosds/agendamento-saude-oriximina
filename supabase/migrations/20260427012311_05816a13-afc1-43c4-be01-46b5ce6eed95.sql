ALTER TABLE public.prontuario_procedimentos
ADD COLUMN IF NOT EXISTS cids_selecionados text[] NOT NULL DEFAULT '{}'::text[];
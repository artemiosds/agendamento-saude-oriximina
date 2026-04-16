-- Add display name column to unidades
ALTER TABLE public.unidades
ADD COLUMN IF NOT EXISTS nome_exibicao text NOT NULL DEFAULT '';

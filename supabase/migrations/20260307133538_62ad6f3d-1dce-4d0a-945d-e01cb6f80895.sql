
ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS profissao text NOT NULL DEFAULT '';
ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS tipo_conselho text NOT NULL DEFAULT '';
ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS numero_conselho text NOT NULL DEFAULT '';
ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS uf_conselho text NOT NULL DEFAULT '';


ALTER TABLE public.fila_espera ADD COLUMN IF NOT EXISTS data_solicitacao_original text NOT NULL DEFAULT '';
ALTER TABLE public.fila_espera ADD COLUMN IF NOT EXISTS origem_cadastro text NOT NULL DEFAULT 'normal';

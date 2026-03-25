
ALTER TABLE public.disponibilidades ADD COLUMN IF NOT EXISTS duracao_consulta integer NOT NULL DEFAULT 30;

ALTER PUBLICATION supabase_realtime ADD TABLE public.disponibilidades;

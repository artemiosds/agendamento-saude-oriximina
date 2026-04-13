ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS procedimento_sigtap text DEFAULT '';
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS nome_procedimento text DEFAULT '';
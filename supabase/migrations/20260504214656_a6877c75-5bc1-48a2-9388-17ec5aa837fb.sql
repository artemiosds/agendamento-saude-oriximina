-- Add quantity and observation columns to prontuario_procedimentos
ALTER TABLE public.prontuario_procedimentos 
ADD COLUMN IF NOT EXISTS quantidade INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS observacao TEXT DEFAULT '';

-- Update existing records to have quantity 1 if they were null
UPDATE public.prontuario_procedimentos 
SET quantidade = 1 
WHERE quantidade IS NULL;

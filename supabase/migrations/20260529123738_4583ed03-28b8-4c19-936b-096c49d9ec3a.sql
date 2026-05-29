-- Add missing column to pts table
ALTER TABLE public.pts 
ADD COLUMN IF NOT EXISTS acompanhamento_interdisciplinar BOOLEAN DEFAULT false;

-- Re-grant permissions to ensure access (standard practice)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pts TO authenticated;
GRANT ALL ON public.pts TO service_role;

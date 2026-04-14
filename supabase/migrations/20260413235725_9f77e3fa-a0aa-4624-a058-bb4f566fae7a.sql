
CREATE TABLE public.soap_custom_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profissional_id TEXT NOT NULL,
  campo TEXT NOT NULL,
  opcao TEXT NOT NULL,
  profissao TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.soap_custom_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read own soap options"
ON public.soap_custom_options
FOR SELECT
USING (is_staff_member());

CREATE POLICY "Staff insert own soap options"
ON public.soap_custom_options
FOR INSERT
WITH CHECK (is_staff_member());

CREATE POLICY "Staff update own soap options"
ON public.soap_custom_options
FOR UPDATE
USING (is_staff_member());

CREATE POLICY "Staff delete own soap options"
ON public.soap_custom_options
FOR DELETE
USING (is_staff_member());

CREATE INDEX idx_soap_custom_options_prof ON public.soap_custom_options (profissional_id, campo);

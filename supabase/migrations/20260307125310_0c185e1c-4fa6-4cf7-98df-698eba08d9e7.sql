
-- Fix function search paths
CREATE OR REPLACE FUNCTION public.update_prontuarios_updated_at()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_google_calendar_tokens_updated_at()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix anonymous access: drop and recreate policies with explicit TO authenticated
DROP POLICY IF EXISTS "Authenticated can read funcionarios" ON public.funcionarios;
CREATE POLICY "Auth users read funcionarios" ON public.funcionarios FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read prontuarios" ON public.prontuarios;
CREATE POLICY "Auth users read prontuarios" ON public.prontuarios FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert prontuarios" ON public.prontuarios;
CREATE POLICY "Auth users insert prontuarios" ON public.prontuarios FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update prontuarios" ON public.prontuarios;
CREATE POLICY "Auth users update prontuarios" ON public.prontuarios FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

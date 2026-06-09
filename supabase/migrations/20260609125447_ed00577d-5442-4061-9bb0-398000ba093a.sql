GRANT SELECT, INSERT, UPDATE, DELETE ON public.prontuarios TO authenticated;
GRANT ALL ON public.prontuarios TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prontuario_procedimentos TO authenticated;
GRANT ALL ON public.prontuario_procedimentos TO service_role;
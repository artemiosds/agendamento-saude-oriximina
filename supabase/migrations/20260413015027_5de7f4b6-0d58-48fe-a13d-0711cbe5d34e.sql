
-- 1. Restringir disponibilidades: remover acesso anônimo, manter apenas autenticados
DROP POLICY IF EXISTS "Anyone can read disponibilidades" ON public.disponibilidades;

CREATE POLICY "Authenticated read disponibilidades"
ON public.disponibilidades
FOR SELECT
TO authenticated
USING (true);

-- 2. Criar view segura para clinica_config que oculta a API key
CREATE OR REPLACE VIEW public.clinica_config_safe
WITH (security_invoker = on) AS
SELECT id, nome_clinica, logo_url, telefone, evolution_base_url, evolution_instance_name, created_at, updated_at
FROM public.clinica_config;
-- Exclui evolution_api_key da view

-- 3. Restringir SELECT direto na clinica_config apenas para master
DROP POLICY IF EXISTS "Staff read clinica_config" ON public.clinica_config;

CREATE POLICY "Only master read clinica_config"
ON public.clinica_config
FOR SELECT
TO authenticated
USING (has_staff_role('master'::text));

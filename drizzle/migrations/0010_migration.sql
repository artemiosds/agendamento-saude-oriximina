CREATE OR REPLACE FUNCTION public.is_global_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.funcionarios WHERE auth_user_id = auth.uid() AND usuario = 'admin.sms' AND ativo = true)
$$;
REVOKE EXECUTE ON FUNCTION public.is_global_owner() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_global_owner() TO authenticated;

CREATE POLICY "Owner only reads saas registry" ON public.system_config AS RESTRICTIVE FOR SELECT TO authenticated
  USING (id <> 'saas_clientes' OR public.is_global_owner());
CREATE POLICY "Owner only inserts license/saas" ON public.system_config AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (id NOT IN ('saas_clientes','licenca') OR public.is_global_owner());
CREATE POLICY "Owner only updates license/saas" ON public.system_config AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (id NOT IN ('saas_clientes','licenca') OR public.is_global_owner())
  WITH CHECK (id NOT IN ('saas_clientes','licenca') OR public.is_global_owner());
CREATE POLICY "Owner only deletes license/saas" ON public.system_config AS RESTRICTIVE FOR DELETE TO authenticated
  USING (id NOT IN ('saas_clientes','licenca') OR public.is_global_owner());
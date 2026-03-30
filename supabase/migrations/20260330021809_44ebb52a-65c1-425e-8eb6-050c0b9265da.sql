
-- Helper function: check if current auth user is a staff member (has a record in funcionarios)
CREATE OR REPLACE FUNCTION public.is_staff_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.funcionarios
    WHERE auth_user_id = auth.uid()
    AND ativo = true
  )
$$;

-- Helper function: check if current auth user has a specific role
CREATE OR REPLACE FUNCTION public.has_staff_role(_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.funcionarios
    WHERE auth_user_id = auth.uid()
    AND ativo = true
    AND role = _role
  )
$$;

-- 1. PERMISSOES: Restrict write access to master role only
DROP POLICY IF EXISTS "Auth users manage permissoes" ON public.permissoes;

CREATE POLICY "Master manages permissoes"
ON public.permissoes
FOR ALL
TO authenticated
USING (public.has_staff_role('master'))
WITH CHECK (public.has_staff_role('master'));

-- 2. SYSTEM_CONFIG: Remove anonymous read, restrict to staff only
DROP POLICY IF EXISTS "Anon read system config" ON public.system_config;

-- Keep auth read but restrict to staff
DROP POLICY IF EXISTS "Auth users read system config" ON public.system_config;
CREATE POLICY "Staff read system config"
ON public.system_config
FOR SELECT
TO authenticated
USING (public.is_staff_member());

-- Keep auth manage but restrict to master
DROP POLICY IF EXISTS "Auth users manage system config" ON public.system_config;
CREATE POLICY "Master manages system config"
ON public.system_config
FOR ALL
TO authenticated
USING (public.has_staff_role('master'))
WITH CHECK (public.has_staff_role('master'));

-- 3. FUNCIONARIOS: Restrict read to staff members only (not patients)
DROP POLICY IF EXISTS "Auth users read funcionarios" ON public.funcionarios;

CREATE POLICY "Staff read funcionarios"
ON public.funcionarios
FOR SELECT
TO authenticated
USING (public.is_staff_member());

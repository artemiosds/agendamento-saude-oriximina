
-- Drop the overly permissive public policies on system_config
DROP POLICY IF EXISTS "upsert_system_config" ON public.system_config;
DROP POLICY IF EXISTS "select_system_config" ON public.system_config;

-- Recreate: only master can upsert
CREATE POLICY "master_upsert_system_config" ON public.system_config
  FOR ALL TO authenticated
  USING (has_staff_role('master'))
  WITH CHECK (has_staff_role('master'));

-- Staff can still read (already exists via "Staff read system config" but adding explicit select for anon/public removal)

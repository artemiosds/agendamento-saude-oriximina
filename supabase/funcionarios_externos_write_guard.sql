-- Funcionários / fase 6.1: administrative external directory writes only via trusted server.
-- Keep the existing staff SELECT predicate and the external own-record policy.
-- No data changes, no changes to quotas, appointments, login RPCs or other tables.
BEGIN;
DROP POLICY IF EXISTS "Staff manage profissionais_externos" ON public.profissionais_externos;
CREATE POLICY "Staff manage profissionais_externos" ON public.profissionais_externos
  FOR SELECT TO authenticated USING ((SELECT public.is_staff_member()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.profissionais_externos
  FROM PUBLIC, anon, authenticated;
-- The service-role endpoint must retain its existing access.
DO $verify$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(role_name,'public.profissionais_externos','INSERT')
       OR has_table_privilege(role_name,'public.profissionais_externos','UPDATE')
       OR has_table_privilege(role_name,'public.profissionais_externos','DELETE')
       OR has_table_privilege(role_name,'public.profissionais_externos','TRUNCATE')
       OR has_any_column_privilege(role_name,'public.profissionais_externos','INSERT')
       OR has_any_column_privilege(role_name,'public.profissionais_externos','UPDATE') THEN
      RAISE EXCEPTION 'Unexpected direct write grant: %',role_name;
    END IF;
  END LOOP;
  IF NOT (has_table_privilege('service_role','public.profissionais_externos','SELECT')
    AND has_table_privilege('service_role','public.profissionais_externos','INSERT')
    AND has_table_privilege('service_role','public.profissionais_externos','UPDATE')
    AND has_table_privilege('authenticated','public.profissionais_externos','SELECT')) THEN
    RAISE EXCEPTION 'Existing authorized access not preserved';
  END IF;
END $verify$;
COMMIT;

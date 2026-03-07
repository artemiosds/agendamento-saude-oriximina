DROP POLICY IF EXISTS "Auth users read system config" ON public.system_config;
CREATE POLICY "Auth users read system config"
ON public.system_config
FOR SELECT
TO authenticated
USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Auth users manage system config" ON public.system_config;
CREATE POLICY "Auth users manage system config"
ON public.system_config
FOR ALL
TO authenticated
USING ((select auth.uid()) IS NOT NULL)
WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Auth users read action logs" ON public.action_logs;
CREATE POLICY "Auth users read action logs"
ON public.action_logs
FOR SELECT
TO authenticated
USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Auth users insert action logs" ON public.action_logs;
CREATE POLICY "Auth users insert action logs"
ON public.action_logs
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) IS NOT NULL);
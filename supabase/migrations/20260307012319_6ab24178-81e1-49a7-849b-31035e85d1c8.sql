ALTER TABLE public.google_calendar_tokens ADD CONSTRAINT google_calendar_tokens_user_id_unique UNIQUE (user_id);

-- Drop the restrictive RLS policy and add a permissive one for service role access
DROP POLICY IF EXISTS "Users can manage own tokens" ON public.google_calendar_tokens;

-- Allow authenticated users to read tokens (for checking connection status)
CREATE POLICY "Anyone can read tokens" ON public.google_calendar_tokens FOR SELECT TO anon, authenticated USING (true);

-- Only service role can insert/update/delete (done via edge functions)
CREATE POLICY "Service role manages tokens" ON public.google_calendar_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
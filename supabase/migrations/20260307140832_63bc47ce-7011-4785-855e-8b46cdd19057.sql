
-- Fix RLS policies to be explicitly PERMISSIVE for public-facing tables

-- Drop and recreate unidades SELECT policy as PERMISSIVE
DROP POLICY IF EXISTS "Anyone can read unidades" ON public.unidades;
CREATE POLICY "Anyone can read unidades" ON public.unidades FOR SELECT TO anon, authenticated USING (true);

-- Drop and recreate salas SELECT policy as PERMISSIVE
DROP POLICY IF EXISTS "Anyone can read salas" ON public.salas;
CREATE POLICY "Anyone can read salas" ON public.salas FOR SELECT TO anon, authenticated USING (true);

-- Drop and recreate disponibilidades SELECT policy as PERMISSIVE
DROP POLICY IF EXISTS "Anyone can read disponibilidades" ON public.disponibilidades;
CREATE POLICY "Anyone can read disponibilidades" ON public.disponibilidades FOR SELECT TO anon, authenticated USING (true);

-- Drop and recreate funcionarios SELECT policy as PERMISSIVE (needed for public scheduling page)
DROP POLICY IF EXISTS "Auth users read funcionarios" ON public.funcionarios;
CREATE POLICY "Anyone can read funcionarios" ON public.funcionarios FOR SELECT TO anon, authenticated USING (true);

-- Also make disponibilidades INSERT available for anon (online booking creates no disponibilidades, but reads them)
-- No change needed for INSERT/UPDATE/DELETE - those stay authenticated only

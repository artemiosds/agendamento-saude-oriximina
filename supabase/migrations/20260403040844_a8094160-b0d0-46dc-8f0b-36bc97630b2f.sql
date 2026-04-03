
-- BLOQUEIOS - Staff write, keep anon/auth read
DROP POLICY IF EXISTS "Auth users manage bloqueios" ON public.bloqueios;
CREATE POLICY "Staff manage bloqueios" ON public.bloqueios
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- DISPONIBILIDADES - Staff write, keep anon/auth read
DROP POLICY IF EXISTS "Auth users delete disponibilidades" ON public.disponibilidades;
DROP POLICY IF EXISTS "Auth users insert disponibilidades" ON public.disponibilidades;
DROP POLICY IF EXISTS "Auth users update disponibilidades" ON public.disponibilidades;
CREATE POLICY "Staff insert disponibilidades" ON public.disponibilidades
  FOR INSERT TO authenticated WITH CHECK (is_staff_member());
CREATE POLICY "Staff update disponibilidades" ON public.disponibilidades
  FOR UPDATE TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());
CREATE POLICY "Staff delete disponibilidades" ON public.disponibilidades
  FOR DELETE TO authenticated USING (is_staff_member());

-- SALAS - Staff write, keep anon/auth read
DROP POLICY IF EXISTS "Auth users manage salas" ON public.salas;
CREATE POLICY "Staff manage salas" ON public.salas
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- UNIDADES - Staff write, keep anon/auth read
DROP POLICY IF EXISTS "Auth users manage unidades" ON public.unidades;
CREATE POLICY "Staff manage unidades" ON public.unidades
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

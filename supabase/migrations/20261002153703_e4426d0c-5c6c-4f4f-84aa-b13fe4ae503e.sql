CREATE INDEX IF NOT EXISTS idx_funcionarios_auth_user_ativo ON public.funcionarios (auth_user_id) WHERE ativo = true;

DO $mig$
DECLARE r record; v_q text; v_c text; v_sql text;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname='public' LOOP
    v_q := r.qual; v_c := r.with_check;
    IF v_q IS NOT NULL THEN
      v_q := replace(v_q,'auth.uid()','(SELECT auth.uid())');
      v_q := replace(v_q,'is_staff_member()','(SELECT is_staff_member())');
      v_q := replace(v_q,'is_external_professional()','(SELECT is_external_professional())');
    END IF;
    IF v_c IS NOT NULL THEN
      v_c := replace(v_c,'auth.uid()','(SELECT auth.uid())');
      v_c := replace(v_c,'is_staff_member()','(SELECT is_staff_member())');
      v_c := replace(v_c,'is_external_professional()','(SELECT is_external_professional())');
    END IF;
    IF v_q IS DISTINCT FROM r.qual OR v_c IS DISTINCT FROM r.with_check THEN
      v_sql := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
      IF v_q IS NOT NULL THEN v_sql := v_sql || ' USING (' || v_q || ')'; END IF;
      IF v_c IS NOT NULL THEN v_sql := v_sql || ' WITH CHECK (' || v_c || ')'; END IF;
      EXECUTE v_sql;
    END IF;
  END LOOP;
END $mig$;
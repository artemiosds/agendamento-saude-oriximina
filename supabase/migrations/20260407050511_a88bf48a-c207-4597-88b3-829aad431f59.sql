
-- Catálogo de tipos de exames
CREATE TABLE public.exam_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  codigo_sus text NOT NULL DEFAULT '',
  categoria text NOT NULL DEFAULT '',
  is_global boolean NOT NULL DEFAULT true,
  profissional_id text DEFAULT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read exam_types" ON public.exam_types
  FOR SELECT TO authenticated USING (is_staff_member());

CREATE POLICY "Staff insert exam_types" ON public.exam_types
  FOR INSERT TO authenticated WITH CHECK (is_staff_member());

CREATE POLICY "Staff update exam_types" ON public.exam_types
  FOR UPDATE TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- Preferências do profissional (desabilitar exames etc)
CREATE TABLE public.professional_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profissional_id text NOT NULL,
  tipo text NOT NULL DEFAULT 'exam',
  item_id uuid NOT NULL,
  desabilitado boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.professional_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read own preferences" ON public.professional_preferences
  FOR SELECT TO authenticated USING (is_staff_member());

CREATE POLICY "Staff manage own preferences" ON public.professional_preferences
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- Índices
CREATE INDEX idx_exam_types_categoria ON public.exam_types (categoria);
CREATE INDEX idx_exam_types_global ON public.exam_types (is_global, ativo);
CREATE INDEX idx_prof_prefs_prof ON public.professional_preferences (profissional_id, tipo);
CREATE UNIQUE INDEX idx_prof_prefs_unique ON public.professional_preferences (profissional_id, tipo, item_id);

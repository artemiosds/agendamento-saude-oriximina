
-- Table: horarios_funcionamento
CREATE TABLE public.horarios_funcionamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dia_semana integer NOT NULL, -- 0=Dom, 1=Seg, ..., 6=Sáb
  ativo boolean NOT NULL DEFAULT false,
  hora_inicio text NOT NULL DEFAULT '07:00',
  hora_fim text NOT NULL DEFAULT '13:00',
  intervalo_slots integer NOT NULL DEFAULT 30, -- minutes: 15, 30, 60
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(dia_semana)
);

ALTER TABLE public.horarios_funcionamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read horarios" ON public.horarios_funcionamento
  FOR SELECT TO authenticated USING (is_staff_member());

CREATE POLICY "Master manage horarios" ON public.horarios_funcionamento
  FOR ALL TO authenticated
  USING (has_staff_role('master'))
  WITH CHECK (has_staff_role('master'));

-- Table: especialidades
CREATE TABLE public.especialidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#3b82f6',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.especialidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read especialidades" ON public.especialidades
  FOR SELECT TO authenticated USING (is_staff_member());

CREATE POLICY "Master manage especialidades" ON public.especialidades
  FOR ALL TO authenticated
  USING (has_staff_role('master'))
  WITH CHECK (has_staff_role('master'));

-- Seed default operating hours (Mon-Fri active, Sat-Sun inactive)
INSERT INTO public.horarios_funcionamento (dia_semana, ativo, hora_inicio, hora_fim, intervalo_slots)
VALUES
  (0, false, '07:00', '13:00', 30),
  (1, true, '07:00', '13:00', 30),
  (2, true, '07:00', '13:00', 30),
  (3, true, '07:00', '13:00', 30),
  (4, true, '07:00', '13:00', 30),
  (5, true, '07:00', '13:00', 30),
  (6, false, '07:00', '13:00', 30);

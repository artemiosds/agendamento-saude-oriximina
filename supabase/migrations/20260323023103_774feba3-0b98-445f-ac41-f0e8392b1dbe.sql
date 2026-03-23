
-- Patient Regulation table (CER intake flow)
CREATE TABLE public.patient_regulation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id text NOT NULL,
  cns text NOT NULL DEFAULT '',
  cpf text NOT NULL DEFAULT '',
  name text NOT NULL,
  mother_name text NOT NULL DEFAULT '',
  priority_level text NOT NULL DEFAULT 'baixo',
  referral_source text NOT NULL DEFAULT 'espontaneo',
  cid_code text NOT NULL DEFAULT '',
  requires_specialty text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'waiting',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_regulation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read patient_regulation" ON public.patient_regulation FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage patient_regulation" ON public.patient_regulation FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Patient Evaluations table
CREATE TABLE public.patient_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id text NOT NULL,
  regulation_id uuid REFERENCES public.patient_regulation(id),
  professional_id text NOT NULL,
  unit_id text NOT NULL DEFAULT '',
  evaluation_date date NOT NULL DEFAULT CURRENT_DATE,
  clinical_notes text NOT NULL DEFAULT '',
  defined_procedures text[] NOT NULL DEFAULT '{}',
  sessions_planned integer NOT NULL DEFAULT 1,
  frequency text NOT NULL DEFAULT 'semanal',
  status text NOT NULL DEFAULT 'pending',
  rejection_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read patient_evaluations" ON public.patient_evaluations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage patient_evaluations" ON public.patient_evaluations FOR ALL TO authenticated USING (true) WITH CHECK (true);

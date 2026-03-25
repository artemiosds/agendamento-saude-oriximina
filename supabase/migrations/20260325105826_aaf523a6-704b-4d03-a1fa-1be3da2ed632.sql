CREATE TABLE IF NOT EXISTS public.multiprofessional_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id text NOT NULL,
  agendamento_id text,
  professional_id text NOT NULL,
  professional_nome text NOT NULL DEFAULT '',
  specialty text NOT NULL DEFAULT '',
  unit_id text NOT NULL DEFAULT '',
  clinical_evaluation text NOT NULL DEFAULT '',
  parecer text NOT NULL DEFAULT 'favoravel',
  observations text NOT NULL DEFAULT '',
  evaluation_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.multiprofessional_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users manage multiprofessional_evaluations" ON public.multiprofessional_evaluations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth users read multiprofessional_evaluations" ON public.multiprofessional_evaluations
  FOR SELECT TO authenticated USING (true);
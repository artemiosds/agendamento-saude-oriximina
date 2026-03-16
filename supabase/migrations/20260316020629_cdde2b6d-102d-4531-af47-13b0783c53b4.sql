
-- Treatment Cycles
CREATE TABLE public.treatment_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id text NOT NULL,
  professional_id text NOT NULL,
  unit_id text NOT NULL DEFAULT '',
  specialty text NOT NULL DEFAULT '',
  treatment_type text NOT NULL DEFAULT '',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date_predicted date,
  total_sessions integer NOT NULL DEFAULT 1,
  sessions_done integer NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'semanal',
  status text NOT NULL DEFAULT 'em_andamento',
  clinical_notes text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.treatment_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read treatment_cycles" ON public.treatment_cycles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage treatment_cycles" ON public.treatment_cycles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Treatment Sessions
CREATE TABLE public.treatment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.treatment_cycles(id) ON DELETE CASCADE,
  patient_id text NOT NULL,
  professional_id text NOT NULL,
  appointment_id text,
  session_number integer NOT NULL DEFAULT 1,
  total_sessions integer NOT NULL DEFAULT 1,
  scheduled_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'agendada',
  absence_type text,
  clinical_notes text NOT NULL DEFAULT '',
  procedure_done text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.treatment_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read treatment_sessions" ON public.treatment_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage treatment_sessions" ON public.treatment_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Treatment Extensions
CREATE TABLE public.treatment_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.treatment_cycles(id) ON DELETE CASCADE,
  previous_sessions integer NOT NULL,
  new_sessions integer NOT NULL,
  previous_end_date date,
  new_end_date date,
  reason text NOT NULL DEFAULT '',
  changed_by text NOT NULL DEFAULT '',
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.treatment_extensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read treatment_extensions" ON public.treatment_extensions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage treatment_extensions" ON public.treatment_extensions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Patient Discharges
CREATE TABLE public.patient_discharges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.treatment_cycles(id) ON DELETE CASCADE,
  patient_id text NOT NULL,
  professional_id text NOT NULL,
  discharge_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text NOT NULL DEFAULT '',
  final_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_discharges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read patient_discharges" ON public.patient_discharges FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage patient_discharges" ON public.patient_discharges FOR ALL TO authenticated USING (true) WITH CHECK (true);

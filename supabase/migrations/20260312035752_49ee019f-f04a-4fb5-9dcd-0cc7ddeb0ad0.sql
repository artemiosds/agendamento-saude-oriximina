
-- Add coren column to funcionarios
ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS coren VARCHAR(20) DEFAULT '';

-- Create triage_settings table
CREATE TABLE IF NOT EXISTS public.triage_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id TEXT,
  profissional_id TEXT,
  enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.triage_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read triage_settings" ON public.triage_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth users manage triage_settings" ON public.triage_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create triage_records table
CREATE TABLE IF NOT EXISTS public.triage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id TEXT NOT NULL,
  tecnico_id TEXT NOT NULL,
  peso NUMERIC(5,2),
  altura NUMERIC(5,2),
  imc NUMERIC(5,2),
  pressao_arterial VARCHAR(10),
  temperatura NUMERIC(4,1),
  frequencia_cardiaca INTEGER,
  saturacao_oxigenio INTEGER,
  glicemia NUMERIC(6,2),
  alergias TEXT[] DEFAULT '{}',
  medicamentos TEXT[] DEFAULT '{}',
  queixa TEXT,
  iniciado_em TIMESTAMPTZ,
  confirmado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agendamento_id)
);

ALTER TABLE public.triage_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read triage_records" ON public.triage_records
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth users insert triage_records" ON public.triage_records
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users update triage_records" ON public.triage_records
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Enable realtime for triage-related changes
ALTER PUBLICATION supabase_realtime ADD TABLE public.triage_records;


-- 1. Tabela de Avaliação de Enfermagem
CREATE TABLE public.nursing_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id text NOT NULL,
  agendamento_id text,
  professional_id text NOT NULL,
  unit_id text NOT NULL DEFAULT '',
  evaluation_date date NOT NULL DEFAULT CURRENT_DATE,
  anamnese_resumida text NOT NULL DEFAULT '',
  condicao_clinica text NOT NULL DEFAULT '',
  avaliacao_risco text NOT NULL DEFAULT '',
  prioridade text NOT NULL DEFAULT 'media',
  observacoes_clinicas text NOT NULL DEFAULT '',
  resultado text NOT NULL DEFAULT 'apto',
  motivo_inapto text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nursing_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read nursing_evaluations" ON public.nursing_evaluations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth users manage nursing_evaluations" ON public.nursing_evaluations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Tabela PTS (Projeto Terapêutico Singular)
CREATE TABLE public.pts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id text NOT NULL,
  professional_id text NOT NULL,
  unit_id text NOT NULL DEFAULT '',
  diagnostico_funcional text NOT NULL DEFAULT '',
  objetivos_terapeuticos text NOT NULL DEFAULT '',
  metas_curto_prazo text NOT NULL DEFAULT '',
  metas_medio_prazo text NOT NULL DEFAULT '',
  metas_longo_prazo text NOT NULL DEFAULT '',
  especialidades_envolvidas text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read pts" ON public.pts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth users manage pts" ON public.pts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Adicionar campo tipo_registro ao prontuários
ALTER TABLE public.prontuarios ADD COLUMN IF NOT EXISTS tipo_registro text NOT NULL DEFAULT 'consulta';

-- 4. Adicionar campos SOAP ao prontuários
ALTER TABLE public.prontuarios ADD COLUMN IF NOT EXISTS soap_subjetivo text DEFAULT '';
ALTER TABLE public.prontuarios ADD COLUMN IF NOT EXISTS soap_objetivo text DEFAULT '';
ALTER TABLE public.prontuarios ADD COLUMN IF NOT EXISTS soap_avaliacao text DEFAULT '';
ALTER TABLE public.prontuarios ADD COLUMN IF NOT EXISTS soap_plano text DEFAULT '';

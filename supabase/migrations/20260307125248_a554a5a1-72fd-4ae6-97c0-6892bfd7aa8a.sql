
-- Create funcionarios table
CREATE TABLE IF NOT EXISTS public.funcionarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE,
  nome text NOT NULL,
  usuario text UNIQUE NOT NULL,
  email text NOT NULL,
  setor text DEFAULT '',
  unidade_id text DEFAULT '',
  sala_id text DEFAULT '',
  cargo text DEFAULT '',
  role text NOT NULL DEFAULT 'recepcao',
  ativo boolean DEFAULT true,
  criado_em timestamptz DEFAULT now(),
  criado_por text DEFAULT ''
);

ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read funcionarios"
ON public.funcionarios FOR SELECT TO authenticated USING (true);

-- Create prontuarios table
CREATE TABLE IF NOT EXISTS public.prontuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id text NOT NULL,
  paciente_nome text NOT NULL,
  profissional_id text NOT NULL,
  profissional_nome text NOT NULL,
  unidade_id text NOT NULL,
  sala_id text DEFAULT '',
  setor text DEFAULT '',
  agendamento_id text DEFAULT '',
  data_atendimento date NOT NULL DEFAULT CURRENT_DATE,
  hora_atendimento text DEFAULT '',
  queixa_principal text DEFAULT '',
  anamnese text DEFAULT '',
  sinais_sintomas text DEFAULT '',
  exame_fisico text DEFAULT '',
  hipotese text DEFAULT '',
  conduta text DEFAULT '',
  prescricao text DEFAULT '',
  solicitacao_exames text DEFAULT '',
  evolucao text DEFAULT '',
  observacoes text DEFAULT '',
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

ALTER TABLE public.prontuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read prontuarios"
ON public.prontuarios FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert prontuarios"
ON public.prontuarios FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update prontuarios"
ON public.prontuarios FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Trigger for updated_at on prontuarios
CREATE OR REPLACE FUNCTION update_prontuarios_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER prontuarios_updated_at
BEFORE UPDATE ON public.prontuarios
FOR EACH ROW EXECUTE FUNCTION update_prontuarios_updated_at();

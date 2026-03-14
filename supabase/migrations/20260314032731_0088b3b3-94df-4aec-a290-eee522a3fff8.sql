
-- 1. Add CNS field to pacientes
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS cns text NOT NULL DEFAULT '';

-- 2. Create procedimentos table
CREATE TABLE public.procedimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  profissao text NOT NULL DEFAULT '',
  especialidade text NOT NULL DEFAULT '',
  profissional_id text DEFAULT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.procedimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read procedimentos" ON public.procedimentos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Auth users manage procedimentos" ON public.procedimentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Create episodios_clinicos table
CREATE TABLE public.episodios_clinicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id text NOT NULL,
  profissional_id text NOT NULL,
  profissional_nome text NOT NULL DEFAULT '',
  unidade_id text NOT NULL DEFAULT '',
  titulo text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  tipo text NOT NULL DEFAULT 'tratamento',
  status text NOT NULL DEFAULT 'ativo',
  data_inicio date NOT NULL DEFAULT CURRENT_DATE,
  data_fim date DEFAULT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.episodios_clinicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read episodios" ON public.episodios_clinicos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage episodios" ON public.episodios_clinicos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Create prontuario_procedimentos junction table
CREATE TABLE public.prontuario_procedimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prontuario_id uuid NOT NULL REFERENCES public.prontuarios(id) ON DELETE CASCADE,
  procedimento_id uuid NOT NULL REFERENCES public.procedimentos(id) ON DELETE CASCADE,
  observacao text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prontuario_procedimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read prontuario_procedimentos" ON public.prontuario_procedimentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage prontuario_procedimentos" ON public.prontuario_procedimentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Add new fields to prontuarios
ALTER TABLE public.prontuarios ADD COLUMN IF NOT EXISTS indicacao_retorno text NOT NULL DEFAULT '';
ALTER TABLE public.prontuarios ADD COLUMN IF NOT EXISTS motivo_alteracao text NOT NULL DEFAULT '';
ALTER TABLE public.prontuarios ADD COLUMN IF NOT EXISTS episodio_id uuid DEFAULT NULL;
ALTER TABLE public.prontuarios ADD COLUMN IF NOT EXISTS procedimentos_texto text NOT NULL DEFAULT '';
ALTER TABLE public.prontuarios ADD COLUMN IF NOT EXISTS outro_procedimento text NOT NULL DEFAULT '';

-- 6. Add realtime for episodios
ALTER PUBLICATION supabase_realtime ADD TABLE public.procedimentos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.episodios_clinicos;

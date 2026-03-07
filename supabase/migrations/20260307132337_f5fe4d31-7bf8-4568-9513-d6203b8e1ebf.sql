
-- Add tempo_atendimento (consultation duration in minutes) to funcionarios
ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS tempo_atendimento integer NOT NULL DEFAULT 30;

-- Create atendimentos table for tracking appointment sessions
CREATE TABLE public.atendimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id text NOT NULL DEFAULT '',
  paciente_id text NOT NULL,
  paciente_nome text NOT NULL,
  profissional_id text NOT NULL,
  profissional_nome text NOT NULL,
  unidade_id text NOT NULL DEFAULT '',
  sala_id text NOT NULL DEFAULT '',
  setor text NOT NULL DEFAULT '',
  procedimento text NOT NULL DEFAULT '',
  observacoes text NOT NULL DEFAULT '',
  data date NOT NULL DEFAULT CURRENT_DATE,
  hora_inicio text NOT NULL DEFAULT '',
  hora_fim text NOT NULL DEFAULT '',
  duracao_minutos integer,
  status text NOT NULL DEFAULT 'em_atendimento',
  criado_em timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;

-- RLS policies for atendimentos
CREATE POLICY "Auth users read atendimentos" ON public.atendimentos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth users insert atendimentos" ON public.atendimentos
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users update atendimentos" ON public.atendimentos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Enable realtime for atendimentos
ALTER PUBLICATION supabase_realtime ADD TABLE public.atendimentos;

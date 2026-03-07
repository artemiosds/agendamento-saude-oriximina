
-- Create pacientes table
CREATE TABLE IF NOT EXISTS public.pacientes (
  id text PRIMARY KEY,
  nome text NOT NULL,
  cpf text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  data_nascimento text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  endereco text NOT NULL DEFAULT '',
  observacoes text NOT NULL DEFAULT '',
  criado_em timestamptz DEFAULT now()
);

ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read pacientes" ON public.pacientes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Auth users insert pacientes" ON public.pacientes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon insert pacientes" ON public.pacientes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth users update pacientes" ON public.pacientes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users delete pacientes" ON public.pacientes FOR DELETE TO authenticated USING (true);

-- Create agendamentos table
CREATE TABLE IF NOT EXISTS public.agendamentos (
  id text PRIMARY KEY,
  paciente_id text NOT NULL DEFAULT '',
  paciente_nome text NOT NULL DEFAULT '',
  unidade_id text NOT NULL DEFAULT '',
  sala_id text NOT NULL DEFAULT '',
  setor_id text NOT NULL DEFAULT '',
  profissional_id text NOT NULL DEFAULT '',
  profissional_nome text NOT NULL DEFAULT '',
  data date NOT NULL DEFAULT CURRENT_DATE,
  hora text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pendente',
  tipo text NOT NULL DEFAULT 'Consulta',
  observacoes text NOT NULL DEFAULT '',
  origem text NOT NULL DEFAULT 'recepcao',
  google_event_id text DEFAULT '',
  sync_status text DEFAULT 'pendente',
  criado_em timestamptz DEFAULT now(),
  criado_por text NOT NULL DEFAULT ''
);

ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read agendamentos" ON public.agendamentos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone insert agendamentos" ON public.agendamentos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Auth users update agendamentos" ON public.agendamentos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users delete agendamentos" ON public.agendamentos FOR DELETE TO authenticated USING (true);

-- Create fila_espera table
CREATE TABLE IF NOT EXISTS public.fila_espera (
  id text PRIMARY KEY,
  paciente_id text NOT NULL DEFAULT '',
  paciente_nome text NOT NULL DEFAULT '',
  unidade_id text NOT NULL DEFAULT '',
  profissional_id text DEFAULT '',
  setor text NOT NULL DEFAULT '',
  prioridade text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'aguardando',
  posicao integer NOT NULL DEFAULT 0,
  hora_chegada text NOT NULL DEFAULT '',
  hora_chamada text DEFAULT '',
  observacoes text DEFAULT '',
  criado_por text NOT NULL DEFAULT 'sistema',
  criado_em timestamptz DEFAULT now()
);

ALTER TABLE public.fila_espera ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read fila" ON public.fila_espera FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert fila" ON public.fila_espera FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users update fila" ON public.fila_espera FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users delete fila" ON public.fila_espera FOR DELETE TO authenticated USING (true);

-- Create bloqueios table for holidays/vacations/meetings
CREATE TABLE IF NOT EXISTS public.bloqueios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_id text DEFAULT '',
  unidade_id text DEFAULT '',
  tipo text NOT NULL DEFAULT 'feriado',
  titulo text NOT NULL DEFAULT '',
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  hora_inicio text DEFAULT '',
  hora_fim text DEFAULT '',
  dia_inteiro boolean DEFAULT true,
  criado_em timestamptz DEFAULT now(),
  criado_por text NOT NULL DEFAULT ''
);

ALTER TABLE public.bloqueios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read bloqueios" ON public.bloqueios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon read bloqueios" ON public.bloqueios FOR SELECT TO anon USING (true);
CREATE POLICY "Auth users manage bloqueios" ON public.bloqueios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Fix existing RESTRICTIVE policies to PERMISSIVE
-- atendimentos
DROP POLICY IF EXISTS "Auth users insert atendimentos" ON public.atendimentos;
DROP POLICY IF EXISTS "Auth users read atendimentos" ON public.atendimentos;
DROP POLICY IF EXISTS "Auth users update atendimentos" ON public.atendimentos;
CREATE POLICY "Auth users insert atendimentos" ON public.atendimentos AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users read atendimentos" ON public.atendimentos AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users update atendimentos" ON public.atendimentos AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- prontuarios
DROP POLICY IF EXISTS "Auth users insert prontuarios" ON public.prontuarios;
DROP POLICY IF EXISTS "Auth users read prontuarios" ON public.prontuarios;
DROP POLICY IF EXISTS "Auth users update prontuarios" ON public.prontuarios;
CREATE POLICY "Auth users insert prontuarios" ON public.prontuarios AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users read prontuarios" ON public.prontuarios AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users update prontuarios" ON public.prontuarios AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- disponibilidades
DROP POLICY IF EXISTS "Anyone can read disponibilidades" ON public.disponibilidades;
DROP POLICY IF EXISTS "Auth users delete disponibilidades" ON public.disponibilidades;
DROP POLICY IF EXISTS "Auth users insert disponibilidades" ON public.disponibilidades;
DROP POLICY IF EXISTS "Auth users update disponibilidades" ON public.disponibilidades;
CREATE POLICY "Anyone can read disponibilidades" ON public.disponibilidades AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Auth users delete disponibilidades" ON public.disponibilidades AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "Auth users insert disponibilidades" ON public.disponibilidades AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users update disponibilidades" ON public.disponibilidades AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- funcionarios
DROP POLICY IF EXISTS "Anyone can read funcionarios" ON public.funcionarios;
CREATE POLICY "Anyone can read funcionarios" ON public.funcionarios AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);

-- unidades
DROP POLICY IF EXISTS "Anyone can read unidades" ON public.unidades;
DROP POLICY IF EXISTS "Auth users manage unidades" ON public.unidades;
CREATE POLICY "Anyone can read unidades" ON public.unidades AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Auth users manage unidades" ON public.unidades AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- salas
DROP POLICY IF EXISTS "Anyone can read salas" ON public.salas;
DROP POLICY IF EXISTS "Auth users manage salas" ON public.salas;
CREATE POLICY "Anyone can read salas" ON public.salas AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Auth users manage salas" ON public.salas AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- google_calendar_tokens
DROP POLICY IF EXISTS "Anyone can read tokens" ON public.google_calendar_tokens;
DROP POLICY IF EXISTS "Service role manages tokens" ON public.google_calendar_tokens;
CREATE POLICY "Anyone can read tokens" ON public.google_calendar_tokens AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages tokens" ON public.google_calendar_tokens AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

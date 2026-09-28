-- Isolated PostgreSQL fixture for the candidate migration. No production data.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.unidades (id text PRIMARY KEY, ativo boolean NOT NULL DEFAULT true);
CREATE TABLE public.funcionarios (
  id uuid PRIMARY KEY, auth_user_id uuid, nome text NOT NULL,
  unidade_id text, role text NOT NULL, ativo boolean DEFAULT true
);
CREATE TABLE public.pacientes (id text PRIMARY KEY, nome text NOT NULL);
CREATE TABLE public.profissionais_externos (
  id uuid PRIMARY KEY, auth_user_id uuid, nome text NOT NULL, ativo boolean DEFAULT true
);
CREATE TABLE public.quotas_externas (
  id uuid PRIMARY KEY, profissional_externo_id uuid NOT NULL,
  profissional_interno_id uuid NOT NULL, unidade_id text NOT NULL,
  vagas_total integer NOT NULL, vagas_usadas integer NOT NULL DEFAULT 0,
  periodo_inicio date NOT NULL, periodo_fim date NOT NULL,
  dia_semana integer, turno text, horario_inicio time, horario_fim time,
  ativo boolean DEFAULT true
);
CREATE TABLE public.disponibilidades (
  id text PRIMARY KEY, profissional_id text NOT NULL, unidade_id text NOT NULL,
  data_inicio date NOT NULL, data_fim date NOT NULL, dias_semana integer[] NOT NULL,
  hora_inicio text NOT NULL, hora_fim text NOT NULL,
  vagas_por_hora integer NOT NULL, vagas_por_dia integer NOT NULL,
  duracao_consulta integer NOT NULL DEFAULT 30
);
CREATE TABLE public.bloqueios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), data_inicio date NOT NULL, data_fim date NOT NULL,
  unidade_id text DEFAULT '', profissional_id text DEFAULT '', dia_inteiro boolean DEFAULT true,
  hora_inicio text DEFAULT '', hora_fim text DEFAULT ''
);
CREATE TABLE public.agendamentos (
  id text PRIMARY KEY, paciente_id text NOT NULL, paciente_nome text NOT NULL,
  unidade_id text NOT NULL, profissional_id text NOT NULL, profissional_nome text NOT NULL,
  data date NOT NULL, hora text NOT NULL, tipo text NOT NULL DEFAULT 'Consulta',
  status text NOT NULL DEFAULT 'pendente', origem text NOT NULL DEFAULT 'recepcao',
  criado_por text NOT NULL DEFAULT '', agendado_por_externo text DEFAULT '',
  observacoes text NOT NULL DEFAULT ''
);
CREATE TABLE public.agendamentos_externos (
  id uuid PRIMARY KEY, paciente_id text NOT NULL, profissional_externo_id uuid NOT NULL,
  profissional_interno_id uuid NOT NULL, unidade_id text NOT NULL, cota_id uuid NOT NULL,
  data date NOT NULL, horario time NOT NULL, turno text NOT NULL,
  status text NOT NULL DEFAULT 'pendente'
);
CREATE TABLE public.permissoes (
  perfil text NOT NULL, modulo text NOT NULL, unidade_id text NOT NULL DEFAULT '',
  can_edit boolean NOT NULL DEFAULT false
);
CREATE TABLE public.permissoes_usuario (
  user_id text NOT NULL, modulo text NOT NULL, unidade_id text NOT NULL DEFAULT '',
  can_edit boolean NOT NULL DEFAULT false
);
CREATE TABLE public.action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL,
  user_nome text NOT NULL, role text NOT NULL, unidade_id text NOT NULL,
  acao text NOT NULL, entidade text NOT NULL, entidade_id text NOT NULL,
  modulo text, agendamento_id text, paciente_id text, profissional_id text,
  before jsonb, after jsonb, detalhes jsonb
);

CREATE FUNCTION public.is_date_blocked(p_date date, p_profissional_id text, p_unidade_id text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.bloqueios b
    WHERE p_date BETWEEN b.data_inicio AND b.data_fim
      AND (b.profissional_id = p_profissional_id OR b.unidade_id = p_unidade_id
        OR (coalesce(b.profissional_id, '') = '' AND coalesce(b.unidade_id, '') = ''))
      AND (b.dia_inteiro OR coalesce(b.hora_inicio, '') = ''))
$$;

ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos_externos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotas_externas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Fixture direct agendamentos" ON public.agendamentos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE POLICY "Fixture direct quotas" ON public.quotas_externas FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE POLICY "Fixture read external ledger" ON public.agendamentos_externos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Externos podem criar seus agendamentos" ON public.agendamentos_externos
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Externos podem atualizar seus agendamentos" ON public.agendamentos_externos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

INSERT INTO public.unidades VALUES ('u1', true), ('u2', true);
INSERT INTO public.funcionarios VALUES
  ('11111111-1111-4111-8111-111111111111', NULL, 'Profissional interno', 'u1', 'profissional', true),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Recepção U1', 'u1', 'recepcao', true),
  ('33333333-3333-4333-8333-333333333333', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Recepção U2', 'u2', 'recepcao', true),
  ('44444444-4444-4444-8444-444444444444', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Master', 'u2', 'master', true);
INSERT INTO public.profissionais_externos VALUES
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Externo A', true),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', '99999999-9999-4999-8999-999999999999', 'Externo B', true);
INSERT INTO public.pacientes VALUES ('p1', 'Paciente 1'), ('p2', 'Paciente 2'),
  ('p3', 'Paciente 3'), ('p4', 'Paciente 4'), ('p5', 'Paciente 5');
INSERT INTO public.quotas_externas VALUES
  ('77777777-7777-4777-8777-777777777777', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
   '11111111-1111-4111-8111-111111111111', 'u1', 3, 0, current_date + 1, current_date + 30,
   NULL, 'manha', '08:00', '12:00', true),
  ('88888888-8888-4888-8888-888888888888', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
   '11111111-1111-4111-8111-111111111111', 'u1', 1, 0, current_date + 1, current_date + 30,
   NULL, 'manha', '08:00', '12:00', true);
INSERT INTO public.disponibilidades VALUES
  ('d1', '11111111-1111-4111-8111-111111111111', 'u1', current_date + 1, current_date + 30,
   ARRAY[0,1,2,3,4,5,6], '08:00', '12:00', 4, 10, 30);
INSERT INTO public.permissoes VALUES ('recepcao', 'agenda', '', true);

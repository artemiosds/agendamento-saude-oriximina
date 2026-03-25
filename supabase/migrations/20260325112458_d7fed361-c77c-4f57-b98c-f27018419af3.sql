
CREATE TABLE public.permissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil text NOT NULL,
  modulo text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_execute boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (perfil, modulo)
);

ALTER TABLE public.permissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read permissoes" ON public.permissoes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth users manage permissoes" ON public.permissoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed default permissions for all roles and modules
INSERT INTO public.permissoes (perfil, modulo, can_view, can_create, can_edit, can_delete, can_execute) VALUES
-- MASTER (full access)
('master', 'pacientes', true, true, true, true, true),
('master', 'encaminhamento', true, true, true, true, true),
('master', 'fila', true, true, true, true, true),
('master', 'triagem', true, true, true, true, true),
('master', 'enfermagem', true, true, true, true, true),
('master', 'agenda', true, true, true, true, true),
('master', 'atendimento', true, true, true, true, true),
('master', 'prontuario', true, true, true, true, true),
('master', 'tratamento', true, true, true, true, true),
('master', 'relatorios', true, true, true, true, true),
('master', 'usuarios', true, true, true, true, true),
-- GESTÃO
('gestao', 'pacientes', true, false, false, false, false),
('gestao', 'encaminhamento', true, false, false, false, false),
('gestao', 'fila', true, false, false, false, false),
('gestao', 'triagem', true, false, false, false, false),
('gestao', 'enfermagem', true, false, false, false, false),
('gestao', 'agenda', true, false, false, false, false),
('gestao', 'atendimento', true, false, false, false, false),
('gestao', 'prontuario', true, false, false, false, false),
('gestao', 'tratamento', true, false, false, false, false),
('gestao', 'relatorios', true, true, true, false, true),
('gestao', 'usuarios', false, false, false, false, false),
-- RECEPÇÃO
('recepcao', 'pacientes', true, true, true, false, true),
('recepcao', 'encaminhamento', true, true, true, false, true),
('recepcao', 'fila', true, true, true, false, true),
('recepcao', 'triagem', false, false, false, false, false),
('recepcao', 'enfermagem', false, false, false, false, false),
('recepcao', 'agenda', true, true, true, true, true),
('recepcao', 'atendimento', true, false, false, false, false),
('recepcao', 'prontuario', false, false, false, false, false),
('recepcao', 'tratamento', true, false, false, false, false),
('recepcao', 'relatorios', true, false, false, false, false),
('recepcao', 'usuarios', false, false, false, false, false),
-- TRIAGEM (tecnico)
('tecnico', 'pacientes', true, false, false, false, false),
('tecnico', 'encaminhamento', true, false, false, false, false),
('tecnico', 'fila', true, false, false, false, false),
('tecnico', 'triagem', true, true, true, false, true),
('tecnico', 'enfermagem', false, false, false, false, false),
('tecnico', 'agenda', true, false, false, false, false),
('tecnico', 'atendimento', false, false, false, false, false),
('tecnico', 'prontuario', false, false, false, false, false),
('tecnico', 'tratamento', false, false, false, false, false),
('tecnico', 'relatorios', false, false, false, false, false),
('tecnico', 'usuarios', false, false, false, false, false),
-- ENFERMAGEM
('enfermagem', 'pacientes', true, false, true, false, false),
('enfermagem', 'encaminhamento', true, false, false, false, false),
('enfermagem', 'fila', true, false, false, false, false),
('enfermagem', 'triagem', true, false, false, false, false),
('enfermagem', 'enfermagem', true, true, true, false, true),
('enfermagem', 'agenda', true, false, false, false, false),
('enfermagem', 'atendimento', true, false, false, false, true),
('enfermagem', 'prontuario', true, true, false, false, false),
('enfermagem', 'tratamento', true, false, false, false, false),
('enfermagem', 'relatorios', true, false, false, false, false),
('enfermagem', 'usuarios', false, false, false, false, false),
-- PROFISSIONAL
('profissional', 'pacientes', true, false, true, false, false),
('profissional', 'encaminhamento', true, false, false, false, false),
('profissional', 'fila', true, false, false, false, false),
('profissional', 'triagem', false, false, false, false, false),
('profissional', 'enfermagem', false, false, false, false, false),
('profissional', 'agenda', true, true, true, false, true),
('profissional', 'atendimento', true, true, true, false, true),
('profissional', 'prontuario', true, true, true, false, true),
('profissional', 'tratamento', true, true, true, false, true),
('profissional', 'relatorios', true, false, false, false, false),
('profissional', 'usuarios', false, false, false, false, false);

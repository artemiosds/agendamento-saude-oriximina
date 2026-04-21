-- Tabela de códigos CBO
CREATE TABLE IF NOT EXISTS public.cbo_codigos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  descricao text NOT NULL,
  profissoes_relacionadas text[] NOT NULL DEFAULT '{}',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cbo_codigos_codigo ON public.cbo_codigos(codigo);
CREATE INDEX IF NOT EXISTS idx_cbo_codigos_descricao ON public.cbo_codigos USING gin (to_tsvector('portuguese', descricao));

ALTER TABLE public.cbo_codigos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read cbo_codigos"
  ON public.cbo_codigos FOR SELECT
  TO authenticated
  USING (is_staff_member());

CREATE POLICY "Master manage cbo_codigos"
  ON public.cbo_codigos FOR ALL
  TO authenticated
  USING (has_staff_role('master'))
  WITH CHECK (has_staff_role('master'));

CREATE TRIGGER trg_cbo_codigos_updated_at
  BEFORE UPDATE ON public.cbo_codigos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

-- Seed dos CBOs mais comuns na área da saúde
INSERT INTO public.cbo_codigos (codigo, descricao, profissoes_relacionadas) VALUES
  ('225125', 'MEDICO CLINICO', ARRAY['medico','medicina']),
  ('225124', 'MEDICO DA ESTRATEGIA DE SAUDE DA FAMILIA', ARRAY['medico','medicina']),
  ('225133', 'MEDICO PEDIATRA', ARRAY['medico','pediatra']),
  ('225250', 'MEDICO GINECOLOGISTA E OBSTETRA', ARRAY['medico','ginecologista','obstetra']),
  ('225135', 'MEDICO PSIQUIATRA', ARRAY['medico','psiquiatra']),
  ('225155', 'MEDICO NEUROLOGISTA', ARRAY['medico','neurologista']),
  ('225170', 'MEDICO ORTOPEDISTA E TRAUMATOLOGISTA', ARRAY['medico','ortopedista']),
  ('225151', 'MEDICO CARDIOLOGISTA', ARRAY['medico','cardiologista']),
  ('225320', 'MEDICO EM RADIOLOGIA E DIAGNOSTICO POR IMAGEM', ARRAY['medico','radiologista']),
  ('225275', 'MEDICO DERMATOLOGISTA', ARRAY['medico','dermatologista']),
  ('223505', 'ENFERMEIRO', ARRAY['enfermeiro','enfermagem']),
  ('223565', 'ENFERMEIRO DA ESTRATEGIA DE SAUDE DA FAMILIA', ARRAY['enfermeiro','enfermagem']),
  ('223535', 'ENFERMEIRO OBSTETRICO', ARRAY['enfermeiro','obstetricia']),
  ('322205', 'TECNICO DE ENFERMAGEM', ARRAY['tecnico de enfermagem','tecnico enfermagem','tecnico']),
  ('322230', 'AUXILIAR DE ENFERMAGEM', ARRAY['auxiliar de enfermagem','auxiliar enfermagem']),
  ('223605', 'FISIOTERAPEUTA GERAL', ARRAY['fisioterapeuta','fisioterapia']),
  ('223625', 'FISIOTERAPEUTA NEUROFUNCIONAL', ARRAY['fisioterapeuta','neurofuncional']),
  ('223630', 'FISIOTERAPEUTA RESPIRATORIA', ARRAY['fisioterapeuta','respiratoria']),
  ('223635', 'FISIOTERAPEUTA TRAUMATO-ORTOPEDICA', ARRAY['fisioterapeuta','ortopedica']),
  ('251510', 'PSICOLOGO CLINICO', ARRAY['psicologo','psicologia']),
  ('251515', 'PSICOLOGO EDUCACIONAL', ARRAY['psicologo','educacional']),
  ('251525', 'PSICOLOGO HOSPITALAR', ARRAY['psicologo','hospitalar']),
  ('223810', 'FONOAUDIOLOGO', ARRAY['fonoaudiologo','fonoaudiologia']),
  ('223905', 'TERAPEUTA OCUPACIONAL', ARRAY['terapeuta ocupacional','terapia ocupacional','to']),
  ('223710', 'NUTRICIONISTA', ARRAY['nutricionista','nutricao']),
  ('223208', 'CIRURGIAO-DENTISTA - CLINICO GERAL', ARRAY['odontologo','dentista','odontologia']),
  ('223293', 'CIRURGIAO-DENTISTA DA ESTRATEGIA DE SAUDE DA FAMILIA', ARRAY['odontologo','dentista']),
  ('223212', 'CIRURGIAO-DENTISTA - ENDODONTISTA', ARRAY['odontologo','endodontista']),
  ('223240', 'CIRURGIAO-DENTISTA - ORTODONTISTA', ARRAY['odontologo','ortodontista']),
  ('322415', 'AUXILIAR EM SAUDE BUCAL', ARRAY['auxiliar saude bucal','asb']),
  ('322420', 'TECNICO EM SAUDE BUCAL', ARRAY['tecnico saude bucal','tsb']),
  ('251605', 'ASSISTENTE SOCIAL', ARRAY['assistente social','servico social']),
  ('223405', 'FARMACEUTICO', ARRAY['farmaceutico','farmacia']),
  ('223415', 'FARMACEUTICO ANALISTA CLINICO', ARRAY['farmaceutico']),
  ('225320', 'MEDICO RADIOLOGISTA', ARRAY['medico','radiologista']),
  ('322110', 'TECNICO EM RADIOLOGIA E IMAGENOLOGIA', ARRAY['tecnico radiologia']),
  ('225285', 'MEDICO INFECTOLOGISTA', ARRAY['medico','infectologista']),
  ('225235', 'MEDICO UROLOGISTA', ARRAY['medico','urologista']),
  ('225260', 'MEDICO ENDOCRINOLOGISTA E METABOLOGISTA', ARRAY['medico','endocrinologista']),
  ('225265', 'MEDICO GASTROENTEROLOGISTA', ARRAY['medico','gastroenterologista']),
  ('225105', 'MEDICO ANESTESIOLOGISTA', ARRAY['medico','anestesiologista']),
  ('225210', 'MEDICO CIRURGIAO GERAL', ARRAY['medico','cirurgiao']),
  ('225215', 'MEDICO CIRURGIAO PEDIATRICO', ARRAY['medico','cirurgiao pediatrico']),
  ('225130', 'MEDICO GERIATRA', ARRAY['medico','geriatra']),
  ('225140', 'MEDICO HOMEOPATA', ARRAY['medico','homeopata']),
  ('225142', 'MEDICO ACUPUNTURISTA', ARRAY['medico','acupunturista']),
  ('225330', 'MEDICO OFTALMOLOGISTA', ARRAY['medico','oftalmologista']),
  ('225340', 'MEDICO OTORRINOLARINGOLOGISTA', ARRAY['medico','otorrinolaringologista']),
  ('225280', 'MEDICO REUMATOLOGISTA', ARRAY['medico','reumatologista']),
  ('225295', 'MEDICO NEFROLOGISTA', ARRAY['medico','nefrologista']),
  ('225298', 'MEDICO PNEUMOLOGISTA', ARRAY['medico','pneumologista']),
  ('322135', 'TECNICO DE LABORATORIO CLINICO', ARRAY['tecnico laboratorio']),
  ('234705', 'BIOMEDICO', ARRAY['biomedico','biomedicina']),
  ('325010', 'TECNICO EM FARMACIA', ARRAY['tecnico farmacia']),
  ('515105', 'AGENTE COMUNITARIO DE SAUDE', ARRAY['acs','agente comunitario']),
  ('515140', 'AGENTE DE COMBATE AS ENDEMIAS', ARRAY['ace','agente endemias']),
  ('322145', 'TECNICO EM IMOBILIZACAO ORTOPEDICA', ARRAY['tecnico ortopedia']),
  ('239440', 'EDUCADOR FISICO', ARRAY['educador fisico','educacao fisica','profissional educacao fisica']),
  ('411005', 'AUXILIAR DE ESCRITORIO', ARRAY['recepcao','recepcionista','administrativo']),
  ('422105', 'RECEPCIONISTA', ARRAY['recepcao','recepcionista']),
  ('252305', 'ADMINISTRADOR', ARRAY['administrador','gestao','master','coordenador'])
ON CONFLICT (codigo) DO NOTHING;
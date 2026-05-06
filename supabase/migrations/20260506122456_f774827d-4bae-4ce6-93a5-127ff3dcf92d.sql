-- Limpar a tabela atual para garantir a integridade dos dados oficiais do PDF
TRUNCATE TABLE public.cbo_codigos;

-- Inserção da lista completa baseada no PDF fornecido
INSERT INTO public.cbo_codigos (codigo, descricao, ativo, profissoes_relacionadas) VALUES
-- GRUPO: AGENTES E SAÚDE PÚBLICA
('515105', 'AGENTE COMUNITÁRIO DE SAÚDE', true, ARRAY['agente saude', 'acs']),
('515310', 'AGENTE DE AÇÃO SOCIAL', true, ARRAY['agente social']),
('515140', 'AGENTE DE COMBATE ÀS ENDEMIAS', true, ARRAY['agente endemias', 'ace']),
('352210', 'AGENTE DE SAÚDE PÚBLICA', true, ARRAY['saude publica']),
('515130', 'AGENTE INDÍGENA DE SANEAMENTO', true, ARRAY['saneamento indigena']),
('515124', 'AGENTE INDÍGENA DE SAÚDE', true, ARRAY['saude indigena']),
('515120', 'VISITADOR SANITÁRIO', true, ARRAY['visitador']),

-- GRUPO: CORPO CLÍNICO - MÉDICOS (ESPECIALIDADES CLÍNICAS E CIRÚRGICAS)
('225125', 'MÉDICO CLÍNICO', true, ARRAY['clinico geral', 'medico']),
('225225', 'MÉDICO CIRURGIÃO GERAL', true, ARRAY['ciruriao geral', 'cirurgiao']),
('225142', 'MÉDICO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA', true, ARRAY['medico esf', 'psf']),
('225130', 'MÉDICO DE FAMÍLIA E COMUNIDADE', true, ARRAY['medico familia']),
('225124', 'MÉDICO PEDIATRA', true, ARRAY['pediatra']),
('225250', 'MÉDICO GINECOLOGISTA E OBSTETRA', true, ARRAY['ginecologista', 'obstetra']),
('225133', 'MÉDICO PSIQUIATRA', true, ARRAY['psiquiatra']),
('225270', 'MÉDICO ORTOPEDISTA E TRAUMATOLOGISTA', true, ARRAY['ortopedista', 'traumatologista']),
('225265', 'MÉDICO OFTALMOLOGISTA', true, ARRAY['oftalmologista']),
('225120', 'MÉDICO CARDIOLOGISTA', true, ARRAY['cardiologista']),
('225135', 'MÉDICO DERMATOLOGISTA', true, ARRAY['dermatologista']),
('225275', 'MÉDICO OTORRINOLARINGOLOGISTA', true, ARRAY['otorrino']),
('225285', 'MÉDICO UROLOGISTA', true, ARRAY['urologista']),
('225112', 'MÉDICO NEUROLOGISTA', true, ARRAY['neurologista']),
('225260', 'MÉDICO NEUROCIRURGIÃO', true, ARRAY['neurocirurgiao']),
('225210', 'MÉDICO CIRURGIÃO CARDIOVASCULAR', true, ARRAY['cirurgiao cardiaco']),
('225230', 'MÉDICO CIRURGIÃO PEDIÁTRICO', true, ARRAY['cirurgiao pediatra']),
('225203', 'MÉDICO EM CIRURGIA VASCULAR', true, ARRAY['cirurgiao vascular']),
('225103', 'MÉDICO INFECTOLOGISTA', true, ARRAY['infectologista']),
('225105', 'MÉDICO ACUPUNTURISTA', true, ARRAY['acupuntura']),
('225110', 'MÉDICO ALERGISTA E IMUNOLOGISTA', true, ARRAY['alergista']),
('225155', 'MÉDICO ENDOCRINOLOGISTA E METABOLOGISTA', true, ARRAY['endocrinologista']),
('225165', 'MÉDICO GASTROENTEROLOGISTA', true, ARRAY['gastroenterologista']),
('225180', 'MÉDICO GERIATRA', true, ARRAY['geriatra']),
('225109', 'MÉDICO NEFROLOGISTA', true, ARRAY['nefrologista']),
('225121', 'MÉDICO ONCOLOGISTA CLÍNICO', true, ARRAY['oncologista']),
('225127', 'MÉDICO PNEUMOLOGISTA', true, ARRAY['pneumologista']),
('225136', 'MÉDICO REUMATOLOGISTA', true, ARRAY['reumatologista']),
('225255', 'MÉDICO MASTOLOGISTA', true, ARRAY['mastologista']),
('225140', 'MÉDICO DO TRABALHO', true, ARRAY['medicina trabalho']),
('2231F9', 'MÉDICO RESIDENTE', true, ARRAY['residente']),
('225139', 'MÉDICO SANITARISTA', true, ARRAY['sanitarista']),

-- GRUPO: ENFERMAGEM
('223505', 'ENFERMEIRO', true, ARRAY['enfermeiro']),
('223565', 'ENFERMEIRO DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA', true, ARRAY['enfermeiro esf']),
('322205', 'TÉCNICO DE ENFERMAGEM', true, ARRAY['tecnico enfermagem']),
('322245', 'TÉCNICO DE ENFERMAGEM DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA', true, ARRAY['tecnico esf']),
('322230', 'AUXILIAR DE ENFERMAGEM', true, ARRAY['auxiliar enfermagem']),
('223545', 'ENFERMEIRO OBSTÉTRICO', true, ARRAY['enfermeiro obstetra']),
('223550', 'ENFERMEIRO PSIQUIÁTRICO', true, ARRAY['enfermeiro psiquiatra']),

-- GRUPO: ODONTOLOGIA
('223208', 'CIRURGIÃO DENTISTA - CLÍNICO GERAL', true, ARRAY['dentista']),
('223293', 'CIRURGIÃO-DENTISTA DA ESTRATÉGIA DE SAÚDE DA FAMÍLIA', true, ARRAY['dentista esf']),
('322405', 'TÉCNICO EM SAÚDE BUCAL', true, ARRAY['tsb', 'tecnico bucal']),
('322415', 'AUXILIAR EM SAÚDE BUCAL', true, ARRAY['asb', 'auxiliar bucal']),
('223212', 'CIRURGIÃO DENTISTA - ENDODONTISTA', true, ARRAY['endodontista']),
('223248', 'CIRURGIÃO DENTISTA - PERIODONTISTA', true, ARRAY['periodontista']),
('223236', 'CIRURGIÃO DENTISTA - ODONTOPEDIATRA', true, ARRAY['odontopediatra']),
('223268', 'CIRURGIÃO DENTISTA - TRAUMATOLOGISTA BUCOMAXILOFACIAL', true, ARRAY['bucomaxilo']),

-- GRUPO: EQUIPE MULTIPROFISSIONAL (NASF / AMBULATÓRIO)
('251510', 'PSICÓLOGO CLÍNICO', true, ARRAY['psicologo']),
('223605', 'FISIOTERAPEUTA GERAL', true, ARRAY['fisioterapeuta']),
('223810', 'FONOAUDIÓLOGO', true, ARRAY['fonoaudiologo']),
('223710', 'NUTRICIONISTA', true, ARRAY['nutricionista']),
('223905', 'TERAPEUTA OCUPACIONAL', true, ARRAY['terapeuta ocupacional', 'to']),
('251605', 'ASSISTENTE SOCIAL', true, ARRAY['assistente social']),
('223405', 'FARMACÊUTICO', true, ARRAY['farmaceutico']),
('223445', 'FARMACÊUTICO HOSPITALAR E CLÍNICO', true, ARRAY['farmacia clinica']),
('224140', 'PROFISSIONAL DE EDUCAÇÃO FÍSICA NA SAÚDE', true, ARRAY['educador fisico']),
('226310', 'ARTETERAPEUTA', true, ARRAY['arteterapia']),
('226305', 'MUSICOTERAPEUTA', true, ARRAY['musicoterapia']),
('251550', 'PSICANALISTA', true, ARRAY['psicanalista']),
('251530', 'PSICÓLOGO SOCIAL', true, ARRAY['psicologo social']),

-- GRUPO: APOIO E ADMINISTRATIVO
('422105', 'RECEPCIONISTA, EM GERAL', true, ARRAY['recepcionista']),
('422110', 'RECEPCIONISTA DE CONSULTÓRIO MÉDICO OU DENTÁRIO', true, ARRAY['recepcao clinica']),
('411010', 'ASSISTENTE ADMINISTRATIVO', true, ARRAY['administrativo']),
('131210', 'GERENTE DE SERVIÇOS DE SAÚDE', true, ARRAY['gerente', 'gestor']),
('131205', 'DIRETOR DE SERVIÇOS DE SAÚDE', true, ARRAY['diretor']),
('131225', 'SANITARISTA', true, ARRAY['sanitarista']);

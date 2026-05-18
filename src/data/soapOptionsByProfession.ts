// SOAP dropdown options per profession
// Todas as profissões da saúde têm chips de seleção rápida.
// Médico mantém os chips como sugestões livres (campos não obrigatórios).

export interface SoapFieldOptions {
  subjetivo: string[];
  objetivo: string[];
  avaliacao: string[];
  plano: string[];
}

export const SOAP_OPTIONS: Record<string, SoapFieldOptions> = {
  fisioterapia: {
    subjetivo: [
      'Dor (escala 0-10)',
      'Limitação funcional',
      'Mecanismo de lesão',
      'Histórico de quedas',
      'Uso de órtese',
      'Qualidade do sono',
    ],
    objetivo: [
      'Amplitude de movimento (ADM)',
      'Força muscular (0-5)',
      'Tônus',
      'Reflexos',
      'Sensibilidade',
      'Edema (grau)',
      'Testes especiais',
      'Postura',
      'Marcha',
    ],
    avaliacao: [
      'Diagnóstico cinético-funcional',
      'Hipótese diagnóstica',
      'Fatores de risco',
      'Prognóstico',
    ],
    plano: [
      'Cinesioterapia',
      'Termoterapia',
      'Crioterapia',
      'Eletroterapia',
      'Ventosaterapia',
      'Liberação miofascial',
      'RPG',
      'Pilates',
      'Exercícios',
      'Orientações',
      'Reavaliação em (dias)',
    ],
  },
  enfermagem: {
    subjetivo: [
      'Queixa do paciente',
      'Percepção de saúde',
      'Adesão ao tratamento',
      'Condições sociofamiliares',
    ],
    objetivo: [
      'Sinais vitais (PA, FC, FR, T°, SpO2)',
      'Exame físico (pele, mucosas, hidratação, eliminações)',
      'Curativos',
      'Cateteres',
      'Drenos',
      'Escala de dor',
      'Escala de Glasgow',
    ],
    avaliacao: [
      'Diagnóstico de enfermagem (NANDA)',
      'Problemas identificados',
      'Riscos',
    ],
    plano: [
      'Cuidados de enfermagem',
      'Curativos',
      'Medicações administradas',
      'Orientações',
      'Encaminhamento',
    ],
  },
  odontologia: {
    subjetivo: [
      'Dor dentária (localização, intensidade, duração)',
      'Sensibilidade',
      'Traumatismo',
      'Hábitos (higiene, dieta, tabagismo)',
      'Próteses',
    ],
    objetivo: [
      'Exame intraoral (dentes, gengiva, mucosa, lesões)',
      'Exame extraoral (ATM, linfonodos)',
      'Sondagem periodontal',
      'Índice de placa',
      'Radiografias',
    ],
    avaliacao: [
      'Diagnóstico odontológico',
      'Necessidade de tratamento',
    ],
    plano: [
      'Restauração',
      'Exodontia',
      'Canal',
      'Profilaxia',
      'Flúor',
      'Encaminhamento',
      'Retorno',
      'Orientações de higiene',
    ],
  },
  psicologia: {
    subjetivo: [
      'Demanda',
      'Humor (triste, ansioso, irritado)',
      'Pensamentos (automáticos, ideação)',
      'Comportamento (isolamento, compulsões)',
      'Sono',
      'Apetite',
      'Relações',
    ],
    objetivo: [
      'Comportamento observado (postura, contato visual, afeto, fala)',
      'Testes aplicados',
      'Escalas (Beck, BAI, PHQ-9)',
    ],
    avaliacao: [
      'Hipóteses diagnósticas (CID)',
      'Estrutura de personalidade',
      'Dinâmica',
      'Recursos',
    ],
    plano: [
      'Técnicas utilizadas (TCC, psicanálise, etc.)',
      'Tarefas de casa',
      'Próxima sessão',
      'Encaminhamento',
    ],
  },
  fonoaudiologia: {
    subjetivo: [
      'Queixa de comunicação (fala, linguagem, voz, deglutição, audição)',
      'Desenvolvimento',
      'Histórico de infecções de ouvido',
      'Uso de AASI',
    ],
    objetivo: [
      'Avaliação da fala (articulação, fluência)',
      'Linguagem (compreensão, expressão)',
      'Voz (qualidade, intensidade)',
      'Deglutição (resíduos, tosse)',
      'Audiometria',
    ],
    avaliacao: [
      'Diagnóstico fonoaudiológico (dislalia, gagueira, disfagia, disfonia, TEA)',
      'Gravidade',
    ],
    plano: [
      'Terapia (técnicas específicas)',
      'Exercícios domiciliares',
      'Retorno',
      'Encaminhamento',
    ],
  },
  medicina: {
    subjetivo: [
      'Queixa principal',
      'História da doença atual (HDA)',
      'Antecedentes pessoais',
      'Antecedentes familiares',
      'Medicações em uso',
      'Alergias',
      'Hábitos de vida (tabagismo, etilismo, atividade física)',
    ],
    objetivo: [
      'Sinais vitais (PA, FC, FR, T°, SpO2)',
      'Estado geral',
      'Exame físico segmentar',
      'Ausculta cardiopulmonar',
      'Exame abdominal',
      'Exame neurológico',
      'Exames complementares',
    ],
    avaliacao: [
      'Hipótese diagnóstica (CID)',
      'Diagnóstico diferencial',
      'Estadiamento / gravidade',
      'Prognóstico',
    ],
    plano: [
      'Prescrição medicamentosa',
      'Solicitação de exames',
      'Encaminhamento para especialista',
      'Orientações ao paciente',
      'Atestado / licença',
      'Retorno em (dias)',
    ],
  },
  nutricao: {
    subjetivo: [
      'Hábitos alimentares',
      'Frequência de refeições',
      'Aversões / preferências',
      'Sintomas gastrointestinais',
      'Consumo de água',
      'Uso de suplementos',
    ],
    objetivo: [
      'Peso atual / habitual',
      'Altura',
      'IMC',
      'Circunferência abdominal',
      'Dobras cutâneas',
      'Bioimpedância',
      'Exames bioquímicos',
    ],
    avaliacao: [
      'Diagnóstico nutricional',
      'Risco nutricional',
      'Necessidades energéticas (GET)',
      'Necessidades de macronutrientes',
    ],
    plano: [
      'Plano alimentar individualizado',
      'Orientações nutricionais',
      'Suplementação',
      'Reavaliação antropométrica',
      'Encaminhamento',
    ],
  },
  terapia_ocupacional: {
    subjetivo: [
      'Queixa funcional',
      'Atividades de vida diária (AVDs)',
      'Atividades instrumentais (AIVDs)',
      'Papéis ocupacionais',
      'Histórico ocupacional',
    ],
    objetivo: [
      'Avaliação de AVDs (Barthel, MIF)',
      'Coordenação motora fina',
      'Preensão palmar',
      'Cognição (MEEM, MoCA)',
      'Integração sensorial',
    ],
    avaliacao: [
      'Diagnóstico ocupacional',
      'Nível de independência',
      'Potencial de reabilitação',
    ],
    plano: [
      'Treino de AVDs',
      'Adaptação de ambiente',
      'Órtese / tecnologia assistiva',
      'Estimulação cognitiva',
      'Orientação familiar',
    ],
  },
  servico_social: {
    subjetivo: [
      'Composição familiar',
      'Condições de moradia',
      'Renda familiar',
      'Acesso a benefícios sociais',
      'Rede de apoio',
      'Vulnerabilidades identificadas',
    ],
    objetivo: [
      'Documentação apresentada',
      'Cadastro Único (CadÚnico)',
      'Benefícios em vigor (BPC, Bolsa Família)',
      'Situação previdenciária',
    ],
    avaliacao: [
      'Diagnóstico social',
      'Demandas identificadas',
      'Direitos a acessar',
    ],
    plano: [
      'Encaminhamento à rede socioassistencial',
      'Orientação sobre direitos',
      'Articulação intersetorial',
      'Visita domiciliar',
      'Acompanhamento',
    ],
  },
  educacao_fisica: {
    subjetivo: [
      'Histórico de atividade física',
      'Objetivos do paciente',
      'Limitações / dores',
      'Disponibilidade semanal',
      'Preferências de treino',
    ],
    objetivo: [
      'Composição corporal',
      'Testes de força',
      'Testes de flexibilidade',
      'Teste cardiorrespiratório',
      'PAR-Q',
    ],
    avaliacao: [
      'Aptidão física',
      'Risco cardiovascular',
      'Classificação funcional',
    ],
    plano: [
      'Prescrição de exercícios',
      'Frequência / intensidade / volume',
      'Orientações de segurança',
      'Reavaliação periódica',
    ],
  },
  farmacia: {
    subjetivo: [
      'Medicações em uso',
      'Adesão ao tratamento',
      'Reações adversas relatadas',
      'Uso de fitoterápicos / automedicação',
      'Dúvidas sobre medicamentos',
    ],
    objetivo: [
      'Conciliação medicamentosa',
      'Interações medicamentosas',
      'Posologia / via de administração',
      'Exames laboratoriais relevantes',
    ],
    avaliacao: [
      'Problemas relacionados a medicamentos (PRM)',
      'Risco de iatrogenia',
      'Necessidade de ajuste posológico',
    ],
    plano: [
      'Orientação farmacêutica',
      'Sugestão de ajuste ao prescritor',
      'Acompanhamento farmacoterapêutico',
      'Dispensação',
      'Educação em saúde',
    ],
  },
  biomedicina: {
    subjetivo: [
      'Indicação clínica do exame',
      'Histórico de exames anteriores',
      'Sintomas relevantes',
      'Medicações em uso',
    ],
    objetivo: [
      'Coleta realizada',
      'Material biológico',
      'Condições da amostra',
      'Resultados laboratoriais',
    ],
    avaliacao: [
      'Análise dos resultados',
      'Valores de referência',
      'Necessidade de repetição',
    ],
    plano: [
      'Liberação de laudo',
      'Encaminhamento ao médico assistente',
      'Repetição de coleta',
      'Orientações ao paciente',
    ],
  },
  tecnico_enfermagem: {
    subjetivo: [
      'Queixas do paciente',
      'Aceitação de cuidados',
      'Eliminações',
      'Sono / repouso',
    ],
    objetivo: [
      'Sinais vitais (PA, FC, FR, T°, SpO2)',
      'Hidratação',
      'Curativos realizados',
      'Medicações administradas',
      'Procedimentos realizados',
    ],
    avaliacao: [
      'Evolução do quadro',
      'Intercorrências',
    ],
    plano: [
      'Cuidados de rotina',
      'Comunicação ao enfermeiro',
      'Reavaliação no próximo turno',
      'Orientações ao paciente / família',
    ],
  },
};

/**
 * Normalize profession string to match SOAP_OPTIONS keys
 */
export function normalizeProfissaoForSoap(profissao: string | undefined): string | null {
  if (!profissao) return null;
  const p = profissao.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (p.includes('tecnico') && p.includes('enferm')) return 'tecnico_enfermagem';
  if (p.includes('fisioterapeut') || p.includes('fisioterapia')) return 'fisioterapia';
  if (p.includes('enfermeir') || p.includes('enfermagem')) return 'enfermagem';
  if (p.includes('odontolog') || p.includes('dentist') || p.includes('cirurgiao dentista')) return 'odontologia';
  if (p.includes('psicolog')) return 'psicologia';
  if (p.includes('fonoaudiolog')) return 'fonoaudiologia';
  if (p.includes('nutric')) return 'nutricao';
  if (p.includes('terapeuta ocupacional') || p.includes('terapia ocupacional') || p === 'to') return 'terapia_ocupacional';
  if (p.includes('servico social') || p.includes('assistente social')) return 'servico_social';
  if (p.includes('educacao fisica') || p.includes('educador fisico') || p.includes('profissional de ef')) return 'educacao_fisica';
  if (p.includes('farmaceut') || p.includes('farmacia')) return 'farmacia';
  if (p.includes('biomedic')) return 'biomedicina';
  if (p.includes('medic')) return 'medicina';

  return null;
}

/**
 * Check if a profession should use dropdown SOAP (chips)
 * Agora TODAS as profissões reconhecidas mostram chips.
 */
export function hasDropdownSoap(profissao: string | undefined): boolean {
  const key = normalizeProfissaoForSoap(profissao);
  return key !== null && key in SOAP_OPTIONS;
}

/**
 * Check if profession is "médico" — campos SOAP não obrigatórios e label sem "(opcional)"
 */
export function isMedico(profissao: string | undefined): boolean {
  return normalizeProfissaoForSoap(profissao) === 'medicina';
}

/**
 * Get SOAP options for a profession, or null if not available
 */
export function getSoapOptions(profissao: string | undefined): SoapFieldOptions | null {
  const key = normalizeProfissaoForSoap(profissao);
  if (!key) return null;
  return SOAP_OPTIONS[key] || null;
}


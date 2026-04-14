// SOAP dropdown options per profession
// Professions with dropdowns: Fisioterapeuta, Enfermeiro, Odontólogo, Psicólogo, Fonoaudiólogo
// Médico uses free text only

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
};

/**
 * Normalize profession string to match SOAP_OPTIONS keys
 */
export function normalizeProfissaoForSoap(profissao: string | undefined): string | null {
  if (!profissao) return null;
  const p = profissao.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (p.includes('fisioterapeut') || p.includes('fisioterapia')) return 'fisioterapia';
  if (p.includes('enfermeir') || p.includes('enfermagem')) return 'enfermagem';
  if (p.includes('odontolog') || p.includes('dentist') || p.includes('cirurgiao dentista')) return 'odontologia';
  if (p.includes('psicologo') || p.includes('psicologia')) return 'psicologia';
  if (p.includes('fonoaudiolog') || p.includes('fonoaudiologia')) return 'fonoaudiologia';
  if (p.includes('medic') || p.includes('medicina')) return 'medicina';

  return null; // unknown = free text
}

/**
 * Check if a profession should use dropdown SOAP
 */
export function hasDropdownSoap(profissao: string | undefined): boolean {
  const key = normalizeProfissaoForSoap(profissao);
  return key !== null && key !== 'medicina' && key in SOAP_OPTIONS;
}

/**
 * Check if profession is "médico" (free text, non-required)
 */
export function isMedico(profissao: string | undefined): boolean {
  return normalizeProfissaoForSoap(profissao) === 'medicina';
}

/**
 * Get SOAP options for a profession, or null if not available
 */
export function getSoapOptions(profissao: string | undefined): SoapFieldOptions | null {
  const key = normalizeProfissaoForSoap(profissao);
  if (!key || key === 'medicina') return null;
  return SOAP_OPTIONS[key] || null;
}

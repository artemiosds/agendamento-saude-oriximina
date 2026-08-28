export interface ClinicalCategory {
  id: string;
  name: string;
  cidPrefixes: string[]; // prefixos canônicos (sem ponto), ex.: ["F84", "F840"]
  description?: string;
  keywords?: string[]; // reforço por descrição oficial (nunca cria categoria isoladamente)
}

/** Categoria de destino para CIDs válidos que não são deficiência mapeada. */
export const OTHER_CATEGORY_NAME = 'Outros Diagnósticos';

/** Regex estrito de CID-10: letra + 2 dígitos + subcategoria opcional. */
const CID_REGEX = /\b([A-Z][0-9]{2}(?:\.?[0-9]{1,2})?)\b/gi;

const INVALID_TOKENS = new Set(['', '-', '—', '–', 'NULL', 'UNDEFINED', 'N/A', 'NA', 'SEM CID']);

/** Forma canônica (sem ponto, maiúscula) usada para comparação e consulta ao banco. */
export const normalizeCid = (cid?: string | null): string =>
  (cid || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '').trim();

/** Forma de exibição: F840 -> F84.0 ; F84 -> F84. */
export const formatCid = (cid?: string | null): string => {
  const c = normalizeCid(cid);
  if (c.length <= 3) return c;
  return `${c.slice(0, 3)}.${c.slice(3)}`;
};

/**
 * Extrai códigos CID-10 válidos de um texto livre.
 * Nunca usa split por espaço: apenas o que casa com o padrão sobrevive.
 * Retorna códigos canônicos únicos.
 */
export const extractCids = (input?: string | null): string[] => {
  if (!input) return [];
  const raw = String(input).trim();
  if (INVALID_TOKENS.has(raw.toUpperCase())) return [];

  const found = new Set<string>();
  const matches = raw.match(CID_REGEX);
  if (!matches) return [];

  matches.forEach((m) => {
    const canonical = normalizeCid(m);
    if (canonical.length < 3) return;
    if (INVALID_TOKENS.has(canonical)) return;
    // precisa ser letra + 2 dígitos (+ até 2 dígitos)
    if (!/^[A-Z][0-9]{2}[0-9]{0,2}$/.test(canonical)) return;
    found.add(canonical);
  });

  return Array.from(found);
};

const range = (letter: string, from: number, to: number): string[] => {
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(`${letter}${String(i).padStart(2, '0')}`);
  return out;
};

export const CLINICAL_CATEGORIES: ClinicalCategory[] = [
  {
    id: 'tea',
    name: 'TEA / Autismo',
    cidPrefixes: ['F84'],
    description: 'Transtorno do Espectro Autista (F84.0 a F84.9)',
    keywords: ['autismo', 'autista', 'espectro autista', 'asperger', 'pervasivo'],
  },
  {
    id: 'surdez',
    name: 'Pessoa Surda',
    cidPrefixes: ['H900', 'H901', 'H902'],
    description: 'Surdez bilateral ou profunda',
    keywords: ['surdo', 'surdez profunda', 'surdez bilateral'],
  },
  {
    id: 'def_auditiva',
    name: 'Deficiência Auditiva',
    cidPrefixes: ['H90', 'H91'],
    description: 'Perda auditiva condutiva ou neurossensorial',
    keywords: ['perda auditiva', 'deficiencia auditiva', 'hipoacusia'],
  },
  {
    id: 'def_visual',
    name: 'Deficiência Visual',
    cidPrefixes: ['H54'],
    description: 'Cegueira ou visão subnormal',
    keywords: ['cegueira', 'visao subnormal', 'baixa visao'],
  },
  {
    id: 'def_fisica',
    name: 'Deficiência Física',
    cidPrefixes: [
      'G80', 'G81', 'G82', 'G83',
      ...range('Q', 65, 74),
      'M20', 'M21',
      'S78', 'S88', 'S98', 'S48', 'S58', 'S68',
      'Z89',
    ],
    description: 'Alteração motora, sequelas e amputações',
    keywords: [
      'paralisia', 'hemiplegia', 'paraplegia', 'tetraplegia', 'amputacao',
      'deformidade', 'encefalopatia cronica', 'sequela motora',
    ],
  },
  {
    id: 'def_intelectual',
    name: 'Deficiência Intelectual',
    cidPrefixes: ['F70', 'F71', 'F72', 'F73', 'F78', 'F79'],
    description: 'Funcionamento intelectual significativamente inferior à média (F70-F79)',
    keywords: ['retardo mental', 'deficiencia intelectual', 'atraso cognitivo'],
  },
  {
    id: 'fala_linguagem',
    name: 'Transtornos de Fala e Linguagem',
    cidPrefixes: ['F80', 'R47'],
    description: 'Dificuldades na produção ou compreensão da fala (F80.0-F80.9, R47)',
    keywords: ['afasia', 'dislalia', 'disturbio de fala', 'linguagem', 'disartria'],
  },
  {
    id: 'neurodesenvolvimento',
    name: 'Transtornos do Neurodesenvolvimento',
    cidPrefixes: ['F81', 'F82', 'F88', 'F89', 'F90', 'F91', 'F92', 'F93', 'F94', 'F95', 'F98'],
    description: 'Transtornos que afetam o desenvolvimento do sistema nervoso',
    keywords: ['tdah', 'hiperatividade', 'deficit de atencao', 'dislexia', 'desenvolvimento psicomotor'],
  },
  {
    id: 'neurologico',
    name: 'Condições Neurológicas',
    cidPrefixes: ['G00', 'G99', 'I60', 'I61', 'I62', 'I63', 'I64', 'I67', 'I69'],
    description: 'Doenças do sistema nervoso central e periférico',
    keywords: ['avc', 'isquemia', 'hemorragia cerebral', 'epilepsia', 'esclerose'],
  },
  {
    id: 'reabilitacao_motora',
    name: 'Reabilitação Motora',
    cidPrefixes: ['M00', 'M99', 'S00', 'T98'],
    description: 'Condições osteomusculares e sequelas de trauma',
    keywords: ['fratura', 'luxacao', 'traumatismo', 'lesao muscular', 'pos-operatorio'],
  },
  {
    id: 'outros',
    name: OTHER_CATEGORY_NAME,
    cidPrefixes: [],
    description: 'Demais diagnósticos válidos não classificados como deficiência mapeada',
  },
];

const MAPPED_CATEGORIES = CLINICAL_CATEGORIES.filter((c) => c.cidPrefixes.length > 0);

/**
 * Classifica um CID (código válido) em categorias clínicas.
 * A descrição oficial só reforça categorias — nunca cria categoria a partir de texto solto.
 */
export const getCategoryByCID = (cid: string, description?: string): ClinicalCategory[] => {
  const normalizedCID = normalizeCid(cid);
  if (!normalizedCID || !/^[A-Z][0-9]{2}[0-9]{0,2}$/.test(normalizedCID)) return [];

  const categoriesFound = new Set<ClinicalCategory>();

  MAPPED_CATEGORIES.forEach((cat) => {
    if (cat.cidPrefixes.some((prefix) => normalizedCID.startsWith(normalizeCid(prefix)))) {
      categoriesFound.add(cat);
    }
  });

  if (description && categoriesFound.size > 0) {
    const normalizedDesc = description
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    MAPPED_CATEGORIES.forEach((cat) => {
      if (
        cat.keywords?.some((kw) => {
          const normalizedKW = kw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return normalizedDesc.includes(normalizedKW);
        })
      ) {
        categoriesFound.add(cat);
      }
    });
  }

  return Array.from(categoriesFound);
};

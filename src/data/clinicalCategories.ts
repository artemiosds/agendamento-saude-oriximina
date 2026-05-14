
export interface ClinicalCategory {
  id: string;
  name: string;
  cidPrefixes: string[]; // e.g. ["F84", "F84.0"]
  description?: string;
  keywords?: string[]; // Keywords in description that can trigger this category
}

export const CLINICAL_CATEGORIES: ClinicalCategory[] = [
  {
    id: 'tea',
    name: 'TEA / Autismo',
    cidPrefixes: ['F84', 'F840', 'F84.0', 'F841', 'F84.1', 'F842', 'F84.2', 'F843', 'F84.3', 'F844', 'F84.4', 'F845', 'F84.5', 'F848', 'F84.8', 'F849', 'F84.9'],
    description: 'Transtorno do Espectro Autista',
    keywords: ['autismo', 'autista', 'espectro autista', 'pervasivo']
  },
  {
    id: 'surdez',
    name: 'Pessoa Surda',
    cidPrefixes: ['H900', 'H90.0', 'H901', 'H90.1', 'H902', 'H90.2'],
    description: 'Surdez bilateral ou profunda',
    keywords: ['surdo', 'surdez profunda', 'surdez bilateral']
  },
  {
    id: 'def_auditiva',
    name: 'Deficiência Auditiva',
    cidPrefixes: ['H90', 'H91'],
    description: 'Perda auditiva condutiva ou neurossensorial',
    keywords: ['perda auditiva', 'deficiencia auditiva', 'hipoacusia']
  },
  {
    id: 'def_visual',
    name: 'Deficiência Visual',
    cidPrefixes: ['H54', 'H540', 'H54.0', 'H541', 'H54.1', 'H542', 'H54.2'],
    description: 'Cegueira ou visão subnormal',
    keywords: ['cegueira', 'visao subnormal', 'baixa visao']
  },
  {
    id: 'def_fisica',
    name: 'Deficiência Física',
    cidPrefixes: ['G80', 'G81', 'G82', 'G83', 'M20', 'M21', 'Q65', 'Q66', 'Q67', 'Q68', 'Q69', 'Q70', 'Q71', 'Q72', 'Q73', 'Q74'],
    description: 'Alteração completa ou parcial de um ou mais segmentos do corpo',
    keywords: ['paralisia', 'hemiplegia', 'paraplegia', 'tetraplegia', 'amputacao', 'deformidade fisica', 'encefalopatia cronica']
  },
  {
    id: 'def_intelectual',
    name: 'Deficiência Intelectual',
    cidPrefixes: ['F70', 'F71', 'F72', 'F73', 'F78', 'F79'],
    description: 'Funcionamento intelectual significativamente inferior à média',
    keywords: ['retardo mental', 'deficiencia intelectual', 'atraso cognitivo']
  },
  {
    id: 'fala_linguagem',
    name: 'Transtornos de Fala e Linguagem',
    cidPrefixes: ['F80', 'F800', 'F80.0', 'F801', 'F80.1', 'F802', 'F80.2', 'R47', 'R470', 'R47.0'],
    description: 'Dificuldades na produção ou compreensão da fala',
    keywords: ['afasia', 'dislalia', 'disturbio de fala', 'linguagem']
  },
  {
    id: 'neurodesenvolvimento',
    name: 'Transtornos do Neurodesenvolvimento',
    cidPrefixes: ['F81', 'F82', 'F88', 'F89', 'F90', 'F91', 'F92', 'F93', 'F94', 'F95', 'F98'],
    description: 'Transtornos que afetam o desenvolvimento do sistema nervoso',
    keywords: ['tdah', 'hiperatividade', 'deficit de atencao', 'dislexia', 'desenvolvimento psicomotor']
  },
  {
    id: 'neurologico',
    name: 'Condições Neurológicas',
    cidPrefixes: ['G00', 'G99', 'I60', 'I61', 'I62', 'I63', 'I64', 'I67', 'I69'],
    description: 'Doenças do sistema nervoso central e periférico',
    keywords: ['avc', 'isquemia', 'hemorragia cerebral', 'epilepsia', 'esclerose']
  },
  {
    id: 'reabilitacao_motora',
    name: 'Reabilitação Motora',
    cidPrefixes: ['M00', 'M99', 'S00', 'T98'],
    description: 'Condições osteomusculares e sequelas de trauma',
    keywords: ['fratura', 'luxacao', 'traumatismo', 'lesao muscular', 'pos-operatorio']
  }
];

export const getCategoryByCID = (cid: string, description?: string): ClinicalCategory[] => {
  if (!cid && !description) return [];
  
  const categoriesFound = new Set<ClinicalCategory>();
  
  // 1. Check by CID prefix
  if (cid) {
    const normalizedCID = cid.toUpperCase().replace('.', '').trim();
    CLINICAL_CATEGORIES.forEach(cat => {
      if (cat.cidPrefixes.some(prefix => {
        const normalizedPrefix = prefix.toUpperCase().replace('.', '').trim();
        return normalizedCID.startsWith(normalizedPrefix);
      })) {
        categoriesFound.add(cat);
      }
    });
  }
  
  // 2. Check by keywords in description
  if (description) {
    const normalizedDesc = description.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    CLINICAL_CATEGORIES.forEach(cat => {
      if (cat.keywords?.some(kw => {
        const normalizedKW = kw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return normalizedDesc.includes(normalizedKW);
      })) {
        categoriesFound.add(cat);
      }
    });
  }
  
  return Array.from(categoriesFound);
};


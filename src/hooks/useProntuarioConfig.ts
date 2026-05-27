import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface BlocoConfig {
  id: string;
  label: string;
  visivel: boolean;
  obrigatorio: boolean;
  favorito: boolean;
  colapsado_padrao: boolean;
  ordem: number;
  /** Admin locked this field as required — professional cannot unset */
  admin_obrigatorio?: boolean;
  /** Admin disabled this field — professional cannot re-enable */
  admin_desabilitado?: boolean;
}

export interface CampoExtraConfig {
  id: string;
  label: string;
  tipo: string;
  obrigatorio: boolean;
  posicao_bloco: string;
  ordem: number;
  opcoes?: string[];
  config_campo?: { min?: number; max?: number; cor_dinamica?: boolean };
  tipos_prontuario?: string[];
}

export interface ProntuarioConfigData {
  versao: number;
  layout: 'padrao' | 'compacto' | 'detalhado';
  blocos: BlocoConfig[];
  catalogos: {
    medicamentos: { favoritos: string[]; desabilitados: string[] };
    exames: { favoritos: string[]; desabilitados: string[] };
  };
  escalas_ativas?: string[];
  campos_especialidade?: Record<string, { visivel: boolean; favorito: boolean; ordem: number }>;
  campos_extras?: CampoExtraConfig[];
  ui: {
    densidade: 'confortavel' | 'compacto';
    animacoes: boolean;
  };
  impressao: {
    cabecalho: string;
    rodape: string;
    mostrar_profissional: boolean;
    mostrar_conselho: boolean;
    mostrar_logo: boolean;
  };
}

// Admin specialty field config (from system_config)
interface AdminCampoEspecialidade {
  id: string;
  key: string;
  label: string;
  tipo: string;
  obrigatorio: boolean;
  habilitado: boolean;
  isBuiltin: boolean;
  order: number;
  opcoes?: string[];
}

interface AdminEspecialidadeConfig {
  key: string;
  label: string;
  ativa: boolean;
  profissoes: string[];
  campos: AdminCampoEspecialidade[];
}

// ─── Default blocks per type ────────────────────────────────────────────────
const BLOCOS_BASE: Record<string, BlocoConfig[]> = {
  avaliacao_inicial: [
    { id: 'soap', label: 'Evolução SOAP', visivel: true, obrigatorio: true, favorito: true, colapsado_padrao: false, ordem: 0 },
    { id: 'queixa_principal', label: 'Queixa Principal', visivel: true, obrigatorio: true, favorito: true, colapsado_padrao: false, ordem: 1 },
    { id: 'anamnese', label: 'História da Doença Atual', visivel: true, obrigatorio: true, favorito: false, colapsado_padrao: false, ordem: 2 },
    { id: 'sinais_sintomas', label: 'Histórico de Saúde', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 3 },
    { id: 'exame_fisico', label: 'Medicações em Uso', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 4 },
    { id: 'hipotese', label: 'Alergias', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 5 },
    { id: 'especialidade', label: 'Campos de Especialidade', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 6 },
    { id: 'conduta', label: 'Diagnóstico Funcional', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 7 },
    { id: 'evolucao', label: 'Conduta Inicial', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 8 },
    { id: 'procedimentos', label: 'Procedimentos Realizados', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 9 },
    { id: 'prescricao', label: 'Prescrição de Medicamentos', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: true, ordem: 10 },
    { id: 'solicitacao_exames', label: 'Solicitação de Exames', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: true, ordem: 11 },
    { id: 'indicacao_retorno', label: 'Indicação de Retorno', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 12 },
  ],
  retorno: [
    { id: 'soap', label: 'Evolução SOAP', visivel: true, obrigatorio: true, favorito: true, colapsado_padrao: false, ordem: 0 },
    { id: 'queixa_principal', label: 'Reavaliação', visivel: true, obrigatorio: false, favorito: true, colapsado_padrao: false, ordem: 1 },
    { id: 'anamnese', label: 'Evolução Clínica', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 2 },
    { id: 'especialidade', label: 'Campos de Especialidade', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 3 },
    { id: 'procedimentos', label: 'Procedimentos Realizados', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 4 },
    { id: 'prescricao', label: 'Prescrição de Medicamentos', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: true, ordem: 5 },
    { id: 'solicitacao_exames', label: 'Solicitação de Exames', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: true, ordem: 6 },
    { id: 'indicacao_retorno', label: 'Indicação de Retorno', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 7 },
  ],
  sessao: [
    { id: 'soap', label: 'Evolução SOAP', visivel: true, obrigatorio: true, favorito: true, colapsado_padrao: false, ordem: 0 },
    { id: 'ciclo_tratamento', label: 'Ciclo de Tratamento Ativo', visivel: true, obrigatorio: false, favorito: true, colapsado_padrao: false, ordem: 1 },
    { id: 'pts_vinculado', label: 'PTS Vinculado', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: true, ordem: 2 },
    { id: 'queixa_principal', label: 'Procedimentos Realizados', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 3 },
    { id: 'anamnese', label: 'Resposta do Paciente', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 4 },
    { id: 'procedimentos', label: 'Procedimentos (checklist)', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 5 },
    { id: 'prescricao', label: 'Prescrição de Medicamentos', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: true, ordem: 6 },
    { id: 'solicitacao_exames', label: 'Solicitação de Exames', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: true, ordem: 7 },
    { id: 'indicacao_retorno', label: 'Indicação de Retorno', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 8 },
  ],
  urgencia: [
    { id: 'soap', label: 'Evolução SOAP', visivel: true, obrigatorio: true, favorito: true, colapsado_padrao: false, ordem: 0 },
    { id: 'queixa_principal', label: 'Queixa Imediata', visivel: true, obrigatorio: true, favorito: true, colapsado_padrao: false, ordem: 1 },
    { id: 'exame_fisico', label: 'Conduta de Urgência', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 2 },
    { id: 'anamnese', label: 'Encaminhamento', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 3 },
    { id: 'procedimentos', label: 'Procedimentos Realizados', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 4 },
    { id: 'prescricao', label: 'Prescrição de Medicamentos', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: true, ordem: 5 },
    { id: 'indicacao_retorno', label: 'Indicação de Retorno', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 6 },
  ],
  procedimento: [
    { id: 'soap', label: 'Evolução SOAP', visivel: true, obrigatorio: true, favorito: true, colapsado_padrao: false, ordem: 0 },
    { id: 'queixa_principal', label: 'Tipo de Exame/Procedimento', visivel: true, obrigatorio: false, favorito: true, colapsado_padrao: false, ordem: 1 },
    { id: 'anamnese', label: 'Resultado', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 2 },
    { id: 'procedimentos', label: 'Procedimentos (checklist)', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 3 },
    { id: 'prescricao', label: 'Prescrição de Medicamentos', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: true, ordem: 4 },
    { id: 'indicacao_retorno', label: 'Indicação de Retorno', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 5 },
  ],
};

// Fallback for legacy types
const DEFAULT_BLOCOS: BlocoConfig[] = [
  { id: 'soap', label: 'Evolução SOAP', visivel: true, obrigatorio: true, favorito: true, colapsado_padrao: false, ordem: 0 },
  { id: 'queixa_principal', label: 'Queixa Principal', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 1 },
  { id: 'anamnese', label: 'Anamnese', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 2 },
  { id: 'exame_fisico', label: 'Exame Físico', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 3 },
  { id: 'hipotese', label: 'Hipótese', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 4 },
  { id: 'conduta', label: 'Conduta', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 5 },
  { id: 'evolucao', label: 'Evolução', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 6 },
  { id: 'procedimentos', label: 'Procedimentos', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 7 },
  { id: 'prescricao', label: 'Prescrição', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: true, ordem: 8 },
  { id: 'solicitacao_exames', label: 'Solicitação de Exames', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: true, ordem: 9 },
  { id: 'indicacao_retorno', label: 'Indicação de Retorno', visivel: true, obrigatorio: false, favorito: false, colapsado_padrao: false, ordem: 10 },
];

export function getDefaultConfig(tipo: string): ProntuarioConfigData {
  return {
    versao: 1,
    layout: 'padrao',
    blocos: BLOCOS_BASE[tipo] || DEFAULT_BLOCOS,
    catalogos: {
      medicamentos: { favoritos: [], desabilitados: [] },
      exames: { favoritos: [], desabilitados: [] },
    },
    ui: { densidade: 'confortavel', animacoes: true },
    impressao: {
      cabecalho: '',
      rodape: '',
      mostrar_profissional: true,
      mostrar_conselho: true,
      mostrar_logo: true,
    },
  };
}

export const TIPOS_PRONTUARIO = [
  { value: 'avaliacao_inicial', label: '🟢 Avaliação Inicial', color: 'bg-green-500' },
  { value: 'retorno', label: '🔵 Retorno', color: 'bg-blue-500' },
  { value: 'sessao', label: '🟡 Sessão', color: 'bg-yellow-500' },
  { value: 'urgencia', label: '🔴 Urgência', color: 'bg-red-500' },
  { value: 'procedimento', label: '🟣 Procedimento', color: 'bg-purple-500' },
] as const;

// ─── Profissão → specialty key mapping ───────────────────────────────────────
const PROFISSAO_TO_SPECIALTY: Record<string, string> = {
  fisioterapeuta: 'fisioterapia',
  fisioterapia: 'fisioterapia',
  psicologo: 'psicologia',
  psicologa: 'psicologia',
  psicologia: 'psicologia',
  fonoaudiologo: 'fonoaudiologia',
  fonoaudiologa: 'fonoaudiologia',
  fonoaudiologia: 'fonoaudiologia',
  nutricionista: 'nutricao',
  nutricao: 'nutricao',
  terapeuta_ocupacional: 'terapia_ocupacional',
  terapia_ocupacional: 'terapia_ocupacional',
  medico: 'medicina',
  medica: 'medicina',
  medicina: 'medicina',
  odontologo: 'odontologia',
  odontologa: 'odontologia',
  odontologia: 'odontologia',
  enfermeiro: 'enfermagem',
  enfermeira: 'enfermagem',
  enfermagem: 'enfermagem',
  assistente_social: 'servico_social',
  servico_social: 'servico_social',
  cirurgiao: 'cirurgia_geral',
  cirurgia_geral: 'cirurgia_geral',
  infectologista: 'infectologia',
  infectologia: 'infectologia',
};

export function normalizeProfissao(profissao: string): string {
  const key = profissao.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
  return PROFISSAO_TO_SPECIALTY[key] || key;
}

// ─── Default specialty configs (same as ConfigEspecialidades defaults) ────────
const DEFAULT_ADMIN_ESPECIALIDADES: AdminEspecialidadeConfig[] = [
  { key: 'fisioterapia', label: 'Fisioterapia', ativa: true, profissoes: ['fisioterapia'],
    campos: [
      { id: 'f1', key: 'avaliacao_funcional', label: 'Avaliação Funcional', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'f2', key: 'adm', label: 'ADM (Amplitude de Movimento)', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'f3', key: 'forca_muscular', label: 'Força Muscular (MRC 0-5)', tipo: 'number', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
      { id: 'f4', key: 'dor_eva', label: 'Dor EVA (0-10)', tipo: 'number', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4 },
      { id: 'f5', key: 'postura_marcha', label: 'Postura e Marcha', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 5 },
    ],
  },
  { key: 'psicologia', label: 'Psicologia', ativa: true, profissoes: ['psicologia'],
    campos: [
      { id: 'p1', key: 'estado_emocional', label: 'Estado Emocional', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'p2', key: 'comportamento', label: 'Comportamento Observado', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'p3', key: 'relato_subjetivo', label: 'Relato Subjetivo', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
      { id: 'p4', key: 'risco', label: 'Risco Auto/Heteroagressão', tipo: 'select', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4, opcoes: ['Ausente', 'Baixo', 'Moderado', 'Alto'] },
    ],
  },
  { key: 'fonoaudiologia', label: 'Fonoaudiologia', ativa: true, profissoes: ['fonoaudiologia'],
    campos: [
      { id: 'fo1', key: 'comunicacao', label: 'Avaliação da Comunicação', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'fo2', key: 'degluticao', label: 'Avaliação da Deglutição', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'fo3', key: 'linguagem', label: 'Linguagem Oral e Escrita', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
      { id: 'fo4', key: 'voz', label: 'Qualidade Vocal', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4 },
    ],
  },
  { key: 'nutricao', label: 'Nutrição', ativa: true, profissoes: ['nutricao'],
    campos: [
      { id: 'n1', key: 'avaliacao_nutricional', label: 'Avaliação Nutricional', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'n2', key: 'habitos_alimentares', label: 'Hábitos Alimentares', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'n3', key: 'plano_alimentar', label: 'Plano Alimentar', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
    ],
  },
  { key: 'terapia_ocupacional', label: 'Terapia Ocupacional', ativa: true, profissoes: ['terapia_ocupacional'],
    campos: [
      { id: 'to1', key: 'avd', label: 'AVDs / AIVDs', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'to2', key: 'adaptacoes', label: 'Adaptações e Tecnologias Assistivas', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'to3', key: 'funcionalidade', label: 'Funcionalidade Global', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
    ],
  },
  { key: 'medicina', label: 'Medicina', ativa: true, profissoes: ['medicina'],
    campos: [
      { id: 'm1', key: 'exame_fisico_geral', label: 'Exame Físico Geral', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'm2', key: 'hipotese_diagnostica', label: 'Hipótese Diagnóstica', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'm3', key: 'cid_principal', label: 'CID Principal', tipo: 'text', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
    ],
  },
  { key: 'odontologia', label: 'Odontologia', ativa: true, profissoes: ['odontologia'],
    campos: [
      { id: 'od1', key: 'odontograma', label: 'Odontograma', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'od2', key: 'exame_intraoral', label: 'Exame Intraoral', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'od3', key: 'plano_tratamento', label: 'Plano de Tratamento', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
    ],
  },
  { key: 'enfermagem', label: 'Enfermagem', ativa: true, profissoes: ['enfermagem'],
    campos: [
      { id: 'en1', key: 'sinais_vitais', label: 'Sinais Vitais', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'en2', key: 'diagnostico_enfermagem', label: 'Diagnóstico de Enfermagem', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'en3', key: 'intervencoes', label: 'Intervenções de Enfermagem', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
    ],
  },
  { key: 'servico_social', label: 'Serviço Social', ativa: true, profissoes: ['servico_social', 'assistente_social'],
    campos: [
      { id: 'ss1', key: 'avaliacao_social', label: 'Avaliação Social', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'ss2', key: 'rede_apoio', label: 'Rede de Apoio Familiar', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'ss3', key: 'encaminhamentos_sociais', label: 'Encaminhamentos Sociais', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
    ],
  },
  { key: 'cirurgia_geral', label: 'Cirurgia Geral', ativa: true, profissoes: ['cirurgia_geral', 'cirurgiao'],
    campos: [
      { id: 'cg1', key: 'avaliacao_pre_operatoria', label: 'Avaliação Pré-operatória', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'cg2', key: 'descricao_cirurgica', label: 'Descrição Cirúrgica', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'cg3', key: 'pos_operatorio', label: 'Evolução Pós-operatória', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
    ],
  },
  { key: 'infectologia', label: 'Infectologia', ativa: true, profissoes: ['infectologia', 'infectologista'],
    campos: [
      { id: 'inf1', key: 'perfil_epidemiologico', label: 'Perfil Epidemiológico', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'inf2', key: 'antibioticoterapia', label: 'Antibioticoterapia', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'inf3', key: 'resultados_culturas', label: 'Resultados de Culturas', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
    ],
  },
];

// ─── Admin config loader ─────────────────────────────────────────────────────
const ADMIN_CONFIG_KEY = 'config_especialidades_campos';

async function loadAdminEspecialidadeConfig(): Promise<AdminEspecialidadeConfig[]> {
  try {
    const { data } = await supabase
      .from('system_config')
      .select('configuracoes')
      .eq('id', 'default')
      .maybeSingle();
    const cfg = data?.configuracoes as any;
    return cfg?.[ADMIN_CONFIG_KEY] || DEFAULT_ADMIN_ESPECIALIDADES;
  } catch {
    return DEFAULT_ADMIN_ESPECIALIDADES;
  }
}

const ADMIN_CUSTOM_FIELDS_KEY = 'custom_fields_config';

async function loadAdminCustomFields(unidadeId?: string): Promise<any[]> {
  try {
    const { data } = await supabase
      .from('system_config')
      .select('configuracoes')
      .eq('id', ADMIN_CUSTOM_FIELDS_KEY)
      .maybeSingle();
    
    const cfg = data?.configuracoes as any;
    if (!cfg || !cfg.prontuario) return [];

    const screenData = cfg.prontuario;
    const globalCfg = screenData['__global__'] || { fields: [] };
    const unitCfg = unidadeId ? screenData[unidadeId] || { fields: [] } : { fields: [] };

    // Merge global and unit fields
    return [...globalCfg.fields, ...unitCfg.fields];
  } catch {
    return [];
  }
}

const ADMIN_PRONTUARIO_KEY = 'config_prontuario_tipos';

async function loadAdminProntuarioConfig(): Promise<any | null> {
  try {
    const { data } = await supabase
      .from('system_config')
      .select('configuracoes')
      .eq('id', 'default')
      .maybeSingle();
    const cfg = data?.configuracoes as any;
    return cfg?.[ADMIN_PRONTUARIO_KEY] || null;
  } catch {
    return null;
  }
}

/**
 * Merge admin base config with professional personal config.
 */
export function mergeAdminAndProfConfig(
  adminEspecialidades: AdminEspecialidadeConfig[] | null,
  adminProntuario: any | null,
  adminCustomFields: any[] | null,
  profissao: string | undefined,
  profConfig: ProntuarioConfigData,
  tipoNormalized: string
): ProntuarioConfigData {
  let merged = { ...profConfig };
  
  // Normalize tipo for comparison (primeira_consulta <-> avaliacao_inicial)
  const tipoToMatch = tipoNormalized === 'avaliacao_inicial' ? ['avaliacao_inicial', 'primeira_consulta'] : [tipoNormalized];

  // 1. Apply general admin prontuario config (from ConfigProntuario)
  if (adminProntuario && adminProntuario.campos) {
    const adminCampos = (adminProntuario.campos as any[]).filter(c => 
      c.tiposProntuario && c.tiposProntuario.some((t: string) => tipoToMatch.includes(t))
    );

    // Merge admin fields into blocos
    const updatedBlocos = [...merged.blocos];
    
    adminCampos.forEach(ac => {
      const idx = updatedBlocos.findIndex(b => b.id === ac.key);
      if (idx !== -1) {
        updatedBlocos[idx] = {
          ...updatedBlocos[idx],
          label: ac.label || updatedBlocos[idx].label,
          visivel: ac.habilitado !== undefined ? ac.habilitado : updatedBlocos[idx].visivel,
          obrigatorio: ac.obrigatorio !== undefined ? ac.obrigatorio : updatedBlocos[idx].obrigatorio,
          ordem: ac.order !== undefined ? ac.order : updatedBlocos[idx].ordem,
          admin_desabilitado: ac.habilitado === false,
          admin_obrigatorio: ac.obrigatorio === true,
        };
      } else if (ac.habilitado !== false) {
        // Add as new block if not present
        updatedBlocos.push({
          id: ac.key,
          label: ac.label,
          visivel: true,
          obrigatorio: !!ac.obrigatorio,
          favorito: false,
          colapsado_padrao: false,
          ordem: ac.order || updatedBlocos.length,
          admin_obrigatorio: !!ac.obrigatorio,
        });
      }
    });

    merged.blocos = updatedBlocos;
  }

  // 2. Apply Custom Fields (from ConfigPersonalizarCampos)
  if (adminCustomFields && adminCustomFields.length > 0) {
    const specialtyKey = profissao ? normalizeProfissao(profissao) : null;
    
    adminCustomFields.forEach(cf => {
      if (!cf.ativo) return;
      
      // Filter by scope
      if (cf.escopo) {
        if (!cf.escopo.global) {
          const matchTipo = !cf.escopo.tiposProntuario || cf.escopo.tiposProntuario.length === 0 || 
                           cf.escopo.tiposProntuario.some((t: string) => tipoToMatch.includes(t));
          const matchEsp = !cf.escopo.especialidades || cf.escopo.especialidades.length === 0 || 
                          (specialtyKey && cf.escopo.especialidades.includes(specialtyKey));
          
          if (!matchTipo || !matchEsp) return;
        }
      }

      const idx = merged.blocos.findIndex(b => b.id === cf.nome || b.id === `custom_${cf.nome}`);
      if (idx === -1) {
        merged.blocos.push({
          id: cf.nome,
          label: cf.rotulo,
          visivel: true,
          obrigatorio: !!cf.obrigatorio,
          favorito: false,
          colapsado_padrao: false,
          ordem: cf.ordem || merged.blocos.length * 10,
          admin_obrigatorio: !!cf.obrigatorio,
          // Store extra info about the custom field if needed
        });
      }
    });
  }

  // 3. Apply specialty specific admin config
  if (adminEspecialidades && profissao) {
    const specialtyKey = normalizeProfissao(profissao);
    const adminEsp = adminEspecialidades.find(e =>
      e.ativa && (e.key === specialtyKey || e.profissoes.some(p => p === specialtyKey))
    );

    if (adminEsp) {
      merged.blocos = merged.blocos.map(bloco => {
        const adminCampo = adminEsp.campos.find(c => c.key === bloco.id || c.id === bloco.id);
        if (adminCampo) {
          // Check if field is applicable to this type
          const tipos = adminCampo.tipos_prontuario && adminCampo.tipos_prontuario.length > 0 ? adminCampo.tipos_prontuario : ['avaliacao', 'retorno'];
          const currentTipoShort = (tipoNormalized === 'avaliacao_inicial') ? 'avaliacao' : tipoNormalized;
          
          if (!tipos.includes(currentTipoShort)) {
            return { ...bloco, admin_desabilitado: true, visivel: false };
          }

          return {
            ...bloco,
            admin_desabilitado: !adminCampo.habilitado,
            visivel: !adminCampo.habilitado ? false : bloco.visivel,
            admin_obrigatorio: adminCampo.obrigatorio,
            obrigatorio: adminCampo.obrigatorio ? true : bloco.obrigatorio,
          };
        }
        return bloco;
      });
    }
  }

  // Sort by order at the end
  merged.blocos = merged.blocos.sort((a, b) => a.ordem - b.ordem);

  return merged;
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useProntuarioConfig(profissionalId: string | undefined, tipoProntuario: string, profissao?: string) {
  const tipoNormalized = TIPOS_PRONTUARIO.some(t => t.value === tipoProntuario)
    ? tipoProntuario
    : (tipoProntuario === 'primeira_consulta' ? 'avaliacao_inicial' : 'sessao');

  const [config, setConfig] = useState<ProntuarioConfigData | null>(() => getDefaultConfig(tipoNormalized));
  const [adminConfig, setAdminConfig] = useState<AdminEspecialidadeConfig[] | null>(null);
  const [adminProntuario, setAdminProntuario] = useState<any | null>(null);
  const [adminCustomFields, setAdminCustomFields] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [profResult, adminEspResult, adminProntResult, adminCustomResult] = await Promise.all([
          profissionalId ? (supabase as any)
            .from('prontuario_config')
            .select('config, versao')
            .eq('profissional_id', profissionalId)
            .eq('tipo_prontuario', tipoNormalized)
            .maybeSingle() : Promise.resolve({ data: null }),
          loadAdminEspecialidadeConfig(),
          loadAdminProntuarioConfig(),
          loadAdminCustomFields(),
        ]);

        if (!cancelled) {
          setAdminConfig(adminEspResult);
          setAdminProntuario(adminProntResult);
          setAdminCustomFields(adminCustomResult);
          
          const defaults = getDefaultConfig(tipoNormalized);
          let loadedConfig: ProntuarioConfigData;

          if (profResult.data?.config) {
            const loaded = profResult.data.config as ProntuarioConfigData;
            loadedConfig = {
              ...defaults,
              ...loaded,
              versao: profResult.data.versao || loaded.versao || 1,
              blocos: loaded.blocos || defaults.blocos,
              catalogos: { ...defaults.catalogos, ...loaded.catalogos },
              ui: { ...defaults.ui, ...loaded.ui },
              impressao: { ...defaults.impressao, ...loaded.impressao },
            };
          } else {
            loadedConfig = defaults;
          }

          // Apply merging logic
          const merged = mergeAdminAndProfConfig(adminEspResult, adminProntResult, adminCustomResult, profissao, loadedConfig, tipoNormalized);
          setConfig(merged);
        }
      } catch (err) {
        console.error('[useProntuarioConfig] Load error:', err);
        if (!cancelled) setConfig(getDefaultConfig(tipoNormalized));
      }
      if (!cancelled) setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [profissionalId, tipoNormalized, profissao]);

  const saveConfig = useCallback(async (newConfig: ProntuarioConfigData) => {
    if (!profissionalId) return;
    setConfig(newConfig);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await (supabase as any).from('prontuario_config').upsert({
          profissional_id: profissionalId,
          tipo_prontuario: tipoNormalized,
          config: newConfig,
          versao: (newConfig.versao || 1) + 1,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'profissional_id,tipo_prontuario' });
      } catch (err) {
        console.error('[saveProntuarioConfig]', err);
      }
      setSaving(false);
    }, 800);
  }, [profissionalId, tipoNormalized]);

  const visibleBlocks = useMemo(() => {
    if (!config) return [];
    return [...config.blocos]
      .filter(b => b.visivel && !b.admin_desabilitado)
      .sort((a, b) => a.ordem - b.ordem);
  }, [config]);

  const isBlocoVisible = useCallback((blocoId: string) => {
    return visibleBlocks.some(b => b.id === blocoId || b.id.replace('evolucao.', '') === blocoId);
  }, [visibleBlocks]);

  const isBlocoRequired = useCallback((blocoId: string) => {
    const bloco = config?.blocos.find(b => b.id === blocoId || b.id.replace('evolucao.', '') === blocoId);
    return bloco?.obrigatorio || bloco?.admin_obrigatorio;
  }, [config]);

  return {
    config,
    adminConfig,
    adminProntuario,
    adminCustomFields,
    loading,
    saving,
    saveConfig,
    visibleBlocks,
    isBlocoVisible,
    isBlocoRequired,
    tipoNormalized,
  };
}


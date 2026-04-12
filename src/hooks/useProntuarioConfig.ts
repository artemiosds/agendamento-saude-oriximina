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

export interface ProntuarioConfigData {
  versao: number;
  layout: 'padrao' | 'compacto' | 'detalhado';
  blocos: BlocoConfig[];
  catalogos: {
    medicamentos: { favoritos: string[]; desabilitados: string[] };
    exames: { favoritos: string[]; desabilitados: string[] };
  };
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

// ─── Admin config loader ─────────────────────────────────────────────────────
const ADMIN_CONFIG_KEY = 'config_especialidades_campos';

async function loadAdminEspecialidadeConfig(): Promise<AdminEspecialidadeConfig[] | null> {
  try {
    const { data } = await supabase
      .from('system_config')
      .select('configuracoes')
      .eq('id', 'default')
      .maybeSingle();
    const cfg = data?.configuracoes as any;
    return cfg?.[ADMIN_CONFIG_KEY] || null;
  } catch {
    return null;
  }
}

/**
 * Merge admin base config with professional personal config.
 * Rules:
 * - Admin disabled field → professional cannot re-enable (admin_desabilitado=true)
 * - Admin required field → professional cannot make optional (admin_obrigatorio=true)
 * - Professional can hide fields admin left visible
 * - Professional can reorder and set favorites freely
 */
export function mergeAdminAndProfConfig(
  adminEspecialidades: AdminEspecialidadeConfig[] | null,
  profissao: string | undefined,
  profConfig: ProntuarioConfigData
): ProntuarioConfigData {
  if (!adminEspecialidades || !profissao) return profConfig;

  const normalizedProf = profissao.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
  
  // Find matching specialty config from admin
  const adminEsp = adminEspecialidades.find(e =>
    e.ativa && e.profissoes.some(p => p === normalizedProf)
  );

  if (!adminEsp) return profConfig;

  // Apply admin constraints on blocos
  const mergedBlocos = profConfig.blocos.map(bloco => {
    // Find if admin has a matching campo config for specialty fields
    const adminCampo = adminEsp.campos.find(c => c.key === bloco.id || c.id === bloco.id);
    
    if (adminCampo) {
      return {
        ...bloco,
        // If admin disabled the field, professional cannot see it
        admin_desabilitado: !adminCampo.habilitado,
        visivel: !adminCampo.habilitado ? false : bloco.visivel,
        // If admin marked required, professional cannot make optional
        admin_obrigatorio: adminCampo.obrigatorio,
        obrigatorio: adminCampo.obrigatorio ? true : bloco.obrigatorio,
      };
    }
    return bloco;
  });

  return { ...profConfig, blocos: mergedBlocos };
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useProntuarioConfig(profissionalId: string | undefined, tipoProntuario: string) {
  const [config, setConfig] = useState<ProntuarioConfigData | null>(null);
  const [adminConfig, setAdminConfig] = useState<AdminEspecialidadeConfig[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Normalize tipo to known types
  const tipoNormalized = TIPOS_PRONTUARIO.some(t => t.value === tipoProntuario)
    ? tipoProntuario
    : 'sessao';

  useEffect(() => {
    if (!profissionalId) { setLoading(false); return; }
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        // Load in parallel: professional config + admin specialty config
        const [profResult, adminResult] = await Promise.all([
          (supabase as any)
            .from('prontuario_config')
            .select('config, versao')
            .eq('profissional_id', profissionalId)
            .eq('tipo_prontuario', tipoNormalized)
            .maybeSingle(),
          loadAdminEspecialidadeConfig(),
        ]);

        if (!cancelled) {
          setAdminConfig(adminResult);
          
          const defaults = getDefaultConfig(tipoNormalized);
          if (profResult.data?.config) {
            const loaded = profResult.data.config as ProntuarioConfigData;
            setConfig({
              ...defaults,
              ...loaded,
              versao: profResult.data.versao || loaded.versao || 1,
              blocos: loaded.blocos || defaults.blocos,
              catalogos: { ...defaults.catalogos, ...loaded.catalogos },
              ui: { ...defaults.ui, ...loaded.ui },
              impressao: { ...defaults.impressao, ...loaded.impressao },
            });
          } else {
            setConfig(defaults);
          }
        }
      } catch {
        if (!cancelled) setConfig(getDefaultConfig(tipoNormalized));
      }
      if (!cancelled) setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [profissionalId, tipoNormalized]);

  const saveConfig = useCallback(async (newConfig: ProntuarioConfigData) => {
    if (!profissionalId) return;
    setConfig(newConfig);

    // Debounce: 800ms
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

  // Helpers — merge admin constraints into visible blocks
  const visibleBlocks = useMemo(() => {
    if (!config) return [];
    return [...config.blocos]
      .filter(b => b.visivel)
      .sort((a, b) => a.ordem - b.ordem);
  }, [config]);

  const isBlocoVisible = useCallback((blocoId: string) => {
    return visibleBlocks.some(b => b.id === blocoId);
  }, [visibleBlocks]);

  return {
    config,
    adminConfig,
    loading,
    saving,
    saveConfig,
    visibleBlocks,
    isBlocoVisible,
    tipoNormalized,
  };
}

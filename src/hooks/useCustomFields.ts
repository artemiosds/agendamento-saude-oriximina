import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type CustomFieldType = 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'textarea';

export interface CustomFieldDef {
  id: string;
  nome: string;
  rotulo: string;
  tipo: CustomFieldType;
  opcoes: string[];
  obrigatorio: boolean;
  ativo: boolean;
  ordem: number;
  valorPadrao: string;
  mostrarListagem: boolean;
}

export type ScreenKey =
  | 'paciente'
  | 'agendamento'
  | 'gestao_tratamento'
  | 'pts'
  | 'relatorio_multiprof'
  | 'relatorio_alta'
  | 'funcionario'
  | 'unidade'
  | 'triagem'
  | 'prontuario'
  | 'encaminhamento'
  | 'fila_espera'
  | 'atendimento';

export const SCREEN_LABELS: Record<ScreenKey, string> = {
  paciente: 'Cadastro de Paciente',
  agendamento: 'Agendamento',
  gestao_tratamento: 'Gestão de Tratamentos',
  pts: 'PTS',
  relatorio_multiprof: 'Relatório Multiprofissional',
  relatorio_alta: 'Relatório de Alta',
  funcionario: 'Funcionários',
  unidade: 'Unidades',
  triagem: 'Triagem',
  prontuario: 'Prontuário',
  encaminhamento: 'Encaminhamento',
  fila_espera: 'Fila de Espera',
  atendimento: 'Atendimentos',
};

// Native fields per screen — exported so config UI and forms share one source of truth.
export const NATIVE_FIELDS: Record<ScreenKey, { nome: string; rotulo: string }[]> = {
  paciente: [
    { nome: 'nome', rotulo: 'Nome' },
    { nome: 'dataNascimento', rotulo: 'Data de Nascimento' },
    { nome: 'cpf', rotulo: 'CPF' },
    { nome: 'cns', rotulo: 'CNS' },
    { nome: 'telefone', rotulo: 'Telefone' },
    { nome: 'email', rotulo: 'E-mail' },
    { nome: 'endereco', rotulo: 'Endereço' },
    { nome: 'municipio', rotulo: 'Município' },
    { nome: 'nomeMae', rotulo: 'Nome da Mãe' },
    { nome: 'observacoes', rotulo: 'Observações' },
    { nome: 'isGestante', rotulo: 'Gestante' },
    { nome: 'isPne', rotulo: 'PNE' },
    { nome: 'isAutista', rotulo: 'Autista (TEA)' },
  ],
  agendamento: [
    { nome: 'pacienteNome', rotulo: 'Paciente' },
    { nome: 'profissionalNome', rotulo: 'Profissional' },
    { nome: 'data', rotulo: 'Data' },
    { nome: 'hora', rotulo: 'Hora' },
    { nome: 'tipo', rotulo: 'Tipo' },
    { nome: 'observacoes', rotulo: 'Observações' },
  ],
  gestao_tratamento: [
    { nome: 'specialty', rotulo: 'Especialidade' },
    { nome: 'frequency', rotulo: 'Frequência' },
    { nome: 'total_sessions', rotulo: 'Total de Sessões' },
    { nome: 'clinical_notes', rotulo: 'Notas Clínicas' },
  ],
  pts: [
    { nome: 'diagnostico_funcional', rotulo: 'Diagnóstico Funcional' },
    { nome: 'objetivos_terapeuticos', rotulo: 'Objetivos Terapêuticos' },
    { nome: 'metas_curto_prazo', rotulo: 'Metas Curto Prazo' },
    { nome: 'metas_medio_prazo', rotulo: 'Metas Médio Prazo' },
    { nome: 'metas_longo_prazo', rotulo: 'Metas Longo Prazo' },
  ],
  relatorio_multiprof: [
    { nome: 'clinical_evaluation', rotulo: 'Avaliação Clínica' },
    { nome: 'parecer', rotulo: 'Parecer' },
    { nome: 'observations', rotulo: 'Observações' },
  ],
  relatorio_alta: [
    { nome: 'reason', rotulo: 'Motivo da Alta' },
    { nome: 'final_notes', rotulo: 'Notas Finais' },
  ],
  funcionario: [
    { nome: 'nome', rotulo: 'Nome' },
    { nome: 'email', rotulo: 'E-mail' },
    { nome: 'cpf', rotulo: 'CPF' },
    { nome: 'usuario', rotulo: 'Usuário' },
    { nome: 'profissao', rotulo: 'Profissão' },
    { nome: 'cargo', rotulo: 'Cargo' },
    { nome: 'setor', rotulo: 'Setor' },
    { nome: 'tipo_conselho', rotulo: 'Tipo de Conselho' },
    { nome: 'numero_conselho', rotulo: 'Nº do Conselho' },
    { nome: 'uf_conselho', rotulo: 'UF do Conselho' },
    { nome: 'tempo_atendimento', rotulo: 'Tempo de Atendimento' },
  ],
  unidade: [
    { nome: 'nome', rotulo: 'Nome' },
    { nome: 'endereco', rotulo: 'Endereço' },
    { nome: 'telefone', rotulo: 'Telefone' },
    { nome: 'whatsapp', rotulo: 'WhatsApp' },
  ],
  triagem: [
    { nome: 'peso', rotulo: 'Peso' },
    { nome: 'altura', rotulo: 'Altura' },
    { nome: 'pressaoArterial', rotulo: 'Pressão Arterial' },
    { nome: 'temperatura', rotulo: 'Temperatura' },
    { nome: 'frequenciaCardiaca', rotulo: 'Frequência Cardíaca' },
    { nome: 'saturacaoOxigenio', rotulo: 'Saturação de Oxigênio' },
    { nome: 'glicemia', rotulo: 'Glicemia' },
    { nome: 'queixaPrincipal', rotulo: 'Queixa Principal' },
    { nome: 'classificacaoRisco', rotulo: 'Classificação de Risco' },
  ],
  prontuario: [
    { nome: 'soap_subjetivo', rotulo: 'Subjetivo (S)' },
    { nome: 'soap_objetivo', rotulo: 'Objetivo (O)' },
    { nome: 'soap_avaliacao', rotulo: 'Avaliação (A)' },
    { nome: 'soap_plano', rotulo: 'Plano (P)' },
    { nome: 'evolucao', rotulo: 'Evolução' },
    { nome: 'queixa_principal', rotulo: 'Queixa Principal' },
    { nome: 'anamnese', rotulo: 'Anamnese' },
    { nome: 'exame_fisico', rotulo: 'Exame Físico' },
    { nome: 'hipotese', rotulo: 'Hipótese' },
    { nome: 'conduta', rotulo: 'Conduta' },
    { nome: 'prescricao', rotulo: 'Prescrição' },
    { nome: 'observacoes', rotulo: 'Observações' },
  ],
  encaminhamento: [
    { nome: 'profissionalDestino', rotulo: 'Profissional de Destino' },
    { nome: 'especialidadeDestino', rotulo: 'Especialidade de Destino' },
    { nome: 'motivo', rotulo: 'Motivo' },
    { nome: 'observacoes', rotulo: 'Observações' },
  ],
  fila_espera: [
    { nome: 'pacienteNome', rotulo: 'Paciente' },
    { nome: 'prioridade', rotulo: 'Prioridade' },
    { nome: 'setor', rotulo: 'Setor' },
    { nome: 'especialidadeDestino', rotulo: 'Especialidade' },
    { nome: 'descricaoClinica', rotulo: 'Descrição Clínica' },
    { nome: 'observacoes', rotulo: 'Observações' },
  ],
  atendimento: [
    { nome: 'pacienteNome', rotulo: 'Paciente' },
    { nome: 'profissionalNome', rotulo: 'Profissional' },
    { nome: 'procedimento', rotulo: 'Procedimento' },
    { nome: 'observacoes', rotulo: 'Observações' },
  ],
};

export interface ScreenConfig {
  fields: CustomFieldDef[];
  hiddenNative: string[];
  labelOverrides: Record<string, string>;
  /** Unified ordering across native + custom field names. Optional for backward compat. */
  orderedNames?: string[];
}

export interface CustomFieldsConfig {
  [screen: string]: {
    [unidadeId: string]: ScreenConfig;
  };
}

const CONFIG_ID = 'custom_fields_config';

const emptyScreenConfig = (): ScreenConfig => ({
  fields: [],
  hiddenNative: [],
  labelOverrides: {},
  orderedNames: [],
});

export function useCustomFields(screen?: ScreenKey, unidadeId?: string) {
  const [config, setConfig] = useState<CustomFieldsConfig>({});
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('system_config')
        .select('configuracoes')
        .eq('id', CONFIG_ID)
        .maybeSingle();

      if (data?.configuracoes) {
        setConfig(data.configuracoes as unknown as CustomFieldsConfig);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Realtime — refetch whenever the row changes anywhere in the system
  useEffect(() => {
    const channel = supabase
      .channel('custom-fields-config')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_config', filter: `id=eq.${CONFIG_ID}` },
        () => fetchConfig(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConfig]);

  const saveConfig = useCallback(async (newConfig: CustomFieldsConfig) => {
    setConfig(newConfig);
    try {
      const { error } = await supabase.from('system_config').upsert({
        id: CONFIG_ID,
        configuracoes: newConfig as any,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(`Erro ao salvar campos: ${err.message}`);
    }
  }, []);

  // Resolved config for screen+unit (merges global with unit-specific)
  const getScreenConfig = useCallback(
    (s: ScreenKey, uid?: string): ScreenConfig => {
      const screenData = config[s];
      if (!screenData) return emptyScreenConfig();

      const globalCfg = screenData['__global__'] || emptyScreenConfig();
      if (!uid || uid === '__global__') return globalCfg;

      const unitCfg = screenData[uid];
      if (!unitCfg) return globalCfg;

      return {
        fields: [...globalCfg.fields, ...unitCfg.fields].sort((a, b) => a.ordem - b.ordem),
        hiddenNative: [...new Set([...globalCfg.hiddenNative, ...unitCfg.hiddenNative])],
        labelOverrides: { ...globalCfg.labelOverrides, ...unitCfg.labelOverrides },
        orderedNames: unitCfg.orderedNames?.length ? unitCfg.orderedNames : globalCfg.orderedNames,
      };
    },
    [config],
  );

  const getRawScreenConfig = useCallback(
    (s: ScreenKey, uid: string): ScreenConfig => {
      return config[s]?.[uid] || emptyScreenConfig();
    },
    [config],
  );

  const updateScreenConfig = useCallback(
    async (s: ScreenKey, uid: string, screenCfg: ScreenConfig) => {
      const newConfig = {
        ...config,
        [s]: {
          ...config[s],
          [uid]: screenCfg,
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const resolved = screen ? getScreenConfig(screen, unidadeId) : emptyScreenConfig();

  // ---------- Convenience helpers for consumers ----------

  /** Get the (possibly renamed) label for a native field on the active screen. */
  const getNativeLabel = useCallback(
    (fieldName: string, fallback?: string): string => {
      const overridden = resolved.labelOverrides?.[fieldName];
      if (overridden) return overridden;
      if (fallback) return fallback;
      const native = screen ? NATIVE_FIELDS[screen]?.find((f) => f.nome === fieldName) : undefined;
      return native?.rotulo || fieldName;
    },
    [resolved.labelOverrides, screen],
  );

  /** True when a native field has been hidden in this screen/unit. */
  const isNativeHidden = useCallback(
    (fieldName: string): boolean => resolved.hiddenNative.includes(fieldName),
    [resolved.hiddenNative],
  );

  return {
    config,
    loading,
    resolved,
    getScreenConfig,
    getRawScreenConfig,
    updateScreenConfig,
    getNativeLabel,
    isNativeHidden,
    refetch: fetchConfig,
  };
}

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

export interface ScreenConfig {
  fields: CustomFieldDef[];
  hiddenNative: string[];
  labelOverrides: Record<string, string>;
}

export interface CustomFieldsConfig {
  [screen: string]: {
    [unidadeId: string]: ScreenConfig; // use '__global__' for global
  };
}

const CONFIG_ID = 'custom_fields_config';

const emptyScreenConfig = (): ScreenConfig => ({
  fields: [],
  hiddenNative: [],
  labelOverrides: {},
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

  // Get the resolved config for a specific screen+unit (merges global with unit-specific)
  const getScreenConfig = useCallback(
    (s: ScreenKey, uid?: string): ScreenConfig => {
      const screenData = config[s];
      if (!screenData) return emptyScreenConfig();

      const globalCfg = screenData['__global__'] || emptyScreenConfig();
      if (!uid || uid === '__global__') return globalCfg;

      const unitCfg = screenData[uid];
      if (!unitCfg) return globalCfg;

      // Merge: unit-specific overrides global
      return {
        fields: [...globalCfg.fields, ...unitCfg.fields].sort((a, b) => a.ordem - b.ordem),
        hiddenNative: [...new Set([...globalCfg.hiddenNative, ...unitCfg.hiddenNative])],
        labelOverrides: { ...globalCfg.labelOverrides, ...unitCfg.labelOverrides },
      };
    },
    [config],
  );

  // For the config UI: get raw config for a specific screen+unit (no merge)
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

  // Convenience for rendering: resolved config for the given screen/unit
  const resolved = screen ? getScreenConfig(screen, unidadeId) : emptyScreenConfig();

  return {
    config,
    loading,
    resolved,
    getScreenConfig,
    getRawScreenConfig,
    updateScreenConfig,
    refetch: fetchConfig,
  };
}

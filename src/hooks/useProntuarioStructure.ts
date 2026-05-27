import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const CONFIG_KEY = 'config_prontuario_tipos';

export interface ProntuarioField {
  id: string;
  key: string;
  label: string;
  tipo: string;
  obrigatorio: boolean;
  habilitado: boolean;
  order: number;
  tiposProntuario: string[];
  opcoes?: string[];
  isBuiltin: boolean;
}

export function useProntuarioStructure(tipoProntuario?: string) {
  const [fields, setFields] = useState<ProntuarioField[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from('system_config')
          .select('configuracoes')
          .eq('id', 'default')
          .single();

        const config = data?.configuracoes as any;
        const allFields: ProntuarioField[] = [];

        // 1. Carregar campos globais (definidos na lista principal de ConfigProntuario)
        if (config?.[CONFIG_KEY]?.campos) {
          allFields.push(...config[CONFIG_KEY].campos);
        }

        // 2. Carregar campos específicos do modelo visual (ConstrutorProntuarioModal)
        // Normalização de chaves para garantir que encontre mesmo se houver variação
        const possibleKeys = [
          `estrutura_prontuario_${tipoProntuario}`,
          tipoProntuario === 'avaliacao_inicial' ? 'estrutura_prontuario_primeira_consulta' : '',
        ].filter(Boolean);

        for (const key of possibleKeys) {
          const modelSchema = config?.[key];
          if (modelSchema?.fields) {
            const mappedFields = modelSchema.fields.map((f: any, idx: number) => ({
              id: f.id,
              key: f.key || `custom_${f.id}`,
              label: f.label,
              tipo: f.type, // BuilderField usa 'type', ProntuarioField usa 'tipo'
              obrigatorio: f.required,
              habilitado: true,
              order: 1000 + idx, // Coloca campos do construtor após os globais
              tiposProntuario: [tipoProntuario],
              opcoes: f.options,
              isBuiltin: false
            }));
            allFields.push(...mappedFields);
          }
        }

        setFields(allFields);
      } catch (err) {
        console.error('Error loading prontuario structure:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tipoProntuario]);

  const getFieldsForType = (type: string) => {
    const normalizedType = type === 'avaliacao_inicial' ? 'avaliacao_inicial' : type;
    const legacyType = type === 'avaliacao_inicial' ? 'primeira_consulta' : type;

    return fields
      .filter(f => f.habilitado && (f.tiposProntuario.includes(normalizedType) || f.tiposProntuario.includes(legacyType)))
      .sort((a, b) => a.order - b.order);
  };

  const enabledFields = tipoProntuario ? getFieldsForType(tipoProntuario) : [];

  return { fields, enabledFields, loading, getFieldsForType };
}

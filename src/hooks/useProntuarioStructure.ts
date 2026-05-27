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
        if (config?.[CONFIG_KEY]?.campos) {
          setFields(config[CONFIG_KEY].campos);
        }
      } catch (err) {
        console.error('Error loading prontuario structure:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const getFieldsForType = (type: string) => {
    return fields
      .filter(f => f.habilitado && f.tiposProntuario.includes(type))
      .sort((a, b) => a.order - b.order);
  };

  const enabledFields = tipoProntuario ? getFieldsForType(tipoProntuario) : [];

  return { fields, enabledFields, loading, getFieldsForType };
}

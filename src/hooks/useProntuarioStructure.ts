import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ProntuarioSection } from '@/components/EditorProntuarioConfig';

const CONFIG_KEY = 'estrutura_prontuario';

export function useProntuarioStructure() {
  const [sections, setSections] = useState<ProntuarioSection[] | null>(null);
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
        if (config?.[CONFIG_KEY]?.sections) {
          setSections(config[CONFIG_KEY].sections);
        }
      } catch {
        // fallback: no custom structure
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  /**
   * Returns enabled fields from enabled sections, sorted by order.
   * Builtin fields map to form keys; custom fields use `custom_<id>`.
   */
  const getEnabledFields = () => {
    if (!sections) return null;
    return sections
      .filter(s => s.enabled)
      .sort((a, b) => a.order - b.order)
      .map(s => ({
        ...s,
        fields: s.fields.filter(f => f.enabled).sort((a, b) => a.order - b.order),
      }))
      .filter(s => s.fields.length > 0);
  };

  return { sections, loading, getEnabledFields };
}

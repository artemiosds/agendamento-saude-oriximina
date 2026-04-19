import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FormTemplate } from '@/types/formTemplate';

interface UseFormTemplateOpts {
  formSlug: string;
  profissionalId?: string | null;
  unidadeId?: string | null;
  enabled?: boolean;
}

/**
 * Resolve o template seguindo a hierarquia: profissional → unidade → global.
 * Reage a mudanças via Supabase Realtime, invalidando o cache instantaneamente.
 */
export function useFormTemplate({ formSlug, profissionalId, unidadeId, enabled = true }: UseFormTemplateOpts) {
  const queryClient = useQueryClient();
  const queryKey = ['form_template', formSlug, profissionalId ?? '', unidadeId ?? ''];

  const query = useQuery({
    queryKey,
    enabled: enabled && !!formSlug,
    staleTime: 30_000,
    queryFn: async (): Promise<FormTemplate | null> => {
      const { data, error } = await (supabase as any).rpc('resolve_form_template', {
        p_form_slug: formSlug,
        p_profissional_id: profissionalId || null,
        p_unidade_id: unidadeId || null,
      });
      if (error) throw error;
      return (data as FormTemplate | null) ?? null;
    },
  });

  // Realtime: qualquer mudança na tabela invalida a query (a RPC reordena conforme hierarquia)
  useEffect(() => {
    if (!enabled || !formSlug) return;
    const channel = supabase
      .channel(`form_templates:${formSlug}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'form_templates', filter: `form_slug=eq.${formSlug}` },
        () => {
          queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formSlug, profissionalId, unidadeId, enabled]);

  return query;
}

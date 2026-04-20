import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Realtime hook que monitora se o WhatsApp está ATIVO para a unidade do usuário.
 * Retorna { ativo, loading, refresh }.
 *
 * - Lê de `whatsapp_config.whatsapp_ativo` filtrado por unidade.
 * - Assina mudanças em tempo real (postgres_changes) para todas as estações
 *   serem atualizadas instantaneamente quando alguém liga/desliga o switch.
 * - Default = true (não bloqueia caso a config ainda não exista).
 */
export function useWhatsappStatus() {
  const { user, isGlobalAdmin } = useAuth();
  const unidadeId = user?.unidadeId || '';
  const [ativo, setAtivo] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchStatus = useCallback(async () => {
    // Admin global sem unidade: não exibe banner
    if (isGlobalAdmin || !unidadeId) {
      setAtivo(true);
      setLoading(false);
      return;
    }
    try {
      const { data } = await supabase
        .from('whatsapp_config' as any)
        .select('whatsapp_ativo')
        .eq('unidade_id', unidadeId)
        .maybeSingle();
      const v = (data as any)?.whatsapp_ativo;
      // Default: true (não cadastrado = ativo)
      setAtivo(v === undefined || v === null ? true : !!v);
    } catch {
      setAtivo(true);
    } finally {
      setLoading(false);
    }
  }, [unidadeId, isGlobalAdmin]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!unidadeId || isGlobalAdmin) return;
    const channel = supabase
      .channel(`whatsapp_config_${unidadeId}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'whatsapp_config', filter: `unidade_id=eq.${unidadeId}` },
        () => { fetchStatus(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [unidadeId, isGlobalAdmin, fetchStatus]);

  return { ativo, loading, refresh: fetchStatus };
}

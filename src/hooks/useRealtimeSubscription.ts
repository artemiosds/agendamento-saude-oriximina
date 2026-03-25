import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

type TableName = 'agendamentos' | 'fila_espera' | 'atendimentos' | 'prontuarios' | 'treatment_cycles' | 'treatment_sessions' | 'permissoes' | 'pacientes';

interface UseRealtimeOptions {
  tables: TableName[];
  onchange: () => void;
  enabled?: boolean;
  debounceMs?: number;
}

export function useRealtimeSubscription({ tables, onchange, enabled = true, debounceMs = 300 }: UseRealtimeOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled || tables.length === 0) return;

    const debouncedHandler = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onchange();
      }, debounceMs);
    };

    const channelName = `realtime-${tables.join('-')}-${Date.now()}`;
    let channel = supabase.channel(channelName);

    tables.forEach((table) => {
      channel = channel.on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table },
        debouncedHandler,
      );
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [tables.join(','), enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload, RealtimeChannel } from "@supabase/supabase-js";

export type RealtimeSyncPayload<T = Record<string, unknown>> = RealtimePostgresChangesPayload<T>;

interface UseRealtimeSyncOptions<T = Record<string, unknown>> {
  table: string;
  schema?: string;
  filter?: string;
  enabled?: boolean;
  debounceMs?: number;
  channelKey?: string;
  onEvent: (payload: RealtimeSyncPayload<T>) => void;
  poll?: () => Promise<void> | void;
  pollIntervalMs?: number;
}

/**
 * RealtimeManager (Fase B, item 5) — pool compartilhado de canais Supabase Realtime.
 *
 * Antes: cada chamada de `useRealtimeSync` criava um canal WebSocket próprio
 * mesmo quando N assinantes escutavam a mesma tabela/filtro. Em telas densas
 * (Agenda + Prontuário + Fila) isso multiplicava por 5-10 o número de canais
 * ativos, saturando o loop do rrweb/main-thread em PCs fracos.
 *
 * Agora: canais são deduplicados por `channelName` com ref-counting. Múltiplos
 * componentes com a mesma chave compartilham 1 canal e recebem o payload por
 * um fan-out interno. O canal é destruído só quando o último assinante
 * desmonta. API pública inalterada — nenhum call-site muda.
 */
type SharedListener = (payload: RealtimeSyncPayload) => void;
interface SharedChannel {
  channel: RealtimeChannel;
  listeners: Set<SharedListener>;
  refCount: number;
  subscribed: boolean;
  onStatus: Set<(status: string) => void>;
}
const sharedChannels = new Map<string, SharedChannel>();

function acquireChannel(
  channelName: string,
  schema: string,
  table: string,
  filter: string | undefined,
  listener: SharedListener,
  onStatus: (status: string) => void,
): () => void {
  let entry = sharedChannels.get(channelName);
  if (!entry) {
    const subscriptionConfig = {
      event: "*",
      schema,
      table,
      ...(filter ? { filter } : {}),
    };
    const channel = supabase.channel(channelName);
    const listeners = new Set<SharedListener>();
    const statusListeners = new Set<(status: string) => void>();
    channel.on("postgres_changes" as any, subscriptionConfig as any, (payload) => {
      for (const fn of listeners) {
        try {
          fn(payload as RealtimeSyncPayload);
        } catch (err) {
          console.error(`[useRealtimeSync:${table}] handler error`, err);
        }
      }
    });
    entry = {
      channel,
      listeners,
      refCount: 0,
      subscribed: false,
      onStatus: statusListeners,
    };
    sharedChannels.set(channelName, entry);
    channel.subscribe((status) => {
      entry!.subscribed = status === "SUBSCRIBED";
      for (const fn of entry!.onStatus) {
        try {
          fn(status);
        } catch {
          /* noop */
        }
      }
    });
  }
  entry.listeners.add(listener);
  entry.onStatus.add(onStatus);
  entry.refCount += 1;

  return () => {
    const e = sharedChannels.get(channelName);
    if (!e) return;
    e.listeners.delete(listener);
    e.onStatus.delete(onStatus);
    e.refCount -= 1;
    if (e.refCount <= 0) {
      sharedChannels.delete(channelName);
      supabase.removeChannel(e.channel);
    }
  };
}

export function useRealtimeSync<T = Record<string, unknown>>({
  table,
  schema = "public",
  filter,
  enabled = true,
  debounceMs = 300,
  channelKey,
  onEvent,
  poll,
  pollIntervalMs = 30000,
}: UseRealtimeSyncOptions<T>) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onEventRef = useRef(onEvent);
  const pollRef = useRef(poll);
  const payloadsRef = useRef<RealtimeSyncPayload<T>[]>([]);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    if (!enabled) return;

    let isSubscribed = false;

    const stopPolling = () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };

    const startPolling = () => {
      if (!pollRef.current || pollingRef.current) return;
      void pollRef.current?.();
      pollingRef.current = setInterval(() => {
        void pollRef.current?.();
      }, pollIntervalMs);
    };

    const flushPayloads = () => {
      const queued = payloadsRef.current;
      payloadsRef.current = [];
      for (const p of queued) {
        try {
          onEventRef.current(p);
        } catch (err) {
          console.error(`[useRealtimeSync:${table}] handler error`, err);
        }
      }
    };

    const handlePayload = (payload: RealtimeSyncPayload<T>) => {
      if (debounceMs <= 0) {
        onEventRef.current(payload);
        return;
      }
      payloadsRef.current.push(payload);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flushPayloads();
      }, debounceMs);
    };

    const channelName = channelKey || `rt:${schema}:${table}:${filter || "all"}`;

    const listener: SharedListener = (payload) => {
      isSubscribed = true;
      stopPolling();
      handlePayload(payload as RealtimeSyncPayload<T>);
    };

    const onStatus = (status: string) => {
      if (status === "SUBSCRIBED") {
        isSubscribed = true;
        stopPolling();
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        startPolling();
      }
    };

    const release = acquireChannel(channelName, schema, table, filter, listener, onStatus);

    const subscribeTimeout = setTimeout(() => {
      if (!isSubscribed) startPolling();
    }, 4000);

    return () => {
      clearTimeout(subscribeTimeout);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      payloadsRef.current = [];
      stopPolling();
      release();
    };
  }, [table, schema, filter, enabled, debounceMs, pollIntervalMs, channelKey]);
}

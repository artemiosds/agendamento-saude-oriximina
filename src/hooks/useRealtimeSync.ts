import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

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

      // Enfileira o payload e agrupa a chamada na janela de debounce, sem
      // descartar eventos intermediários — o handler é invocado uma vez
      // por payload recebido quando o timer dispara.
      payloadsRef.current.push(payload);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flushPayloads();
      }, debounceMs);
    };


    const channelName = channelKey || `rt:${schema}:${table}:${filter || "all"}`;
    const subscriptionConfig = {
      event: "*",
      schema,
      table,
      ...(filter ? { filter } : {}),
    };

    const channel = supabase
      .channel(channelName)
      .on("postgres_changes" as any, subscriptionConfig as any, (payload) => {
        isSubscribed = true;
        stopPolling();
        handlePayload(payload as RealtimeSyncPayload<T>);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          isSubscribed = true;
          stopPolling();
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          startPolling();
        }
      });

    const subscribeTimeout = setTimeout(() => {
      if (!isSubscribed) startPolling();
    }, 4000);

    return () => {
      clearTimeout(subscribeTimeout);
      if (timerRef.current) clearTimeout(timerRef.current);
      stopPolling();
      supabase.removeChannel(channel);
    };
  }, [table, schema, filter, enabled, debounceMs, pollIntervalMs, channelKey]);
}
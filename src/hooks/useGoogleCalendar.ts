import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useGoogleCalendar() {
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        body: { action: 'check_status' },
      });
      if (!error && data) {
        setConnected(data.connected);
      }
      return data?.connected ?? false;
    } catch {
      return false;
    }
  }, []);

  const connect = useCallback(async () => {
    setLoading(true);
    try {
      const redirectUri = `${window.location.origin}/painel/configuracoes`;
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        body: { action: 'get_auth_url', redirect_uri: redirectUri },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Failed to start Google Calendar auth:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const exchangeCode = useCallback(async (code: string) => {
    setLoading(true);
    try {
      const redirectUri = `${window.location.origin}/painel/configuracoes`;
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        body: { action: 'exchange_code', code, redirect_uri: redirectUri },
      });
      if (error) throw error;
      if (data?.connected) {
        setConnected(true);
      }
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setLoading(true);
    try {
      await supabase.functions.invoke('google-calendar-auth', {
        body: { action: 'disconnect' },
      });
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const createEvent = useCallback(async (event: {
    summary: string;
    description?: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    attendees?: { email: string }[];
  }) => {
    const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
      body: { action: 'create_event', event },
    });
    if (error) throw error;
    return data;
  }, []);

  const updateEvent = useCallback(async (eventId: string, event: any) => {
    const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
      body: { action: 'update_event', eventId, event },
    });
    if (error) throw error;
    return data;
  }, []);

  const deleteEvent = useCallback(async (eventId: string) => {
    const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
      body: { action: 'delete_event', eventId },
    });
    if (error) throw error;
    return data;
  }, []);

  const listEvents = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
      body: { action: 'list_events' },
    });
    if (error) throw error;
    return data?.events ?? [];
  }, []);

  return {
    loading,
    connected,
    checkStatus,
    connect,
    exchangeCode,
    disconnect,
    createEvent,
    updateEvent,
    deleteEvent,
    listEvents,
  };
}
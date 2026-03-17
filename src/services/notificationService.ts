import { supabase } from '@/integrations/supabase/client';

export const notificationService = {
  async sendWebhook(payload: Record<string, any>) {
    try {
      const { data, error } = await supabase.functions.invoke('webhook-notify', { body: payload });
      if (error) console.error('Webhook error:', error);
      return { data, error };
    } catch (err) {
      console.error('Notification error:', err);
      return { data: null, error: err };
    }
  },
};

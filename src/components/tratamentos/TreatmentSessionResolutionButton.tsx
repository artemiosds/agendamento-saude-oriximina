import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function TreatmentSessionResolutionButton({ sessionId, appointmentId, date, number, onChanged }: {
  sessionId: string; appointmentId: string | null; date: string | null; number: number; onChanged: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  return <Button size="sm" variant="outline" disabled={saving} onClick={async () => {
    if (saving || !window.confirm(`Liberar a sessão nº ${number} para novo agendamento? Se a reserva estiver compartilhada, ela será preservada para a outra sessão. Uma reserva exclusiva ainda não recebida será excluída. Registros clínicos são protegidos.`)) return;
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc('release_treatment_session_for_booking', {
        p_session_id: sessionId, p_expected_appointment_id: appointmentId, p_expected_date: date,
      });
      if (error) throw error;
      if (data?.status !== 'liberado') throw new Error('A liberação não foi confirmada. Atualize os dados.');
      toast.success(data.appointment_preserved ? 'Sessão liberada; reserva compartilhada preservada.' : 'Sessão liberada para novo agendamento.');
      await onChanged();
    } catch (error: any) { toast.error(error?.message || 'Não foi possível liberar a sessão.'); }
    finally { setSaving(false); }
  }}>{saving ? 'Liberando…' : 'Liberar para agendar'}</Button>;
}

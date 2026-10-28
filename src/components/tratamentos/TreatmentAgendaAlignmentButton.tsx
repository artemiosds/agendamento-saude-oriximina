import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
export function TreatmentAgendaAlignmentButton({ sessionId, sessionDate, appointmentId, agendaDate, onChanged }: {
  sessionId: string; sessionDate: string | null; appointmentId: string; agendaDate: string; onChanged: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  return <Button size="sm" variant="outline" disabled={saving} onClick={async () => {
    if (saving || !window.confirm(`Usar a data ${agendaDate.split('-').reverse().join('/')} da Agenda nesta sessão? A alteração será auditada.`)) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc('align_treatment_session_to_agenda', {
        p_session_id: sessionId, p_expected_date: sessionDate, p_appointment_id: appointmentId, p_expected_agenda_date: agendaDate,
      });
      if (error) throw error;
      toast.success('Sessão sincronizada com a data da Agenda.');
      await onChanged();
    } catch (error: any) { toast.error(error?.message || 'Não foi possível sincronizar a sessão.'); }
    finally { setSaving(false); }
  }}>{saving ? 'Sincronizando…' : 'Usar data da Agenda'}</Button>;
}

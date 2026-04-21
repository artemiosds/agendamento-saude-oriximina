/**
 * Auto-fix utility: detects treatment_sessions agendadas em datas inválidas
 * (sábado, domingo, feriado, bloqueio manual) e as devolve para
 * "pendente_agendamento", desvinculando a data e o agendamento — sem excluir
 * a sessão nem perder histórico.
 */
import { supabase } from '@/integrations/supabase/client';
import { buildBlockedRanges, isInvalidSessionDate, type BlockedRange } from './treatmentSessionGenerator';

interface SessionRow {
  id: string;
  cycle_id: string;
  patient_id: string;
  professional_id: string;
  scheduled_date: string;
  status: string;
  appointment_id: string | null;
}

interface CycleRow {
  id: string;
  professional_id: string;
  unit_id: string;
}

export interface AutoFixResult {
  scanned: number;
  fixed: number;
  errors: number;
}

/**
 * Scans all treatment_sessions still pending or scheduled and clears the
 * scheduled_date/appointment_id when the date is invalid (weekend or blocked).
 *
 * Scoped by professionalId/unitId when provided so we don't touch data
 * outside the current user's reach.
 */
export async function autoFixInvalidTreatmentSessions(params: {
  bloqueios: any[];
  professionalId?: string;
  unitId?: string;
}): Promise<AutoFixResult> {
  const result: AutoFixResult = { scanned: 0, fixed: 0, errors: 0 };

  try {
    // Load candidate sessions: only those still scheduled or pending and
    // with a date set. Realizadas/canceladas/falta NÃO são tocadas.
    let q = (supabase as any)
      .from('treatment_sessions')
      .select('id, cycle_id, patient_id, professional_id, scheduled_date, status, appointment_id')
      .in('status', ['agendada', 'pendente_agendamento'])
      .not('scheduled_date', 'is', null)
      .neq('scheduled_date', '');

    if (params.professionalId) q = q.eq('professional_id', params.professionalId);

    const { data: sessions, error } = await q;
    if (error) throw error;

    const sessionList = (sessions || []) as SessionRow[];
    result.scanned = sessionList.length;
    if (sessionList.length === 0) return result;

    // If unitId restriction is needed, fetch the cycles for the involved sessions
    let cyclesById: Record<string, CycleRow> = {};
    if (params.unitId) {
      const cycleIds = Array.from(new Set(sessionList.map((s) => s.cycle_id)));
      const { data: cycles } = await (supabase as any)
        .from('treatment_cycles')
        .select('id, professional_id, unit_id')
        .in('id', cycleIds);
      cyclesById = Object.fromEntries(((cycles || []) as CycleRow[]).map((c) => [c.id, c]));
    }

    // Build per-cycle blocked ranges cache
    const rangesCache: Record<string, BlockedRange[]> = {};

    for (const s of sessionList) {
      const cycle = cyclesById[s.cycle_id];
      if (params.unitId && cycle && cycle.unit_id !== params.unitId) continue;

      const profId = s.professional_id;
      const unitId = cycle?.unit_id || params.unitId || '';
      const cacheKey = `${profId}|${unitId}`;
      if (!rangesCache[cacheKey]) {
        rangesCache[cacheKey] = buildBlockedRanges(params.bloqueios || [], profId, unitId);
      }
      const ranges = rangesCache[cacheKey];

      if (!isInvalidSessionDate(s.scheduled_date, ranges)) continue;

      // Invalid date — clear scheduling and (best-effort) cancel a linked agendamento
      try {
        const { error: updErr } = await (supabase as any)
          .from('treatment_sessions')
          .update({
            status: 'pendente_agendamento',
            scheduled_date: null as any,
            appointment_id: null,
          })
          .eq('id', s.id);

        if (updErr) {
          // Some schemas don't allow null on scheduled_date — fallback: only clear status/appointment
          await (supabase as any)
            .from('treatment_sessions')
            .update({
              status: 'pendente_agendamento',
              appointment_id: null,
            })
            .eq('id', s.id);
        }

        if (s.appointment_id) {
          await (supabase as any)
            .from('agendamentos')
            .update({ status: 'cancelado', observacoes: 'Cancelado automaticamente: data inválida (feriado/fim de semana/bloqueio)' })
            .eq('id', s.appointment_id);
        }

        result.fixed += 1;
      } catch (err) {
        console.error('[autoFixInvalidTreatmentSessions] failed for session', s.id, err);
        result.errors += 1;
      }
    }
  } catch (err) {
    console.error('[autoFixInvalidTreatmentSessions] fatal', err);
  }

  return result;
}

/** Read-only checks. Historical rows are reported, never repaired. */
export interface CycleIntegritySnapshot {
  id: string;
  patient_id: string;
  professional_id: string;
  unit_id: string;
  total_sessions: number;
}

export interface SessionIntegritySnapshot {
  id?: string;
  cycle_id: string;
  patient_id: string;
  professional_id: string;
  session_number: number;
  scheduled_date: string;
  status: string;
  appointment_id?: string | null;
}

export interface CycleIntegrityIssue {
  code: 'count' | 'sequence' | 'date' | 'appointment' | 'identity';
  message: string;
  sessionIds: string[];
}

export const isActiveCycleSession = (session: Pick<SessionIntegritySnapshot, 'status'>) =>
  !['cancelada', 'remarcada'].includes(session.status);

export function validateTreatmentCycle(
  cycle: CycleIntegritySnapshot,
  sessions: readonly SessionIntegritySnapshot[],
  appointmentClaims: readonly { id: string; appointment_id: string | null }[] = sessions
    .filter((s): s is SessionIntegritySnapshot & { id: string } => !!s.id)
    .map((s) => ({ id: s.id, appointment_id: s.appointment_id || null })),
): CycleIntegrityIssue[] {
  const issues: CycleIntegrityIssue[] = [];
  if (!Number.isInteger(cycle.total_sessions) || cycle.total_sessions < 1 || sessions.length !== cycle.total_sessions) {
    issues.push({ code: 'count', message: `Quantidade ${sessions.length < cycle.total_sessions ? 'incompleta' : 'inconsistente'}: ciclo previsto para ${cycle.total_sessions} sessões, mas possui ${sessions.length} registradas.`, sessionIds: [] });
  }
  const numbers = sessions.map((s) => s.session_number).sort((a, b) => a - b);
  if (numbers.length !== cycle.total_sessions || numbers.some((n, i) => n !== i + 1)) {
    issues.push({ code: 'sequence', message: 'Numeração inconsistente: há sessões com sequência incompleta.', sessionIds: [] });
  }
  const dates = new Map<string, SessionIntegritySnapshot[]>();
  for (const session of sessions) {
    if (session.cycle_id !== cycle.id || session.patient_id !== cycle.patient_id || session.professional_id !== cycle.professional_id || !cycle.unit_id) {
      issues.push({ code: 'identity', message: 'Paciente, profissional ou unidade divergente do ciclo — revisão necessária.', sessionIds: session.id ? [session.id] : [] });
    }
    if (isActiveCycleSession(session) && session.scheduled_date) {
      const group = dates.get(session.scheduled_date) || [];
      group.push(session);
      dates.set(session.scheduled_date, group);
    }
    if (session.appointment_id && appointmentClaims.some((claim) => claim.appointment_id === session.appointment_id && claim.id !== session.id)) {
      issues.push({ code: 'appointment', message: 'Agendamento já vinculado a outra sessão deste ciclo ou de outro ciclo.', sessionIds: session.id ? [session.id] : [] });
    }
  }
  for (const group of dates.values()) {
    if (group.length > 1) issues.push({ code: 'date', message: 'Data duplicada: duas sessões ativas deste ciclo estão previstas para a mesma data.', sessionIds: group.flatMap((s) => s.id ? [s.id] : []) });
  }
  return issues;
}

export function assertTreatmentCycle(cycle: CycleIntegritySnapshot, sessions: readonly SessionIntegritySnapshot[]) {
  const issues = validateTreatmentCycle(cycle, sessions);
  if (issues.length) throw new Error(issues.map((issue) => issue.message).join(' '));
}

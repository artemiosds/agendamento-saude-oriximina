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
  scheduled_date: string | null;
  status: string;
  appointment_id?: string | null;
}

export interface CycleIntegrityIssue {
  code: 'count' | 'sequence' | 'date' | 'appointment' | 'identity' | 'undated';
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
    issues.push({ code: 'sequence', message: `Numeração inconsistente: ${getMissingSessionNumbers(cycle.total_sessions, sessions).length ? 'faltam as sessões nº ' + getMissingSessionNumbers(cycle.total_sessions, sessions).join(', ') + '.' : 'há números repetidos ou fora do planejamento.'}`, sessionIds: [] });
  }
  const dates = new Map<string, SessionIntegritySnapshot[]>();
  for (const session of sessions) {
    if (session.cycle_id !== cycle.id || session.patient_id !== cycle.patient_id || session.professional_id !== cycle.professional_id || !cycle.unit_id) {
      issues.push({ code: 'identity', message: 'Paciente, profissional ou unidade divergente do ciclo — revisão necessária.', sessionIds: session.id ? [session.id] : [] });
    }
    if (isActiveCycleSession(session) && !session.scheduled_date) {
      issues.push({ code: 'undated', message: `Sessão nº ${session.session_number} sem data — aguarda agendamento. Escolha uma nova data manualmente.`, sessionIds: session.id ? [session.id] : [] });
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
    if (group.length > 1) issues.push({ code: 'date', message: `Data duplicada: sessões nº ${group.map((s) => s.session_number).join(' e ')} em ${group[0].scheduled_date?.split('-').reverse().join('/')}. Revise a sessão sem agendamento; preserve os vínculos válidos.`, sessionIds: group.flatMap((s) => s.id ? [s.id] : []) });
  }
  return issues;
}

export function assertTreatmentCycle(cycle: CycleIntegritySnapshot, sessions: readonly SessionIntegritySnapshot[]) {
  const issues = validateTreatmentCycle(cycle, sessions);
  if (issues.length) throw new Error(issues.map((issue) => issue.message).join(' '));
}


export function getMissingSessionNumbers(total: number, sessions: readonly Pick<SessionIntegritySnapshot, 'session_number'>[]): number[] {
  if (!Number.isInteger(total) || total < 1 || total > 10000) return [];
  const existing = new Set(sessions.map((session) => session.session_number));
  return Array.from({ length: total }, (_, index) => index + 1).filter((number) => !existing.has(number));
}

/** Historical issues on other rows must not freeze the professional's valid actions. */
export function assertTreatmentSessionChange(cycle: CycleIntegritySnapshot, sessions: readonly SessionIntegritySnapshot[], sessionId: string, date?: string) {
  const target = sessions.find((session) => session.id === sessionId);
  if (!target) throw new Error('Sessão não encontrada. Atualize o ciclo.');
  if (target.patient_id !== cycle.patient_id || target.professional_id !== cycle.professional_id || target.cycle_id !== cycle.id || !cycle.unit_id) {
    throw new Error('Sessão divergente do paciente, profissional ou unidade.');
  }
  const proposedDate = date || target.scheduled_date;
  if (!proposedDate) throw new Error('Escolha uma data para esta sessão.');
  const duplicate = sessions.find((session) => session.id !== target.id && session.cycle_id === cycle.id && isActiveCycleSession(session) && session.scheduled_date === proposedDate);
  if (duplicate) throw new Error(`Já existe a sessão nº ${duplicate.session_number} deste ciclo em ${proposedDate.split('-').reverse().join('/')}. Escolha outra data.`);
  if (target.appointment_id && sessions.some((session) => session.id !== target.id && session.appointment_id === target.appointment_id)) throw new Error('Agendamento já vinculado a outra sessão. Preserve o vínculo original.');
}

export function suggestTreatmentSessionDate(sessions: readonly SessionIntegritySnapshot[], sessionNumber: number, availableDates: readonly string[], today: string, frequency: string): string | null {
  const dated = sessions.filter((session) => session.scheduled_date && isActiveCycleSession(session));
  const before = dated.filter((s) => s.session_number < sessionNumber).sort((a,b) => b.session_number-a.session_number)[0]?.scheduled_date;
  const after = dated.filter((s) => s.session_number > sessionNumber).sort((a,b) => a.session_number-b.session_number)[0]?.scheduled_date;
  const occupied = new Set(dated.map((session) => session.scheduled_date));
  const weekdays = new Set(dated.map((session) => new Date(session.scheduled_date + 'T12:00:00').getDay()));
  return [...availableDates].sort().find((date) => date >= today && (!before || date > before) && (!after || date < after) && !occupied.has(date) && ![0,6].includes(new Date(date + 'T12:00:00').getDay()) && (!frequency.includes('semana') || !weekdays.size || weekdays.has(new Date(date + 'T12:00:00').getDay()))) || null;
}

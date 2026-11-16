export interface TreatmentReportCycle {
  id: string;
  unit_id: string;
  professional_id: string;
  start_date?: string | null;
  status: string;
}

export interface TreatmentReportSession {
  cycle_id: string;
  scheduled_date?: string | null;
  status: string;
}

export interface TreatmentReportScope {
  unitId: string;
  professionalId: string;
  dateFrom: string;
  dateTo: string;
}

const isWithinPeriod = (date: string | null | undefined, dateFrom: string, dateTo: string) => {
  if (!date) return false;
  const day = date.slice(0, 10);
  return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
};

/**
 * Separates cycle-start counts from session-date counts. Undated pending
 * sessions are a backlog indicator for active cycles, not part of a date window.
 */
export const buildTreatmentReportMetrics = <
  Cycle extends TreatmentReportCycle,
  Session extends TreatmentReportSession,
>(cycles: Cycle[], sessions: Session[], scope: TreatmentReportScope) => {
  const scopedCycles = cycles.filter(cycle =>
    (scope.unitId === 'all' || cycle.unit_id === scope.unitId)
    && (scope.professionalId === 'all' || cycle.professional_id === scope.professionalId));
  const scopedCycleIds = new Set(scopedCycles.map(cycle => cycle.id));
  const activeCycleIds = new Set(scopedCycles
    .filter(cycle => cycle.status === 'em_andamento')
    .map(cycle => cycle.id));

  const filteredCycles = scopedCycles.filter(cycle =>
    isWithinPeriod(cycle.start_date, scope.dateFrom, scope.dateTo));
  const filteredSessions = sessions.filter(session =>
    scopedCycleIds.has(session.cycle_id)
    && isWithinPeriod(session.scheduled_date, scope.dateFrom, scope.dateTo));
  const undatedPendingSessions = sessions.filter(session =>
    activeCycleIds.has(session.cycle_id)
    && !session.scheduled_date
    && session.status === 'pendente_agendamento').length;

  return { filteredCycles, filteredSessions, undatedPendingSessions };
};

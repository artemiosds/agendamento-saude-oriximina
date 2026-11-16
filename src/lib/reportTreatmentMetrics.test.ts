import { describe, expect, it } from 'vitest';
import { buildTreatmentReportMetrics } from './reportTreatmentMetrics';

const cycles = [
  { id: 'in-period', unit_id: 'unit-a', professional_id: 'professional-a', start_date: '2026-11-02', status: 'em_andamento' },
  { id: 'older-cycle', unit_id: 'unit-a', professional_id: 'professional-a', start_date: '2026-08-01', status: 'em_andamento' },
  { id: 'other-unit', unit_id: 'unit-b', professional_id: 'professional-a', start_date: '2026-11-03', status: 'em_andamento' },
  { id: 'inactive', unit_id: 'unit-a', professional_id: 'professional-a', start_date: '2026-11-04', status: 'suspenso' },
];

const sessions = [
  { cycle_id: 'in-period', scheduled_date: '2026-11-10', status: 'realizada' },
  { cycle_id: 'older-cycle', scheduled_date: '2026-11-12', status: 'agendada' },
  { cycle_id: 'in-period', scheduled_date: null, status: 'pendente_agendamento' },
  { cycle_id: 'older-cycle', scheduled_date: null, status: 'pendente_agendamento' },
  { cycle_id: 'other-unit', scheduled_date: '2026-11-11', status: 'realizada' },
  { cycle_id: 'inactive', scheduled_date: null, status: 'pendente_agendamento' },
  { cycle_id: 'in-period', scheduled_date: '2026-10-31', status: 'realizada' },
];

describe('buildTreatmentReportMetrics', () => {
  it('applies unit/professional scope and counts sessions scheduled in the selected period, including cycles that started earlier', () => {
    const result = buildTreatmentReportMetrics(cycles, sessions, {
      unitId: 'unit-a',
      professionalId: 'professional-a',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
    });

    expect(result.filteredCycles.map(cycle => cycle.id)).toEqual(['in-period', 'inactive']);
    expect(result.filteredSessions.map(session => session.cycle_id)).toEqual(['in-period', 'older-cycle']);
  });

  it('reports undated pending sessions separately, only for active cycles in the selected unit and professional scope', () => {
    const result = buildTreatmentReportMetrics(cycles, sessions, {
      unitId: 'unit-a',
      professionalId: 'professional-a',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
    });

    expect(result.undatedPendingSessions).toBe(2);
    expect(result.filteredSessions).toHaveLength(2);
  });

  it('does not apply unit or professional restrictions to the global Master scope', () => {
    const result = buildTreatmentReportMetrics(cycles, sessions, {
      unitId: 'all',
      professionalId: 'all',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
    });

    expect(result.filteredCycles.map(cycle => cycle.id)).toEqual(['in-period', 'other-unit', 'inactive']);
    expect(result.undatedPendingSessions).toBe(2);
  });
});

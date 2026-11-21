import { describe, expect, it } from 'vitest';
import { getDashboardOperations } from './dashboardOperations';

const today = '2026-11-21';
const now = new Date(today + 'T11:00:00-03:00');

describe('termômetro operacional do Dashboard', () => {
  it('prioriza atendimento aberto há mais de 90 min', () => {
    const rows = [
      { id: 'a', hora: '08:10', status: 'em_atendimento', iniciado_em: today + 'T09:25:00-03:00' },
      { id: 'b', hora: '07:10', status: 'em_atendimento', iniciado_em: today + 'T09:30:00-03:00' },
    ];
    const result = getDashboardOperations(rows, new Set(), 11, now, today);
    expect(result.tone).toBe('critical');
    expect(result.summary).toMatch(/^1 em atendimento/);
  });

  it('usa faltas confirmadas no turno e agrega presença pela hora marcada', () => {
    const rows = [
      { id: 'a', hora: '09:10', status: 'confirmado_chegada' },
      { id: 'b', hora: '09:30', status: 'falta' },
      { id: 'c', hora: '14:00', status: 'falta' },
      { id: 'd', hora: '09:32', status: 'cancelado' },
    ];
    const result = getDashboardOperations(rows, new Set(), 0, now, today);
    expect(result.absent).toBe(1);
    expect(result.tone).toBe('warning');
    expect(result.peak).toMatchObject({ range: '09h00 às 10h00', scheduled: 2, present: 1 });
  });

  it('alerta no patamar da fila e considera 10% de faltas ainda dentro da faixa', () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      id: String(index), hora: '10:00', status: index ? 'confirmado' : 'falta',
    }));
    expect(getDashboardOperations(rows, new Set(), 9, now, today).tone).toBe('normal');
    expect(getDashboardOperations(rows, new Set(), 10, now, today).tone).toBe('warning');
  });
});

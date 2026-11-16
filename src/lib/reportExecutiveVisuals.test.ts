import { describe, expect, it } from 'vitest';
import { buildExecutiveReportVisuals } from './reportExecutiveVisuals';

describe('buildExecutiveReportVisuals', () => {
  it('renders KPI cards and accessible charts from the supplied aggregates', () => {
    const html = buildExecutiveReportVisuals({
      kpis: { total: 120, completed: 96, attendanceRate: 80, absences: 12 },
      monthly: [
        { date: '2026-10-01', appointments: 50, completed: 40, absences: 5 },
        { date: '2026-11-01', appointments: 70, completed: 56, absences: 7 },
      ],
      specialties: [{ name: 'Fisioterapia', appointments: 80, absences: 8 }],
    });

    expect(html).toContain('Atendimentos no escopo');
    expect(html).toContain('120');
    expect(html).toContain('aria-label="Gráfico de evolução mensal');
    expect(html).toContain('aria-label="Gráfico das sete especialidades');
    expect(html).toContain('Fisioterapia');
  });

  it('escapes labels and tolerates empty or invalid chart values', () => {
    const html = buildExecutiveReportVisuals({
      kpis: { total: Number.NaN, completed: -5, attendanceRate: 0, absences: 0 },
      monthly: [{ date: 'invalid', appointments: Number.NaN, completed: -2, absences: 0 }],
      specialties: [{ name: '<script>alert(1)</script>', appointments: 3, absences: 0 }],
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('0');
    expect(html).not.toContain('NaN');
  });
});

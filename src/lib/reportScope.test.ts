import { describe, expect, it } from 'vitest';
import { reportScopesEqual, validateReportScope, type ReportScope } from './reportScope';

const base: ReportScope = {
  unit: 'all', professional: 'all', status: 'all', type: 'all', sector: 'all',
  dateFrom: '2026-10-01', dateTo: '2026-10-31',
};

describe('escopo aplicado dos relatórios', () => {
  it('detecta qualquer filtro ainda não aplicado', () => {
    expect(reportScopesEqual(base, { ...base })).toBe(true);
    expect(reportScopesEqual(base, { ...base, unit: 'cer' })).toBe(false);
    expect(reportScopesEqual(base, { ...base, dateTo: '2026-11-01' })).toBe(false);
  });

  it('impede um período cronologicamente inválido', () => {
    expect(validateReportScope(base)).toBeNull();
    expect(validateReportScope({ ...base, dateFrom: '2026-11-01' })).toMatch(/data inicial/i);
  });
});

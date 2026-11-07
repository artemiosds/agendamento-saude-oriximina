import { describe, it, expect } from 'vitest';
import { normalizeLicense, isPathLicensed } from './licenseModules';

describe('licenciamento de módulos', () => {
  it('sem configuração, tudo fica liberado (Oriximiná)', () => {
    const lic = normalizeLicense(null);
    expect(isPathLicensed('/painel/bpa-exportar', lic)).toBe(true);
    expect(isPathLicensed('/painel/triagem', lic)).toBe(true);
  });
  it('desligar Faturamento SUS bloqueia BPA, mas não a Agenda', () => {
    const lic = normalizeLicense({ faturamento_sus: false });
    expect(isPathLicensed('/painel/bpa-exportar', lic)).toBe(false);
    expect(isPathLicensed('/painel/agenda', lic)).toBe(true);
  });
  it('desligar Reabilitação bloqueia PTS', () => {
    expect(isPathLicensed('/painel/pts', normalizeLicense({ reabilitacao: false }))).toBe(false);
  });
});

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
  it('preserva caminhos não gerenciados pelo licenciamento legado', () => {
    const lic = normalizeLicense({ faturamento_sus: false, triagem: false });
    expect(isPathLicensed('/painel/agenda', lic)).toBe(true);
    expect(isPathLicensed('/painel/prontuario', lic)).toBe(true);
  });
  it('bloqueia acesso direto por URL aos grupos desativados', () => {
    const lic = normalizeLicense({ regulacao: false, reabilitacao: false });
    expect(isPathLicensed('/painel/fila', lic)).toBe(false);
    expect(isPathLicensed('/painel/pts/', lic)).toBe(false);
  });
});

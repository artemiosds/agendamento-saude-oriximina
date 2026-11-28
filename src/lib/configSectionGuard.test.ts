import { describe, expect, it } from 'vitest';
import { assertExpectedConfigSection, sameConfigSection, configObject, configVersion } from './configSectionGuard';

describe('proteção de configurações do prontuário', () => {
  it('aceita chaves reordenadas e seções independentes sem mascarar alteração da seção', () => {
    const baseline = { campos: [{ id: 'x', label: 'A' }], soapLabels: { s: 'S', o: 'O' } };
    expect(() => assertExpectedConfigSection({ outra: true, prontuario: { soapLabels: { o: 'O', s: 'S' }, campos: [{ label: 'A', id: 'x' }] } }, { key: 'prontuario', value: baseline })).not.toThrow();
    expect(() => assertExpectedConfigSection({ prontuario: { ...baseline, campos: [{ id: 'x', label: 'B' }] } }, { key: 'prontuario', value: baseline })).toThrow('mudou');
  });
  it('diferencia seção ausente, nula e linha ausente', () => {
    expect(() => assertExpectedConfigSection({}, { key: 'x', value: undefined })).not.toThrow();
    expect(() => assertExpectedConfigSection({ x: null }, { key: 'x', value: undefined })).toThrow();
    expect(() => assertExpectedConfigSection(null, { key: 'x', value: undefined })).toThrow();
    expect(() => assertExpectedConfigSection(null)).not.toThrow();
  });
  it('preserva a ordem de arrays de campos e opções', () => {
    expect(sameConfigSection(['a','b'], ['b','a'])).toBe(false);
  });
  it('valida versão sem converter formatos inválidos', () => {
    expect(configVersion(undefined)).toBe(0);
    expect(configVersion({ version: 4 })).toBe(4);
    expect(() => configVersion({ version: '4' })).toThrow();
    expect(() => configObject([])).toThrow();
  });
});

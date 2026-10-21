import { describe, expect, it } from 'vitest';
import { sigtapCodeKey, uniqueSigtapCodes } from './sigtapCode';

describe('SIGTAP code comparison', () => {
  it('matches an old formatted code to the official ten-digit code', () => {
    expect(sigtapCodeKey('03.02.05.002-7')).toBe('0302050027');
    expect(sigtapCodeKey('0302050027')).toBe('0302050027');
    expect(sigtapCodeKey('PROCEDIMENTO LIVRE')).toBe('PROCEDIMENTO LIVRE');
  });

  it('prefers the official catalog row without changing historical rows', () => {
    const legacy = { codigo: '03.02.05.002-7', nome: 'Registro antigo' };
    const official = { codigo: '0302050027', nome: 'Registro oficial' };
    expect(uniqueSigtapCodes([legacy, official])).toEqual([official]);
    expect(uniqueSigtapCodes([official, legacy])).toEqual([official]);
    expect(legacy.codigo).toBe('03.02.05.002-7');
    expect(uniqueSigtapCodes([legacy])).toEqual([legacy]);
  });
});

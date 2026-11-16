import { describe, expect, it } from 'vitest';
import { getMunicipalityWithMostPatients } from './reportMunicipalityScope';

describe('getMunicipalityWithMostPatients', () => {
  it('selects by registered-patient count, not by attendance volume', () => {
    const rows = [
      { municipio: 'Município A', pacientesCount: 7, atendimentos: 100 },
      { municipio: 'Município B', pacientesCount: 12, atendimentos: 4 },
    ];

    expect(getMunicipalityWithMostPatients(rows)).toBe(rows[1]);
  });

  it('returns null for an empty dataset', () => {
    expect(getMunicipalityWithMostPatients([])).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { getTreatmentCycleIdsForScope } from './reportTreatmentScope';

const cycles = [
  { id: 'cer-fisio', unit_id: 'cer', professional_id: 'fisio' },
  { id: 'cer-fono', unit_id: 'cer', professional_id: 'fono' },
  { id: 'ubs-fisio', unit_id: 'ubs', professional_id: 'fisio' },
];

describe('escopo de sessões por ciclo de tratamento', () => {
  it('limita os ciclos pela unidade e pelo profissional selecionados', () => {
    expect([...getTreatmentCycleIdsForScope(cycles, 'cer', 'fisio')]).toEqual(['cer-fisio']);
  });

  it('permite todos os ciclos somente quando os filtros estão em Todas/Todos', () => {
    expect([...getTreatmentCycleIdsForScope(cycles, 'all', 'all')]).toEqual(['cer-fisio', 'cer-fono', 'ubs-fisio']);
  });
});

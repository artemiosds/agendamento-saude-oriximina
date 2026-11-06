import { describe, expect, it } from 'vitest';
import { getTriagePendingFields } from './triagePending';

const empty = { pressaoArterial: '', peso: '', temperatura: '', saturacaoOxigenio: '', queixaPrincipal: '', classificacaoRisco: '' };

describe('campos pendentes da triagem (apenas informativo)', () => {
  it('lista PA e Queixa quando vazios', () => {
    const r = getTriagePendingFields(empty);
    expect(r).toContain('PA');
    expect(r).toContain('Queixa');
  });
  it('remove PA quando preenchida', () => {
    expect(getTriagePendingFields({ ...empty, pressaoArterial: '120/80' })).not.toContain('PA');
  });
  it('retorna vazio quando tudo preenchido', () => {
    expect(getTriagePendingFields({ pressaoArterial: '120/80', peso: '70', temperatura: '36.5', saturacaoOxigenio: '98', queixaPrincipal: 'dor', classificacaoRisco: 'verde' })).toHaveLength(0);
  });
});

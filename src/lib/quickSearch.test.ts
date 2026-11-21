import { describe, expect, it } from 'vitest';
import { parseQuickSearchTerm, quickSearchCpfVariants } from './quickSearch';

describe('busca rápida do painel', () => {
  it('distingue CPF, CNS e SIGTAP completos com ou sem formatação', () => {
    expect(parseQuickSearchTerm('0301010072')).toEqual({ kind: 'sigtap', digits: '0301010072' });
    expect(parseQuickSearchTerm('03.01.01.007-2')).toEqual({ kind: 'sigtap', digits: '0301010072' });
    expect(parseQuickSearchTerm('123.456.789-01')).toEqual({ kind: 'cpf', digits: '12345678901' });
    expect(parseQuickSearchTerm('123 4567 8901 2345')).toEqual({ kind: 'cns', digits: '123456789012345' });
    expect(quickSearchCpfVariants('12345678901')).toEqual(['12345678901', '123.456.789-01']);
  });

  it('aceita nomes compostos e descarta buscas incompletas ou com curingas', () => {
    expect(parseQuickSearchTerm("  João   D'Ávila  ")).toEqual({ kind: 'name', name: "João D'Ávila" });
    for (const term of ['An', 'A--', '123.456', 'Maria%', 'Maria_', 'Maria,or(...)']) {
      expect(parseQuickSearchTerm(term)).toBeNull();
    }
  });
});

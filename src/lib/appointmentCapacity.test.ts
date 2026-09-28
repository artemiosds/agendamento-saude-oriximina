import { describe, expect, it } from 'vitest';
import { statusOcupaVaga } from './appointmentCapacity';

describe('ocupação da capacidade da agenda', () => {
  it('libera vaga apenas em cancelamento ou falta', () => {
    expect(statusOcupaVaga('cancelado')).toBe(false);
    expect(statusOcupaVaga('falta')).toBe(false);
    for (const status of ['pendente', 'confirmado', 'confirmado_chegada', 'em_atendimento', 'concluido', 'excluido', 'removido', 'inativo']) {
      expect(statusOcupaVaga(status)).toBe(true);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { careStage, elapsedMinutes } from './unitCockpit';

describe('monitor da unidade', () => {
  it('distingue reserva, chegada, chamada, consulta e saída', () => {
    expect(['confirmado','confirmado_chegada','apto_atendimento','chamado','em_atendimento','concluido','cancelado'].map(careStage))
      .toEqual(['outside','reception','ready','calling','consultation','done','outside']);
  });
  it('usa somente intervalos registrados e válidos', () => {
    const end = Date.parse('2026-11-19T12:25:00Z');
    expect(elapsedMinutes('2026-11-19T09:00:00-03:00', end)).toBe(25);
    expect(elapsedMinutes(null,end)).toBeNull();
    expect(elapsedMinutes('2026-11-19T09:30:00-03:00',end)).toBeNull();
  });
});

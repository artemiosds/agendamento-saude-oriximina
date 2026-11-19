import { describe, expect, it } from 'vitest';
import { dateKeyEscala, distribuirRegistros, primeirasDatasSemanais } from './escalaInformativa';
import type { RegistroEscala } from './escalaInformativa';

const day = (value: string) => new Date(value + 'T12:00:00');
const weekly: RegistroEscala = { id: 'weekly', unidade: 'cer', sala: null, data: '2026-11-23', inicio: '08:00', fim: '12:00', semanal: true };

describe('escala informativa', () => {
  it('determina o início semanal por dia sem depender da ordem de seleção', () => {
    expect(primeirasDatasSemanais(['2026-12-07', '2026-11-29', '2026-11-23', '2026-11-25', '2026-11-25']))
      .toEqual(['2026-11-23', '2026-11-25', '2026-11-29']);
  });

  it('mostra datas avulsas inclusive no domingo e sobrescreve só a ocorrência indicada', () => {
    const dates = ['2026-11-16', '2026-11-23', '2026-11-29', '2026-11-30', '2026-12-07'].map(day);
    const rows = distribuirRegistros([
      weekly,
      { ...weekly, id: 'one-off', data: '2026-11-29', semanal: false, local_avulso: 'Polo da Vila' },
      { ...weekly, id: 'exception', data: '2026-11-30', semanal: false, origem: 'weekly', local_avulso: 'Rota Fluvial' },
    ], dates);
    expect(dates.map(d => rows.get(dateKeyEscala(d))?.map(r => r.id)))
      .toEqual([[], ['weekly'], ['one-off'], ['exception'], ['weekly']]);
  });
});

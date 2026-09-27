import { describe, expect, it } from 'vitest';
import { buildBlockedRanges } from './treatmentSessionGenerator';

describe('buildBlockedRanges', () => {
  it('excludes partial-hour blocks but keeps full-day and untimed blocks', () => {
    const blocks = [
      { dataInicio: '2026-10-05', dataFim: '2026-10-05', profissionalId: 'staff-1', diaInteiro: false, horaInicio: '08:00' },
      { data_inicio: '2026-10-06', data_fim: '2026-10-06', unidade_id: 'unit-1', dia_inteiro: true, hora_inicio: '08:00' },
      { data_inicio: '2026-10-07', data_fim: '2026-10-07', dia_inteiro: false, hora_inicio: '' },
      { data_inicio: '2026-10-08', data_fim: '2026-10-08', unidade_id: 'unit-2', dia_inteiro: true },
    ];

    expect(buildBlockedRanges(blocks, 'staff-1', 'unit-1')).toEqual([
      { start: '2026-10-06', end: '2026-10-06' },
      { start: '2026-10-07', end: '2026-10-07' },
    ]);
  });
});

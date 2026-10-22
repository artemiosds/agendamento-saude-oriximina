import { describe, expect, it } from 'vitest';
import { buildBlockedRanges, generateSessionDatesWithInfo } from './treatmentSessionGenerator';

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


describe('geração completa de novos planos', () => {
  it.each(['manual', 'mensal', '1x_semana'])('gera sete datas únicas em %s mesmo com bloqueios', (frequency) => {
    const result = generateSessionDatesWithInfo('2026-10-19', frequency, [1], 7, [{ start: '2026-10-26', end: '2026-11-08' }]);
    expect(result.dates).toHaveLength(7);
    expect(new Set(result.dates).size).toBe(7);
    expect(result.dates).toEqual([...result.dates].sort());
  });
  it('recusa geração parcial sem retornar datas bloqueadas como fallback', () => {
    expect(() => generateSessionDatesWithInfo('2026-10-19', '1x_semana', [1], 7, [{ start: '2026-01-01', end: '2030-12-31' }])).toThrow('Geração incompleta');
    expect(() => generateSessionDatesWithInfo('2026-10-19', 'manual', [], 7, [{ start: '2026-01-01', end: '2030-12-31' }])).toThrow('Nenhum plano foi salvo');
  });
});

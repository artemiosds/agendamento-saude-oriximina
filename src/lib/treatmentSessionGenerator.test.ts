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
    expect(() => generateSessionDatesWithInfo('2026-10-19', '1x_semana', [1], 7, [{ start: '2026-01-01', end: '2040-12-31' }])).toThrow('Geração incompleta');
    expect(() => generateSessionDatesWithInfo('2026-10-19', 'manual', [], 7, [{ start: '2026-01-01', end: '2040-12-31' }])).toThrow('Nenhum plano foi salvo');
  });
});


it('pula datas sem disponibilidade ao gerar um novo ciclo completo', () => {
  const available = new Set(['2030-01-07','2030-01-21','2030-02-04','2030-02-18','2030-03-04','2030-03-18','2030-04-01']);
  const result = generateSessionDatesWithInfo('2030-01-07','1x_semana',[1],7,[],available);
  expect(result.dates).toEqual([...available]);
  expect(() => generateSessionDatesWithInfo('2030-01-07','1x_semana',[1],7,[],new Set())).toThrow('Geração incompleta');
});

describe('busca segura de datas válidas após bloqueios prolongados', () => {
  it('completa todas as 11 sessões e preserva sequência após bloqueios', () => {
    const blocked = [{ start: '2026-10-26', end: '2026-11-08' }];
    const result = generateSessionDatesWithInfo('2026-10-19', '1x_semana', [1], 11, blocked);
    expect(result.dates).toHaveLength(11);
    expect(new Set(result.dates).size).toBe(11);
    expect(result.dates).toEqual([...result.dates].sort());
    expect(result.dates.every((date) => !blocked.some((range) => date >= range.start && date <= range.end))).toBe(true);
    expect(result.dates[0]).toBe('2026-10-19');
    expect(result.dates[1]).toBe('2026-11-09');
  });
  it('continua além do limite antigo de 60 dias para frequência semanal', () => {
    const available = new Set(['2030-07-22']);
    expect(generateSessionDatesWithInfo('2030-01-07', '1x_semana', [1], 1, [], available).dates).toEqual(['2030-07-22']);
  });
  it.each(['manual', 'mensal'])('continua além de 365 dias em frequência %s', (frequency) => {
    const available = new Set(['2031-02-10']);
    expect(generateSessionDatesWithInfo('2030-01-07', frequency, [1], 1, [], available).dates).toEqual(['2031-02-10']);
  });
  it('falha sem gravar quando nenhuma data válida existe no limite seguro', () => {
    const blocked = [{ start: '2026-10-19', end: '2040-12-31' }];
    expect(() => generateSessionDatesWithInfo('2026-10-19', '1x_semana', [1], 11, blocked)).toThrow('Nenhum plano foi salvo');
  });
});

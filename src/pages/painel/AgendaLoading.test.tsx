import { describe, expect, it } from 'vitest';
import { getAgendaDayListState } from './Agenda';

const day = '2026-09-23';
const nextDay = '2026-09-24';
const key = `${day}|patient-1`;

describe('Agenda: apresentação da lista durante carga', () => {
  it('não declara a data vazia enquanto o intervalo não terminou', () => {
    expect(getAgendaDayListState(day, new Set(), '', key, null, null, 1, 0)).toBe('loading');
  });

  it('aguarda a hidratação dos pacientes após completar o intervalo', () => {
    expect(getAgendaDayListState(day, new Set([day]), '', key, null, null, 1, 0)).toBe('loading');
  });

  it('só declara vazio real quando intervalo e hidratação terminam', () => {
    expect(getAgendaDayListState(day, new Set([day]), key, key, null, null, 1, 0)).toBe('empty');
  });

  it('mostra resultados normalmente depois da carga', () => {
    expect(getAgendaDayListState(day, new Set([day]), key, key, null, null, 1, 188)).toBe('results');
  });

  it('mostra erro de intervalo ou de pacientes, sem tratar uma página parcial como vazia', () => {
    expect(getAgendaDayListState(day, new Set(), '', key, { date: day, generation: 1 }, null, 1, 0)).toBe('error');
    expect(getAgendaDayListState(day, new Set([day]), '', key, null, { key, generation: 1 }, 1, 0)).toBe('error');
  });

  it('ignora erro antigo ao trocar rapidamente de data, inclusive ao voltar', () => {
    const oldError = { date: day, generation: 1 };
    expect(getAgendaDayListState(nextDay, new Set(), '', `${nextDay}|`, oldError, null, 2, 0)).toBe('loading');
    expect(getAgendaDayListState(day, new Set(), '', key, oldError, null, 3, 0)).toBe('loading');
    const oldHydrationError = { key, generation: 1 };
    expect(getAgendaDayListState(day, new Set([day]), '', key, null, oldHydrationError, 3, 0)).toBe('loading');
  });
});

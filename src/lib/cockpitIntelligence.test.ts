import { describe, expect, it } from 'vitest';
import { cockpitIntelligence } from './cockpitIntelligence';

const day = '2026-11-27';
const now = Date.parse('2026-11-27T15:00:00Z');
const base = { ready: [], completed: [], inProgress: [], waitingTotal: 0, waitingTimed: 0, day, now, waitLimit: 20, visitLimit: 90 };
describe('inteligência operacional da Planta Viva', () => {
  it('agrupa somente profissão vinculada, separa classificação e chegada e não inventa médias', () => {
    const r = cockpitIntelligence({ ...base, waitingTotal: 4, waitingTimed: 2, ready: [
      { profession: 'Nutrição', arrival: '2026-11-27T14:10:00Z', clearedAt: '2026-11-27T14:50:00Z' },
      { profession: 'NUTRICAO', arrival: '2026-11-27T14:40:00Z', clearedAt: null },
      { profession: '', arrival: null, clearedAt: null },
    ] });
    expect(r.professions).toHaveLength(2);
    expect(r.professions[0]).toMatchObject({ name: 'Nutrição', waiting: 2, aboveLimit: 1, average: 35, averageCleared: 10, waitingTimed: 2, clearedTimed: 1 });
    expect(r.professions[1]).toMatchObject({ name: 'Profissão não informada', average: null, averageCleared: null });
    expect(r.quality).toMatchObject({ missingArrival: 2, missingClearance: 2, missingProfession: 1 });
  });
  it('só agrupa horários de conclusão válidos da data operacional e anteriores à leitura', () => {
    const r = cockpitIntelligence({ ...base, completed: [
      { profession: 'Médico', completedAt: '2026-11-27T11:20:00Z' },
      { profession: 'Médico', completedAt: '2026-11-27T11:59:00Z' },
      { profession: 'Médico', completedAt: '2026-11-27T12:10:00Z' },
      { profession: '', completedAt: '2026-11-27T02:00:00Z' },
      { profession: '', completedAt: '2026-11-27T16:00:00Z' },
      { profession: '', completedAt: 'inválido' },
    ] });
    expect(r.hours).toEqual([{ hour: '08', count: 2 }, { hour: '09', count: 1 }]);
    expect(r.peak).toBe(2);
    expect(r.busiest).toEqual(['08']);
    expect(r.covered).toBe(3);
    expect(r.quality.missingCompletion).toBe(3);
    expect(r.professions.reduce((n, g) => n + g.completed, 0)).toBe(6);
  });
  it('não conta início ausente ou futuro como duração e separa qualidade de sala', () => {
    const r = cockpitIntelligence({ ...base, inProgress: [
      { start: '2026-11-27T13:29:00Z', linkedRoom: true },
      { start: '2026-11-27T13:30:00Z', linkedRoom: false },
      { start: null, linkedRoom: false },
      { start: '2026-11-27T15:05:00Z', linkedRoom: true },
    ] });
    expect(r.delayed).toBe(1);
    expect(r.quality.missingStart).toBe(2);
    expect(r.quality.missingRoom).toBe(2);
  });
  it('mantém resultados vazios sem criar previsão ou horários artificiais', () => {
    const r = cockpitIntelligence(base);
    expect(r.professions).toEqual([]);
    expect(r.hours).toEqual([]);
    expect(r.busiest).toEqual([]);
    expect(r.peak).toBe(0);
    expect(Object.values(r.quality).every(value => value === 0)).toBe(true);
  });
});
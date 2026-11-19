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

it('usa o dia oficial da unidade e não o dia UTC', async () => {
  const { cockpitDay } = await import('./unitCockpit');
  expect(cockpitDay(Date.parse('2026-11-20T01:00:00Z'))).toBe('2026-11-19');
});

it('diferencia setores físicos, tempo de espera e chamada efêmera', async () => {
  const { roomSector, waitingTone, freshCockpitCall } = await import('./unitCockpit');
  expect(roomSector('Recepção')).toBe('reception');
  expect(roomSector('Sala de Medicação')).toBe('procedure');
  expect(roomSector('Consultório 01')).toBe('consultation');
  expect([null, 14, 15, 30, 31].map(waitingTone)).toEqual(['neutral','safe','warning','warning','danger']);
  expect(freshCockpitCall('2026-11-19T15:00:00Z', Date.parse('2026-11-19T15:01:00Z'))).toBe(false);
});

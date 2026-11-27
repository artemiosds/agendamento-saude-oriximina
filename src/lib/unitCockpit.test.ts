import { describe, expect, it } from 'vitest';
import { careStage, elapsedMinutes, linkedRoomWaits, isBottleneck, roomIllustration } from './unitCockpit';

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

describe('demanda vinculada às salas da Planta Viva', () => {
  const now = Date.parse('2026-11-27T15:00:00Z');
  const activeRooms = new Set(['sala-1', 'sala-2']);
  const row = (id: string, room: string, patient = id, arrival: string | null = '2026-11-27T14:30:00Z', status = 'apto_atendimento') =>
    ({ id, sala_id: room, paciente_id: patient, arrival, stage: careStage(status) as ReturnType<typeof careStage> });

  it('não replica a demanda em outras salas da mesma especialidade', () => {
    const waits = linkedRoomWaits([row('a', 'sala-1'), row('b', 'sala-1'), row('c', 'sala-1'), row('d', 'sala-1')], activeRooms, now);
    expect(waits.get('sala-1')?.size).toBe(4);
    expect(waits.has('sala-2')).toBe(false);
    expect(isBottleneck(waits.get('sala-1')?.size ?? 0)).toBe(true);
    expect(isBottleneck(waits.get('sala-2')?.size ?? 0)).toBe(false);
  });

  it('exclui sala ausente, inativa ou de outra unidade, sem inferir vínculo', () => {
    const waits = linkedRoomWaits([row('a', ''), row('b', 'outra-unidade'), row('c', 'inativa')], activeRooms, now);
    expect(waits.size).toBe(0);
  });

  it('conta um paciente por sala e mantém o atendimento com maior espera', () => {
    const waits = linkedRoomWaits([row('a', 'sala-1', 'p'), row('b', 'sala-1', 'p', '2026-11-27T14:10:00Z'), row('c', 'sala-2', 'p')], activeRooms, now);
    expect(waits.get('sala-1')?.size).toBe(1);
    expect(waits.get('sala-1')?.get('p')?.id).toBe('b');
    expect(waits.get('sala-2')?.size).toBe(1);
  });

  it('não inventa horários nem conta quem ainda está em triagem ou já está em atendimento', () => {
    const waits = linkedRoomWaits([
      row('a', 'sala-1', 'a', null),
      row('b', 'sala-1', 'b', '2026-11-27T15:01:00Z'),
      row('c', 'sala-1', 'c', '2026-11-27T14:40:00Z'),
      row('d', 'sala-1', 'd', '2026-11-27T14:20:00Z', 'em_triagem'),
      row('e', 'sala-1', 'e', '2026-11-27T14:20:00Z', 'em_atendimento'),
      row('f', 'sala-1', 'f', '2026-11-27T14:39:00Z'),
    ], activeRooms, now);
    expect([...waits.get('sala-1')?.keys() ?? []]).toEqual(['f']);
    expect(isBottleneck(3)).toBe(false);
  });
});

describe('ilustração dos ambientes da Planta Viva', () => {
  it('reconhece os ambientes cadastrados sem depender de acentos ou caixa', () => {
    expect(['GINÁSIO DE FISIOTERAPIA', 'FONOAUDIOLOGIA 2', 'Odontologia', 'Sala de Enfermagem', 'Psicologia', 'Nutrição', 'Terapia Ocupacional', 'Recepção', 'Sala de Medicação'].map(name => roomIllustration(name)))
      .toEqual(['physio', 'speech', 'dental', 'nursing', 'psychology', 'nutrition', 'occupational', 'reception', 'procedure']);
  });
  it('preserva o nome explícito da sala antes da especialidade da equipe', () => {
    expect(roomIllustration('Fonoaudiologia 2', 'Nutrição')).toBe('speech');
    expect(roomIllustration('Triagem', 'Médico')).toBe('nursing');
  });
  it('usa especialidade única apenas como referência visual, com fallback neutro', () => {
    expect(roomIllustration('Consultório 1', 'Fonoaudióloga')).toBe('speech');
    expect(roomIllustration('Consultório 3', 'Psicóloga · Médico')).toBe('consultation');
    expect(roomIllustration('Sala 7', '')).toBe('consultation');
    expect(roomIllustration('Sala 7', 'Especialidade não reconhecida')).toBe('consultation');
    expect(roomIllustration('Consultório 4', 'Fonoaudióloga · Fonoaudiólogo')).toBe('speech');
  });
  it('não altera as regras operacionais de classificação de setor', async () => {
    const { roomSector } = await import('./unitCockpit');
    expect(roomSector('Fonoaudiologia 2')).toBe('consultation');
    expect(roomSector('Ginásio de Fisioterapia')).toBe('procedure');
    expect(roomSector('Triagem')).toBe('triage');
  });
});

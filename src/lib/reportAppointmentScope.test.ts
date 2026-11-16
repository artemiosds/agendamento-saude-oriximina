import { describe, expect, it } from 'vitest';
import { filterAppointmentsToSectorScope, filterTriagesToAppointmentScope } from './reportAppointmentScope';

describe('escopo de Triagem nos Relatórios', () => {
  it('inclui apenas triagens vinculadas aos agendamentos do escopo aplicado', () => {
    const triages = [
      { id: 'triage-1', agendamento_id: 'agenda-1' },
      { id: 'triage-2', agendamento_id: 'agenda-2' },
      { id: 'triage-orphan', agendamento_id: 'agenda-missing' },
    ];

    expect(filterTriagesToAppointmentScope(triages, [{ id: 'agenda-1' }]))
      .toEqual([triages[0]]);
  });

  it('retorna vazio quando o escopo não tem agendamentos', () => {
    expect(filterTriagesToAppointmentScope([{ agendamento_id: 'agenda-1' }], [])).toEqual([]);
  });
});

describe('escopo de setor para agendamentos', () => {
  it('mantém apenas os agendamentos com atendimento registrado no setor escolhido', () => {
    const appointments = [{ id: 'agenda-1' }, { id: 'agenda-2' }, { id: 'agenda-3' }];
    const attendances = [
      { agendamento_id: 'agenda-1', setor: 'Fisioterapia' },
      { agendamento_id: 'agenda-2', setor: 'Psicologia' },
    ];

    expect(filterAppointmentsToSectorScope(appointments, attendances, 'Fisioterapia'))
      .toEqual([appointments[0]]);
  });

  it('não restringe os agendamentos quando o setor é Todas', () => {
    const appointments = [{ id: 'agenda-1' }];
    expect(filterAppointmentsToSectorScope(appointments, [], 'all')).toEqual(appointments);
  });
});

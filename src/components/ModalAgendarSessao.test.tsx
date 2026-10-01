import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ModalAgendarSessao } from './ModalAgendarSessao';

const fixture = vi.hoisted(() => ({
  appointments: [] as Array<{ id: string; data: string; profissional_id: string; profissional_nome: string; hora: string }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ not: async () => ({ data: fixture.appointments }) }),
      }),
    }),
  },
}));

const cycle = {
  id: 'cycle-1',
  patient_id: 'patient-1',
  professional_id: 'professional-1',
  unit_id: 'unit-1',
  treatment_type: 'Tratamento',
};

const baseProps = {
  open: true,
  onClose: vi.fn(),
  cycle,
  pacienteNome: 'Paciente',
  profissionalNome: 'Profissional',
  salas: [],
  availableDates: ['2099-10-09'],
  getAvailableSlots: () => ['07:30'],
  getTurnoInfo: () => [{ horaInicio: '07:30', horaFim: '11:00', vagasLivresInternas: 2 }],
  onConfirm: vi.fn(async () => {}),
};

describe('ModalAgendarSessao', () => {
  afterEach(() => {
    cleanup();
    fixture.appointments = [];
  });

  it('permite outra hora em uma data com agendamento do mesmo paciente e profissional', async () => {
    fixture.appointments = [{ id: 'other-1', data: '2099-10-09', profissional_id: 'professional-1', profissional_nome: 'Profissional', hora: '08:00' }];
    render(<ModalAgendarSessao {...baseProps} session={{ id: 'session-1', session_number: 8, total_sessions: 12, scheduled_date: '2099-10-08', status: 'pendente_agendamento', appointment_id: null }} />);

    fireEvent.click(screen.getByRole('button', { name: '9' }));
    await waitFor(() => expect(screen.getByText(/já possui agendamento com este profissional/i)).toBeInTheDocument());
    const timeInput = screen.getByRole('dialog').querySelector('input[type="time"]')!;
    fireEvent.change(timeInput, { target: { value: '09:00' } });

    expect(screen.getByRole('button', { name: 'Confirmar Agendamento' })).toBeEnabled();
    fireEvent.change(timeInput, { target: { value: '08:00' } });
    expect(screen.getByRole('button', { name: 'Confirmar Agendamento' })).toBeDisabled();
  });

  it('permite remarcar no próprio turno cheio sem criar uma vaga adicional', async () => {
    fixture.appointments = [{ id: 'appointment-1', data: '2099-10-08', profissional_id: 'professional-1', profissional_nome: 'Profissional', hora: '07:30' }];
    render(<ModalAgendarSessao {...baseProps} mode="remarcar" availableDates={[]} getAvailableSlots={() => []} getTurnoInfo={() => [{ horaInicio: '07:30', horaFim: '11:00', vagasLivresInternas: 0 }]} currentAppointment={{ id: 'appointment-1', data: '2099-10-08', hora: '07:30' }} session={{ id: 'session-1', session_number: 8, total_sessions: 12, scheduled_date: '2099-10-08', status: 'agendada', appointment_id: 'appointment-1' }} />);

    await waitFor(() => expect(screen.getByRole('dialog').querySelector('input[type="time"]')).not.toBeNull());
    fireEvent.change(screen.getByRole('dialog').querySelector('input[type="time"]')!, { target: { value: '09:00' } });
    expect(screen.getByRole('button', { name: 'Confirmar Remarcação' })).toBeEnabled();
  });

  it('não libera novo agendamento em turno cheio', async () => {
    render(<ModalAgendarSessao {...baseProps} availableDates={[]} getAvailableSlots={() => []} getTurnoInfo={() => [{ horaInicio: '07:30', horaFim: '11:00', vagasLivresInternas: 0 }]} session={{ id: 'session-1', session_number: 8, total_sessions: 12, scheduled_date: '2099-10-08', status: 'pendente_agendamento', appointment_id: null }} />);

    await waitFor(() => expect(screen.getByText(/Turno sem vagas livres nesta data/i)).toBeInTheDocument());
    expect(screen.getByRole('dialog').querySelector('input[type="time"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmar Agendamento' })).toBeDisabled();
  });

  it('permite encaixe manual no turno cheio somente quando autorizado', async () => {
    const onConfirm = vi.fn(async () => {});
    render(<ModalAgendarSessao {...baseProps} onConfirm={onConfirm} allowCapacityOverride
      availableDates={['2099-10-08']} getAvailableSlots={() => []}
      getTurnoInfo={() => [{ horaInicio: '07:30', horaFim: '11:00', vagasLivresInternas: 0 }]}
      getConfiguredWindows={() => [{ horaInicio: '07:30', horaFim: '11:00', vagasPorHora: 0 }]}
      session={{ id: 'session-1', session_number: 8, total_sessions: 12, scheduled_date: '2099-10-08', status: 'pendente_agendamento', appointment_id: null }} />);

    await waitFor(() => expect(screen.getByRole('dialog').querySelector('input[type="time"]')).not.toBeNull());
    fireEvent.change(screen.getByRole('dialog').querySelector('input[type="time"]')!, { target: { value: '08:00' } });
    expect(screen.getByText(/Encaixe acima da capacidade/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Agendamento' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('2099-10-08', '08:00', ''));
  });
});

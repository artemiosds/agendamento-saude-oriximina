import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { TreatmentCyclePendingPanel } from './TreatmentCyclePendingPanel';
import { validateTreatmentCycle } from '@/lib/treatmentCycleIntegrity';

const cycle = { id: 'cycle', patient_id: 'patient', professional_id: 'professional', unit_id: 'unit', total_sessions: 2, frequency: '1x_semana' };
const rows = [
  { id: 'protected', cycle_id: 'cycle', patient_id: 'patient', professional_id: 'professional', session_number: 1, scheduled_date: '2030-02-04', status: 'agendada', appointment_id: 'appointment' },
  { id: 'duplicate', cycle_id: 'cycle', patient_id: 'patient', professional_id: 'professional', session_number: 2, scheduled_date: '2030-02-04', status: 'pendente_agendamento', appointment_id: null },
];
const appointments = { appointment: { id: 'appointment', paciente_id: 'patient', profissional_id: 'professional', unidade_id: 'unit', data: '2030-02-04', status: 'confirmado' } };
const onChanged = vi.fn(async () => {});
beforeEach(() => { rpc.mockReset(); onChanged.mockClear(); });
afterEach(cleanup);

describe('regularização manual sem alterar o vínculo protegido', () => {
  it('somente envia a sessão sem vínculo, depois de motivo e confirmação explícita', async () => {
    rpc.mockResolvedValue({ data: { message: 'Data duplicada removida' }, error: null });
    render(<TreatmentCyclePendingPanel cycle={cycle} sessions={rows} issues={validateTreatmentCycle(cycle, rows)} appointments={appointments} canReview availableDates={[]} onChanged={onChanged} />);
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByText(/Reserva vinculada: sessão nº 1/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirar data duplicada da sessão nº 1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retirar data duplicada da sessão nº 2' }));
    expect(screen.getByRole('button', { name: 'Confirmar regularização' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motivo da alteração (obrigatório)'), { target: { value: 'Vínculo da sessão 1 conferido' } });
    expect(screen.getByRole('button', { name: 'Confirmar regularização' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar regularização' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledExactlyOnceWith('clear_duplicate_treatment_session_date', { p_session_id: 'duplicate', p_expected_date: '2030-02-04', p_reason: 'Vínculo da sessão 1 conferido', p_confirmed: true });
  });
  it('cancelar ou apenas abrir pendências não realiza nenhuma gravação', () => {
    render(<TreatmentCyclePendingPanel cycle={cycle} sessions={rows} issues={validateTreatmentCycle(cycle, rows)} appointments={appointments} canReview availableDates={[]} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retirar data duplicada da sessão nº 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(rpc).not.toHaveBeenCalled();
  });
  it('completar um número faltante exige ação individual confirmada e não preenche data automaticamente', async () => {
    const sessions = [rows[0]];
    rpc.mockResolvedValue({ data: { message: '2 de 2 sessões registradas' }, error: null });
    render(<TreatmentCyclePendingPanel cycle={cycle} sessions={sessions} issues={validateTreatmentCycle(cycle, sessions)} appointments={appointments} canReview availableDates={['2030-02-11']} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar manualmente sessão nº 2 faltante' }));
    expect((screen.getByLabelText('Nova data (opcional)') as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('Motivo da alteração (obrigatório)'), { target: { value: 'Ausência do registro conferida' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar regularização' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledExactlyOnceWith('restore_missing_treatment_session', { p_cycle_id: 'cycle', p_session_number: 2, p_date: null, p_reason: 'Ausência do registro conferida', p_confirmed: true }));
  });
  it('não disponibiliza regularizações para quem não pode gerir o ciclo', () => {
    render(<TreatmentCyclePendingPanel cycle={cycle} sessions={rows} issues={validateTreatmentCycle(cycle, rows)} appointments={appointments} canReview={false} availableDates={[]} onChanged={onChanged} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

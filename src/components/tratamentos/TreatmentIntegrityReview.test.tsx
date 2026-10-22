import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { TreatmentIntegrityReview } from './TreatmentIntegrityReview';

afterEach(cleanup);
beforeEach(() => rpc.mockReset());
describe('revisão de integridade reservada ao Master', () => {
  it('não consulta nem exibe pendências para outro perfil', () => {
    render(<TreatmentIntegrityReview open isMaster={false} onOpenChange={vi.fn()} />);
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.queryByText(/revisão Master/)).toBeNull();
  });
  it('mostra a contagem real e abre a conferência sem corrigir ou gravar nada', async () => {
    const cycle = { id: 'legacy', total_sessions: 7 };
    rpc.mockResolvedValue({ data: [{ cycle, patient_name: 'PACIENTE FICTÍCIO', registered_sessions: 6, issues: ['Quantidade incompleta: ciclo previsto para 7 sessões, mas possui 6 registradas.'] }], error: null });
    const onSelect = vi.fn();
    render(<TreatmentIntegrityReview open isMaster onOpenChange={vi.fn()} onSelect={onSelect} />);
    expect(await screen.findByText('6 de 7 sessões registradas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ciclo para conferência' }));
    expect(onSelect).toHaveBeenCalledWith(cycle);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('get_treatment_integrity_pending', { p_page: 0, p_limit: 20 });
    expect(screen.queryByRole('button', { name: /corrigir|gerar|renumerar|vincular/i })).toBeNull();
  });
  it('distingue falha de consulta de ausência de problemas', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    render(<TreatmentIntegrityReview open isMaster onOpenChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível consultar'));
    expect(screen.queryByText('Nenhuma pendência nesta página.')).toBeNull();
  });
});

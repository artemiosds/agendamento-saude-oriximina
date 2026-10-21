import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  user: { id: 'recepcao', role: 'recepcao', unidadeId: 'u1', usuario: 'recepcao' },
  read: vi.fn(), resolve: vi.fn(async () => 'u1'),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/contexts/OperacionalContext', () => ({ useOperacional: () => ({ resolveScopedUnidadeId: state.resolve }) }));
vi.mock('@/hooks/useRealtimeSync', () => ({ useRealtimeSync: () => {} }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: state.read } }));
import { PacientesSliceProvider, usePacientes } from './PacientesContext';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}><PacientesSliceProvider>{children}</PacientesSliceProvider></QueryClientProvider>;
}
beforeEach(() => {
  state.user = { id: 'recepcao', role: 'recepcao', unidadeId: 'u1', usuario: 'recepcao' };
  state.read.mockReset();
  const query = { select: () => query, in: () => query, or: () => query,
    then: (resolve: (value: unknown) => void) => resolve({ data: [{ id: 'p1', nome: 'PACIENTE', unidade_id: 'u1', criado_em: '2026-01-01', custom_data: { bairro: 'CENTRO' } }], error: null }) };
  state.read.mockReturnValue(query);
});
afterEach(cleanup);

describe('atualização pontual do paciente persistido', () => {
  it('alimenta as prioridades usadas na Triagem sem fazer outra leitura', async () => {
    const { result } = renderHook(usePacientes, { wrapper });
    await act(async () => { await result.current.hydrateAgendaPatients(['p1']); });
    const reads = state.read.mock.calls.length;
    act(() => result.current.applySavedPaciente({ id: 'p1', nome: 'PACIENTE', unidade_id: 'u1',
      is_gestante: true, is_pne: false, is_autista: true, tipo_condicao: 'tea', custom_data: { bairro: 'CENTRO', is_autista: true } }));
    expect(result.current.pacientes[0]).toMatchObject({ isGestante: true, isPne: false, isAutista: true, tipo_condicao: 'tea', custom_data: { bairro: 'CENTRO' } });
    expect(state.read).toHaveBeenCalledTimes(reads);
    act(() => result.current.applySavedPaciente({ id: 'p2', nome: 'NÃO CARREGADO' }));
    expect(result.current.pacientes).toHaveLength(1);
  });
  it('ignora uma resposta de salvamento do escopo anterior após trocar de usuário/unidade', async () => {
    const { result, rerender } = renderHook(usePacientes, { wrapper });
    await act(async () => { await result.current.hydrateAgendaPatients(['p1']); });
    const oldApply = result.current.applySavedPaciente;
    state.user = { id: 'outro', role: 'recepcao', unidadeId: 'u2', usuario: 'outro' };
    rerender();
    act(() => oldApply({ id: 'p1', is_autista: true }));
    expect(result.current.pacientes).toEqual([]);
  });
});

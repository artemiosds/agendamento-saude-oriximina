import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
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
  let requestedIds = ['p1'];
  const query = { select: () => query, in: (_column: string, ids: string[]) => { requestedIds = ids; return query; }, or: () => query,
    then: (resolve: (value: unknown) => void) => resolve({ data: requestedIds.map(id => ({ id, nome: `PACIENTE ${id}`, unidade_id: 'u1', criado_em: '2026-01-01', custom_data: { bairro: 'CENTRO' } })), error: null }) };
  state.read.mockReturnValue(query);
});
afterEach(cleanup);

describe('atualização pontual do paciente persistido', () => {
  it('mantém só os pacientes dos ciclos visíveis e reutiliza o cache ao trocar de página', async () => {
    const { result } = renderHook(usePacientes, { wrapper });
    await act(async () => { result.current.activateTreatmentPatients(); await result.current.hydrateTreatmentPatients(['p1', 'p2']); });
    expect(result.current.pacientes.map(p => p.id)).toEqual(['p1', 'p2']);
    const reads = state.read.mock.calls.length;
    await act(async () => { await result.current.hydrateTreatmentPatients(['p2']); });
    expect(result.current.pacientes.map(p => p.id)).toEqual(['p2']);
    expect(state.read).toHaveBeenCalledTimes(reads);
    await act(async () => { await result.current.hydrateTreatmentPatients(['p2'], true); });
    expect(state.read).toHaveBeenCalledTimes(reads + 1);
    act(() => result.current.activateAgendaPatients());
    expect(result.current.pacientes).toEqual([]);
    expect(state.read).toHaveBeenCalledTimes(reads + 1);
  });

  it('ignora a resposta de outra página que chegou depois da página atual', async () => {
    const pending: Array<{ ids: string[]; resolve: (value: unknown) => void }> = [];
    state.read.mockImplementation(() => {
      let ids: string[] = [];
      const query = { select: () => query, or: () => query, in: (_column: string, values: string[]) => { ids = values; return query; },
        then: (resolve: (value: unknown) => void) => new Promise<void>(done => {
          pending.push({ ids, resolve: value => { resolve(value); done(); } });
        }) };
      return query;
    });
    const { result } = renderHook(usePacientes, { wrapper });
    let oldPage!: Promise<unknown>;
    let newPage!: Promise<unknown>;
    act(() => {
      oldPage = result.current.hydrateTreatmentPatients(['p1']);
      newPage = result.current.hydrateTreatmentPatients(['p2']);
    });
    await waitFor(() => expect(pending.map(p => p.ids)).toEqual([['p1'], ['p2']]));
    await act(async () => {
      pending[1].resolve({ data: [{ id: 'p2', nome: 'ATUAL', unidade_id: 'u1', criado_em: '2026-01-01' }], error: null });
      await newPage;
    });
    pending[0].resolve({ data: [{ id: 'p1', nome: 'ANTIGA', unidade_id: 'u1', criado_em: '2026-01-01' }], error: null });
    await expect(oldPage).rejects.toThrow('Leitura de pacientes obsoleta');
    expect(result.current.pacientes.map(p => p.id)).toEqual(['p2']);
  });
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


it('inclui só o novo cadastro em memória, evita duplicar e dispensa nova leitura para selecioná-lo',async()=>{
 const {result}=renderHook(usePacientes,{wrapper});
 act(()=>result.current.activateAgendaPatients());
 const calls=state.read.mock.calls.length;
 act(()=>result.current.applyCreatedPaciente({id:'new',nome:'NOVO PACIENTE',unidade_id:'u1',custom_data:{racaCor:'parda'}}));
 expect(result.current.pacientes).toHaveLength(1);
 act(()=>result.current.applyCreatedPaciente({id:'new',nome:'NOVO PACIENTE',unidade_id:'u1'}));
 expect(result.current.pacientes).toHaveLength(1);
 await act(async()=>{expect((await result.current.hydrateAgendaPatients(['new']))[0].id).toBe('new');});
 expect(state.read).toHaveBeenCalledTimes(calls);
 act(()=>result.current.applyCreatedPaciente({id:'other-unit',nome:'OUTRO',unidade_id:'u2'}));
 expect(result.current.pacientes).toHaveLength(1);
});

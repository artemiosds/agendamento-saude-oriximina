import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFilaAutomatica } from './useFilaAutomatica';

const fixture = vi.hoisted(() => ({
  contact: { id: 'p1', telefone: '93999999999', email: 'paciente@example.com' } as Record<string, string> | null,
  reads: [] as Array<{ table: string; columns: string; id: string }>,
  notify: vi.fn(), updateFila: vi.fn(), addAgendamento: vi.fn(),
  logAction: vi.fn(), refreshFila: vi.fn(), refreshAgendamentos: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', unidadeId: 'unidade', usuario: 'recepcao' } }) }));
vi.mock('@/contexts/FilaContext', () => ({ useFila: () => ({
  fila: [{ id: 'f1', pacienteId: 'p1', pacienteNome: 'Paciente', unidadeId: 'unidade',
    profissionalId: 'prof', status: 'aguardando', prioridade: 'normal', criadoEm: '2026-09-22T10:00:00' }],
  updateFila: fixture.updateFila, refreshFila: fixture.refreshFila,
}) }));
vi.mock('@/contexts/OperacionalContext', () => ({ useOperacional: () => ({
  funcionarios: [{ id: 'prof', nome: 'Profissional' }], unidades: [{ id: 'unidade', nome: 'Unidade' }],
  configuracoes: { filaEspera: { modoEncaixe: 'assistido' } }, logAction: fixture.logAction,
}) }));
vi.mock('@/contexts/AgendamentosContext', () => ({ useAgendamentos: () => ({
  addAgendamento: fixture.addAgendamento, refreshAgendamentos: fixture.refreshAgendamentos,
}) }));
vi.mock('@/hooks/useWebhookNotify', () => ({ useWebhookNotify: () => ({ notify: fixture.notify }) }));
vi.mock('@/hooks/useEnsurePortalAccess', () => ({ useEnsurePortalAccess: () => ({ ensurePortalAccess: vi.fn().mockResolvedValue(undefined) }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => ({
  select: (columns: string) => ({
    eq: (_: string, id: string) => {
      fixture.reads.push({ table, columns, id });
      return { or: () => ({ maybeSingle: async () => ({ data: fixture.contact, error: null }) }) };
    },
  }),
}) } }));

const slot = { data: '2026-09-25', hora: '13:30', profissionalId: 'prof',
  profissionalNome: 'Profissional', unidadeId: 'unidade' };

beforeEach(() => {
  vi.clearAllMocks();
  fixture.reads = [];
  fixture.contact = { id: 'p1', telefone: '93999999999', email: 'paciente@example.com' };
});

describe('A1.2: contato pontual da fila', () => {
  it('avisa sobre vaga liberada usando o contato do paciente escolhido', async () => {
    const { result } = renderHook(() => useFilaAutomatica());
    let called = false;
    await act(async () => { called = await result.current.chamarProximoDaFila(slot); });
    expect(called).toBe(true);
    expect(fixture.reads).toEqual([{ table: 'pacientes', columns: 'id,telefone,email,unidade_id', id: 'p1' }]);
    expect(fixture.notify).toHaveBeenCalledWith(expect.objectContaining({
      evento: 'vaga_liberada', telefone: '93999999999', email: 'paciente@example.com',
    }));
  });

  it('confirma encaixe com o mesmo contato, sem varrer pacientes', async () => {
    const { result } = renderHook(() => useFilaAutomatica());
    await act(async () => { await result.current.confirmarEncaixe('f1', slot); });
    expect(fixture.reads).toEqual([{ table: 'pacientes', columns: 'id,telefone,email,unidade_id', id: 'p1' }]);
    expect(fixture.addAgendamento).toHaveBeenCalledWith(expect.objectContaining({ pacienteId: 'p1' }));
    expect(fixture.notify).toHaveBeenCalledWith(expect.objectContaining({
      evento: 'novo_agendamento', telefone: '93999999999', email: 'paciente@example.com',
    }));
  });

  it('para antes de alterar a fila ou criar agendamento se não houver contato', async () => {
    fixture.contact = null;
    const { result } = renderHook(() => useFilaAutomatica());
    await act(async () => {
      expect(await result.current.chamarProximoDaFila(slot)).toBe(false);
      await result.current.confirmarEncaixe('f1', slot);
    });
    expect(fixture.updateFila).not.toHaveBeenCalled();
    expect(fixture.addAgendamento).not.toHaveBeenCalled();
    expect(fixture.notify).not.toHaveBeenCalled();
  });
});

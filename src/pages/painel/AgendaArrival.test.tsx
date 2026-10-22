import React, { useEffect, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  day: '2026-10-22', empty: [] as any[], rows: [] as any[], queue: [] as any[],
  complete: new Set(['2026-10-22']),
  patients: [{ id: 'p1', nome: 'PACIENTE TESTE', criadoEm: '', cpf: '', cns: '' }],
  units: [{ id: 'u1', nome: 'UNIDADE TESTE' }],
  professionals: [{ id: 'prof1', nome: 'PROFISSIONAL TESTE', unidadeId: 'u1' }],
  user: { id: 'admin', usuario: 'admin.sms', role: 'master', unidadeId: 'u1', nome: 'TESTE' },
  triage: true, globalTriage: null as null | boolean, readStatus: 'confirmado', queryError: null as any,
  update: vi.fn(), addQueue: vi.fn(), updateQueue: vi.fn(), refresh: vi.fn(), refreshQueue: vi.fn(),
  loadRange: vi.fn(), hydrate: vi.fn(), exceptions: vi.fn(), selected: vi.fn(),
  log: vi.fn(), notify: vi.fn(), toastError: vi.fn(), rpc: vi.fn(),
  setter: null as null | React.Dispatch<React.SetStateAction<any[]>>,
  queueSetter: null as null | React.Dispatch<React.SetStateAction<any[]>>,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: f.user }) }));
vi.mock('@/contexts/PacientesContext', () => ({ usePacientes: () => ({ pacientes: f.patients, hydrateAgendaPatients: f.hydrate }) }));
vi.mock('@/contexts/AgendamentosContext', () => ({ useAgendamentos: () => {
  const [agendamentos, set] = useState(f.rows); f.setter = set;
  return { agendamentos, updateAgendamento: f.update, refreshAgendamentos: f.refresh,
    loadAgendaRange: f.loadRange, completeAgendaDates: f.complete,
    loadAgendaExceptions: f.exceptions, setAgendaSelectedDate: f.selected };
} }));
vi.mock('@/contexts/FilaContext', () => ({ useFila: () => {
  const [fila, set] = useState(f.queue); f.queueSetter = set;
  return { fila, addToFila: f.addQueue, updateFila: f.updateQueue, refreshFila: f.refreshQueue };
} }));
vi.mock('@/contexts/OperacionalContext', () => ({ useOperacional: () => ({
  funcionarios: f.professionals, unidades: f.units, salas: f.empty, bloqueios: f.empty,
  disponibilidades: f.empty, configuracoes: { googleCalendar: {} }, logAction: f.log,
  getAvailableSlots: () => [], getAvailableDates: () => [], getTurnoInfo: () => [],
}) }));
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock('@/hooks/useUnidadeFilter', () => ({ useUnidadeFilter: () => ({ isMaster: true,
  unidadesVisiveis: f.units, profissionaisVisiveis: f.professionals, salasVisiveis: f.empty, showUnitSelector: false }) }));
vi.mock('@/hooks/useGoogleCalendar', () => ({ useGoogleCalendar: () => ({}) }));
vi.mock('@/hooks/useWebhookNotify', () => ({ useWebhookNotify: () => ({ notify: f.notify }) }));
vi.mock('@/hooks/useFilaAutomatica', () => ({ useFilaAutomatica: () => ({ handleVagaLiberada: vi.fn() }) }));
vi.mock('@/hooks/useEnsurePortalAccess', () => ({ useEnsurePortalAccess: () => ({ ensurePortalAccess: vi.fn() }) }));
vi.mock('@/lib/utils', async original => ({ ...await original<typeof import('@/lib/utils')>(), todayLocalStr: () => f.day }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: f.toastError, info: vi.fn() } }));
vi.mock('@/components/BuscaPaciente', () => ({ BuscaPaciente: () => null }));
vi.mock('@/components/RegistrarFaltaModal', () => ({ RegistrarFaltaModal: () => null }));
vi.mock('@/components/ConcluirAtendimentoModal', () => ({ ConcluirAtendimentoModal: () => null }));
vi.mock('@/components/AgendaNotificacoes', () => ({ AgendaNotificacaoIndividual: () => null, AgendaNotificacoesMassa: () => null }));
vi.mock('./CalendarioAgenda', () => ({ CalendarioAgenda: ({ onVisibleRangeChange }: any) => {
  useEffect(() => { onVisibleRangeChange(f.day, f.day); }, [onVisibleRangeChange]); return null;
} }));
vi.mock('./agenda/AgendaItemCard', () => ({ default: ({ ag, onStatusChange }: any) => <div>
  <output data-testid="status">{ag.status}</output>
  <button onClick={() => onStatusChange(ag.id, 'confirmado_chegada')}>Chegada teste</button>
</div> }));
// Exercita o callback real da Agenda sem editar o cadastro de um paciente.
vi.mock('@/components/ConferirDadosPacienteModal', () => ({ ConferirDadosPacienteModal: ({ open, onConfirm, onOpenChange }: any) => {
  const [error, setError] = useState('');
  return open ? <div role="dialog"><button onClick={async () => {
    try { await onConfirm(); onOpenChange(false); } catch (e: any) { setError(e.message); }
  }}>Confirmar teste</button><output>{error}</output></div> : null;
} }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => {
    let professional = false;
    const q: any = {
      select: () => q,
      eq: (key: string) => { if (key === 'profissional_id') professional = true; return q; },
      is: () => q, in: () => q, not: () => q, order: () => q, limit: () => q,
      single: async () => ({ data: { status: f.readStatus, paciente_id: 'p1', unidade_id: 'u1' }, error: f.queryError }),
      maybeSingle: async () => ({ data: table === 'triage_settings'
        ? (professional ? { enabled: f.triage } : f.globalTriage === null ? null : { enabled: f.globalTriage }) : null, error: f.queryError }),
      then: (resolve: any, reject: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
    };
    return q;
  },
  rpc: (...args: any[]) => f.rpc(...args),
  channel: () => { const channel: any = { on: () => channel, subscribe: () => channel }; return channel; },
  removeChannel: vi.fn(),
} }));
import Agenda from './Agenda';

beforeEach(() => {
  vi.clearAllMocks(); f.triage = true; f.globalTriage = null; f.readStatus = 'confirmado'; f.queryError = null;
  f.rows = [{ id: 'ag1', pacienteId: 'p1', pacienteNome: 'PACIENTE TESTE', profissionalId: 'prof1',
    profissionalNome: 'PROFISSIONAL TESTE', unidadeId: 'u1', data: f.day, hora: '08:00',
    status: 'confirmado', tipo: 'Consulta', origem: 'recepcao', observacoes: '', criadoEm: '' }];
  f.queue = []; f.hydrate.mockResolvedValue(f.patients); f.exceptions.mockResolvedValue([]);
  f.loadRange.mockResolvedValue(undefined); f.refresh.mockResolvedValue(undefined); f.refreshQueue.mockResolvedValue(undefined);
  f.rpc.mockResolvedValue({ error: null }); f.log.mockResolvedValue(undefined); f.notify.mockResolvedValue(undefined);
  f.update.mockImplementation(async (id, patch) => { f.setter?.(rows => rows.map(a => a.id === id ? { ...a, ...patch } : a)); });
  f.addQueue.mockReset().mockImplementation(async row => { f.queueSetter?.(rows => [...rows, row]); });
  f.updateQueue.mockReset().mockImplementation(async (id, patch) => { f.queueSetter?.(rows => rows.map(a => a.id === id ? { ...a, ...patch } : a)); });
});
afterEach(cleanup);
async function confirmArrival() {
  render(<MemoryRouter><Agenda /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Chegada teste' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar teste' }));
}
describe('confirmação de chegada na Agenda', () => {
  it.each([true, false])('preserva o encaminhamento com triagem=%s sem recarregar o período', async enabled => {
    f.triage = enabled;
    await confirmArrival();
    const status = enabled ? 'confirmado_chegada' : 'apto_atendimento';
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('status')).toHaveTextContent(status);
    expect(screen.getByRole('button', { name: 'Todos (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmados (0)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: enabled ? 'Aptos (0)' : 'Aptos (1)' })).toBeInTheDocument();
    expect(f.update).toHaveBeenCalledWith('ag1', { status });
    expect(f.addQueue).toHaveBeenCalledWith(expect.objectContaining({ id: 'ag1', pacienteId: 'p1',
      unidadeId: 'u1', profissionalId: 'prof1', status: enabled ? 'chegada_confirmada' : 'apto_atendimento', horaChegada: expect.any(String) }), true);
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.loadRange).toHaveBeenCalledTimes(1); // carga inicial do calendário
    expect(f.refreshQueue).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(f.log).toHaveBeenCalledWith(expect.objectContaining({ acao: 'status_change', agendamentoId: 'ag1' })));
  });
  it('reutiliza fila existente sem criar outra entrada', async () => {
    f.queue = [{ id: 'ag1', status: 'aguardando' }];
    await confirmArrival();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(f.updateQueue).toHaveBeenCalledWith('ag1', expect.objectContaining({ status: 'chegada_confirmada' }), true);
    expect(f.addQueue).not.toHaveBeenCalled(); expect(f.refresh).not.toHaveBeenCalled();
  });
  it('preserva o tratamento de inserção concorrente na fila', async () => {
    f.addQueue.mockRejectedValueOnce({ code: '23505' });
    await confirmArrival();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(f.updateQueue).toHaveBeenCalledWith('ag1', expect.objectContaining({ status: 'chegada_confirmada' }), true);
    expect(f.refresh).not.toHaveBeenCalled();
  });
  it('mantém o modal aberto quando a fila falha', async () => {
    f.addQueue.mockRejectedValueOnce(new Error('Falha na fila'));
    await confirmArrival();
    expect(await screen.findByText('Falha na fila')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(f.refreshQueue).not.toHaveBeenCalled();
  });
  it('bloqueia chegada repetida e mantém a recarga de recuperação', async () => {
    f.readStatus = 'em_atendimento';
    await confirmArrival();
    expect(await screen.findByText(/Este atendimento já avançou/)).toBeInTheDocument();
    expect(f.update).not.toHaveBeenCalled(); expect(f.addQueue).not.toHaveBeenCalled();
    expect(f.refresh).toHaveBeenCalledTimes(1);
  });
});

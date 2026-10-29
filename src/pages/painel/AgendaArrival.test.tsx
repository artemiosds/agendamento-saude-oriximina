import React, { useEffect, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  deleteRow: vi.fn(), log: vi.fn(), notify: vi.fn(), toastError: vi.fn(), toastInfo: vi.fn(), rpc: vi.fn(), apply: vi.fn(),
  createdPatient: vi.fn(), registrationMount: vi.fn(),
  setter: null as null | React.Dispatch<React.SetStateAction<any[]>>,
  queueSetter: null as null | React.Dispatch<React.SetStateAction<any[]>>,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: f.user }) }));
vi.mock('@/contexts/PacientesContext', () => ({ usePacientes: () => ({ pacientes: f.patients, hydrateAgendaPatients: f.hydrate, applyCreatedPaciente: f.createdPatient }) }));
vi.mock('@/contexts/AgendamentosContext', () => ({ useAgendamentos: () => {
  const [agendamentos, set] = useState(f.rows); f.setter = set;
  return { agendamentos, updateAgendamento: f.update, refreshAgendamentos: f.refresh, applyCareFlowAgendamentoUpdate: f.apply,
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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: f.toastError, info: f.toastInfo } }));
vi.mock('@/components/TriageReconciliationPanel', () => ({ default: () => null }));
vi.mock('@/components/BuscaPaciente', () => ({ BuscaPaciente: ({onCadastrarNovo,value}:any) => <><output data-testid="patient-selected">{value}</output>{onCadastrarNovo && <button onClick={()=>onCadastrarNovo('MARIA')}>Cadastrar paciente teste</button>}</> }));
vi.mock('@/components/agenda/CadastroPacienteNaAgenda',()=>({default:({termo,onSaved,onCancel}:any)=>{f.registrationMount();return <div><output>{termo}</output><button onClick={onCancel}>Voltar teste</button><button onClick={()=>onSaved({id:'new-patient',nome:'MARIA',unidade_id:'u1'})}>Salvar paciente teste</button></div>;}}));
vi.mock('@/components/RegistrarFaltaModal', () => ({ RegistrarFaltaModal: () => null }));
vi.mock('@/components/ConcluirAtendimentoModal', () => ({ ConcluirAtendimentoModal: () => null }));
vi.mock('@/components/AgendaNotificacoes', () => ({ AgendaNotificacaoIndividual: () => null, AgendaNotificacoesMassa: () => null }));
vi.mock('./CalendarioAgenda', () => ({ CalendarioAgenda: ({ onVisibleRangeChange }: any) => {
  useEffect(() => { onVisibleRangeChange(f.day, f.day); }, [onVisibleRangeChange]); return null;
} }));
vi.mock('./agenda/AgendaItemCard', () => ({ default: ({ ag, onStatusChange, onDeleteInit }: any) => <div>
  <button onClick={() => onDeleteInit(ag)}>Excluir teste</button>
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
    let deleting = false;
    const q: any = {
      select: () => q,
      delete: () => { deleting = true; f.deleteRow(table); return q; },
      eq: (key: string) => { if (key === 'profissional_id') professional = true; return q; },
      is: () => q, in: () => q, not: () => q, order: () => q, limit: () => q,
      single: async () => ({ data: { status: f.readStatus, paciente_id: 'p1', unidade_id: 'u1' }, error: f.queryError }),
      maybeSingle: async () => ({ data: deleting ? { id: 'ag1' } : table === 'triage_settings'
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
  f.apply.mockImplementation(row => f.setter?.(rows => rows.map(a => a.id === row.id ? { ...a, status: row.status } : a)));
  f.rpc.mockImplementation(async () => ({ data: { already_processed: false, status: f.triage ? 'confirmado_chegada' : 'apto_atendimento', agendamento: { id: 'ag1', status: f.triage ? 'confirmado_chegada' : 'apto_atendimento' }, fila: { hora_chegada: '08:00' } }, error: null })); f.log.mockResolvedValue(undefined); f.notify.mockResolvedValue(undefined);
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
describe('confirmação atômica de chegada na Agenda', () => {
  it.each([true, false])('aplica o resultado confirmado pelo banco com triagem=%s sem recarregar o período', async enabled => {
    f.triage = enabled;
    await confirmArrival();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('status')).toHaveTextContent(enabled ? 'confirmado_chegada' : 'apto_atendimento');
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.rpc).toHaveBeenCalledWith('confirmar_chegada_atendimento', expect.objectContaining({ p_agendamento_id: 'ag1', p_usuario_id: 'admin', p_unidade_id: 'u1', p_paciente_id_esperado: 'p1', p_reconciliar: false }));
    expect(f.update).not.toHaveBeenCalled(); expect(f.addQueue).not.toHaveBeenCalled(); expect(f.updateQueue).not.toHaveBeenCalled();
    expect(f.refresh).not.toHaveBeenCalled(); expect(f.refreshQueue).toHaveBeenCalledTimes(1);
    expect(f.loadRange).toHaveBeenCalledTimes(1);
    expect(f.log).not.toHaveBeenCalled();
  });
  it('fecha o modal e informa chegada já processada sem repetir auditoria ou notificações', async () => {
    f.rpc.mockResolvedValueOnce({ data: { already_processed: true, status: 'em_atendimento', agendamento: { id: 'ag1', status: 'em_atendimento' }, fila: null }, error: null });
    await confirmArrival();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(f.toastInfo).toHaveBeenCalledWith('A chegada deste paciente já foi confirmada por outro terminal.');
    expect(screen.getByTestId('status')).toHaveTextContent('em_atendimento');
    expect(f.log).not.toHaveBeenCalled(); expect(f.notify).not.toHaveBeenCalled();
  });
  it('mantém o formulário aberto e o cartão anterior quando a transação falha', async () => {
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'Falha na fila' } });
    await confirmArrival(); expect(await screen.findByText('Falha na fila')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(screen.getByTestId('status')).toHaveTextContent('confirmado');
    expect(f.apply).not.toHaveBeenCalled(); expect(f.addQueue).not.toHaveBeenCalled();
  });
  it('RPC indisponível não dispara o antigo fluxo parcial', async () => {
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
    await confirmArrival(); expect(await screen.findByText(/operação segura ainda não está disponível/)).toBeInTheDocument();
    expect(f.update).not.toHaveBeenCalled(); expect(f.addQueue).not.toHaveBeenCalled();
  });
});

describe('Agenda: diálogo único de exclusão', () => {
  it('abre com nome e horário corretos, cancela sem gravação e confirma pelo handler auditado existente', async () => {
    render(<MemoryRouter><Agenda /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir teste' }));
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(screen.getByRole('alertdialog')).toHaveTextContent('PACIENTE TESTE às 08:00');
    fireEvent.click(screen.getByRole('button', { name: /^Cancelar$/ }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(f.deleteRow).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir teste' }));
    fireEvent.click(screen.getByRole('button', { name: /^Excluir$/ }));
    await waitFor(() => expect(f.log).toHaveBeenCalledWith(expect.objectContaining({ acao: 'excluir_agendamento', entidadeId: 'ag1', agendamentoId: 'ag1' })));
    expect(f.deleteRow).toHaveBeenCalledWith('agendamentos');
    expect(f.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});


describe('cadastro dentro do mesmo diálogo da Agenda',()=>{
 it('monta sob demanda, preserva profissional e horário e seleciona o paciente salvo sem recarregar',async()=>{
   f.user.id='admin';f.user.role='master';f.user.usuario='admin.sms';
   vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}});
   const originalScroll=HTMLElement.prototype.scrollIntoView;HTMLElement.prototype.scrollIntoView=vi.fn();
   try {
    render(<MemoryRouter><Agenda /></MemoryRouter>);
    expect(f.registrationMount).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button',{name:'Novo Agendamento'})[0]);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('combobox')[0]);
    fireEvent.click((await screen.findAllByRole('option'))[0]);
    fireEvent.keyDown(document.activeElement || document.body,{key:'Escape'});
    const time=screen.getByRole('dialog').querySelector('input[type="time"]')!;
    fireEvent.change(time,{target:{value:'09:30'}});
    fireEvent.click(screen.getByText('Cadastrar paciente teste'));
    await screen.findByText('Voltar teste');expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(screen.getByText('Voltar teste'));
    expect(screen.getByRole('dialog').querySelector('input[type="time"]')).toHaveValue('09:30');
    expect(screen.getByRole('dialog')).toHaveTextContent('PROFISSIONAL TESTE');
    fireEvent.click(screen.getByText('Cadastrar paciente teste'));
    fireEvent.click(await screen.findByText('Salvar paciente teste'));
    await waitFor(()=>expect(screen.getByTestId('patient-selected')).toHaveTextContent('new-patient'));
    expect(screen.getByText('✓ Dados conferidos')).toBeInTheDocument();
    expect(f.createdPatient).toHaveBeenCalledWith(expect.objectContaining({id:'new-patient'}));
    expect(screen.getByRole('dialog').querySelector('input[type="time"]')).toHaveValue('09:30');
    expect(f.refresh).not.toHaveBeenCalled();
   }finally{f.user.id='admin';f.user.role='master';f.user.usuario='admin.sms';HTMLElement.prototype.scrollIntoView=originalScroll;vi.unstubAllGlobals();}
 });
});

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), refresh: vi.fn(), log: vi.fn(), update: vi.fn(), apply: vi.fn(),
  ag: [{ id: 'ag1', pacienteId: 'p1', pacienteNome: 'PACIENTE TESTE', unidadeId: 'u1', profissionalId: 'prof1', profissionalNome: 'PROF TESTE', data: '2026-10-23', hora: '08:00', status: 'aguardando_triagem' }],
  queue: [{ id: 'ag1', pacienteId: 'p1', pacienteNome: 'PACIENTE TESTE', unidadeId: 'u1', profissionalId: 'prof1', status: 'aguardando_triagem', horaChegada: '08:00' }],
  patients: [{ id: 'p1', nome: 'PACIENTE TESTE' }], toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'tecnico1', nome: 'TECNICO', usuario: 'tecnico', role: 'triagem', unidadeId: 'u1' }, isGlobalAdmin: false }) }));
vi.mock('@/contexts/PacientesContext', () => ({ usePacientes: () => ({ pacientes: f.patients }) }));
vi.mock('@/contexts/AgendamentosContext', () => ({ useAgendamentos: () => ({ agendamentos: f.ag, updateAgendamento: f.update, applyCareFlowAgendamentoUpdate: f.apply, refreshAgendamentos: f.refresh }) }));
vi.mock('@/contexts/FilaContext', () => ({ useFila: () => ({ fila: f.queue, updateFila: f.update, refreshFila: f.refresh }) }));
vi.mock('@/contexts/OperacionalContext', () => ({ useOperacional: () => ({ logAction: f.log }) }));
vi.mock('@/hooks/useCustomFields', () => ({ useCustomFields: () => ({ resolved: { fields: [] } }) }));
vi.mock('@/components/TriageReconciliationPanel', () => ({ default: () => null }));
vi.mock('@/components/ui/slider', () => ({ Slider: () => null }));
vi.mock('@/components/ChamarPacienteButton', () => ({ default: () => null }));
vi.mock('@/components/CondicaoBadges', () => ({ default: () => null }));
vi.mock('@/components/triagem/MedicamentoBusca', () => ({ default: () => null }));
vi.mock('@/components/triagem/AlergiaBusca', () => ({ default: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (...args: any[]) => f.from(...args), rpc: (...args: any[]) => f.rpc(...args) } }));
vi.mock('sonner', () => ({ toast: f.toast }));
import Triagem from './Triagem';
beforeEach(() => {
  vi.clearAllMocks();
  f.from.mockImplementation(() => { const q: any = { select: () => q, eq: () => q, not: () => q, limit: () => q, maybeSingle: async () => ({ data: null, error: null }) }; return q; });
  f.refresh.mockResolvedValue(undefined); f.rpc.mockResolvedValue({ data: { already_processed: false, status: 'aguardando_triagem', agendamento: { id: 'ag1', status: 'aguardando_triagem' }, fila: { id: 'ag1' } }, error: null });
});
afterEach(cleanup);
async function open() { render(<Triagem />); fireEvent.click(screen.getByRole('button', { name: 'Iniciar triagem' })); await screen.findByLabelText('Peso (kg)'); }
describe('Triagem: bloqueio de valores antes da requisição', () => {
  it.each(['63000', '9999'])('peso %s bloqueia confirmação e rascunho sem enviar ficha', async value => {
    await open(); const calls = f.from.mock.calls.length; const rpcCalls = f.rpc.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value } });
    expect(screen.getByRole('alert')).toHaveTextContent('Peso inválido. Informe um valor entre 0,5 kg e 400 kg.');
    const confirm = screen.getByRole('button', { name: 'Seguir sem Enfermagem' });
    expect(confirm).toBeDisabled(); expect(screen.getByRole('button', { name: 'Salvar Rascunho' })).toBeDisabled();
    fireEvent.click(confirm); expect(f.rpc).toHaveBeenCalledTimes(rpcCalls); expect(f.from).toHaveBeenCalledTimes(calls);
  });
  it('aceita vírgula decimal e recupera o botão depois da correção', async () => {
    await open(); fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '63,0' } });
    fireEvent.change(screen.getByLabelText('Altura (cm ou m)'), { target: { value: '1,56' } });
    expect(screen.getByLabelText('Peso (kg)')).toHaveValue('63.0');
    expect(screen.getByLabelText('Altura (cm ou m)')).toHaveValue('1.56');
    expect(screen.getByRole('button', { name: 'Seguir sem Enfermagem' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Triagem: conclusão atômica e erros recuperáveis', () => {
  it('envia uma única RPC com valores normalizados e fecha somente após sucesso', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '63,0' } });
    fireEvent.change(screen.getByLabelText('Altura (cm ou m)'), { target: { value: '1,56' } });
    f.rpc.mockResolvedValueOnce({ data: { already_processed: false, status: 'apto_atendimento', agendamento: { id: 'ag1', status: 'apto_atendimento' }, fila: { id: 'ag1' } }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Seguir sem Enfermagem' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(f.rpc).toHaveBeenLastCalledWith('concluir_triagem_atendimento', expect.objectContaining({ p_tecnico_id: 'tecnico1', p_dados_triagem: expect.objectContaining({ peso: 63, altura: 156, imc: 25.89 }), p_encaminhar_enfermagem: false }));
    expect(f.update).not.toHaveBeenCalled(); expect(f.log).not.toHaveBeenCalled();
  });
  it('mantém os valores preenchidos e permite repetir depois do erro', async () => {
    await open(); fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '63' } });
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: '23514', message: 'Confira a altura' } });
    // Failure audit remains a separate diagnostic write, never a clinical fallback.
    f.from.mockReturnValueOnce({ insert: async () => ({ error: null }) });
    fireEvent.click(screen.getByRole('button', { name: 'Seguir sem Enfermagem' }));
    await waitFor(() => expect(f.toast.error).toHaveBeenCalledWith('Confira a altura'));
    expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(screen.getByLabelText('Peso (kg)')).toHaveValue('63');
    expect(screen.getByRole('button', { name: 'Seguir sem Enfermagem' })).toBeEnabled();
    expect(f.update).not.toHaveBeenCalled();
  });
});

import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  get: vi.fn(), save: vi.fn(), apply: vi.fn(), refresh: vi.fn(), attachments: vi.fn(),
}));
vi.mock('@/services/patientService', async importOriginal => {
  const original = await importOriginal<typeof import('@/services/patientService')>();
  return { patientService: { ...original.patientService, getById: mocks.get, savePacienteCadastro: mocks.save } };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/services/auditService', () => ({ auditService: {} }));
vi.mock('@/contexts/PacientesContext', () => ({ usePacientes: () => ({ applySavedPaciente: mocks.apply, refreshPacientes: mocks.refresh }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'recepcao', unidadeId: 'u1' } }) }));
vi.mock('@/components/PatientAttachmentManager', () => ({ default: () => { mocks.attachments(); return <div>Anexos carregados</div>; } }));
vi.mock('@/components/LogradouroDneAutocomplete', () => ({ default: () => null }));
vi.mock('@/components/MunicipioCombobox', () => ({ default: () => null }));
import { ConferirDadosPacienteModal } from './ConferirDadosPacienteModal';

const patient = { id: 'p1', nome: 'PACIENTE', data_nascimento: '1940-01-01', is_autista: false,
  is_gestante: false, is_pne: false, tipo_condicao: '', custom_data: {}, unidade_id: 'u1' };
function show(onConfirm = vi.fn(async () => {}), modo: 'chegada' | 'agendamento' = 'chegada') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  function Wrapper() {
    const [open, setOpen] = useState(true);
    return <QueryClientProvider client={client}><ConferirDadosPacienteModal open={open} onOpenChange={setOpen}
      pacienteId="p1" modo={modo} onConfirm={onConfirm} /></QueryClientProvider>;
  }
  render(<Wrapper />);
  return { client, onConfirm };
}
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks(); mocks.get.mockResolvedValue(patient);
  mocks.save.mockReset();
  mocks.save.mockImplementation(async (_id, form) => ({ ...patient, ...form }));
});
afterEach(cleanup);

describe('conferência de chegada e prioridades', () => {
  it.each(['agendamento', 'chegada'] as const)('mostra o sexo já cadastrado no modo %s', async modo => {
    mocks.get.mockResolvedValueOnce({ ...patient, sexo: 'F' });
    show(undefined, modo);
    expect(await screen.findByText('Feminino')).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('mantém o valor Ignorado visível quando já cadastrado', async () => {
    mocks.get.mockResolvedValueOnce({ ...patient, sexo: 'I' });
    show();
    expect(await screen.findByText('Ignorado')).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('salva a escolha no mesmo formato do cadastro principal', async () => {
    mocks.get.mockResolvedValueOnce({ ...patient, sexo: 'F' });
    show();
    const female = await screen.findByText('Feminino');
    fireEvent.click(female);
    fireEvent.click(await screen.findByRole('option', { name: 'Masculino' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar agora' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('p1', expect.objectContaining({ sexo: 'masculino' }), 'Confirmar Chegada'));
  });
  it('exibe e salva condição e prioridades antes de prosseguir com o novo agendamento', async () => {
    let finish!: (value: typeof patient) => void;
    mocks.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { onConfirm } = show(undefined, 'agendamento');
    expect(await screen.findByRole('heading', { name: 'Condição e Prioridade de Atendimento (Triagem)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'TEA' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Gestante' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'PNE — Pessoa com deficiência' }));
    expect(screen.getByRole('checkbox', { name: 'Autista (TEA)' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Confirmo que os dados foram conferidos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e continuar' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save).toHaveBeenCalledWith('p1', expect.objectContaining({
      tipo_condicao: 'tea', is_autista: true, is_gestante: true, is_pne: true,
    }), 'Novo Agendamento');
    expect(onConfirm).not.toHaveBeenCalled();
    await act(async () => finish({ ...patient, tipo_condicao: 'tea', is_autista: true, is_gestante: true, is_pne: true }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(mocks.apply.mock.invocationCallOrder[0]).toBeLessThan(onConfirm.mock.invocationCallOrder[0]);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it.each(['agendamento', 'chegada'] as const)('carrega TEA e prioridades já gravadas no modo %s', async modo => {
    mocks.get.mockResolvedValueOnce({ ...patient, tipo_condicao: 'tea', is_autista: true, is_gestante: true, is_pne: true });
    show(undefined, modo);
    expect(await screen.findByRole('radio', { name: 'TEA' })).toBeChecked();
    for (const name of ['Autista (TEA)', 'Gestante', 'PNE — Pessoa com deficiência']) {
      expect(screen.getByRole('checkbox', { name })).toBeChecked();
    }
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('salva a prioridade no agendamento pelo botão Salvar agora sem prosseguir', async () => {
    const { onConfirm } = show(undefined, 'agendamento');
    fireEvent.click(await screen.findByRole('radio', { name: 'Física' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'PNE — Pessoa com deficiência' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar agora' }));
    await waitFor(() => expect(mocks.apply).toHaveBeenCalled());
    expect(mocks.save).toHaveBeenCalledWith('p1', expect.objectContaining({ tipo_condicao: 'fisica', is_pne: true }), 'Novo Agendamento');
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it('exibe idade automática e só carrega anexos quando a seção é aberta', async () => {
    show();
    expect(await screen.findByText(/Prioridade Legal: Idoso/)).toBeInTheDocument();
    expect(mocks.attachments).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Documentos e Anexos (opcional)' }));
    expect(await screen.findByText('Anexos carregados')).toBeInTheDocument();
  });
  it('salva TEA e atualiza só o paciente antes de confirmar, sem aguardar refresh', async () => {
    const { onConfirm, client } = show();
    fireEvent.click(await screen.findByRole('radio', { name: 'TEA' }));
    expect(screen.getByRole('checkbox', { name: 'Autista (TEA)' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dados conferidos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Chegada' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][1]).toMatchObject({ tipo_condicao: 'tea', is_autista: true });
    expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', tipo_condicao: 'tea', is_autista: true }));
    expect(mocks.apply.mock.invocationCallOrder[0]).toBeLessThan(onConfirm.mock.invocationCallOrder[0]);
    expect(client.getQueryData(['pacientes', 'p1'])).toMatchObject({ is_autista: true });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('não confirma nem fecha quando o salvamento falha', async () => {
    mocks.save.mockRejectedValueOnce(new Error('falha de gravação'));
    const { onConfirm } = show();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Gestante' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dados conferidos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Chegada' }));
    await screen.findByText(/Erro ao salvar: falha de gravação/);
    expect(onConfirm).not.toHaveBeenCalled(); expect(mocks.apply).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('aguarda a confirmação real antes de fechar, sem regravar cadastro intacto', async () => {
    let finish!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    show(onConfirm);
    await screen.findByRole('checkbox', { name: 'Gestante' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dados conferidos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Chegada' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Processando…' })).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();
    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});


describe('mobilidade no modal de conferência da Agenda', () => {
  it('exibe opções de mobilidade e salva o dispositivo ao selecionar Física', async () => {
    const { onConfirm } = show(undefined, 'agendamento');
    fireEvent.click(await screen.findByRole('radio', { name: 'Física' }));
    expect(await screen.findByText('Mobilidade')).toBeInTheDocument();
    expect(screen.getByText('Usa dispositivo?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Mobilidade' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Cadeira de rodas' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Usa dispositivo?' }));
    fireEvent.change(screen.getByLabelText('Tipo de dispositivo'), { target: { value: 'Muleta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar agora' }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('p1', expect.objectContaining({
      tipo_condicao: 'fisica', mobilidade: 'cadeira_rodas', usa_dispositivo: true, tipo_dispositivo: 'Muleta',
    }), 'Novo Agendamento'));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ send: vi.fn(), rooms: [] as { nome: string }[], filters: [] as any[], success: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/painelChamadas', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/painelChamadas')>(); return { ...real, solicitarChamada: fixture.send };
});
vi.mock('sonner', () => ({ toast: { success: fixture.success, warning: fixture.warning, error: fixture.error } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
  const q = { select: () => q, eq: (key: string, value: unknown) => { fixture.filters.push([key, value]); return q; },
    order: () => q, then: (resolve: any) => Promise.resolve({ data: fixture.rooms, error: null }).then(resolve) }; return q;
} } }));
import ChamarPacienteButton from './ChamarPacienteButton';
beforeEach(() => { vi.clearAllMocks(); fixture.rooms = []; fixture.filters = []; localStorage.clear(); fixture.send.mockResolvedValue('recebida'); });
afterEach(cleanup);
async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Chamar paciente no painel' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Chamar no painel' })).toBeEnabled());
}
describe('botão de chamadas', () => {
  it('ignora a antiga sala global e conserva a sugestão específica da Triagem', async () => {
    localStorage.setItem('painel_chamadas_local', 'CONSULTORIO ANTIGO');
    render(<ChamarPacienteButton unidadeId="u1" pacienteNome="PACIENTE" defaultLocal="Sala de Triagem" />); await open();
    fireEvent.click(screen.getByRole('button', { name: 'Chamar no painel' }));
    await waitFor(() => expect(fixture.send).toHaveBeenCalledWith('u1', expect.objectContaining({ local: 'Sala de Triagem' })));
    expect(fixture.filters).toContainEqual(['ativo', true]);
  });
  it('pré-seleciona a sala cadastrada do profissional e mantém o seletor disponível', async () => {
    fixture.rooms = [{ nome: 'CONSULTÓRIO 3' }, { nome: 'CONSULTÓRIO 4' }];
    localStorage.setItem('painel_chamadas_local:u1:CONSULTÓRIO 3', 'CONSULTÓRIO 4');
    render(<ChamarPacienteButton unidadeId="u1" pacienteNome="PACIENTE" profissionalNome="PROFISSIONAL"
      defaultLocal="CONSULTÓRIO 3" priorizarSalaPadrao />);
    await open();
    expect(screen.getByText('CONSULTÓRIO 3')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Chamar no painel' }));
    await waitFor(() => expect(fixture.send).toHaveBeenCalledWith('u1', expect.objectContaining({
      local: 'CONSULTÓRIO 3', profissionalNome: 'PROFISSIONAL',
    })));
  });
  it('bloqueia Enter repetido e clique enquanto há envio em andamento', async () => {
    let finish!: (value: string) => void; fixture.send.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<ChamarPacienteButton unidadeId="u1" pacienteNome="PACIENTE" />); await open();
    const input = screen.getByPlaceholderText('Ex.: Consultório 3'); fireEvent.change(input, { target: { value: 'SALA 1' } });
    fireEvent.keyDown(input, { key: 'Enter' }); fireEvent.keyDown(input, { key: 'Enter' });
    expect(fixture.send).toHaveBeenCalledTimes(1); expect(screen.getByRole('button', { name: 'Chamando...' })).toBeDisabled();
    await act(async () => { finish('recebida'); });
  });
  it('não mostra sucesso se somente o servidor aceitou o evento', async () => {
    fixture.send.mockResolvedValue('nao_confirmada'); render(<ChamarPacienteButton unidadeId="u1" pacienteNome="PACIENTE" />); await open();
    fireEvent.change(screen.getByPlaceholderText('Ex.: Consultório 3'), { target: { value: 'SALA 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chamar no painel' }));
    await waitFor(() => expect(fixture.warning).toHaveBeenCalled()); expect(fixture.success).not.toHaveBeenCalled();
  });
});

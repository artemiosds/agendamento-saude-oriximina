import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CadastroEscala } from './EscalaInformativa';

const f = vi.hoisted(() => ({
  role: 'gestao',
  rpc: vi.fn(),
  staff: [{ id: 'p1', nome: 'Pessoa fictícia', unidadeId: 'u1', role: 'profissional', ativo: true }],
  units: [{ id: 'u1', nome: 'Unidade fictícia', ativo: true }],
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: f.role } }) }));
vi.mock('@/hooks/useUnidadeFilter', () => ({ useUnidadeFilter: () => ({
  isGlobalAdmin: false, userUnidadeId: 'u1', profissionaisVisiveis: f.staff, unidadesVisiveis: f.units,
}) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: f.rpc } }));

afterEach(() => { cleanup(); vi.resetAllMocks(); f.role = 'gestao'; });
function open() {
  const onSavedDate = vi.fn();
  const { container } = render(<CadastroEscala date="2026-11-23" entries={[]} onSavedDate={onSavedDate} />);
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar plantão / escala' }));
  return { form: within(container.querySelector('form')!), onSavedDate };
}

describe('cadastro informativo', () => {
  it('seleciona dias de meses diferentes, remove um dia e salva local e setor livres em uma chamada', async () => {
    f.rpc.mockResolvedValue({ data: 2, error: null });
    const { form, onSavedDate } = open();
    fireEvent.change(form.getByLabelText('Profissional'), { target: { value: 'Pessoa fictícia' } });
    fireEvent.change(form.getByLabelText(/Local de trabalho/), { target: { value: '  Maternidade Municipal  ' } });
    fireEvent.change(form.getByLabelText('Setor ou sala (opcional)'), { target: { value: 'Sala de Parto' } });
    fireEvent.change(form.getByLabelText('Turno'), { target: { value: 'manha' } });
    fireEvent.click(form.getByRole('gridcell', { name: '24' }));
    fireEvent.click(form.getByRole('gridcell', { name: '29' }));
    fireEvent.click(form.getByRole('button', { name: 'Próximo mês' }));
    fireEvent.click(form.getByRole('gridcell', { name: '4' }));
    fireEvent.click(form.getByRole('button', { name: 'Remover 24/11/2026' }));
    expect(f.rpc).not.toHaveBeenCalled();
    fireEvent.click(form.getByRole('button', { name: 'Salvar escala informativa' }));
    await waitFor(() => expect(form.getByRole('status').textContent).toBe('2 datas salvas na escala.'));
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.rpc).toHaveBeenCalledWith('salvar_escalas_personalizadas', expect.objectContaining({
      p_profissional: 'p1', p_unidade: null, p_local: 'Maternidade Municipal', p_setor: 'Sala de Parto',
      p_datas: ['2026-11-29', '2026-12-04'], p_inicio: '08:00', p_duracao: 240, p_semanal: false,
    }));
    expect(onSavedDate).toHaveBeenCalledWith('2026-11-29');
  });

  it('oferece atalhos do mês, limpar seleção e plantão de 24h com unidade existente', async () => {
    f.rpc.mockResolvedValue({ data: 1, error: null });
    const { form } = open();
    fireEvent.click(form.getByRole('button', { name: 'Segundas' }));
    expect(form.getByText('5 datas marcadas')).toBeTruthy();
    fireEvent.click(form.getByRole('button', { name: 'Terças' }));
    expect(form.getByText('9 datas marcadas')).toBeTruthy();
    fireEvent.click(form.getByRole('button', { name: 'Finais de semana' }));
    expect(form.getByText('18 datas marcadas')).toBeTruthy();
    fireEvent.click(form.getByRole('button', { name: 'Limpar seleção' }));
    expect(form.getByText('Nenhuma data marcada')).toBeTruthy();
    fireEvent.change(form.getByLabelText('Profissional'), { target: { value: 'Pessoa fictícia' } });
    fireEvent.change(form.getByLabelText(/Local de trabalho/), { target: { value: 'Unidade fictícia' } });
    fireEvent.change(form.getByLabelText('Turno'), { target: { value: 'plantao24' } });
    fireEvent.click(form.getByRole('gridcell', { name: '29' }));
    fireEvent.click(form.getByRole('button', { name: 'Salvar escala informativa' }));
    await waitFor(() => expect(f.rpc).toHaveBeenCalledWith('salvar_escalas_personalizadas', expect.objectContaining({
      p_unidade: 'u1', p_datas: ['2026-11-29'], p_inicio: '07:00', p_duracao: 1440,
    })));
  });

  it('mantém a recepção em modo de consulta', () => {
    f.role = 'recepcao';
    render(<CadastroEscala date="2026-11-23" entries={[]} onSavedDate={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Adicionar plantão / escala' })).toBeNull();
  });
});

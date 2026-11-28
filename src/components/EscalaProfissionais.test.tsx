import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Escala } from './EscalaProfissionais';

const f = vi.hoisted(() => ({ rpc: vi.fn(), print: vi.fn(), toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: f.rpc } }));
vi.mock('@/lib/printLayout', () => ({ openPrintDocument: f.print }));
vi.mock('sonner', () => ({ toast: { error: f.toast } }));
vi.mock('./EscalaInformativa', () => ({ CadastroEscala: () => null }));
vi.mock('./EscalaPeriodo', () => ({ EscalaPeriodo: ({ onChange }: { onChange: (date: string) => void }) => <button onClick={() => onChange('2026-11-01')}>Novembro de 2026</button> }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'master1', nome: 'Master local', role: 'master', unidadeId: 'u1' } }) }));
vi.mock('@/hooks/useUnidadeFilter', () => ({ useUnidadeFilter: () => ({
  isGlobalAdmin: false, userUnidadeId: 'u1',
  unidadesVisiveis: [{ id: 'u1', nome: 'Unidade local' }, { id: 'u2', nome: 'OUTRA UNIDADE' }],
  salasVisiveis: [{ id: 's1', nome: 'Sala de teste' }],
}) }));
vi.mock('@/contexts/PermissionsContext',()=>({usePermissions:()=>({loading:false,can:(module:string,action:string)=>module==='disponibilidade'&&['can_view','can_edit','can_delete'].includes(action)})}));
vi.mock('@/contexts/OperacionalContext', () => ({ useOperacional: () => ({
  configuracoes:{},refreshDisponibilidades:vi.fn(),refreshBloqueios:vi.fn(),refreshFuncionarios:vi.fn(),refreshConfiguracoes:vi.fn(),
  funcionarios: [
    { id: 'p1', nome: 'Profissional local', ativo: true, role: 'profissional', unidadeId: 'u1', profissao: 'Fisioterapia', cbo: '223605' },
    { id: 'p2', nome: 'PESSOA DE OUTRA UNIDADE', ativo: true, role: 'profissional', unidadeId: 'u2' },
  ],
  disponibilidades: ['u1', 'u2'].map((unit, index) => ({ id: 'g' + index, unidadeId: unit, profissionalId: 'p' + (index + 1), salaId: 's1',
    diasSemana: [0, 1, 2, 3, 4, 5, 6], dataInicio: '2020-01-01', horaInicio: '08:00', horaFim: '12:00', vagasPorHora: 0 })),
  bloqueios: [{ id: 'b1', unidadeId: 'u1', dataInicio: '2026-11-02', dataFim: '2026-11-02', diaInteiro: true, titulo: 'Feriado de teste' }],
}) }));

beforeEach(() => { vi.clearAllMocks(); f.rpc.mockResolvedValue({ data: [], error: null }); f.print.mockResolvedValue(undefined); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function monthly() {
  render(<Escala />);
  fireEvent.click(screen.getByRole('button', { name: 'Novembro de 2026' }));
  fireEvent.click(screen.getByRole('button', { name: /^Mensal$/ }));
  const print = screen.getByRole('button', { name: 'Imprimir Escala Oficial (A4)' });
  await waitFor(() => expect(print).toBeEnabled());
  return print;
}

describe('Escala: integração com impressão', () => {
  it('usa o calendário filtrado da unidade, mantém feriado e encaminha ao utilitário institucional', async () => {
    fireEvent.click(await monthly());
    await waitFor(() => expect(f.print).toHaveBeenCalledTimes(1));
    const [title, body, meta] = f.print.mock.calls[0];
    const dom = new DOMParser().parseFromString(body, 'text/html');
    expect(title).toBe('ESCALA MENSAL DOS PROFISSIONAIS - NOVEMBRO / 2026');
    expect(meta.Período).toBe('01/11/2026 a 30/11/2026');
    expect(meta['Emitido por']).toBe('Master local');
    expect(dom.querySelectorAll('.escala-days th')).toHaveLength(32);
    expect(body).toContain('Profissional local');
    expect(body).not.toContain('PESSOA DE OUTRA UNIDADE');
    expect(body).not.toContain('OUTRA UNIDADE');
    expect(dom.querySelector('tbody .escala-total')?.textContent).toBe('116h');
    expect(body).toContain('Feriado de teste');
    expect(f.rpc.mock.calls.every(([name]) => name === 'listar_escalas_personalizadas')).toBe(true);
  });

  it('não imprime um período cuja fonte de escalas manuais falhou', async () => {
    f.rpc.mockResolvedValue({ data: null, error: new Error('Falha de rede') });
    render(<Escala />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
    expect(screen.getByRole('button', { name: 'Imprimir Escala Oficial (A4)' })).toBeDisabled();
    expect(f.print).not.toHaveBeenCalled();
  });

  it('trata falha de impressão e permite nova tentativa sem gravar no banco', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    f.print.mockRejectedValueOnce(new Error('Impressora indisponível'));
    fireEvent.click(await monthly());
    await waitFor(() => expect(f.toast).toHaveBeenCalledWith('Não foi possível preparar a escala. Tente novamente.'));
    const button = screen.getByRole('button', { name: 'Imprimir Escala Oficial (A4)' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(f.print).toHaveBeenCalledTimes(2));
    expect(f.rpc.mock.calls.every(([name]) => name === 'listar_escalas_personalizadas')).toBe(true);
  });
});

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CockpitUnidade from './CockpitUnidade';
import type { ChamadaPaciente } from '@/lib/painelChamadas';

const fixture = vi.hoisted(() => ({
  feed: vi.fn(), scope: { isGlobalAdmin: false, userUnidadeId: 'local' }, observe: vi.fn(),
  salas: [{ id: 's', unidadeId: 'local', nome: 'Sala teste', ativo: true }, { id: 'x', unidadeId: 'outra', nome: 'Sala externa', ativo: true }],
}));
vi.mock('./useCockpitFeed', () => ({ useCockpitFeed: fixture.feed }));
vi.mock('@/hooks/useUnidadeFilter', () => ({ useUnidadeFilter: () => ({
  ...fixture.scope, unidadesVisiveis: [{ id: 'outra', nome: 'Outra unidade' }, { id: 'local', nome: 'Unidade teste' }],
}) }));
vi.mock('@/contexts/OperacionalContext', () => ({ useOperacional: () => ({
  funcionarios: [{ id: 'f', role: 'profissional', nome: 'Profissional teste', profissao: 'Nutrição', unidadeId: 'local', salaId: 's', ativo: true }],
  salas: fixture.salas,
}) }));
vi.mock('@/lib/painelChamadas', () => ({ observarChamadas: fixture.observe }));

const a = { id: 'ag', paciente_id: 'p', paciente_nome: 'Paciente teste', sala_id: 's', profissional_id: 'f', profissional_nome: 'Profissional teste', tipo: 'Consulta' };
function setup(status: string, options: { rows?: unknown[]; arrivals?: Record<string,string>; starts?: Record<string,string>; triage?: unknown[] } = {}) {
  fixture.observe.mockImplementation(() => () => {});
  fixture.feed.mockReturnValue({
    rows: options.rows ?? [{ ...a, status }], triage: options.triage ?? [], arrivals: options.arrivals ?? {},
    starts: options.starts ?? {}, online: true, reload: vi.fn(),
  });
}
const consult = () => screen.getByRole('button', { name: /Sala teste\./ });
const close = () => fireEvent.click(screen.getByRole('button', { name: 'Fechar detalhes' }));

afterEach(() => {
  cleanup();
  fixture.scope.isGlobalAdmin = false;
  fixture.salas.splice(2);
  vi.clearAllMocks();
});

it('move o paciente na planta e mostra horários e histórico só nos detalhes', () => {
  const start = new Date(Date.now() - 18 * 60000 - 1000).toISOString();
  setup('apto_atendimento', { arrivals: { ag: start } });
  const page = render(<CockpitUnidade />);
  expect(fixture.feed.mock.calls[0][0]).toBe('local');
  expect(screen.queryByRole('button', { name: /Sala externa/ })).toBeNull();
  const reception = screen.getByRole('button', { name: /Recepção e sala de espera\. 1 aguardando/ });
  expect(reception.querySelector('[data-papel=paciente]')).toBeTruthy();
  expect(screen.queryByText('Paciente teste')).toBeNull();
  fireEvent.keyDown(reception, { key: 'Enter' });
  expect(within(screen.getByRole('dialog')).getByText('18 min de espera').closest('li')?.getAttribute('data-tone')).toBe('warning');
  close();

  setup('chamado');
  page.rerender(<CockpitUnidade />);
  expect(consult().getAttribute('data-state')).toBe('calling');
  fireEvent.click(consult());
  expect(within(screen.getByRole('dialog')).getByText('Paciente teste')).toBeTruthy();

  setup('em_atendimento', { starts: { ag: start } });
  page.rerender(<CockpitUnidade />);
  expect(within(consult()).getByText('Em atendimento · 18 min')).toBeTruthy();
  expect(consult().querySelector('[data-papel=paciente]')).toBeTruthy();
  expect(within(screen.getByRole('dialog')).getByText('18 min em atendimento')).toBeTruthy();

  setup('concluido');
  page.rerender(<CockpitUnidade />);
  expect(consult().getAttribute('data-state')).toBe('free');
  expect(consult().querySelector('[data-papel=paciente]')).toBeNull();
  expect(within(screen.getByRole('dialog')).getByText('Histórico de hoje · 1')).toBeTruthy();
  close();
  expect(screen.queryByText('Paciente teste')).toBeNull();
});

it('usa a chamada do painel sem ler eventos de outra unidade', () => {
  setup('apto_atendimento');
  render(<CockpitUnidade />);
  const receiver: (payload: ChamadaPaciente) => void = fixture.observe.mock.calls[0][1];
  const call = { id: 'c', local: 'SALA TESTE', pacienteNome: 'Paciente teste', criadoEm: new Date().toISOString() };
  act(() => receiver({ ...call, unidadeId: 'outra' }));
  expect(consult().getAttribute('data-state')).toBe('free');
  act(() => receiver({ ...call, unidadeId: 'local' }));
  expect(consult().getAttribute('data-state')).toBe('calling');
  expect(screen.queryByText('Paciente teste')).toBeNull();
});

it('mostra prioridade e procedimento no setor correto sem duplicar o paciente', () => {
  const now = new Date().toISOString();
  setup('', {
    rows: [
      { ...a, status: 'confirmado_chegada' },
      { ...a, id: 'med', paciente_nome: 'Paciente em medicação', tipo: 'Medicação', nome_procedimento: 'Infusão registrada', status: 'em_atendimento' },
    ],
    triage: [{ agendamento_id: 'ag', iniciado_em: now, confirmado_em: null, classificacao_risco: 'Laranja' }],
  });
  render(<CockpitUnidade />);
  expect(screen.getByRole('button', { name: /Triagem\. Prioridade laranja/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Recepção e sala de espera\. 0 aguardando/ })).toBeTruthy();
  const procedure = screen.getByRole('button', { name: /Medicação e sessões\. 1 em andamento/ });
  expect(procedure.querySelector('[data-papel=medicacao]')).toBeTruthy();
  expect(consult().querySelector('[data-papel=paciente]')).toBeNull();
  fireEvent.click(procedure);
  expect(within(screen.getByRole('dialog')).getByText('Infusão registrada · Sala teste')).toBeTruthy();
});

it('sinaliza gargalo apenas com mais de três pacientes distintos e mais de 20 minutos de espera', () => {
  const rows = Array.from({ length: 4 }, (_, i) => ({ ...a, id: 'a' + i, paciente_id: 'p' + i, status: 'apto_atendimento' }));
  const arrivals = Object.fromEntries(rows.map(row => [row.id, new Date(Date.now() - 25 * 60000).toISOString()]));
  setup('', { rows: rows.slice(0, 3), arrivals });
  const page = render(<CockpitUnidade />);
  expect(consult().getAttribute('data-state')).toBe('free');
  setup('', { rows, arrivals });
  page.rerender(<CockpitUnidade />);
  expect(consult().getAttribute('data-state')).toBe('bottleneck');
});

it('global alterna unidades e o telão não inclui nomes, detalhes ou seletor de unidade', () => {
  fixture.scope.isGlobalAdmin = true;
  setup('chamado');
  const { container } = render(<CockpitUnidade />);
  fireEvent.change(screen.getByLabelText('Unidade'), { target: { value: 'local' } });
  expect(fixture.feed.mock.lastCall?.[0]).toBe('local');
  expect(screen.queryByRole('button', { name: /Sala externa/ })).toBeNull();
  fireEvent.click(consult());
  expect(screen.getByText('Paciente teste')).toBeTruthy();
  close();
  fireEvent.click(screen.getByRole('button', { name: 'Modo telão' }));
  expect(container.querySelector('[data-telao]')?.getAttribute('data-telao')).toBe('true');
  expect(screen.queryByRole('button', { name: /Sala teste/ })).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(container.textContent).not.toContain('Paciente teste');
  expect(container.textContent).not.toContain('Profissional teste');
  expect(screen.queryByLabelText('Unidade')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Sair do modo telão' }));
  expect(container.querySelector('[data-telao]')?.getAttribute('data-telao')).toBe('false');
  expect(consult()).toBeTruthy();
});

it('mantém a visão compacta com mais de cinco consultórios sem omitir os demais', () => {
  for (let i = 1; i <= 7; i++) fixture.salas.push({ id: 'r' + i, nome: 'Consultório ' + i, ativo: true, unidadeId: 'local' });
  setup('', { rows: [] });
  render(<CockpitUnidade />);
  expect(screen.getByText('0/8')).toBeTruthy();
  expect(screen.getByText('Consultórios 1/2')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Consultório 7/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Próximos consultórios' }));
  expect(screen.getByRole('button', { name: /Consultório 7/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Consultório 1\./ })).toBeNull();
});

it('agrupa recepção cheia sem esconder o total ou impedir consultar toda a fila', () => {
  setup('', { rows: Array.from({ length: 20 }, (_, i) => ({ ...a, id: 'r' + i, paciente_id: 'p' + i, paciente_nome: 'Pessoa ' + i, status: 'chegou' })) });
  render(<CockpitUnidade />);
  const reception = screen.getByRole('button', { name: /Recepção e sala de espera\. 20 aguardando/ });
  expect(reception.querySelectorAll('[data-papel=paciente]').length).toBe(16);
  expect(screen.getByText('20 aguardando · +4')).toBeTruthy();
  fireEvent.click(reception);
  const drawer = screen.getByRole('dialog');
  expect(within(drawer).getAllByRole('listitem').length).toBe(12);
  fireEvent.click(within(drawer).getByRole('button', { name: 'Ver mais (8)' }));
  expect(within(drawer).getAllByRole('listitem').length).toBe(20);
});

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CockpitUnidade from './CockpitUnidade';
import type { ChamadaPaciente } from '@/lib/painelChamadas';

const fixture = vi.hoisted(() => ({
  feed: vi.fn(),
  scope: { isGlobalAdmin: false, userUnidadeId: 'local' },
  observe: vi.fn(),
}));
vi.mock('./useCockpitFeed', () => ({ useCockpitFeed: fixture.feed }));
vi.mock('@/hooks/useUnidadeFilter', () => ({ useUnidadeFilter: () => ({
  ...fixture.scope, unidadesVisiveis: [{ id: 'outra', nome: 'Outra unidade' }, { id: 'local', nome: 'Unidade teste' }],
}) }));
vi.mock('@/contexts/OperacionalContext', () => ({ useOperacional: () => ({
  funcionarios: [{ id: 'f', role: 'profissional', nome: 'Profissional teste', profissao: 'Nutrição', unidadeId: 'local', salaId: 's', ativo: true }],
  salas: [{ id: 's', unidadeId: 'local', nome: 'Sala teste', ativo: true }, { id: 'x', unidadeId: 'outra', nome: 'Sala externa', ativo: true }],
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

afterEach(() => {
  cleanup();
  fixture.scope.isGlobalAdmin = false;
  vi.clearAllMocks();
});

it('move o paciente entre espera, chamada, consulta e conclusão na unidade selecionada', () => {
  const start = new Date(Date.now() - 18 * 60000).toISOString();
  setup('apto_atendimento', { arrivals: { ag: start } });
  const page = render(<CockpitUnidade />);
  expect(fixture.feed.mock.calls[0][0]).toBe('local');
  expect(screen.queryByText('Sala externa')).toBeNull();
  expect(screen.getByText('Recepção · 1 aguardando')).toBeTruthy();
  expect(screen.getByText('18 min de espera').getAttribute('data-tone')).toBe('warning');
  expect(page.container.querySelector('#cockpit-recepcao [data-papel=paciente]')).toBeTruthy();

  setup('chamado');
  page.rerender(<CockpitUnidade />);
  const room = screen.getByRole('article');
  expect(room.getAttribute('data-state')).toBe('calling');
  expect(within(room).getByText('Paciente teste')).toBeTruthy();

  setup('em_atendimento', { starts: { ag: start } });
  page.rerender(<CockpitUnidade />);
  expect(within(room).getByText('Em atendimento')).toBeTruthy();
  expect(within(room).getByText('18 min em atendimento')).toBeTruthy();
  expect(room.querySelector('[data-papel=paciente]')).toBeTruthy();

  setup('concluido');
  page.rerender(<CockpitUnidade />);
  expect(within(room).getByText('Livre')).toBeTruthy();
  expect(room.querySelector('[data-papel=paciente]')).toBeNull();
  expect(within(room).getByText('Histórico de hoje · 1')).toBeTruthy();
});

it('escuta a chamada efêmera do painel e recusa um evento de outra unidade', () => {
  setup('apto_atendimento');
  render(<CockpitUnidade />);
  const receiver: (payload: ChamadaPaciente) => void = fixture.observe.mock.calls[0][1];
  const call = { id: 'c', local: 'SALA TESTE', pacienteNome: 'Paciente teste', criadoEm: new Date().toISOString() };
  act(() => receiver({ ...call, unidadeId: 'outra' }));
  expect(screen.getByRole('article').getAttribute('data-state')).toBe('free');
  act(() => receiver({ ...call, unidadeId: 'local' }));
  expect(screen.getByRole('article').getAttribute('data-state')).toBe('calling');
});

it('mostra a prioridade gravada na triagem e o procedimento em andamento no setor correto', () => {
  const now = new Date().toISOString();
  setup('', {
    rows: [
      { ...a, status: 'confirmado_chegada' },
      { ...a, id: 'med', paciente_nome: 'Paciente em medicação', tipo: 'Medicação', nome_procedimento: 'Infusão registrada', status: 'em_atendimento' },
    ],
    triage: [{ agendamento_id: 'ag', iniciado_em: now, confirmado_em: null, classificacao_risco: 'Laranja' }],
  });
  const page = render(<CockpitUnidade />);
  expect(screen.getByText('Classificando')).toBeTruthy();
  expect(screen.getByText('Prioridade laranja').getAttribute('data-risk')).toBe('laranja');
  expect(screen.getByText('Recepção · 0 aguardando')).toBeTruthy();
  expect(screen.getByText('Infusão registrada · Sala teste')).toBeTruthy();
  expect(page.container.querySelector('#cockpit-procedimentos [data-papel=medicacao]')).toBeTruthy();
  expect(screen.getByRole('article').querySelector('[data-papel=paciente]')).toBeNull();
});

it('sinaliza gargalo apenas com mais de três pacientes distintos e espera superior a 20 minutos', () => {
  const rows = Array.from({ length: 4 }, (_, i) => ({ ...a, id: 'a' + i, paciente_id: 'p' + i, status: 'apto_atendimento' }));
  const arrivals = Object.fromEntries(rows.map(row => [row.id, new Date(Date.now() - 25 * 60000).toISOString()]));
  setup('', { rows: rows.slice(0, 3), arrivals });
  const page = render(<CockpitUnidade />);
  expect(screen.getByRole('article').getAttribute('data-state')).toBe('free');
  setup('', { rows, arrivals });
  page.rerender(<CockpitUnidade />);
  expect(screen.getByRole('article').getAttribute('data-state')).toBe('bottleneck');
});

it('admin global alterna unidades e o modo telão pode ser fechado', () => {
  fixture.scope.isGlobalAdmin = true;
  setup('', { rows: [] });
  const { container } = render(<CockpitUnidade />);
  fireEvent.change(screen.getByLabelText('Unidade'), { target: { value: 'local' } });
  expect(fixture.feed.mock.lastCall?.[0]).toBe('local');
  expect(screen.queryByText('Sala externa')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Modo telão / Tela cheia' }));
  expect(container.querySelector('main')?.getAttribute('data-telao')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Sair do modo telão' }));
  expect(container.querySelector('main')?.getAttribute('data-telao')).toBe('false');
});

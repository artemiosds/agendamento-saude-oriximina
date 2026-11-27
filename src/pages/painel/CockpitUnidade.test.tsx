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
  fixture.observe.mockImplementation((_unit, _receive, connected) => { connected?.(true); return () => {}; });
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

it('mostra prioridade, procedimento no resumo e ocupação na sala vinculada', () => {
  const now = new Date().toISOString();
  setup('', {
    rows: [
      { ...a, status: 'confirmado_chegada' },
      { ...a, id: 'med', paciente_nome: 'Paciente em medicação', tipo: 'Medicação', nome_procedimento: 'Infusão registrada', status: 'em_atendimento' },
    ],
    triage: [{ agendamento_id: 'ag', iniciado_em: now, confirmado_em: null, classificacao_risco: 'Laranja' }],
  });
  render(<CockpitUnidade />);
  expect(screen.getByRole('button', { name: /Em classificação Prioridade laranja/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Recepção e sala de espera\. 0 aguardando/ })).toBeTruthy();
  const procedure = screen.getByRole('button', { name: /Medicação e sessões\. 1 em andamento/ });
  expect(procedure.querySelector('[data-papel=medicacao]')).toBeTruthy();
  expect(consult().querySelectorAll('[data-papel=paciente]')).toHaveLength(1);
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

it('mostra todos os consultórios e demais salas ativas cadastradas, inclusive na segunda fileira', () => {
  for (let i = 1; i <= 7; i++) fixture.salas.push({ id: 'r' + i, nome: 'Consultório ' + i, ativo: true, unidadeId: 'local' });
  fixture.salas.push({ id: 't', nome: 'TRIAGEM', ativo: true, unidadeId: 'local' },
    { id: 'inativa', nome: 'Sala desativada', ativo: false, unidadeId: 'local' });
  setup('', { rows: [] });
  const view = render(<CockpitUnidade />);
  expect(screen.getByText('0/9')).toBeTruthy();
  expect(screen.getByText(/9 salas ativas cadastradas/)).toBeInTheDocument();
  expect(view.container.querySelector('[data-map-zone="t"]')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Consultório 7\./ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Consultório 1\./ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Sala desativada|Sala externa/ })).not.toBeInTheDocument();
});

it('usa a sala real da Agenda para sessões e sinaliza vínculos a salas de outra unidade', () => {
  fixture.salas.push({ id: 'curativo', nome: 'Sala de Curativos', ativo: true, unidadeId: 'local' });
  setup('em_atendimento', { rows: [
    { ...a, sala_id: 'curativo', tipo: 'Sessão', status: 'em_atendimento' },
    { ...a, id: 'fora', sala_id: 'x', paciente_nome: 'Paciente sem sala local', status: 'em_atendimento' },
  ] });
  const view = render(<CockpitUnidade />);
  const room = view.container.querySelector('[data-map-zone="curativo"]') as SVGElement;
  expect(room).toHaveAttribute('data-state', 'occupied');
  fireEvent.click(room);
  expect(within(screen.getByRole('dialog')).getByText('Paciente teste')).toBeInTheDocument();
  close();
  fireEvent.click(screen.getByRole('button', { name: '1 em atendimento sem sala' }));
  expect(within(screen.getByRole('dialog')).getByText('Paciente sem sala local')).toBeInTheDocument();
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

it('abre só os pacientes do alerta, registra ciência nesta tela e remove o alerta resolvido', async () => {
  const older = new Date(Date.now() - 95 * 60_000).toISOString();
  const recent = new Date(Date.now() - 5 * 60_000).toISOString();
  const overdue = { ...a, status: 'em_atendimento', iniciado_em: older };
  const current = { ...a, id: 'outro', paciente_id: 'outro', paciente_nome: 'Paciente dentro do tempo', status: 'em_atendimento', iniciado_em: recent };
  setup('em_atendimento', { rows: [overdue, current] });
  const page = render(<CockpitUnidade />);
  const details = screen.getByRole('button', { name: 'Ver detalhes de Sala teste' });
  expect(consult()).toHaveAttribute('data-alert', 'danger');
  const acknowledge = screen.getByRole('button', { name: 'Ciente de Sala teste' });
  fireEvent.click(acknowledge);
  expect(acknowledge).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(details);
  const drawer = screen.getByRole('dialog');
  expect(within(drawer).getByText('Paciente teste')).toBeInTheDocument();
  expect(within(drawer).queryByText('Paciente dentro do tempo')).not.toBeInTheDocument();
  fireEvent.click(within(drawer).getByText('Jornada do paciente'));
  expect(await within(drawer).findByText('Atendimento iniciado')).toBeInTheDocument();
  expect(drawer.querySelector('time')).toHaveAttribute('datetime', older);
  close();
  setup('em_atendimento', { rows: [current] });
  page.rerender(<CockpitUnidade />);
  expect(screen.queryByRole('button', { name: 'Ver detalhes de Sala teste' })).not.toBeInTheDocument();
  setup('em_atendimento', { rows: [overdue, current] });
  page.rerender(<CockpitUnidade />);
  expect(screen.getByRole('button', { name: 'Ciente de Sala teste' })).toHaveAttribute('aria-pressed', 'false');
});

it('separa as etapas com seus próprios horários e mantém só a sala de triagem cadastrada na planta', () => {
  fixture.salas.push({ id: 'triagem-fisica', nome: 'Triagem', ativo: true, unidadeId: 'local' });
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
  const ready = { ...a, id: 'apto', paciente_nome: 'Pessoa apta', status: 'apto_atendimento' };
  setup('', {
    rows: [{ ...a, status: 'chegou' }, ready],
    arrivals: { [a.id]: minutesAgo(25), apto: minutesAgo(40) },
    triage: [{ agendamento_id: 'apto', iniciado_em: minutesAgo(20), confirmado_em: minutesAgo(8), classificacao_risco: 'Verde' }],
  });
  render(<CockpitUnidade />);
  const map = screen.getByRole('group', { name: 'Planta da unidade' });
  expect(within(map).getAllByRole('button', { name: /^Triagem\./ })).toHaveLength(1);
  expect(screen.getByRole('button', { name: /Aguardando triagem Até 25 min desde a chegada/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Aptos para consulta Até 8 min desde a classificação/ }));
  const drawer = screen.getByRole('dialog');
  expect(within(drawer).getByText('Pessoa apta')).toBeInTheDocument();
  expect(within(drawer).queryByText('Paciente teste')).not.toBeInTheDocument();
});

it('limita a exibição inicial de alertas sem esconder seu total', () => {
  const rows = Array.from({ length: 5 }, (_, i) => {
    const id = 'alert-room-' + i;
    fixture.salas.push({ id, nome: 'Sala ' + i, ativo: true, unidadeId: 'local' });
    return { ...a, id, sala_id: id, status: 'em_atendimento', iniciado_em: new Date(Date.now() - 95 * 60000).toISOString() };
  });
  setup('', { rows });
  render(<CockpitUnidade />);
  expect(screen.getByText('5 ativos · 5 críticos')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Ver detalhes de Sala/ })).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Ver mais alertas (2)' }));
  expect(screen.getAllByRole('button', { name: /Ver detalhes de Sala/ })).toHaveLength(5);
});

it('separa título e especialidade em linhas delimitadas mesmo com cinco salas por fileira', () => {
  fixture.salas.push({ id: 'fono', nome: 'FONOAUDIOLOGIA 2', ativo: true, unidadeId: 'local' });
  for (let i = 0; i < 3; i++) fixture.salas.push({ id: 'extra' + i, nome: 'Consultório ' + i, ativo: true, unidadeId: 'local' });
  setup('em_atendimento', { rows: [{ ...a, sala_id: 'fono', status: 'em_atendimento' }] });
  render(<CockpitUnidade />);
  const room = screen.getByRole('button', { name: /^FONOAUDIOLOGIA 2\./ });
  const title = within(room).getByText('FONOAUDIOLOGIA 2', { selector: 'text' });
  const specialty = within(room).getByText('Nutrição', { selector: 'text' });
  expect(title.parentElement).toBe(specialty.parentElement);
  expect(title.parentElement?.tagName.toLowerCase()).toBe('svg');
  expect(title.parentElement).toHaveAttribute('overflow', 'hidden');
  expect(Number(specialty.getAttribute('y')) - Number(title.getAttribute('y'))).toBeGreaterThanOrEqual(13);
  fireEvent.click(room);
  expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'FONOAUDIOLOGIA 2' })).toBeInTheDocument();
});

it('abre o histórico real de triagem na sala cadastrada mesmo quando a consulta usa outro consultório ou já terminou', () => {
  fixture.salas.push({ id: 'triagem-fisica', nome: 'Triagem', ativo: true, unidadeId: 'local' });
  const now = new Date().toISOString();
  setup('', { rows: [
    { ...a, status: 'concluido' },
    { ...a, id: 'apto', paciente_nome: 'Pessoa classificada', status: 'apto_atendimento' },
    { ...a, id: 'rascunho', status: 'chegou' },
    { ...a, id: 'antiga', status: 'concluido' },
  ], triage: [
    { agendamento_id: a.id, iniciado_em: now, confirmado_em: now, classificacao_risco: 'verde', tecnico_id: 'f' },
    { agendamento_id: 'apto', iniciado_em: now, confirmado_em: now, classificacao_risco: 'amarelo' },
    { agendamento_id: 'rascunho', iniciado_em: now, confirmado_em: null },
    { agendamento_id: 'antiga', confirmado_em: '2020-01-01T12:00:00Z' },
    { agendamento_id: 'sem-vinculo-na-unidade', confirmado_em: now },
  ] });
  render(<CockpitUnidade />);
  const room = screen.getByRole('button', { name: /^Triagem\./ });
  expect(within(room).queryByText('0 concluídos')).not.toBeInTheDocument();
  fireEvent.click(room);
  const drawer = screen.getByRole('dialog');
  expect(within(drawer).getByRole('heading', { name: 'Triagens concluídas hoje · 2' })).toBeInTheDocument();
  expect(within(drawer).getByText(/O registro de triagem não identifica a sala física/)).toBeInTheDocument();
  expect(within(drawer).getByText('Pessoa classificada')).toBeInTheDocument();
  expect(within(drawer).getByText(/Prioridade verde · Profissional teste/)).toBeInTheDocument();
  expect(within(drawer).getByText('1 em classificação')).toBeInTheDocument();
  close();
  fireEvent.click(screen.getByRole('button', { name: /Em classificação/ }));
  expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Triagens concluídas hoje · 2' })).toBeInTheDocument();
});

it('não inventa uma sala para o histórico quando há mais de uma triagem cadastrada', () => {
  fixture.salas.push({ id: 't1', nome: 'Triagem 1', ativo: true, unidadeId: 'local' },
    { id: 't2', nome: 'Triagem 2', ativo: true, unidadeId: 'local' });
  const now = new Date().toISOString();
  setup('concluido', { triage: [{ agendamento_id: a.id, confirmado_em: now }] });
  render(<CockpitUnidade />);
  for (const name of [/^Triagem 1\./, /^Triagem 2\./]) {
    fireEvent.click(screen.getByRole('button', { name }));
    expect(within(screen.getByRole('dialog')).getByText(/Resumo da triagem da unidade/)).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Triagens concluídas hoje · 1' })).toBeInTheDocument();
    close();
  }
});

it('não anuncia fluxo ao vivo quando o canal de chamadas está desconectado', () => {
  setup('', { rows: [] });
  render(<CockpitUnidade />);
  expect(screen.getByRole('status')).toHaveTextContent('Ao vivo · Fluxo da unidade');
  const connection: (connected: boolean) => void = fixture.observe.mock.calls[0][2];
  act(() => connection(false));
  expect(screen.getByRole('status')).toHaveTextContent('Sincronização parcial');
  expect(screen.getByRole('status')).toHaveTextContent('Chamadas');
  expect(screen.getByRole('status')).toHaveAttribute('data-online','false');
  act(() => connection(true));
  expect(screen.getByRole('status')).toHaveTextContent('Ao vivo · Fluxo da unidade');
});

it('recolhe e expande os alertas sem perder contagem, detalhes ou ciência', () => {
  const older = new Date(Date.now() - 95 * 60000).toISOString();
  setup('em_atendimento', { rows: [{ ...a, status: 'em_atendimento', iniciado_em: older }] });
  render(<CockpitUnidade />);
  fireEvent.click(screen.getByRole('button', { name: 'Ciente de Sala teste' }));
  const toggle = screen.getByRole('button', { name: 'Recolher' });
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(toggle);
  expect(screen.getByText('1 ativos · 1 críticos')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Ver detalhes de Sala teste' })).not.toBeInTheDocument();
  const expand = screen.getByRole('button', { name: 'Expandir' });
  expect(expand).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(expand);
  expect(screen.getByRole('button', { name: 'Ciente de Sala teste' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Ver detalhes de Sala teste' })).toBeInTheDocument();
});

it('diferencia os ambientes ilustrados sem alterar vínculo, ocupação ou abertura de detalhes', () => {
  fixture.salas.push({ id: 'fisio', nome: 'Ginásio de Fisioterapia', ativo: true, unidadeId: 'local' },
    { id: 'fono', nome: 'Fonoaudiologia 2', ativo: true, unidadeId: 'local' },
    { id: 'odonto', nome: 'Odontologia', ativo: true, unidadeId: 'local' });
  setup('em_atendimento', { rows: [{ ...a, sala_id: 'fisio', status: 'em_atendimento' }] });
  const { container } = render(<CockpitUnidade />);
  const physio = container.querySelector('[data-map-zone="fisio"]') as SVGElement;
  expect(physio.querySelector('[data-room-layout="physio"]')).toBeInTheDocument();
  expect(physio).toHaveAttribute('data-state', 'occupied');
  expect(physio.querySelectorAll('[data-papel="paciente"]')).toHaveLength(1);
  expect(container.querySelector('[data-map-zone="fono"] [data-room-layout="speech"]')).toBeInTheDocument();
  expect(container.querySelector('[data-map-zone="odonto"] [data-room-layout="dental"]')).toBeInTheDocument();
  expect(container.querySelector('[data-map-zone="fono"]')).toHaveAttribute('data-state', 'free');
  fireEvent.click(physio);
  expect(within(screen.getByRole('dialog')).getByText('Paciente teste')).toBeInTheDocument();
});

it('abre os quatro indicadores com os mesmos dados da unidade e preserva a privacidade do telão', () => {
  const arrival = new Date(Date.now() - 30 * 60000 - 1000).toISOString();
  const done = { ...a, id: 'done', paciente_id: 'p-done', paciente_nome: 'Pessoa concluída', status: 'concluido', concluido_em: new Date().toISOString() };
  const waiting = { ...a, id: 'waiting', paciente_id: 'p-wait', paciente_nome: 'Pessoa aguardando', status: 'apto_atendimento' };
  const noTime = { ...waiting, id: 'no-time', paciente_nome: 'Pessoa sem horário', paciente_id: 'p-no-time' };
  const duplicate = { ...a, id: 'duplicate', status: 'aguardando_enfermagem' };
  setup('', { rows: [{ ...a, status: 'em_atendimento' }, duplicate, waiting, noTime, done], arrivals: { waiting: arrival } });
  const { container } = render(<CockpitUnidade />);
  const metrics = screen.getByRole('region', { name: 'Indicadores da unidade' });
  expect(within(metrics).getAllByRole('button')).toHaveLength(4);
  fireEvent.click(within(metrics).getByRole('button', { name: /Pacientes na unidade/ }));
  let drawer = screen.getByRole('dialog');
  expect(within(drawer).getByText('3 pacientes distintos')).toBeInTheDocument();
  expect(within(drawer).getAllByText('Paciente teste')).toHaveLength(2);
  expect(within(drawer).queryByText('Pessoa concluída')).not.toBeInTheDocument();
  close();
  fireEvent.click(within(metrics).getByRole('button', { name: /Espera média/ }));
  drawer = screen.getByRole('dialog');
  expect(within(drawer).getByText('30 min de média')).toBeInTheDocument();
  expect(within(drawer).getByText('Pessoa aguardando')).toBeInTheDocument();
  expect(within(drawer).getByText(/Chegada sem horário válido/)).toBeInTheDocument();
  expect(within(drawer).queryByText('Paciente teste')).not.toBeInTheDocument();
  close();
  fireEvent.click(within(metrics).getByRole('button', { name: /Salas em atendimento/ }));
  drawer = screen.getByRole('dialog');
  expect(within(drawer).getByText('1/1 salas em atendimento')).toBeInTheDocument();
  expect(within(drawer).queryByText('Sala externa')).not.toBeInTheDocument();
  fireEvent.click(within(drawer).getByRole('button', { name: /Sala teste/ }));
  expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Sala teste' })).toBeInTheDocument();
  close();
  fireEvent.click(within(metrics).getByRole('button', { name: /Concluídos hoje/ }));
  drawer = screen.getByRole('dialog');
  expect(within(drawer).getByText('Pessoa concluída')).toBeInTheDocument();
  expect(within(drawer).queryByText('Pessoa aguardando')).not.toBeInTheDocument();
  close();
  fireEvent.click(screen.getByRole('button', { name: 'Modo telão' }));
  expect(within(screen.getByRole('region', { name: 'Indicadores da unidade' })).queryAllByRole('button')).toHaveLength(0);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(container.textContent).not.toContain('Pessoa concluída');
});
it('não apresenta espera média zero quando todos os horários estão ausentes', () => {
  setup('apto_atendimento');
  render(<CockpitUnidade />);
  fireEvent.click(screen.getByRole('button', { name: /Espera média/ }));
  expect(within(screen.getByRole('dialog')).getByText('Média indisponível')).toBeInTheDocument();
});

import { render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import CockpitUnidade from './CockpitUnidade';

const feed = vi.hoisted(() => vi.fn());
vi.mock('./useCockpitFeed', () => ({ useCockpitFeed: feed }));
vi.mock('@/hooks/useUnidadeFilter', () => ({ useUnidadeFilter: () => ({
  isGlobalAdmin: false, userUnidadeId: 'local', unidadesVisiveis: [{ id: 'outra', nome: 'Outra unidade' }, { id: 'local', nome: 'Unidade teste' }],
}) }));
vi.mock('@/contexts/OperacionalContext', () => ({ useOperacional: () => ({
  funcionarios: [], salas: [{ id: 's', unidadeId: 'local', nome: 'Sala teste', ativo: true }, { id: 'x', unidadeId: 'outra', nome: 'Sala externa', ativo: true }],
}) }));
vi.mock('@/lib/painelChamadas', () => ({ observarChamadas: () => () => {} }));

it('acompanha a espera, consulta e conclusão da unidade selecionada', () => {
  const a = { id: 'ag', paciente_id: 'p', paciente_nome: 'Paciente teste', sala_id: 's', profissional_nome: 'Profissional teste', tipo: 'Consulta' };
  const status = (value: string) => feed.mockReturnValue({
    rows: [{ ...a, status: value }], triage: [], arrivals: {}, online: true,
  });
  status('apto_atendimento');
  const page = render(<CockpitUnidade/>);
  expect(feed.mock.calls[0][0]).toBe('local');
  expect(screen.queryByText('Sala externa')).toBeNull();
  expect(screen.getByText('Recepção · 1 aguardando')).toBeTruthy();
  status('em_atendimento');
  page.rerender(<CockpitUnidade/>);
  expect(within(screen.getByRole('article')).getByText('Em atendimento')).toBeTruthy();
  status('concluido');
  page.rerender(<CockpitUnidade/>);
  expect(within(screen.getByRole('article')).getByText('Livre')).toBeTruthy();
  expect(screen.getByText('Histórico de hoje · 1')).toBeTruthy();
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { addDaysToDateStr, localDateStr } from '@/lib/utils';
import Dashboard from './Dashboard';

const fixture = vi.hoisted(() => ({
  scope: [] as [string, string][],
  today: '',
  yesterday: '',
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
  user: { id: 'staff-1', role: 'profissional', nome: 'Joana Lima', unidadeId: 'u1', usuario: 'joana' },
}) }));
vi.mock('@/contexts/FilaContext', () => ({ useFila: () => ({ fila: [
  { id: 'q1', unidadeId: 'u1', profissionalId: 'staff-1', status: 'aguardando' },
  { id: 'q2', unidadeId: 'u2', profissionalId: 'staff-1', status: 'aguardando' },
  { id: 'q3', unidadeId: 'u1', profissionalId: 'staff-2', status: 'aguardando' },
] }) }));
vi.mock('@/contexts/OperacionalContext', () => ({ useOperacional: () => ({
  funcionarios: [], salas: [], disponibilidades: [], unidades: [{ id: 'u1', nome: 'Unidade teste' }],
}) }));
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ({ can: (module: string) => module === 'agenda', loading: false }) }));
vi.mock('@/hooks/useRealtimeSync', () => ({ useRealtimeSync: () => {} }));
vi.mock('@/hooks/useLicense', () => ({ useLicense: () => ({ license: {}, loading: false }) }));
vi.mock('recharts', () => ({
  Area: () => null, AreaChart: () => null, CartesianGrid: () => null, ResponsiveContainer: () => null,
  Tooltip: () => null, Legend: () => null, XAxis: () => null, YAxis: () => null,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => {
    let date: string | undefined;
    let scopedUnit = false;
    let scopedProfessional = false;
    const query = {
      select: () => query, gte: () => query, lt: () => query, lte: () => query, order: () => query, range: () => query, abortSignal: () => query,
      eq(column: string, value: string) {
        fixture.scope.push([column, value]);
        if (column === 'data') date = value;
        if (column === 'unidade_id') scopedUnit = value === 'u1';
        if (column === 'profissional_id') scopedProfessional = value === 'staff-1';
        return query;
      },
      match(columns: Record<string, string>) {
        for (const [column, value] of Object.entries(columns)) query.eq(column, value);
        return query;
      },
      then(resolve: (result: { data: unknown[]; error: null }) => unknown) {
        if (!scopedUnit || !scopedProfessional) throw new Error('Consulta sem escopo');
        const rows = table === 'atendimentos' ? [] : date ? [
          { id: 'a1', paciente_id: 'p1', paciente_nome: 'Paciente manhã', profissional_nome: 'Joana Lima', hora: '08:20', data: fixture.today, status: 'confirmado_chegada', tipo: 'Consulta' },
          { id: 'a2', paciente_id: 'p2', paciente_nome: 'Paciente tarde', profissional_nome: 'Joana Lima', hora: '13:30', data: fixture.today, status: 'concluido', tipo: 'Consulta' },
        ] : [{ id: 'a3', data: fixture.yesterday, status: 'falta' }];
        return resolve({ data: rows, error: null });
      },
    };
    return query;
  },
} }));

it('aplica o escopo profissional, restringe atalhos e filtra agenda e métricas de forma independente', async () => {
  fixture.today = localDateStr(new Date());
  fixture.yesterday = addDaysToDateStr(fixture.today, -1);
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  const shortcuts = screen.getByRole('navigation', { name: 'Ações rápidas' });
  expect(within(shortcuts).getAllByRole('link')).toHaveLength(1);
  expect(within(shortcuts).getByRole('link', { name: 'Agenda do Dia' })).toHaveAttribute('href', '/painel/agenda');
  expect(await screen.findByText('Paciente manhã')).toBeInTheDocument();
  expect(screen.getByText('0 faltas em 2 agendamentos válidos')).toBeInTheDocument();
  expect(screen.getByText('Pacientes na fila').closest('.space-y-3')).toHaveTextContent('1');
  fireEvent.click(screen.getByRole('button', { name: 'Finalizados' }));
  expect(screen.queryByText('Paciente manhã')).not.toBeInTheDocument();
  expect(screen.getByText('Paciente tarde')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Últimos 7 dias' }));
  expect(screen.getByText('1 faltas em 3 agendamentos válidos')).toBeInTheDocument();
  expect(screen.getByText('Paciente tarde')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Modo Telão' }));
  expect(screen.queryByText('Paciente tarde')).not.toBeInTheDocument();
  expect(screen.getByText('Termômetro operacional')).toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.getByText('Paciente tarde')).toBeInTheDocument();
  expect(fixture.scope.filter(([column]) => column === 'profissional_id')).toHaveLength(3);
});

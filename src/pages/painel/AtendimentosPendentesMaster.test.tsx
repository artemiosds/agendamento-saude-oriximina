import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { AtendimentosPendentesMaster } from './AtendimentosPendentesMaster';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

it('carrega o plantão primeiro e consulta o histórico em páginas quando expandido', async () => {
  rpc.mockImplementation((name, { p_periodo, p_pagina }) => name === 'regularizar_atendimentos_anteriores_master'
    ? Promise.resolve({ data: 16, error: null }) : ({
    abortSignal: async () => {
      const history = p_periodo === 'anteriores';
      return {
        error: null,
        data: {
          total: history ? 16 : 0,
          limite_minutos: 60,
          itens: history ? Array.from({ length: p_pagina === 1 ? 15 : 1 }, (_, index) => ({
            id: `${p_pagina}-${index}`, paciente_nome: `Paciente ${p_pagina}-${index}`, profissional_nome: 'Profissional teste',
            data: '2026-10-28', hora: '08:00', minutos_aberto: 31680,
          })) : [],
        },
      };
    },
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = render(<QueryClientProvider client={client}><MemoryRouter>
    <AtendimentosPendentesMaster scope="master-u1" today="2026-11-19" agendaAllowed={false} />
  </MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Atendimentos em aberto no plantão (0)')).toBeInTheDocument();
  expect(rpc.mock.calls).toEqual([['get_atendimentos_pendentes_master_page', { p_periodo: 'hoje', p_pagina: 1 }]]);
  fireEvent.click(screen.getByRole('button', { name: 'Passado' }));
  expect(await screen.findByText('Paciente 1-0')).toBeInTheDocument();
  expect(screen.getAllByText('há 22 dias · 28/10')).toHaveLength(15);
  fireEvent.click(screen.getByRole('button', { name: 'Ver mais' }));
  expect(await screen.findByText('Paciente 2-0')).toBeInTheDocument();
  expect(screen.queryByText('Paciente 1-0')).not.toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(rpc).toHaveBeenLastCalledWith('get_atendimentos_pendentes_master_page', { p_periodo: 'anteriores', p_pagina: 2 });
  fireEvent.click(screen.getByRole('button', { name: 'Regularizar Atendimentos Anteriores' }));
  const confirm = screen.getByRole('button', { name: 'Confirmar encerramento' });
  expect(confirm).toBeDisabled();
  expect(rpc.mock.calls.filter(([name]) => name === 'regularizar_atendimentos_anteriores_master')).toHaveLength(0);
  fireEvent.change(screen.getByLabelText(/Justificativa/), { target: { value: 'Regularização conferida pela gestão' } });
  fireEvent.click(confirm);
  expect(await screen.findByText('16 agendamentos encerrados administrativamente.')).toBeInTheDocument();
  expect(rpc).toHaveBeenCalledWith('regularizar_atendimentos_anteriores_master', {
    p_justificativa: 'Regularização conferida pela gestão', p_data_referencia: '2026-11-19', p_total_confirmado: 16,
  });
  ui.unmount();
  client.clear();
});

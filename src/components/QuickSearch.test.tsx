import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QuickSearch from './QuickSearch';

const fixture = vi.hoisted(() => ({ from: vi.fn(), eq: vi.fn(), filterIn: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'staff-local', unidadeId: 'unidade-local', role: 'recepcao' }, isGlobalAdmin: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fixture.from } }));

function Path() {
  const { pathname, search } = useLocation();
  return <output data-testid="path">{pathname + search}</output>;
}

function open(access: Partial<ComponentProps<typeof QuickSearch>> = {}) {
  render(<MemoryRouter initialEntries={['/painel']}>
    <QuickSearch directory agenda prontuario={false} sigtap={false} {...access} />
    <Path />
  </MemoryRouter>);
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  return screen.getByRole('combobox');
}

const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  const result = { data: [{ id: 'pac-1', nome: 'Paciente fictício' }], error: null };
  const query = {
    select: () => query,
    abortSignal: () => query,
    eq: (...args: unknown[]) => { fixture.eq(...args); return query; },
    in: (...args: unknown[]) => { fixture.filterIn(...args); return query; },
    order: () => query,
    limit: async () => result,
  };
  fixture.from.mockImplementation(() => query);
});

afterEach(() => {
  cleanup();
  if (scrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('atalho global da busca rápida', () => {
  it('limita a busca à unidade e oferece somente o destino permitido', async () => {
    fireEvent.change(open(), { target: { value: '123.456.789-01' } });
    const link = await screen.findByRole('option', { name: 'Ver agendamentos de Paciente fictício' });
    expect(fixture.from).toHaveBeenCalledWith('pacientes');
    expect(fixture.eq).toHaveBeenCalledWith('unidade_id', 'unidade-local');
    expect(fixture.filterIn).toHaveBeenCalledWith('cpf', ['12345678901', '123.456.789-01']);
    expect(screen.queryByRole('option', { name: /prontuário/i })).toBeNull();
    fireEvent.click(link);
    expect(screen.getByTestId('path')).toHaveTextContent('/painel/agenda');
    expect(screen.getByTestId('path')).not.toHaveTextContent('12345678901');
  });

  it('impede consultas de pacientes quando o diretório não está permitido', async () => {
    fireEvent.change(open({ directory: false, sigtap: true }), { target: { value: '12345678901' } });
    await waitFor(() => expect(screen.getByText(/tipo de busca não está disponível/)).toBeInTheDocument());
    expect(fixture.from).not.toHaveBeenCalled();
  });
});

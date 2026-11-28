import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ options: {} as Record<string, any>, refetch: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: Record<string, any>) => {
  state.options = options;
  return { data: [], error: null, isPending: false, isFetching: false, refetch: state.refetch };
} }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import CockpitTurno from './CockpitTurno';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('turno durante edição clínica', () => {
  it('pausa só atualização automática, preservando consulta manual e escopo', () => {
    render(<CockpitTurno professionalId="isolated-professional" unitId="isolated-unit" enabled paused />);
    expect(state.options.refetchInterval).toBe(false);
    expect(state.options.refetchOnWindowFocus).toBe(false);
    expect(state.options.queryKey.slice(0, 3)).toEqual(['cockpit-turno', 'isolated-professional', 'isolated-unit']);
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar situação do turno' }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });
  it('mantém os 30 segundos sem atendimento em edição', () => {
    render(<CockpitTurno professionalId="isolated-professional" unitId="isolated-unit" enabled />);
    expect(state.options.refetchInterval).toBe(30000);
    expect(state.options.refetchOnWindowFocus).toBe(true);
  });
});
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useOperationalUnitScope } from './useOperationalUnitScope';

const units = [{ id: 'cer' }, { id: 'policlinica' }];
const wrapper = (path: string) => ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
);

afterEach(cleanup);

describe('escopo operacional por unidade', () => {
  it('mantém filtros existentes ao navegar entre unidades válidas', () => {
    const { result } = renderHook(() => ({
      scope: useOperationalUnitScope(units, true),
      location: useLocation(),
    }), { wrapper: wrapper('/painel/funcionarios?aba=internos&unidade=cer') });

    expect(result.current.scope.unitId).toBe('cer');
    act(() => result.current.scope.setUnitId('policlinica'));
    expect(result.current.scope.unitId).toBe('policlinica');
    expect(result.current.location.search).toContain('aba=internos');

    act(() => result.current.scope.setUnitId('all'));
    expect(result.current.scope.unitId).toBe('all');
    expect(result.current.location.search).toBe('?aba=internos');
  });

  it('rejeita unidade da URL fora do escopo conhecido e ignora seleção inválida', () => {
    const { result } = renderHook(() => useOperationalUnitScope(units, true), {
      wrapper: wrapper('/painel/unidades?unidade=outra'),
    });
    expect(result.current.unitId).toBe('all');
    act(() => result.current.setUnitId('outra'));
    expect(result.current.unitId).toBe('all');
  });

  it('não amplia o escopo de um usuário sem visão global', () => {
    const { result } = renderHook(() => useOperationalUnitScope(units, false), {
      wrapper: wrapper('/painel/disponibilidade?unidade=policlinica'),
    });
    expect(result.current.unitId).toBe('all');
    act(() => result.current.setUnitId('policlinica'));
    expect(result.current.unitId).toBe('all');
  });
});

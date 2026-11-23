import { useCallback, useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTreatmentCyclesPageLoad } from "./useTreatmentCyclesPageLoad";

function setup() {
  const fetchPage = vi.fn(async (_page: number, _silent: boolean) => {});
  const hook = renderHook(({ scope, fetchPage }) => {
    const [page, setPage] = useState(1);
    const loadData = useCallback(async (silent: boolean) => {
      await fetchPage(page, silent);
    }, [page, fetchPage]);
    useTreatmentCyclesPageLoad({ page, setPage, filterScope: scope, loadData });
    return { page, setPage };
  }, { initialProps: { scope: "original", fetchPage } });
  return { ...hook, fetchPage };
}

describe("carregamento paginado dos ciclos de tratamento", () => {
  it("carrega a primeira página com loading e permite avançar e voltar", () => {
    const { result, fetchPage } = setup();
    expect(fetchPage.mock.calls).toEqual([[1, false]]);
    for (const page of [2, 3, 2, 1]) {
      act(() => result.current.setPage(page));
      expect(result.current.page).toBe(page);
      expect(fetchPage).toHaveBeenLastCalledWith(page, true);
    }
    expect(fetchPage).toHaveBeenCalledTimes(5);
  });

  it.each(["profissional", "unidade", "status", "integridade", "busca", "conta autenticada"])(
    "volta à página 1 ao mudar %s, sem buscar a página antiga com o novo escopo",
    (scope) => {
      const { result, rerender, fetchPage } = setup();
      act(() => result.current.setPage(3));
      fetchPage.mockClear();
      rerender({ scope, fetchPage });
      expect(result.current.page).toBe(1);
      expect(fetchPage.mock.calls).toEqual([[1, true]]);
      act(() => result.current.setPage(2));
      expect(result.current.page).toBe(2);
      expect(fetchPage).toHaveBeenLastCalledWith(2, true);
    },
  );

  it("mantém a página durante revalidação com os mesmos filtros", () => {
    const { result, rerender, fetchPage } = setup();
    act(() => result.current.setPage(2));
    fetchPage.mockClear();
    const refreshPage = async (page: number, silent: boolean) => fetchPage(page, silent);
    rerender({ scope: "original", fetchPage: refreshPage });
    expect(result.current.page).toBe(2);
    expect(fetchPage.mock.calls).toEqual([[2, true]]);
    rerender({ scope: "original", fetchPage: refreshPage });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

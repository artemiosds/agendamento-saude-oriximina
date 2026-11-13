import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TreatmentCapacityOverview from "./TreatmentCapacityOverview";

const queryState = vi.hoisted(() => ({
  tables: [] as string[],
  delayNextAvailability: false,
  releaseAvailability: null as null | (() => void),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "master-1", role: "master", unidade_id: "unit-1" }, isGlobalAdmin: false }),
}));
vi.mock("@/hooks/useUnidadeFilter", () => ({
  useUnidadeFilter: () => ({ userUnidadeId: "unit-1", unidadesVisiveis: [{ id: "unit-1", nome: "CER II" }] }),
}));
vi.mock("@/contexts/PermissionsContext", () => ({
  usePermissions: () => ({ can: () => true, loading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      queryState.tables.push(table);
      const query: Record<string, (...args: unknown[]) => unknown> = {};
      for (const method of ["select", "gte", "lte", "eq", "in", "or", "order"]) query[method] = () => query;
      query.range = async () => {
        if (table === "disponibilidades" && queryState.delayNextAvailability) {
          queryState.delayNextAvailability = false;
          await new Promise<void>((resolve) => { queryState.releaseAvailability = resolve; });
        }
        return { data: table === "funcionarios" ? [{ id: "staff-1", nome: "Profissional de teste", profissao: "Fisioterapeuta", role: "profissional", ativo: true, unidade_id: "unit-1", tempo_atendimento: 30 }] : [], error: null };
      };
      return query;
    },
  },
}));

afterEach(() => {
  queryState.releaseAvailability?.();
  queryState.releaseAvailability = null;
  queryState.delayNextAvailability = false;
  queryState.tables = [];
});

describe("capacidade e demanda: carregamento estável", () => {
  it("mantém a análise e evita novas consultas ao mudar o simulador ou recriar dependências do contexto", async () => {
    const view = render(<MemoryRouter><TreatmentCapacityOverview /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Abrir análise" }));
    await screen.findByText("Vagas seguras para novos pacientes");
    const initialQueries = queryState.tables.length;

    fireEvent.change(screen.getByLabelText("Quantidade de sessões"), { target: { value: "18" } });
    view.rerender(<MemoryRouter><TreatmentCapacityOverview /></MemoryRouter>);
    expect(queryState.tables).toHaveLength(initialQueries);

    queryState.delayNextAvailability = true;
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    await screen.findByText(/Atualizando os dados em segundo plano/);
    expect(screen.getByText("Vagas seguras para novos pacientes")).toBeTruthy();
    expect(screen.queryByText(/Carregando capacidade/)).toBeNull();

    queryState.releaseAvailability?.();
    await waitFor(() => expect(screen.getByRole("button", { name: "Atualizar" })).toBeTruthy());
  });
});

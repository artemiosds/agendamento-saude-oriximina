import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import HistoricoTriagem from "./HistoricoTriagem";

type IndexResult = { data: { id: string }[]; count: number; error: Error | null };
const mocks = vi.hoisted(() => ({
  indexRequests: [] as Array<() => Promise<IndexResult>>,
  searchRequests: [] as Array<() => Promise<{ data: Record<string, unknown>[]; error: Error | null }>>,
  queryCount: 0,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { role: "master", usuario: "admin.sms", unidadeId: "" } }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => {
        const builder = {
          order: () => builder,
          ilike: () => builder,
          or: () => builder,
          range: () => {
            if (table !== "triage_records") throw new Error("Consulta inesperada");
            mocks.queryCount++;
            const next = columns === "id" ? mocks.indexRequests.shift() : mocks.searchRequests.shift();
            if (!next) throw new Error("Resposta de índice não preparada");
            return next();
          },
          in: (_column: string, ids: string[]) => Promise.resolve({
            data: table === "triage_records"
              ? ids.map((id) => ({ id, agendamento_id: id, tecnico_id: "", classificacao_risco: "", criado_em: "2026-09-26T10:00:00Z", confirmado_em: null }))
              : table === "agendamentos"
                ? ids.map((id) => ({ id, paciente_id: null, paciente_nome: "Paciente de teste", unidade_id: "" }))
                : [],
            error: null,
          }),
        };
        return builder;
      },
    }),
  },
}));

vi.mock("@/components/Triagem/ModalEdicaoTriagem", () => ({ ModalEdicaoTriagem: () => null }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const success = (ids: string[] = []): IndexResult => ({ data: ids.map((id) => ({ id })), count: ids.length, error: null });
const failure = (): IndexResult => ({ data: [], count: 0, error: new Error("Falha simulada") });

function changeDate(container: HTMLElement, date: string) {
  const input = container.querySelector('input[type="date"]');
  if (!input) throw new Error("Filtro de data não encontrado");
  fireEvent.change(input, { target: { value: date } });
}

describe("Histórico de Triagem: carregamento, erro e vazio", () => {
  beforeEach(() => {
    mocks.indexRequests.length = 0;
    mocks.searchRequests.length = 0;
    mocks.queryCount = 0;
  });
  afterEach(() => { cleanup(); });

  it("mostra carregamento na primeira consulta sem declarar vazio", async () => {
    const pending = deferred<IndexResult>();
    mocks.indexRequests.push(() => pending.promise);
    render(<HistoricoTriagem />);
    await waitFor(() => expect(mocks.queryCount).toBe(1));
    expect(screen.getByRole("status", { name: "Carregando histórico de triagem" })).toBeInTheDocument();
    expect(screen.queryByText("Nenhum registro encontrado.")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    pending.resolve(success());
    await screen.findByText("Nenhum registro encontrado.");
  });

  it("mostra vazio somente após uma resposta bem-sucedida sem registros", async () => {
    mocks.indexRequests.push(async () => success());
    render(<HistoricoTriagem />);
    expect(await screen.findByText("Nenhum registro encontrado.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mostra erro inicial distinto de vazio", async () => {
    mocks.indexRequests.push(async () => failure());
    render(<HistoricoTriagem />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar o histórico de triagem.");
    expect(screen.queryByText("Nenhum registro encontrado.")).not.toBeInTheDocument();
  });

  it("preserva os últimos resultados durante a atualização e após sua falha", async () => {
    const pending = deferred<IndexResult>();
    mocks.indexRequests.push(async () => success(["ficha-1"]), () => pending.promise);
    const { container } = render(<HistoricoTriagem />);
    await screen.findByText("Paciente de teste");
    changeDate(container, "2026-09-25");
    await waitFor(() => expect(mocks.queryCount).toBe(2));
    expect(screen.getByText("Paciente de teste")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Atualizando histórico");
    pending.resolve(failure());
    expect(await screen.findByRole("alert")).toHaveTextContent("Exibindo os últimos resultados carregados.");
    expect(screen.getByText("Paciente de teste")).toBeInTheDocument();
    expect(screen.queryByText("Nenhum registro encontrado.")).not.toBeInTheDocument();
  });

  it("ignora resposta antiga após mudança de filtro", async () => {
    const old = deferred<IndexResult>();
    const current = deferred<IndexResult>();
    mocks.indexRequests.push(() => old.promise, () => current.promise);
    const { container } = render(<HistoricoTriagem />);
    await waitFor(() => expect(mocks.queryCount).toBe(1));
    changeDate(container, "2026-09-25");
    await waitFor(() => expect(mocks.queryCount).toBe(2));
    current.resolve(success());
    await screen.findByText("Nenhum registro encontrado.");
    await act(async () => { old.resolve(success(["ficha-antiga"])); });
    expect(screen.getByText("Nenhum registro encontrado.")).toBeInTheDocument();
    expect(screen.queryByText("Paciente de teste")).not.toBeInTheDocument();
  });

  it("busca um paciente no histórico completo depois da digitação", async () => {
    mocks.indexRequests.push(async () => success());
    mocks.searchRequests.push(async () => ({
      data: [{
        id: "ficha-1", agendamento_id: "ficha-1", tecnico_id: "",
        classificacao_risco: "", criado_em: "2026-09-26T10:00:00Z",
        confirmado_em: null, custom_data: {},
      }],
      error: null,
    }));
    render(<HistoricoTriagem />);
    await screen.findByText("Nenhum registro encontrado.");

    fireEvent.change(screen.getByPlaceholderText("Nome do paciente..."), { target: { value: "Paciente" } });
    expect(await screen.findByText("Paciente de teste")).toBeInTheDocument();
    expect(mocks.queryCount).toBe(2);
    expect(screen.getByText("1 registro(s) encontrado(s)")).toBeInTheDocument();
  });
});

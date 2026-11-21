import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { OperacionalSliceProvider, useOperacional } from "./OperacionalContext";

const mock = vi.hoisted(() => ({
  user: { id: "operator", role: "recepcao", usuario: "usuario", unidadeId: "u1" },
  reads: [] as string[],
  events: new Map<string, () => void>(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock("@/hooks/useRealtimeSync", () => ({
  useRealtimeSync: ({ table, onEvent }: { table: string; onEvent: () => void }) => {
    mock.events.set(table, onEvent);
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      let unit = "";
      const query = {
        select: () => query,
        eq: (column: string, value: string) => {
          if (column === "unidade_id" || column === "id") unit = value;
          return query;
        },
        abortSignal: async () => {
          mock.reads.push(table);
          return { data: table === "salas" ? [{ id: unit, nome: unit, unidade_id: unit, ativo: true }] : [], error: null };
        },
        maybeSingle: async () => ({ data: null, error: null }),
        insert: async () => ({ error: null }),
      };
      return query;
    },
  },
}));

it("reusa o cache, atualiza apenas o cadastro afetado e separa os dados por unidade", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: previous => previous } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}><OperacionalSliceProvider>{children}</OperacionalSliceProvider></QueryClientProvider>
  );
  const first = renderHook(useOperacional, { wrapper });
  await waitFor(() => expect(first.result.current.salas[0]?.id).toBe("u1"));
  expect(mock.reads.slice().sort()).toEqual(["bloqueios", "disponibilidades", "funcionarios", "salas", "unidades"]);
  first.unmount();

  const next = renderHook(useOperacional, { wrapper });
  expect(next.result.current.salas[0]?.id).toBe("u1");
  expect(mock.reads).toHaveLength(5);

  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  expect(mock.reads).toHaveLength(5);

  await act(async () => { mock.events.get("bloqueios")?.(); });
  await waitFor(() => expect(mock.reads.slice(5)).toEqual(["bloqueios"]));
  await act(async () => {
    await next.result.current.addSala({ id: "s2", nome: "Sala 2", unidadeId: "u1", ativo: true });
  });
  expect(mock.reads.slice(5)).toEqual(["bloqueios", "salas"]);

  mock.user = { ...mock.user, unidadeId: "u2" };
  next.rerender();
  expect(next.result.current.salas.some(sala => sala.unidadeId === "u1")).toBe(false);
  await waitFor(() => expect(next.result.current.salas[0]?.id).toBe("u2"));

  next.unmount();
  focusManager.setFocused(undefined);
  client.clear();
});

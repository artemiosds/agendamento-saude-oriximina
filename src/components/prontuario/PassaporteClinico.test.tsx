import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import PassaporteClinico from "./PassaporteClinico";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => {
    const query: any = {
      select: () => query, eq: () => query, neq: () => query, in: () => query,
      gte: () => query, lte: () => query, limit: () => query, not: () => query, order: () => query,
      single: async () => ({ data: { id: "patient", nome: "PACIENTE TESTE" }, error: null }),
      then: (resolve: any, reject: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
    };
    return query;
  } },
}));
afterEach(cleanup);
function renderPassport(nested = false, onOpenChange?: (open: boolean) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const passport = <PassaporteClinico patientId="patient" professionalId="professional" profession="Fisioterapia" enabled onOpenChange={onOpenChange} />;
  return render(<QueryClientProvider client={client}>{nested
    ? <Sheet open><SheetContent><SheetTitle>Detalhes do agendamento</SheetTitle>
      <SheetDescription>Consulta de dados</SheetDescription>{passport}<button>Fora do passaporte</button></SheetContent></Sheet>
    : <>{passport}<button>Fora do passaporte</button></>}</QueryClientProvider>);
}
describe("Passaporte Clínico: fechamento e foco", () => {
  it("mantém o conteúdo dentro da gaveta para não disputar o foco com ela", async () => {
    renderPassport(true);
    fireEvent.click(screen.getByRole("button", { name: "Abrir passaporte clínico do paciente" }));
    const heading = await screen.findByText("Resumo clínico · PACIENTE TESTE");
    expect(screen.getByRole("dialog", { name: "Detalhes do agendamento" })).toContainElement(heading);
  });

  it("fecha ao clicar fora dentro da gaveta e mantém a gaveta aberta", async () => {
    renderPassport(true);
    fireEvent.click(screen.getByRole("button", { name: "Abrir passaporte clínico do paciente" }));
    await screen.findByText("Resumo clínico · PACIENTE TESTE");
    const outside = screen.getByRole("button", { name: "Fora do passaporte" });
    fireEvent.pointerDown(outside, { pointerType: "mouse" });
    fireEvent.focus(outside);
    fireEvent.click(outside);
    await waitFor(() => expect(screen.queryByText("Resumo clínico · PACIENTE TESTE")).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Detalhes do agendamento" })).toBeInTheDocument();
  });

  it("informa abertura, fechamento e desmontagem para a lista manter o cartão", async () => {
    const onOpenChange = vi.fn();
    const view = renderPassport(false, onOpenChange);
    fireEvent.click(screen.getByRole("button", { name: "Abrir passaporte clínico do paciente" }));
    await screen.findByText("Resumo clínico · PACIENTE TESTE");
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });
    await waitFor(() => expect(onOpenChange).toHaveBeenLastCalledWith(false));
    view.unmount();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("abre e fecha repetidamente por Escape e mantém o acionador utilizável", async () => {
    renderPassport();
    const trigger = screen.getByRole("button", { name: "Abrir passaporte clínico do paciente" });
    for (let attempt = 0; attempt < 3; attempt++) {
      fireEvent.click(trigger);
      await screen.findByText("Resumo clínico · PACIENTE TESTE");
      fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });
      await waitFor(() => expect(screen.queryByText("Resumo clínico · PACIENTE TESTE")).not.toBeInTheDocument());
      await waitFor(() => expect(trigger).toHaveFocus());
    }
  });
});

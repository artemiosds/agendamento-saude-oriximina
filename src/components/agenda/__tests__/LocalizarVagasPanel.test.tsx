import { describe, it, expect, vi, beforeEach } from "vitest";
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function () {};
(Element.prototype as any).hasPointerCapture = (Element.prototype as any).hasPointerCapture || (() => false);
(Element.prototype as any).releasePointerCapture = (Element.prototype as any).releasePointerCapture || (() => {});
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const loaded = new Set<string>();
vi.mock("@/contexts/_agendamentosBridge", () => ({ isCompleteAgendaDate: (d: string) => loaded.has(d) }));

let failPending = false;
const cycles = [{ id: "c1", status: "em_andamento", unit_id: "u1" }, { id: "c2", status: "em_andamento", unit_id: "u2" }];
const sessions = [
  { cycle_id: "c1", professional_id: "p1", status: "pendente_agendamento", appointment_id: null, scheduled_date: null },
  { cycle_id: "c2", professional_id: "p1", status: "pendente_agendamento", appointment_id: null, scheduled_date: null },
];
vi.mock("@/integrations/supabase/client", () => {
  const q = (table: string) => {
    const b: any = { select: () => b, in: () => b, eq: () => b, is: () => b,
      range: async () => failPending ? { data: null, error: { message: "x" } } : { data: table === "treatment_cycles" ? cycles : sessions, error: null } };
    return b;
  };
  return { supabase: { from: q } };
});

import { LocalizarVagasPanel } from "../LocalizarVagasPanel";
import { todayLocalStr, addDaysToDateStr } from "@/lib/utils";

const profs: any[] = [
  { id: "p1", nome: "Fono A", profissao: "Fonoaudióloga", role: "profissional", unidadeId: "u1", ativo: true },
  { id: "p2", nome: "TO B", profissao: "Terapeuta X", role: "profissional", unidadeId: "u1", ativo: true },
];
const unidades = [{ id: "u1", nome: "CER II" }, { id: "u2", nome: "UBS Centro" }];

async function abrirEBuscar(props: Partial<React.ComponentProps<typeof LocalizarVagasPanel>> = {}) {
  render(<LocalizarVagasPanel profissionais={profs} unidades={unidades} getAvailableSlots={() => []} loadAgendaRange={async () => {}} onPick={() => {}} {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /Localizar Vagas/ }));
  fireEvent.click(screen.getAllByRole("combobox")[0]);
  fireEvent.click(await screen.findByRole("option", { name: "Fonoaudiologia" }));
  fireEvent.click(screen.getByRole("button", { name: /Buscar/ }));
}

beforeEach(() => { loaded.clear(); failPending = false; });

describe("LocalizarVagasPanel (integração)", () => {
  it("erro na Agenda = Disponibilidade não confirmada, nunca Sem vaga", async () => {
    await abrirEBuscar({ loadAgendaRange: async () => { throw new Error("falha"); } });
    expect(await screen.findByText("Disponibilidade não confirmada")).toBeTruthy();
    expect(screen.queryByText("Sem vaga no período")).toBeNull();
  });
  it("profissão não reconhecida não aparece; serviço só lista especialidades reconhecidas", async () => {
    await abrirEBuscar();
    await screen.findByText("Fono A");
    expect(screen.queryByText("TO B")).toBeNull();
  });
  it("pendências separadas por unidade do ciclo", async () => {
    await abrirEBuscar();
    const box = await screen.findByTestId("pendentes-totais");
    await waitFor(() => expect(box.textContent).toContain("CER II: 1"));
    expect(box.textContent).toContain("UBS Centro: 1");
  });
  it("falha nas pendências = Informação não disponível, nunca zero", async () => {
    failPending = true;
    await abrirEBuscar();
    const box = await screen.findByTestId("pendentes-totais");
    expect(box.textContent).toContain("Informação não disponível");
  });
  it("desempenho: 30 dias x 40 profissionais em menos de 1,5 s", async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `f${i}`, nome: `Fono ${i}`, profissao: "Fonoaudiologia", role: "profissional", unidadeId: "u1", ativo: true }));
    const start = todayLocalStr();
    for (let i = 0; i < 30; i++) loaded.add(addDaysToDateStr(start, i));
    const slots = vi.fn(() => ["08:00", "09:00"]);
    render(<LocalizarVagasPanel profissionais={many as any} unidades={unidades} getAvailableSlots={slots} loadAgendaRange={async () => {}} onPick={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Localizar Vagas/ }));
    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: "Fonoaudiologia" }));
    fireEvent.click(screen.getAllByRole("combobox")[2]);
    fireEvent.click(await screen.findByRole("option", { name: "Próximos 30 dias" }));
    const t0 = performance.now();
    fireEvent.click(screen.getByRole("button", { name: /Buscar/ }));
    await screen.findByText(/Consulta concluída/);
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(slots).toHaveBeenCalledTimes(40 * 30);
  });
});

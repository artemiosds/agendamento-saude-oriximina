import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import MapaVagasSemanalPrint from "./MapaVagasSemanalPrint";
import { renderWeeklyOfferMap } from "@/lib/weeklyOfferPrint";
import { addDaysToDateStr, todayLocalStr } from "@/lib/utils";

const printDocument = vi.hoisted(() =>
  vi.fn(async (_html: string, _title?: string, _meta?: Record<string, string>) => {}),
);
vi.mock("@/lib/printLayout", () => ({ openPrintDocument: printDocument }));

describe("mapa de balcão sem dados de pacientes", () => {
  it("limita o documento a ofertas seguras e escapa textos cadastrados", () => {
    const document = renderWeeklyOfferMap([{professionalId:"p1",unitId:"u1",professionalName:'Profissional <img src=x onerror=alert(1)>',
      specialty:"Fonoaudiologia",date:"2026-11-16",shift:"Manhã",times:[{date:"2026-11-16",time:"10:00",count:2,singleVisit:false}],vacancies:2}],
      "2026-11-16","2026-11-21",new Map([["u1","CER II"]]));
    expect(document).toContain("10:00 (2)");
    expect(document).toContain("Profissional &lt;img");
    expect(document).not.toContain("<img src=x");
    expect(document).toContain("não reserva horários");
  });

  it("identifica o horizonte longo e permite que tabelas extensas se distribuam em páginas A4", () => {
    const rows = Array.from({length: 35}, (_, index) => ({professionalId:"p1",unitId:"u1",professionalName:"Profissional A",
      specialty:"Psicologia",date:addDaysToDateStr("2026-11-13", index),shift:"Manhã" as const,
      times:[{date:"2026-11-13",time:"09:00",count:1,singleVisit:false}],vacancies:1}));
    const document = renderWeeklyOfferMap(rows,"2026-11-13","2027-02-10",new Map([["u1","CER II"]]),90);
    expect(document).toContain("(90 dias)");
    expect(document).toContain("Unidade: CER II");
    expect(document).toContain("Profissional A · Psicologia");
    expect(document).toContain('break-inside:auto');
    expect(document).toContain('break-inside:avoid-page;page-break-inside:avoid');
    expect(document).not.toContain("Paciente");
  });

  it("envia ao layout institucional o título e o intervalo exato dos 30 dias selecionados", async () => {
    printDocument.mockClear();
    const today = todayLocalStr();
    const endDate = addDaysToDateStr(today, 29);
    const professional = { id:"p1",unitId:"u1",unitName:"CER II",name:"Profissional A",profession:"Fonoaudióloga",appointmentDurationMinutes:30 };
    const input = { today, endDate, periodDates:[], professionals:[professional], availabilities:[],appointments:[],blocks:[],externalQuotas:[],pendingSessions:[],queueDemand:[] };
    render(createElement(MapaVagasSemanalPrint, {input, professionals:[professional], periodDays:30, loadedAt:Date.now()}));
    fireEvent.click(screen.getByRole("button",{name:"Imprimir Mapa de Ofertas (30 dias)"}));
    await waitFor(() => expect(printDocument).toHaveBeenCalledOnce());
    expect(printDocument.mock.calls[0][0]).toContain(`Mapa de Ofertas do Período — ${new Date(today+"T12:00:00").toLocaleDateString("pt-BR")} a ${new Date(endDate+"T12:00:00").toLocaleDateString("pt-BR")} (30 dias)`);
    expect(printDocument.mock.calls[0][2]["Período"]).toContain("(30 dias)");
  });
});

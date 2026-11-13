import { describe, expect, it } from "vitest";
import { renderWeeklyOfferMap } from "@/lib/weeklyOfferPrint";
import { addDaysToDateStr } from "@/lib/utils";

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
});

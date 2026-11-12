import { describe, it, expect } from "vitest";
import { selecionarMovimentaveis } from "./remanejamentoLote";
const base = { data: "2026-11-15", profissionalId: "p1", hora: "08:00" };
describe("remanejamento em lote", () => {
  it("não move concluídos, faltas, cancelados nem em atendimento", () => {
    const r = selecionarMovimentaveis([
      { ...base, status: "agendado" }, { ...base, status: "concluido" }, { ...base, status: "falta" },
      { ...base, status: "cancelado" }, { ...base, status: "em_atendimento" }, { ...base, status: "remarcado" },
    ], "2026-11-15", null);
    expect(r.map((a) => a.status)).toEqual(["agendado"]);
  });
  it("filtra por profissional e data", () => {
    const r = selecionarMovimentaveis([{ ...base, status: "confirmado" }, { ...base, profissionalId: "p2", status: "confirmado" }, { ...base, data: "2026-11-16", status: "confirmado" }], "2026-11-15", "p1");
    expect(r).toHaveLength(1);
  });
});

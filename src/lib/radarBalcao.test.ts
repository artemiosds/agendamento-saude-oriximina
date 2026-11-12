import { describe, expect, it } from "vitest";
import { ausenciasDetectadas, classificarAtraso } from "./radarBalcao";

const hoje = "2026-11-12";
describe("radar de balcão", () => {
  it("até 15 minutos de atraso é tolerância; 16 minutos é ausência", () => {
    expect(classificarAtraso({ data: hoje, hora: "08:00", status: "agendado" }, hoje, "08:15")?.estado).toBe("tolerancia");
    expect(classificarAtraso({ data: hoje, hora: "08:00", status: "agendado" }, hoje, "08:16")?.estado).toBe("ausencia");
  });
  it("ignora quem já chegou, faltou, foi cancelado ou é de outro dia", () => {
    for (const status of ["confirmado_chegada", "falta", "cancelado", "concluido", "em_atendimento"])
      expect(classificarAtraso({ data: hoje, hora: "08:00", status }, hoje, "10:00")).toBeNull();
    expect(classificarAtraso({ data: "2026-11-11", hora: "08:00", status: "agendado" }, hoje, "10:00")).toBeNull();
  });
  it("lista só ausências, com o maior atraso primeiro", () => {
    const r = ausenciasDetectadas([
      { id: "a", data: hoje, hora: "09:00", status: "agendado" },
      { id: "b", data: hoje, hora: "08:00", status: "confirmado" },
      { id: "c", data: hoje, hora: "09:50", status: "agendado" },
    ], hoje, "10:00");
    expect(r.map((x) => [x.ag.id, x.atrasoMin])).toEqual([["b", 120], ["a", 60]]);
  });
});

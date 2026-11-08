import { describe, expect, it } from "vitest";
import { getLegacyRouteDataNeeds } from "./legacyRouteDataNeeds";

describe("A1.1 route data activation", () => {
  it("keeps Dashboard free from legacy global loads", () => {
    expect(getLegacyRouteDataNeeds("/painel")).toEqual({
      pacientes: false,
      agendamentos: false,
    });
  });

  it("keeps Agenda free from both legacy global loads", () => {
    expect(getLegacyRouteDataNeeds("/painel/agenda")).toEqual({
      pacientes: false,
      agendamentos: false,
    });
  });

  it("activates both legacy datasets for routes that still use both global stores", () => {
    for (const pathname of [
      "/painel/fila",
      "/painel/prontuario",
      "/painel/triagem",
    ]) {
      expect(getLegacyRouteDataNeeds(pathname)).toEqual({
        pacientes: true,
        agendamentos: true,
      });
    }
  });

  it("loads the patient list through its dedicated activator, not the legacy global patient store", () => {
    expect(getLegacyRouteDataNeeds("/painel/pacientes")).toEqual({ pacientes: false, agendamentos: true });
  });

  it("loads only appointments for Treatments; patients are hydrated by visible cycle", () => {
    expect(getLegacyRouteDataNeeds("/painel/tratamentos")).toEqual({ pacientes: false, agendamentos: true });
  });

  it("activates only the dataset required by the remaining legacy routes", () => {
    expect(getLegacyRouteDataNeeds("/painel/pts")).toEqual({ pacientes: true, agendamentos: false });
    expect(getLegacyRouteDataNeeds("/painel/relatorios")).toEqual({ pacientes: true, agendamentos: false });
    expect(getLegacyRouteDataNeeds("/painel/alta")).toEqual({ pacientes: true, agendamentos: false });
    expect(getLegacyRouteDataNeeds("/painel/atualizacao-cadastral")).toEqual({ pacientes: true, agendamentos: false });
    expect(getLegacyRouteDataNeeds("/painel/multiprofissional")).toEqual({ pacientes: false, agendamentos: true });
  });
});

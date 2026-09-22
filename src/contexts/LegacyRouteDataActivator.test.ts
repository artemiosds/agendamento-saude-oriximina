import { describe, expect, it } from "vitest";
import { getLegacyRouteDataNeeds } from "./legacyRouteDataNeeds";

describe("A1.1 route data activation", () => {
  it("keeps Dashboard free from legacy global loads", () => {
    expect(getLegacyRouteDataNeeds("/painel")).toEqual({
      pacientes: false,
      agendamentos: false,
    });
  });

  it("activates both legacy datasets for operational routes", () => {
    for (const pathname of [
      "/painel/agenda",
      "/painel/pacientes",
      "/painel/fila",
      "/painel/prontuario",
      "/painel/triagem",
      "/painel/tratamentos",
    ]) {
      expect(getLegacyRouteDataNeeds(pathname)).toEqual({
        pacientes: true,
        agendamentos: true,
      });
    }
  });

  it("activates only the dataset required by the remaining legacy routes", () => {
    expect(getLegacyRouteDataNeeds("/painel/pts")).toEqual({ pacientes: true, agendamentos: false });
    expect(getLegacyRouteDataNeeds("/painel/relatorios")).toEqual({ pacientes: true, agendamentos: false });
    expect(getLegacyRouteDataNeeds("/painel/alta")).toEqual({ pacientes: true, agendamentos: false });
    expect(getLegacyRouteDataNeeds("/painel/atualizacao-cadastral")).toEqual({ pacientes: true, agendamentos: false });
    expect(getLegacyRouteDataNeeds("/painel/multiprofissional")).toEqual({ pacientes: false, agendamentos: true });
  });
});
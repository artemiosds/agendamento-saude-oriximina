import { describe, expect, it } from "vitest";
import { getQuickAgePriority, getQuickCadastroPendencies, getQuickSelectionIndex, isQuickAppointmentInScope } from "./quickCheckin";

describe("Check-in Expresso", () => {
  it("informa pendências cadastrais sem transformar a validação em condição de confirmação", () => {
    expect(getQuickCadastroPendencies({ nome: "Paciente" })).toEqual([
      "CPF", "CNS", "Data de nascimento", "Sexo", "Nome da mãe", "Raça/Cor", "Bairro", "Logradouro/Endereço", "Telefone",
    ]);
    // A função é exclusivamente informativa: a RPC de chegada não recebe nem consulta este resultado.
  });

  it("reconhece idade legal de 60+ e prioridade 80+", () => {
    const today = new Date(2026, 10, 5);
    expect(getQuickAgePriority({ dataNascimento: "1966-11-05" }, today).age).toBe(60);
    expect(getQuickAgePriority({ dataNascimento: "1946-11-05" }, today).tier).toBe(0);
  });

  it("navega pelos resultados sem ultrapassar os limites da lista", () => {
    expect(getQuickSelectionIndex(-1, 1, 3)).toBe(0);
    expect(getQuickSelectionIndex(0, -1, 3)).toBe(0);
    expect(getQuickSelectionIndex(1, 1, 3)).toBe(2);
    expect(getQuickSelectionIndex(2, 1, 3)).toBe(2);
    expect(getQuickSelectionIndex(0, -1, 0)).toBe(-1);
  });

  it("isola por unidade e profissional, mantendo o admin.sms global", () => {
    const appointment = { unidadeId: "u2", profissionalId: "prof2" };
    expect(isQuickAppointmentInScope(appointment, { id: "recep", unidadeId: "u1" }, ["u1"], false)).toBe(false);
    expect(isQuickAppointmentInScope(appointment, { id: "prof2", unidadeId: "u2" }, ["u2"], true)).toBe(true);
    expect(isQuickAppointmentInScope(appointment, { id: "global", usuario: "admin.sms", unidadeId: "u1" }, ["u1"], false)).toBe(true);
  });
});

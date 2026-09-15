import { describe, expect, it } from "vitest";
import {
  buildBpaAttendanceKey,
  buildBpaProductionKey,
  consolidateBpaProcedureCandidates,
} from "./bpaDeduplication";

const proc = (codigo: string, origem: string, cid = "") => ({ codigo, origem, cid });

describe("deduplicação BPA-I específica do atendimento", () => {
  it("consolida o mesmo SIGTAP repetido em duas fontes do mesmo atendimento", () => {
    const result = consolidateBpaProcedureCandidates([
      proc("0301010048", "Prontuário"),
      proc("0301010048", "PTS"),
    ], true);
    expect(result.consolidated).toHaveLength(1);
    expect(result.repetitions).toHaveLength(1);
  });

  it.each([
    [["0301010048", "0301010072"], 2],
    [["0301010048", "0301010072", "0301010030"], 3],
  ])("preserva %i SIGTAPs diferentes no mesmo atendimento", (codes, expected) => {
    const result = consolidateBpaProcedureCandidates(
      codes.map((code) => proc(code, "Prontuário")),
      true,
    );
    expect(result.consolidated).toHaveLength(expected);
    expect(result.repetitions).toHaveLength(0);
  });

  it("não deduplica dois atendimentos distintos do mesmo paciente, profissional, data e SIGTAP", () => {
    const common = { pacienteId: "pac-1", profissionalId: "prof-1", unidadeId: "uni-1", dataAtendimento: "2026-08-19" };
    const first = buildBpaProductionKey({ ...common, agendamentoId: "ag-1", prontuarioId: "pr-1" }, proc("0301010048", "Prontuário"), true);
    const second = buildBpaProductionKey({ ...common, agendamentoId: "ag-2", prontuarioId: "pr-2" }, proc("0301010048", "Prontuário"), true);
    expect(first).not.toBe(second);
  });

  it("deduplica duas fontes do mesmo atendimento pela mesma chave final", () => {
    const identity = { agendamentoId: "ag-1", prontuarioId: "pr-1" };
    expect(buildBpaProductionKey(identity, proc("0301010048", "Prontuário"), true))
      .toBe(buildBpaProductionKey(identity, proc("0301010048", "PTS"), true));
  });

  it("usa prontuario.id quando agendamento_id está ausente", () => {
    expect(buildBpaAttendanceKey({ prontuarioId: "pr-9", pacienteId: "pac-1" })).toBe("prontuario:pr-9");
  });

  it("preserva vários SIGTAPs diferentes no mesmo prontuário", () => {
    const identity = { prontuarioId: "pr-1" };
    const keys = ["0301010048", "0301010072", "0301010030"].map((codigo) =>
      buildBpaProductionKey(identity, proc(codigo, "Prontuário"), true),
    );
    expect(new Set(keys).size).toBe(3);
  });
});
import { describe, expect, it } from "vitest";
import { includeBpaProductionResolution, loadBpaEntitiesByIds } from "./bpaSourceLoading";

describe("carga e origem dos registros BPA-I", () => {
  it("carrega todos os 1.031 pacientes sem perder linhas no limite de 1.000 do PostgREST", async () => {
    const ids = Array.from({ length: 1031 }, (_, index) => `paciente-${index}`);
    const batches: number[] = [];
    const rows = await loadBpaEntitiesByIds(ids, "pacientes", async (batch) => {
      batches.push(batch.length);
      return { data: batch.slice(0, 1000).map((id) => ({ id })), error: null };
    });

    expect(batches).toEqual([500, 500, 31]);
    expect(rows).toHaveLength(1031);
    expect(rows.at(-1)?.id).toBe("paciente-1030");
  });

  it("interrompe a exportação se algum lote falhar", async () => {
    const ids = Array.from({ length: 501 }, (_, index) => String(index));
    await expect(loadBpaEntitiesByIds(ids, "pacientes", async (batch) => ({
      data: batch.length === 500 ? batch : null,
      error: batch.length === 500 ? null : { message: "consulta indisponível" },
    }))).rejects.toThrow("Erro ao consultar pacientes: consulta indisponível");
  });

  it("não confunde um código planejado no PTS com procedimento realizado", () => {
    expect(includeBpaProductionResolution("pts", "0301010048", [])).toBe(false);
    expect(includeBpaProductionResolution("pts", "0301010048", ["0301010056"])).toBe(false);
    expect(includeBpaProductionResolution("pts", "0301010048", ["0301010048"])).toBe(true);
    expect(includeBpaProductionResolution("prontuario", "0301010048", [])).toBe(true);
  });
});

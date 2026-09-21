import { describe, expect, it } from "vitest";
import { compareEvents, mergeEvents, previousRange } from "./HistoricoCompletoModal";

type TestEvent = Parameters<typeof compareEvents>[0];

function event(source: TestEvent["source"], sourceId: string, date: string, time?: string): TestEvent {
  return {
    id: `${source}:${sourceId}`,
    source,
    sourceId,
    type: source === "falta" ? "falta" : source === "sessao" ? "sessao" : source === "alta" ? "alta" : "consulta",
    date,
    time,
    professional: "",
    summary: "",
  };
}

describe("Histórico Completo progressivo", () => {
  it("cria faixas consecutivas de 90 dias com fronteira semiaberta", () => {
    const current = previousRange("2026-09-22");
    const older = previousRange(current.start);

    expect(current).toEqual({ start: "2026-06-24", end: "2026-09-22" });
    expect(older.end).toBe(current.start);
    expect(older).toEqual({ start: "2026-03-26", end: "2026-06-24" });
  });

  it("ordena por data, hora, prioridade da fonte e ID", () => {
    const events = [
      event("alta", "9", "2026-08-20"),
      event("sessao", "8", "2026-08-20"),
      event("falta", "7", "2026-08-20", "09:00"),
      event("prontuario", "2", "2026-08-20", "09:00"),
      event("prontuario", "3", "2026-08-20", "09:00"),
      event("prontuario", "1", "2026-08-21", "08:00"),
    ].sort(compareEvents);

    expect(events.map(item => item.id)).toEqual([
      "prontuario:1",
      "prontuario:3",
      "prontuario:2",
      "falta:7",
      "sessao:8",
      "alta:9",
    ]);
  });

  it("deduplica pela chave canônica fonte:id e mantém todos os demais eventos", () => {
    const original = event("prontuario", "1", "2026-08-20", "08:00");
    const updated = { ...original, summary: "detalhe carregado", detailsLoaded: true };
    const merged = mergeEvents([original, event("falta", "1", "2026-08-19")], [updated, event("sessao", "1", "2026-08-18")]);

    expect(merged).toHaveLength(3);
    expect(merged.find(item => item.id === "prontuario:1")?.summary).toBe("detalhe carregado");
    expect(new Set(merged.map(item => item.id)).size).toBe(3);
  });
});
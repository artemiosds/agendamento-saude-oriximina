import { describe, expect, it } from "vitest";
import { clinicalEvolutionPrintHtml, clinicalSeries, evolutionEntries, validClinicalMetric } from "./clinicalEvolution";

describe("medidas clínicas do tratamento", () => {
  it("aceita somente valores dentro da escala, inclusive zero, sem criar valor para ausências", () => {
    expect(validClinicalMetric("eva", 0)).toBe(0);
    expect(validClinicalMetric("berg", 56)).toBe(56);
    expect(validClinicalMetric("mrc", 6)).toBeNull();
    expect(validClinicalMetric("mrc", 3.5)).toBeNull();
    expect(validClinicalMetric("eva", 2.5)).toBe(2.5);
    expect(validClinicalMetric("eva", "")).toBeNull();
    expect(validClinicalMetric("eva", "não medido")).toBeNull();
  });

  it("não mistura ciclos, dados sem vínculo ou pontuações inválidas", () => {
    const rows = [
      { id: "a", data_atendimento: "2026-11-01", custom_data: { clinical_metrics_cycle_id: "c1", clinical_metrics_session: 1, clinical_metrics: { eva: 8, berg: 40 } } },
      { id: "b", data_atendimento: "2026-11-08", custom_data: { clinical_metrics_cycle_id: "c1", clinical_metrics_session: 2, clinical_metrics: { eva: 2, berg: 90 } } },
      { id: "c", data_atendimento: "2026-11-09", custom_data: { clinical_metrics_cycle_id: "c2", clinical_metrics: { eva: 10 } } },
      { id: "d", data_atendimento: "2026-11-10", custom_data: { clinical_metrics: { eva: 1 } } },
    ];
    expect(evolutionEntries(rows, "c1").map((item) => item.metrics)).toEqual([{ eva: 8, berg: 40 }, { eva: 2 }]);
    expect(evolutionEntries(rows, "c2")).toHaveLength(1);
    expect(evolutionEntries(rows, "")).toEqual([]);
  });

  it("não compara forças de músculos diferentes como uma única série", () => {
    const entries = evolutionEntries([
      { id: "a", data_atendimento: "2026-11-01", custom_data: { clinical_metrics_cycle_id: "c1", clinical_metrics: { mrc: 2 }, clinical_metrics_context: { mrc: "quadríceps direito" } } },
      { id: "b", data_atendimento: "2026-11-02", custom_data: { clinical_metrics_cycle_id: "c1", clinical_metrics: { mrc: 4 }, clinical_metrics_context: { mrc: "bíceps esquerdo" } } },
      { id: "c", data_atendimento: "2026-11-03", custom_data: { clinical_metrics_cycle_id: "c1", clinical_metrics: { mrc: 5 } } },
    ], "c1");
    expect(clinicalSeries(entries).map((series) => [series.context, series.points.length])).toEqual([
      ["quadríceps direito", 1], ["bíceps esquerdo", 1],
    ]);
  });

  it("inclui curva e valores no relatório sem interpretar melhora ou permitir HTML do cadastro", () => {
    const entries = evolutionEntries([
      { id: "a", data_atendimento: "2026-11-01", custom_data: { clinical_metrics_cycle_id: "c1", clinical_metrics: { eva: 8 } } },
      { id: "b", data_atendimento: "2026-11-08", custom_data: { clinical_metrics_cycle_id: "c1", clinical_metrics: { eva: 2 } } },
    ], "c1");
    const html = clinicalEvolutionPrintHtml([{ cycleId: "c1", specialty: "Fisio <script>alert(1)</script>", entries }]);
    expect(html).toContain("8 → 2");
    expect(html).toContain("<svg");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

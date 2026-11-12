/** Pontuações opcionais registradas pelo profissional; nunca extraídas de texto livre. */
export const CLINICAL_SCALES = {
  eva: { label: "Dor (EVA)", min: 0, max: 10, direction: "menor" },
  berg: { label: "Equilíbrio (Berg)", min: 0, max: 56, direction: "maior" },
  mrc: { label: "Força (MRC)", min: 0, max: 5, direction: "maior" },
} as const;
export type ClinicalScale = keyof typeof CLINICAL_SCALES;
export type ClinicalMetrics = Partial<Record<ClinicalScale, number>>;
export type ClinicalMetricEntry = { id: string; date: string; session: number | null; metrics: ClinicalMetrics; mrcContext: string };

export function validClinicalMetric(scale: ClinicalScale, value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  const def = CLINICAL_SCALES[scale];
  return Number.isFinite(n) && n >= def.min && n <= def.max && (scale === "eva" || Number.isInteger(n)) ? n : null;
}

export function evolutionEntries(rows: ReadonlyArray<{ id: string; data_atendimento: string; custom_data: unknown }>, cycleId: string): ClinicalMetricEntry[] {
  if (!cycleId) return [];
  return rows.flatMap((row) => {
    const cd = row.custom_data as Record<string, unknown> | null;
    if (!cd || cd.clinical_metrics_cycle_id !== cycleId || !cd.clinical_metrics || typeof cd.clinical_metrics !== "object") return [];
    const raw = cd.clinical_metrics as Record<string, unknown>;
    const context = cd.clinical_metrics_context as Record<string, unknown> | null;
    const mrcContext = String(context?.mrc || "").trim().slice(0, 80);
    const metrics: ClinicalMetrics = {};
    for (const key of Object.keys(CLINICAL_SCALES) as ClinicalScale[]) {
      const value = validClinicalMetric(key, raw[key]);
      if (value !== null && (key !== "mrc" || mrcContext)) metrics[key] = value;
    }
    if (!Object.keys(metrics).length) return [];
    const session = Number(cd.clinical_metrics_session);
    return [{ id: row.id, date: row.data_atendimento, session: Number.isInteger(session) && session > 0 ? session : null, metrics, mrcContext }];
  }).sort((a, b) => a.date.localeCompare(b.date) || (a.session || 0) - (b.session || 0));
}

export function clinicalSeries(entries: readonly ClinicalMetricEntry[]) {
  return (Object.keys(CLINICAL_SCALES) as ClinicalScale[]).flatMap((scale) => {
    const contexts = scale === "mrc"
      ? [...new Set(entries.filter((e) => e.metrics.mrc !== undefined).map((e) => e.mrcContext))] : [""];
    return contexts.map((context) => ({ scale, context,
      points: entries.filter((e) => e.metrics[scale] !== undefined && (scale !== "mrc" || e.mrcContext === context)),
    })).filter((series) => series.points.length);
  });
}

export type ClinicalEvolutionSection = { cycleId: string; specialty: string; entries: ClinicalMetricEntry[] };

/** Impressão somente de pontuações conferidas; não cria conclusão clínica automática. */
export function clinicalEvolutionPrintHtml(sections: readonly ClinicalEvolutionSection[]): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
  if (!sections.length) return "";
  return `<div class="section"><div class="section-title">Medidas clínicas registradas</div>${sections.map((section) =>
    `<div class="field"><span class="field-label">${escape(section.specialty)}</span>${clinicalSeries(section.entries).map(({scale, context, points: entries}) => {
      const values = entries.map((entry) => entry.metrics[scale]!);
      const def = CLINICAL_SCALES[scale];
      const points = values.map((v, i) => `${10 + i * 180 / Math.max(1, values.length - 1)},${44 - (v - def.min) / (def.max - def.min) * 34}`).join(" ");
      return `<div class="field-value">${def.label}${context ? ` · ${escape(context)}` : ""}: ${values[0]} → ${values[values.length - 1]} (${values.length} medida(s))
        <svg width="200" height="54" viewBox="0 0 200 54" role="img" aria-label="Curva ${def.label}">
          <line x1="10" y1="44" x2="190" y2="44" stroke="#94a3b8" />
          ${values.length > 1 ? `<polyline fill="none" stroke="#0369a1" stroke-width="2" points="${points}" />` : ""}
          ${points.split(" ").map((point) => { const [x, y] = point.split(","); return `<circle cx="${x}" cy="${y}" r="3" fill="#0369a1" />`; }).join("")}
        </svg></div>`;
    }).join("")}</div>`).join("")}
    <p>Medidas registradas no prontuário; interpretação, metas atingidas e decisão de alta são de responsabilidade profissional.</p></div>`;
}

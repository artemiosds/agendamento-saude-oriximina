/** Radar de Balcão: classificação somente visual; nunca altera status sozinho. */
export const TOLERANCIA_MINUTOS = 15;
const PENDENTES_CHEGADA = new Set(["agendado", "confirmado", "pendente"]);

export type RadarEstado = "no_prazo" | "tolerancia" | "ausencia";
export type RadarItem<T> = { ag: T; atrasoMin: number; estado: RadarEstado };

function toMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function classificarAtraso(
  ag: { data: string; hora: string; status: string },
  hoje: string, agoraHHMM: string, tolerancia = TOLERANCIA_MINUTOS,
): { estado: RadarEstado; atrasoMin: number } | null {
  if (ag.data !== hoje || !PENDENTES_CHEGADA.has(String(ag.status || "").toLowerCase())) return null;
  const h = toMin(ag.hora), n = toMin(agoraHHMM);
  if (h === null || n === null) return null;
  const atrasoMin = n - h;
  if (atrasoMin < 0) return { estado: "no_prazo", atrasoMin };
  return { estado: atrasoMin <= tolerancia ? "tolerancia" : "ausencia", atrasoMin };
}

export function ausenciasDetectadas<T extends { data: string; hora: string; status: string }>(
  ags: readonly T[], hoje: string, agoraHHMM: string, tolerancia = TOLERANCIA_MINUTOS,
): RadarItem<T>[] {
  return ags.flatMap((ag) => {
    const c = classificarAtraso(ag, hoje, agoraHHMM, tolerancia);
    return c && c.estado === "ausencia" ? [{ ag, ...c }] : [];
  }).sort((a, b) => b.atrasoMin - a.atrasoMin);
}

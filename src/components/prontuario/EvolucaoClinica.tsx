import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CLINICAL_SCALES, clinicalSeries, evolutionEntries } from "@/lib/clinicalEvolution";

/** Indicadores observados; nenhuma melhora, piora ou alta é inferida pelo sistema. */
export default function EvolucaoClinica({ patientId, cycleId }: { patientId: string; cycleId: string }) {
  const { data, error, isPending } = useQuery({
    queryKey: ["evolucao-clinica", patientId, cycleId], enabled: !!patientId && !!cycleId,
    queryFn: async () => {
      const { data: rows, error: dbError } = await supabase.from("prontuarios")
        .select("id,data_atendimento,custom_data").eq("paciente_id", patientId)
        .contains("custom_data", { clinical_metrics_cycle_id: cycleId })
        .order("data_atendimento", { ascending: true }).limit(501);
      if (dbError) throw dbError;
      return { entries: evolutionEntries(rows || [], cycleId), incomplete: (rows || []).length > 500 };
    },
  });
  if (!patientId || !cycleId) return null;
  if (isPending) return <p className="text-xs text-muted-foreground">Consultando medidas registradas…</p>;
  if (error) return <p role="status" className="text-xs text-destructive">Não foi possível consultar a evolução registrada.</p>;
  if (data?.incomplete) return <p role="status" className="text-xs text-amber-700">Há mais de 500 registros neste ciclo; consulte o histórico completo antes de interpretar a curva.</p>;
  if (!data?.entries.length) return <p className="text-xs text-muted-foreground">Ainda não há medidas estruturadas registradas neste ciclo.</p>;
  const entries = data.entries;
  return <section aria-label="Evolução de medidas registradas" className="space-y-2 rounded-md border p-3">
    <h4 className="text-sm font-medium">Medidas do ciclo · {entries.length} registro(s)</h4>
    {clinicalSeries(entries).map(({scale, context, points}) => {
      const def = CLINICAL_SCALES[scale];
      const coords = points.map((point, i) => `${10 + i * 180 / Math.max(1, points.length - 1)},${44 - (point.metrics[scale]! - def.min) / (def.max - def.min) * 34}`).join(" ");
      return <div key={`${scale}-${context}`} className="grid grid-cols-[1fr_120px] gap-2 items-center text-xs">
        <div><span className="font-medium">{def.label}{context ? ` · ${context}` : ""}</span><p>Inicial: {points[0].metrics[scale]} · Última: {points[points.length - 1].metrics[scale]} · {points.length} medida(s)</p></div>
        <svg viewBox="0 0 200 54" role="img" aria-label={`Evolução ${def.label}: ${points.map((p) => p.metrics[scale]).join(", ")}`} className="w-[120px] h-11 text-primary">
          <line x1="10" y1="44" x2="190" y2="44" stroke="currentColor" opacity="0.25" />
          {points.length > 1 && <polyline fill="none" stroke="currentColor" strokeWidth="2" points={coords} />}
          {coords.split(" ").map((coord, i) => { const [x, y] = coord.split(","); return <circle key={i} cx={x} cy={y} r="3" fill="currentColor" />; })}
        </svg>
      </div>;
    })}
    <p className="text-[11px] text-muted-foreground">Escalas não são equivalentes entre si. Interpretação e alta dependem do profissional.</p>
  </section>;
}

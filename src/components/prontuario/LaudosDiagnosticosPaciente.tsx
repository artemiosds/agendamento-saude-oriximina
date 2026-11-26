import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScanLine, ChevronDown } from "lucide-react";
import { isDiagnosticAppointment } from "@/lib/diagnosticExams";

interface Row {
  id: string;
  data: string;
  hora: string;
  tipo: string;
  status: string;
  profissional_nome: string;
  custom_data: Record<string, any> | null;
}

/** Somente leitura: laudos diagnósticos já liberados do paciente (Fase 6). */
export default function LaudosDiagnosticosPaciente({ pacienteId }: { pacienteId?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pacienteId) { setRows([]); return; }
    let active = true;
    setLoading(true);
    (supabase as any)
      .from("agendamentos")
      .select("id,data,hora,tipo,status,profissional_nome,custom_data")
      .eq("paciente_id", pacienteId)
      .ilike("tipo", "exame")
      .eq("custom_data->>status_exame", "laudo_liberado")
      .order("data", { ascending: false })
      .limit(50)
      .then(({ data }: { data: Row[] | null }) => {
        if (!active) return;
        setRows((data || []).filter(isDiagnosticAppointment));
        setLoading(false);
      });
    return () => { active = false; };
  }, [pacienteId]);

  if (!pacienteId || (!loading && rows.length === 0)) return null;

  return (
    <div className="bg-muted/30 rounded-lg p-4 border space-y-2 mt-2 mb-2">
      <div className="flex items-center gap-2">
        <ScanLine className="w-5 h-5 text-primary shrink-0" />
        <span className="text-sm font-semibold text-foreground">Laudos de exames diagnósticos</span>
        <span className="text-xs text-muted-foreground">({loading ? "carregando…" : rows.length})</span>
      </div>
      {rows.map((r) => {
        const l = r.custom_data?.laudo || {};
        return (
          <details key={r.id} className="rounded-md border bg-background p-2 text-sm">
            <summary className="cursor-pointer flex items-center gap-2 list-none">
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{r.custom_data?.exame_nome || "Exame diagnóstico"}</span>
              <span className="text-xs text-muted-foreground">
                {r.data?.split("-").reverse().join("/")} · {r.profissional_nome || "—"}
                {r.custom_data?.sigtap_codigo ? ` · SIGTAP ${r.custom_data.sigtap_codigo}` : ""}
              </span>
            </summary>
            <div className="mt-2 space-y-1 text-xs whitespace-pre-wrap break-words">
              {l.descricao && <p><strong>Achados:</strong> {l.descricao}</p>}
              {l.hipotese && <p><strong>Hipótese:</strong> {l.hipotese}</p>}
              <p><strong>Conclusão:</strong> {l.conclusao || "—"}</p>
              {l.crm_registro && <p className="text-muted-foreground">CRM {l.crm_registro}</p>}
            </div>
          </details>
        );
      })}
    </div>
  );
}

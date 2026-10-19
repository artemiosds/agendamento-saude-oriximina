import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Activity, ChevronDown, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const RISCO: Record<string, { label: string; cls: string }> = {
  vermelho: { label: "Emergência", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  laranja: { label: "Muito urgente", cls: "bg-orange-100 text-orange-800 border-orange-300" },
  amarelo: { label: "Urgente", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  verde: { label: "Pouco urgente", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  azul: { label: "Não urgente", cls: "bg-primary/10 text-primary border-primary/30" },
};

const fmt = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

interface Props {
  pacienteId?: string;
  unidadeId?: string;
  isGlobalAdmin?: boolean;
}

/** Leitura sob demanda das triagens anteriores do paciente (somente leitura). */
const TriagensPacienteTab: React.FC<Props> = ({ pacienteId, unidadeId, isGlobalAdmin }) => {
  const [openId, setOpenId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["triage_records", "paciente-lateral", pacienteId, isGlobalAdmin ? "all" : unidadeId || "none"],
    enabled: Boolean(pacienteId) && (isGlobalAdmin || Boolean(unidadeId)),
    staleTime: 60_000,
    queryFn: async () => {
      let ag = supabase.from("agendamentos").select("id").eq("paciente_id", pacienteId!).limit(500);
      if (!isGlobalAdmin && unidadeId) ag = ag.eq("unidade_id", unidadeId);
      const [{ data: ags }, { data: fila }] = await Promise.all([
        ag,
        supabase.from("fila_espera").select("id").eq("paciente_id", pacienteId!).limit(500),
      ]);
      const ids = [...(ags || []), ...(fila || [])].map((r: any) => r.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("triage_records")
        .select("id,agendamento_id,classificacao_risco,confirmado_em,criado_em,pressao_arterial,glicemia,saturacao_oxigenio,frequencia_cardiaca,temperatura,peso,altura,imc,queixa,alergias,tecnico_id")
        .in("agendamento_id", ids)
        .not("confirmado_em", "is", null)
        .order("confirmado_em", { ascending: false })
        .limit(30);
      if (error) throw error;
      const tecIds = [...new Set((data || []).map((t) => t.tecnico_id).filter(Boolean))];
      const nomes: Record<string, string> = {};
      if (tecIds.length) {
        const { data: f } = await supabase.from("funcionarios").select("id,nome").in("id", tecIds);
        (f || []).forEach((x: any) => (nomes[x.id] = x.nome));
      }
      return (data || []).map((t) => ({ ...t, tecnico_nome: nomes[t.tecnico_id] || "" }));
    },
  });

  if (!pacienteId) return <p className="p-4 text-xs text-muted-foreground">Nenhum paciente selecionado.</p>;
  if (q.isLoading) return <div className="p-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  if (q.isError) return <p className="p-4 text-xs text-destructive">Não foi possível carregar as triagens.</p>;
  const rows = q.data || [];
  if (rows.length === 0) return <p className="p-4 text-xs text-muted-foreground">Nenhuma triagem registrada para este paciente.</p>;

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {rows.map((t: any) => {
        const r = RISCO[(t.classificacao_risco || "").toLowerCase()];
        const open = openId === t.id;
        const vit = [
          t.pressao_arterial && `PA ${t.pressao_arterial}`,
          t.glicemia != null && `Glic ${t.glicemia}`,
          t.saturacao_oxigenio != null && `SpO₂ ${t.saturacao_oxigenio}%`,
        ].filter(Boolean).join(" · ");
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setOpenId(open ? null : t.id)}
            className="w-full text-left rounded-lg border border-border/60 bg-card p-3 hover:border-primary/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-xs font-semibold text-foreground">{fmt(t.confirmado_em || t.criado_em)}</span>
              {r && <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border ${r.cls}`}>{r.label}</span>}
              <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""} ${r ? "" : "ml-auto"}`} />
            </div>
            {vit && <p className="text-[11px] text-muted-foreground mt-1">{vit}</p>}
            {t.queixa && <p className={`text-[11px] text-foreground mt-1 ${open ? "" : "line-clamp-2"}`}>{t.queixa}</p>}
            {open && (
              <div className="mt-2 pt-2 border-t border-border/40 space-y-1 text-[11px] text-muted-foreground">
                <p>FC: {t.frequencia_cardiaca ?? "—"} · Temp: {t.temperatura ?? "—"} °C</p>
                <p>Peso: {t.peso ?? "—"} kg · Altura: {t.altura ?? "—"} · IMC: {t.imc ?? "—"}</p>
                {t.alergias?.length > 0 && (
                  <p className="flex items-start gap-1 text-destructive"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> Alergias: {t.alergias.join(", ")}</p>
                )}
                {t.tecnico_nome && <p>Responsável: {t.tecnico_nome}</p>}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default React.memo(TriagensPacienteTab);

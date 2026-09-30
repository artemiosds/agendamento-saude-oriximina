import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Entry {
  patient_id: string; patient_name: string; profession: string;
  discharge_date: string; release_date: string; unit_name: string | null; scope: string;
}
const brDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");

export default function RelatorioCareniaProfissional() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("list_active_profession_careness");
      if (error) throw error;
      setRows((data || []) as Entry[]);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar as carências.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <Card className="shadow-card border-0"><CardContent className="p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-warning" /> Pacientes em carência</h2>
        <p className="text-sm text-muted-foreground">Somente restrições vigentes; alta, profissão consolidada, liberação e unidade de origem.</p></div>
      <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="w-4 h-4 mr-2" /> Atualizar</Button>
    </div>
    {loading ? <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Carregando…</div> :
      rows.length === 0 ? <p className="text-sm text-muted-foreground rounded-md bg-muted/40 p-5">Não há pacientes em carência ativa.</p> :
      <div className="overflow-x-auto rounded-md border"><table className="w-full text-sm">
        <thead><tr className="bg-muted/60 text-left"><th className="p-3">Paciente</th><th className="p-3">Profissão</th><th className="p-3">Data da alta</th><th className="p-3">Liberação</th><th className="p-3">Unidade de origem</th><th className="p-3">Escopo</th></tr></thead>
        <tbody>{rows.map(row => <tr key={`${row.patient_id}-${row.profession}-${row.discharge_date}`} className="border-t">
          <td className="p-3 font-medium">{row.patient_name}</td><td className="p-3">{row.profession}</td>
          <td className="p-3">{brDate(row.discharge_date)}</td><td className="p-3">{brDate(row.release_date)}</td>
          <td className="p-3">{row.unit_name || "Unidade não identificada"}</td><td className="p-3">{row.scope === "global" ? "Global" : "Só unidade"}</td>
        </tr>)}</tbody></table></div>}
  </CardContent></Card>;
}

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Notice { profession: string; discharge_date: string; release_date: string; source_unit_id: string; scope: string }
const brDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");

export function PatientProfessionCarenessNotice({ patientId }: { patientId: string }) {
  const [items, setItems] = useState<Notice[]>([]);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await (supabase as any).rpc("list_patient_profession_careness", { p_patient_id: patientId });
      if (active) setItems(error ? [] : (data || []) as Notice[]);
    })();
    return () => { active = false; };
  }, [patientId]);
  if (!items.length) return null;
  return <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm space-y-1" role="status">
    <p className="font-semibold text-warning flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Carência pós‑alta ativa</p>
    {items.map(item => <p key={`${item.profession}-${item.discharge_date}`} className="text-foreground">
      {item.profession}: alta em {brDate(item.discharge_date)}; agendamentos liberados a partir de {brDate(item.release_date)}{item.scope === "global" ? " em todas as unidades" : " nesta unidade"}.
    </p>)}
  </div>;
}

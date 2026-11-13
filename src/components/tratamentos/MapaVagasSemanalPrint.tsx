import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { openPrintDocument } from "@/lib/printLayout";
import { buildWeeklySafeOfferMap, type CapacityPlanningInput, type CapacityPlanningProfessionalInput } from "@/lib/treatmentCapacityPlanning";
import { nowMinutesInBrazil, todayLocalStr } from "@/lib/utils";
import { renderWeeklyOfferMap, shortDate } from "@/lib/weeklyOfferPrint";

interface Props {
  input: CapacityPlanningInput;
  professionals: CapacityPlanningProfessionalInput[];
  loadedAt: number;
}

export default function MapaVagasSemanalPrint({ input, professionals, loadedAt }: Props) {
  const [printing, setPrinting] = useState(false);
  const map = useMemo(() => buildWeeklySafeOfferMap(input, professionals, nowMinutesInBrazil()), [input, professionals]);
  const unitNames = useMemo(() => new Map(input.professionals.map(p => [p.unitId, p.unitName || p.unitId])), [input.professionals]);

  const print = async () => {
    if (input.today !== todayLocalStr() || Date.now() - loadedAt > 120_000) {
      toast.error("Atualize os dados antes de imprimir o mapa de vagas.");
      return;
    }
    setPrinting(true);
    try {
      const freshMap = buildWeeklySafeOfferMap(input, professionals, nowMinutesInBrazil());
      if (!freshMap.complete) throw new Error("Dados incompletos para a semana");
      const emittedAt = new Date().toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" });
      await openPrintDocument("Mapa de Ofertas da Semana", renderWeeklyOfferMap(freshMap.rows, freshMap.startDate, freshMap.endDate, unitNames), {
        "Período": `${shortDate(freshMap.startDate)} a ${shortDate(freshMap.endDate)}`,
        "Emissão": emittedAt,
      });
    } catch (error) {
      console.error("Falha ao preparar o mapa semanal", error);
      toast.error("Não foi possível preparar o mapa semanal. Tente novamente.");
    } finally {
      setPrinting(false);
    }
  };

  return <Button type="button" variant="outline" size="sm" disabled={printing || !map.complete || !professionals.length}
    onClick={() => void print()} title={!map.complete ? "Os dados carregados não cobrem toda a próxima semana" : undefined}>
    <Printer className="mr-2 h-4 w-4" />{printing ? "Preparando mapa…" : "Imprimir Mapa de Ofertas da Semana"}
  </Button>;
}

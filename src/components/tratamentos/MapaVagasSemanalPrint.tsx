import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { openPrintDocument } from "@/lib/printLayout";
import { buildPeriodSafeOfferMap, getSafeOfferPeriod, type CapacityPlanningInput, type CapacityPlanningProfessionalInput } from "@/lib/treatmentCapacityPlanning";
import { nowMinutesInBrazil, todayLocalStr } from "@/lib/utils";
import { renderWeeklyOfferMap, shortDate } from "@/lib/weeklyOfferPrint";

interface Props {
  input: CapacityPlanningInput;
  professionals: CapacityPlanningProfessionalInput[];
  loadedAt: number;
  periodDays: number;
  disabled?: boolean;
}

export default function MapaVagasSemanalPrint({ input, professionals, loadedAt, periodDays, disabled = false }: Props) {
  const [printing, setPrinting] = useState(false);
  const printPeriod = getSafeOfferPeriod(input.today, periodDays);
  const complete = input.endDate >= printPeriod.endDate;
  const title = periodDays === 7 ? "Mapa de Ofertas da Semana" : `Mapa de Ofertas (${periodDays} dias)`;
  const unitNames = useMemo(() => new Map(input.professionals.map(p => [p.unitId, p.unitName || p.unitId])), [input.professionals]);

  const print = async () => {
    if (disabled) return;
    if (input.today !== todayLocalStr() || Date.now() - loadedAt > 120_000) {
      toast.error("Atualize os dados antes de imprimir o mapa de vagas.");
      return;
    }
    setPrinting(true);
    try {
      const freshMap = buildPeriodSafeOfferMap(input, professionals, nowMinutesInBrazil(), periodDays);
      if (!freshMap.complete) throw new Error("Dados incompletos para o período selecionado");
      const emittedAt = new Date().toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" });
      const documentTitle = periodDays === 7 ? title
        : `Mapa de Ofertas do Período — ${shortDate(freshMap.startDate)} a ${shortDate(freshMap.endDate)} (${periodDays} dias)`;
      await openPrintDocument(documentTitle, renderWeeklyOfferMap(freshMap.rows, freshMap.startDate, freshMap.endDate, unitNames, periodDays), {
        "Período": `${shortDate(freshMap.startDate)} a ${shortDate(freshMap.endDate)}${periodDays === 7 ? "" : ` (${periodDays} dias)`}`,
        "Emissão": emittedAt,
      });
    } catch (error) {
      console.error("Falha ao preparar o mapa de ofertas", error);
      toast.error("Não foi possível preparar o mapa de ofertas. Tente novamente.");
    } finally {
      setPrinting(false);
    }
  };

  return <Button type="button" variant="outline" size="sm" disabled={disabled || printing || !complete || !professionals.length}
    onClick={() => void print()} title={!complete ? "Os dados carregados não cobrem todo o período selecionado" : undefined}>
    <Printer className="mr-2 h-4 w-4" />{printing ? "Preparando mapa…" : `Imprimir ${title}`}
  </Button>;
}

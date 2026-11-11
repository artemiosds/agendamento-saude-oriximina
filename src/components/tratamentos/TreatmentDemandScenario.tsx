import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  buildTreatmentDemandScenario,
  type TreatmentDemandScenarioGroupInput,
  type DemandManagementStatus,
} from "@/lib/treatmentDemandScenario";

interface Props {
  groups: TreatmentDemandScenarioGroupInput[];
  periodDays: number;
  today: string;
  professionalFilterActive?: boolean;
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatWeeks(value: number | null) {
  if (value === null) return "Sem capacidade";
  if (value === 0) return "Sem fila";
  return formatNumber(value, 1) + " semana(s)";
}

function statusLabel(status: DemandManagementStatus) {
  switch (status) {
    case "priority_wait": return "Espera prioritária";
    case "capacity_bottleneck": return "Gargalo de capacidade";
    case "demand_above_capacity": return "Demanda acima da capacidade";
    case "capacity_above_unassigned_backlog": return "Capacidade acima da fila sem profissional";
    default: return "Equilíbrio estimado";
  }
}

function csvCell(value: string | number) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export default function TreatmentDemandScenario({
  groups,
  periodDays,
  today,
  professionalFilterActive = false,
}: Props) {
  const [additionalSlots, setAdditionalSlots] = useState("0");
  const [additionalSlotsByGroup, setAdditionalSlotsByGroup] = useState<Record<string, string>>({});
  const normalizedAdditionalSlots = Math.max(
    0,
    Math.min(1000, Math.floor(Number(additionalSlots) || 0)),
  );
  const scenarioGroups = useMemo(() => groups.map((group) => {
    const key = group.unitId + "|" + group.specialty;
    const override = additionalSlotsByGroup[key];
    return {
      ...group,
      additionalSlotsPerWeek: override === undefined || override.trim() === ""
        ? normalizedAdditionalSlots
        : Math.max(0, Math.min(1000, Math.floor(Number(override) || 0))),
    };
  }), [groups, additionalSlotsByGroup, normalizedAdditionalSlots]);

  const results = useMemo(() => buildTreatmentDemandScenario({
    today,
    periodDays,
    additionalSlotsPerWeek: normalizedAdditionalSlots,
    groups: scenarioGroups,
  }), [today, periodDays, normalizedAdditionalSlots, scenarioGroups]);

  const totalBacklog = results.reduce((sum, row) => sum + row.backlog, 0);
  const totalWithoutDate = results.reduce((sum, row) => sum + row.withoutDate, 0);
  const priorityGroups = results.filter((row) => row.managementStatus === "priority_wait").length;
  const bottleneckGroups = results.filter((row) =>
    row.managementStatus === "capacity_bottleneck" || row.managementStatus === "demand_above_capacity",
  ).length;
  const capacityAboveBacklogGroups = results.filter((row) =>
    row.managementStatus === "capacity_above_unassigned_backlog",
  ).length;

  const exportCsv = () => {
    const headers = [
      "Unidade", "Especialidade", "Fila sem profissional", "0-7 dias", "8-30 dias",
      "31-90 dias", "Mais de 90 dias", "Sem data válida", "Capacidade líquida no período",
      "Vagas adicionais simuladas por semana", "Prazo atual em semanas",
      "Prazo simulado em semanas", "Redução estimada em dias", "Leitura gerencial", "Recomendação",
    ];
    const rows = results.map((row) => [
      row.unitName,
      row.specialty,
      row.backlog,
      row.cohort0To7,
      row.cohort8To30,
      row.cohort31To90,
      row.cohortOver90,
      row.withoutDate,
      row.netPeriodCapacity,
      row.additionalSlotsPerWeek,
      row.baselineWeeksToClear === null ? "Sem capacidade" : row.baselineWeeksToClear.toFixed(2),
      row.simulatedWeeksToClear === null ? "Sem capacidade" : row.simulatedWeeksToClear.toFixed(2),
      row.estimatedDaysReduced === null ? "Não calculável" : row.estimatedDaysReduced.toFixed(2),
      statusLabel(row.managementStatus),
      row.managementNote,
    ]);
    const csv = "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "relatorio-demanda-tratamentos-" + today + ".csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4" aria-label="Simulador gerencial de demanda">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">Comparação de cenários e prioridades gerenciais</h3>
          <p className="max-w-3xl text-xs text-muted-foreground">
            Compare a fila e a capacidade por unidade/especialidade. Defina vagas adicionais por grupo e exporte o quadro para análise. Nada é gravado na agenda ou na fila.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-full sm:w-56">
            <Label htmlFor="treatment-extra-slots">Vagas adicionais padrão por semana</Label>
            <Input
              id="treatment-extra-slots"
              type="number"
              min={0}
              max={1000}
              step={1}
              value={additionalSlots}
              onChange={(event) => setAdditionalSlots(event.target.value)}
              className="mt-1"
            />
          </div>
          <Button type="button" variant="outline" onClick={exportCsv} disabled={results.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Exportar relatório
          </Button>
        </div>
      </div>

      {professionalFilterActive && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-300">
          O filtro de profissional restringe a capacidade considerada, mas a demanda sem profissional continua representando o total da unidade/especialidade.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Demanda sem profissional</p>
            <p className="text-xl font-semibold tabular-nums">{formatNumber(totalBacklog)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Pedidos sem data válida</p>
            <p className="text-xl font-semibold tabular-nums">{formatNumber(totalWithoutDate)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Grupos com espera acima de 90 dias</p>
            <p className="text-xl font-semibold tabular-nums">{formatNumber(priorityGroups)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Grupos com gargalo de capacidade</p>
            <p className="text-xl font-semibold tabular-nums">{formatNumber(bottleneckGroups)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Capacidade acima da fila sem profissional</p>
            <p className="text-xl font-semibold tabular-nums">{formatNumber(capacityAboveBacklogGroups)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-[1480px] w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Unidade / especialidade</th>
              <th className="px-3 py-2 text-right font-medium">Fila sem profissional</th>
              <th className="px-3 py-2 text-right font-medium">0–7 dias</th>
              <th className="px-3 py-2 text-right font-medium">8–30 dias</th>
              <th className="px-3 py-2 text-right font-medium">31–90 dias</th>
              <th className="px-3 py-2 text-right font-medium">Mais de 90</th>
              <th className="px-3 py-2 text-right font-medium">Sem data</th>
              <th className="px-3 py-2 text-right font-medium">Capacidade líquida/semana</th>
              <th className="px-3 py-2 text-right font-medium">Vagas extras/semana</th>
              <th className="px-3 py-2 text-right font-medium">Prazo atual</th>
              <th className="px-3 py-2 text-right font-medium">Prazo simulado</th>
              <th className="px-3 py-2 text-right font-medium">Redução estimada</th>
              <th className="px-3 py-2 font-medium">Leitura gerencial</th>
            </tr>
          </thead>
          <tbody>
            {results.map((row) => {
              const key = row.unitId + "|" + row.specialty;
              const override = additionalSlotsByGroup[key];
              return (
                <tr key={key} className="border-t border-border align-top">
                  <td className="px-3 py-3 font-medium">
                    {row.unitName}
                    <p className="text-xs text-muted-foreground">{row.specialty}</p>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNumber(row.backlog)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNumber(row.cohort0To7)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNumber(row.cohort8To30)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNumber(row.cohort31To90)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNumber(row.cohortOver90)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNumber(row.withoutDate)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatNumber(row.baselineSlotsPerWeek, 1)}
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(row.availableAppointments)} vagas − {formatNumber(row.pendingSessions)} sessões no período
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Input
                      aria-label={"Vagas extras por semana para " + row.unitName + " — " + row.specialty}
                      type="number"
                      min={0}
                      max={1000}
                      step={1}
                      value={override === undefined ? additionalSlots : override}
                      onChange={(event) => setAdditionalSlotsByGroup((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))}
                      className="ml-auto w-24 text-right"
                    />
                    <p className="text-xs text-muted-foreground">
                      {override === undefined || override.trim() === "" ? "Padrão" : "Personalizado"}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatWeeks(row.baselineWeeksToClear)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatWeeks(row.simulatedWeeksToClear)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {row.estimatedDaysReduced === null ? "—" : formatNumber(row.estimatedDaysReduced, 1) + " dia(s)"}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{statusLabel(row.managementStatus)}</p>
                    <p className="max-w-xs text-xs text-muted-foreground">{row.managementNote}</p>
                  </td>
                </tr>
              );
            })}
            {results.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-6 text-center text-muted-foreground">
                  Não há solicitações aptas sem profissional no escopo atual para comparar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        A priorização é exclusivamente gerencial e usa a data_solicitacao_original válida; não representa classificação clínica ou prioridade assistencial. “Capacidade acima da fila sem profissional” não significa ociosidade comprovada: outras demandas direcionadas podem consumir essa oferta. O prazo é uma estimativa linear do estoque atual, calculada pela capacidade livre do período selecionado menos sessões pendentes. Não estima novas entradas, sazonalidade, ausências ou mudanças futuras de grade; os dias poupados são comparação matemática, não promessa de atendimento.
      </p>
    </section>
  );
}

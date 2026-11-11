import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildTreatmentDemandScenario,
  type TreatmentDemandScenarioGroupInput,
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

export default function TreatmentDemandScenario({
  groups,
  periodDays,
  today,
  professionalFilterActive = false,
}: Props) {
  const [additionalSlots, setAdditionalSlots] = useState("0");
  const normalizedAdditionalSlots = Math.max(
    0,
    Math.min(1000, Math.floor(Number(additionalSlots) || 0)),
  );
  const results = useMemo(() => buildTreatmentDemandScenario({
    today,
    periodDays,
    additionalSlotsPerWeek: normalizedAdditionalSlots,
    groups,
  }), [today, periodDays, normalizedAdditionalSlots, groups]);

  const totalBacklog = results.reduce((sum, row) => sum + row.backlog, 0);
  const totalWithoutDate = results.reduce((sum, row) => sum + row.withoutDate, 0);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4" aria-label="Simulador gerencial de demanda">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">Simulador de ampliação da capacidade</h3>
          <p className="max-w-3xl text-xs text-muted-foreground">
            Simule vagas adicionais por semana para cada combinação de unidade e especialidade. O cenário é somente consultivo e não altera fila, horários, profissionais ou agendamentos.
          </p>
        </div>
        <div className="w-full sm:w-64">
          <Label htmlFor="treatment-extra-slots">Vagas adicionais por semana (por unidade/especialidade)</Label>
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
      </div>

      {professionalFilterActive && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-300">
          O filtro de profissional restringe a capacidade considerada, mas a demanda sem profissional continua representando o total da unidade/especialidade.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Demanda sem profissional neste cenário</p>
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
            <p className="text-xs text-muted-foreground">Vagas extras simuladas por grupo</p>
            <p className="text-xl font-semibold tabular-nums">{formatNumber(normalizedAdditionalSlots)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-[1120px] w-full text-left text-sm">
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
              <th className="px-3 py-2 text-right font-medium">Prazo atual</th>
              <th className="px-3 py-2 text-right font-medium">Prazo simulado</th>
              <th className="px-3 py-2 text-right font-medium">Redução estimada</th>
            </tr>
          </thead>
          <tbody>
            {results.map((row) => (
              <tr key={row.unitId + "|" + row.specialty} className="border-t border-border">
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
                    {formatNumber(row.availableAppointments)} vagas − {formatNumber(row.pendingSessions)} sessões, no período
                  </p>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{formatWeeks(row.baselineWeeksToClear)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatWeeks(row.simulatedWeeksToClear)}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {row.estimatedDaysReduced === null ? "—" : formatNumber(row.estimatedDaysReduced, 1) + " dia(s)"}
                </td>
              </tr>
            ))}
            {results.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">
                  Não há solicitações aptas sem profissional no escopo atual para simular.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        A distribuição por idade usa somente data_solicitacao_original válida dos registros apto_atendimento sem profissional. O prazo é uma estimativa linear do estoque atual, calculada pela capacidade livre do período selecionado menos as sessões pendentes. Não estima novas solicitações, sazonalidade, ausências ou mudanças futuras de grade; os dias poupados são uma comparação matemática, não uma promessa de prazo de atendimento.
      </p>
    </section>
  );
}

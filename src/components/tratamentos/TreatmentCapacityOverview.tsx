import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, CalendarDays, Clock3, RefreshCw, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUnidadeFilter } from "@/hooks/useUnidadeFilter";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addDaysToDateStr, todayLocalStr } from "@/lib/utils";
import {
  buildTreatmentCapacitySnapshot,
  classifyTreatmentCapacitySpecialty,
  extractExplicitCboCode,
  type CapacityAppointmentInput,
  type CapacityAvailabilityInput,
  type CapacityBlockInput,
  type CapacityProfessionalInput,
  type PendingTreatmentSessionInput,
  type QueueDemandInput,
  type TreatmentCapacitySnapshot,
} from "@/lib/treatmentCapacityAnalytics";

const PAGE_SIZE = 1000;
const ACTIVE_CYCLE_STATUSES = ["em_andamento", "ativo", "aguardando_vaga", "em_fila", "concluido"];

async function fetchAllPages<T>(createQuery: (from: number, to: number) => any): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await createQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data || []) as T[];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

function chunk<T>(items: T[], size = 100) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function specialtyColor(specialty: string) {
  return specialty === "Fisioterapia"
    ? "border-sky-500/25 bg-sky-500/5"
    : "border-violet-500/25 bg-violet-500/5";
}

export default function TreatmentCapacityOverview() {
  const { user, isGlobalAdmin } = useAuth();
  const { unidadesVisiveis, userUnidadeId } = useUnidadeFilter();
  const { can: hasPermission, loading: permissionsLoading } = usePermissions();
  const [periodDays, setPeriodDays] = useState("30");
  const [unitFilter, setUnitFilter] = useState(isGlobalAdmin ? "all" : userUnidadeId);
  const [specialtyFilter, setSpecialtyFilter] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [snapshot, setSnapshot] = useState<TreatmentCapacitySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [queueReadStatus, setQueueReadStatus] = useState<"loading" | "available" | "unavailable">("loading");
  const [queueWarning, setQueueWarning] = useState("");
  const requestRef = useRef(0);

  useEffect(() => {
    if (isGlobalAdmin) setUnitFilter("all");
    else if (userUnidadeId) setUnitFilter(userUnidadeId);
  }, [isGlobalAdmin, userUnidadeId]);

  useEffect(() => {
    const requestId = ++requestRef.current;
    let cancelled = false;

    const run = async () => {
      if (permissionsLoading) {
        setLoading(true);
        return;
      }
      if (!isGlobalAdmin && !userUnidadeId) {
        setSnapshot(null);
        setError("Seu usuário não possui unidade definida. A consulta foi interrompida para evitar exibição fora do escopo.");
        setLoading(false);
        return;
      }

      const effectiveUnit = isGlobalAdmin ? unitFilter : userUnidadeId;
      if (!effectiveUnit) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      setQueueReadStatus("loading");
      setQueueWarning("");
      const today = todayLocalStr();
      const horizon = Number(periodDays);
      const endDate = addDaysToDateStr(today, horizon - 1);
      const periodDates = Array.from({ length: horizon }, (_, index) => addDaysToDateStr(today, index));

      try {
        const availabilityRows = await fetchAllPages<any>((from, to) => {
          let query = supabase
            .from("disponibilidades" as any)
            .select("id,profissional_id,unidade_id,data_inicio,data_fim,dias_semana,vagas_por_dia")
            .gte("data_fim", today)
            .lte("data_inicio", endDate);
          if (effectiveUnit !== "all") query = query.eq("unidade_id", effectiveUnit);
          if (user?.role === "profissional" && user?.id) query = query.eq("profissional_id", user.id);
          return query.range(from, to);
        });

        const availabilityProfessionalIds = [...new Set(
          availabilityRows.map((row) => String(row.profissional_id || "")).filter(Boolean),
        )];

        const loadStaff = async (ids?: string[]) => {
          if (ids && ids.length === 0) return [];
          const results: any[] = [];
          const groups = ids ? chunk(ids, 100) : [null];
          for (const group of groups) {
            const rows = await fetchAllPages<any>((from, to) => {
              let query = supabase
                .from("funcionarios" as any)
                .select("id,nome,profissao,role,unidade_id,ativo,custom_data")
                .eq("ativo", true)
                .eq("role", "profissional");
              if (group) query = query.in("id", group);
              else if (effectiveUnit !== "all") query = query.eq("unidade_id", effectiveUnit);
              if (user?.role === "profissional" && user?.id) query = query.eq("id", user.id);
              return query.order("nome", { ascending: true }).range(from, to);
            });
            results.push(...rows);
          }
          return results;
        };

        const primaryStaff = await loadStaff();
        const knownStaffIds = new Set(primaryStaff.map((row) => String(row.id)));
        const additionalIds = availabilityProfessionalIds.filter((id) => !knownStaffIds.has(id));
        const additionalStaff: any[] = [];
        for (const ids of chunk(additionalIds, 100)) additionalStaff.push(...await loadStaff(ids));

        const staffById = new Map<string, any>();
        [...primaryStaff, ...additionalStaff].forEach((row) => staffById.set(String(row.id), row));
        const targetStaff = [...staffById.values()].filter((row) =>
          row.ativo === true &&
          row.role === "profissional" &&
          classifyTreatmentCapacitySpecialty(String(row.profissao || "")) !== null &&
          (user?.role !== "profissional" || String(row.id) === String(user.id)),
        );

        const unitNameById = new Map(
          unidadesVisiveis.map((unit) => [String(unit.id), String(unit.nome || unit.nomeExibicao || unit.id)] as const),
        );

        if (targetStaff.length === 0) {
          const emptySnapshot = buildTreatmentCapacitySnapshot({
            today,
            periodDates,
            professionals: [],
            availabilities: [],
            appointments: [],
            blocks: [],
            pendingSessions: [],
            queueDemand: [],
          });
          if (!cancelled && requestRef.current === requestId) {
            setSnapshot(emptySnapshot);
            setQueueReadStatus("unavailable");
            setQueueWarning("A consulta da fila não foi executada porque não há profissionais-alvo no escopo selecionado.");
            setError("Não foram encontrados profissionais ativos de Fisioterapia ou Fonoaudiologia no escopo selecionado.");
          }
          return;
        }

        const targetIds = targetStaff.map((row) => String(row.id));
        const [appointmentRows, blockRows] = await Promise.all([
          (async () => {
            const rows: any[] = [];
            for (const ids of chunk(targetIds, 100)) {
              rows.push(...await fetchAllPages<any>((from, to) => {
                let query = supabase
                  .from("agendamentos" as any)
                  .select("profissional_id,unidade_id,data,hora,status")
                  .in("profissional_id", ids)
                  .gte("data", today)
                  .lte("data", endDate);
                if (effectiveUnit !== "all") query = query.eq("unidade_id", effectiveUnit);
                return query.range(from, to);
              }));
            }
            return rows;
          })(),
          fetchAllPages<any>((from, to) => supabase
            .from("bloqueios" as any)
            .select("data_inicio,data_fim,unidade_id,profissional_id,dia_inteiro,hora_inicio,hora_fim")
            .lte("data_inicio", endDate)
            .gte("data_fim", today)
            .range(from, to)),
        ]);

        const targetPairs = new Map<string, { staff: any; unitId: string }>();
        for (const staff of targetStaff) {
          const id = String(staff.id);
          const units = new Set<string>();
          const primaryUnit = String(staff.unidade_id || "");
          if (primaryUnit && (effectiveUnit === "all" || effectiveUnit === primaryUnit)) units.add(primaryUnit);
          for (const availability of availabilityRows) {
            if (String(availability.profissional_id) !== id) continue;
            const unitId = String(availability.unidade_id || "");
            if (unitId && (effectiveUnit === "all" || effectiveUnit === unitId)) units.add(unitId);
          }
          for (const unitId of units) targetPairs.set(id + "|" + unitId, { staff, unitId });
        }

        const activePairs = new Set(targetPairs.keys());
        const cycleRows: any[] = [];
        for (const ids of chunk(targetIds, 100)) {
          cycleRows.push(...await fetchAllPages<any>((from, to) => {
            let query = supabase
              .from("treatment_cycles" as any)
              .select("id,professional_id,unit_id,status")
              .in("professional_id", ids)
              .in("status", ACTIVE_CYCLE_STATUSES);
            if (effectiveUnit !== "all") query = query.eq("unit_id", effectiveUnit);
            return query.range(from, to);
          }));
        }

        const relevantCycles = cycleRows.filter((cycle) =>
          activePairs.has(String(cycle.professional_id) + "|" + String(cycle.unit_id)),
        );
        const cycleById = new Map<string, any>(
          relevantCycles.map((cycle) => [String(cycle.id), cycle] as const),
        );
        const cycleIds = relevantCycles.map((cycle) => String(cycle.id));
        const sessionRows: any[] = [];
        for (const ids of chunk(cycleIds, 100)) {
          sessionRows.push(...await fetchAllPages<any>((from, to) => supabase
            .from("treatment_sessions" as any)
            .select("cycle_id,professional_id,status,scheduled_date,appointment_id")
            .in("cycle_id", ids)
            .eq("status", "pendente_agendamento")
            .range(from, to)));
        }

        const fetchQueue = (term: string) => fetchAllPages<any>((from, to) => {
          let query = supabase
            .from("fila_espera" as any)
            .select("id,unidade_id,profissional_id,especialidade_destino,setor,data_solicitacao_original,custom_data")
            .eq("status", "apto_atendimento")
            .or("especialidade_destino.ilike.%" + term + "%,setor.ilike.%" + term + "%");
          if (effectiveUnit !== "all") query = query.eq("unidade_id", effectiveUnit);
          return query.range(from, to);
        });

        let queueRows: any[] = [];
        let nextQueueReadStatus: "available" | "unavailable" = "unavailable";
        let nextQueueWarning = "";
        const mayReadQueue = isGlobalAdmin || user?.role === "master" || hasPermission("fila", "can_view");
        if (mayReadQueue) {
          try {
            const [physioQueue, speechQueue] = await Promise.all([
              fetchQueue("fisioterap"),
              fetchQueue("fonoaud"),
            ]);
            const uniqueQueue = new Map<string, any>();
            [...physioQueue, ...speechQueue].forEach((row) => uniqueQueue.set(String(row.id), row));
            queueRows = [...uniqueQueue.values()];
            nextQueueReadStatus = "available";
          } catch (queueError: any) {
            nextQueueWarning = queueError?.message
              ? "A fila apta não pôde ser consultada: " + queueError.message
              : "A fila apta não pôde ser consultada. Os indicadores de fila serão exibidos como não disponíveis.";
          }
        } else {
          nextQueueWarning = "Seu perfil não possui permissão de leitura da fila. Os indicadores de fila não serão exibidos.";
        }

        const professionals: CapacityProfessionalInput[] = [...targetPairs.values()].map(({ staff, unitId }) => ({
          id: String(staff.id),
          name: String(staff.nome || "Profissional sem nome"),
          profession: String(staff.profissao || ""),
          unitId,
          unitName: unitNameById.get(unitId) || unitId,
          cboCode: extractExplicitCboCode(staff.custom_data),
        }));

        const availabilities: CapacityAvailabilityInput[] = availabilityRows
          .filter((row) => targetStaff.some((staff) => String(staff.id) === String(row.profissional_id)))
          .filter((row) => effectiveUnit === "all" || String(row.unidade_id) === effectiveUnit)
          .map((row) => ({
            professionalId: String(row.profissional_id),
            unitId: String(row.unidade_id),
            startDate: String(row.data_inicio),
            endDate: String(row.data_fim),
            weekdays: Array.isArray(row.dias_semana) ? row.dias_semana.map(Number) : [],
            vacanciesPerDay: Math.max(0, Number(row.vagas_por_dia) || 0),
          }));

        const appointments: CapacityAppointmentInput[] = appointmentRows.map((row) => ({
          professionalId: String(row.profissional_id),
          unitId: String(row.unidade_id),
          date: String(row.data || ""),
          time: row.hora ? String(row.hora) : null,
          status: String(row.status || ""),
        }));

        const blocks: CapacityBlockInput[] = blockRows.map((row) => ({
          startDate: String(row.data_inicio || ""),
          endDate: String(row.data_fim || ""),
          unitId: row.unidade_id ? String(row.unidade_id) : null,
          professionalId: row.profissional_id ? String(row.profissional_id) : null,
          allDay: row.dia_inteiro === true || (row.dia_inteiro == null && (!row.hora_inicio || !row.hora_fim)),
          startTime: row.hora_inicio ? String(row.hora_inicio) : null,
          endTime: row.hora_fim ? String(row.hora_fim) : null,
        }));

        const pendingSessions: PendingTreatmentSessionInput[] = sessionRows.flatMap((session) => {
          const cycle = cycleById.get(String(session.cycle_id));
          if (!cycle) return [];
          return [{
            professionalId: String(session.professional_id || cycle.professional_id),
            unitId: String(cycle.unit_id),
            status: String(session.status),
            scheduledDate: session.scheduled_date ? String(session.scheduled_date) : null,
            appointmentId: session.appointment_id ? String(session.appointment_id) : null,
          }];
        });

        const queueDemand: QueueDemandInput[] = queueRows.map((row) => ({
          id: String(row.id),
          unitId: String(row.unidade_id || ""),
          professionalId: row.profissional_id ? String(row.profissional_id) : null,
          destinationProfession: row.especialidade_destino ? String(row.especialidade_destino) : null,
          sector: row.setor ? String(row.setor) : null,
          requestDate: row.data_solicitacao_original ? String(row.data_solicitacao_original) : null,
          cboCode: extractExplicitCboCode(row.custom_data, String(row.especialidade_destino || "")),
        }));

        const nextSnapshot = buildTreatmentCapacitySnapshot({
          today,
          periodDates,
          professionals,
          availabilities,
          appointments,
          blocks,
          pendingSessions,
          queueDemand,
        });

        if (!cancelled && requestRef.current === requestId) {
          setSnapshot(nextSnapshot);
          setQueueReadStatus(nextQueueReadStatus);
          setQueueWarning(nextQueueWarning);
          setError("");
        }
      } catch (loadError: any) {
        if (!cancelled && requestRef.current === requestId) {
          setSnapshot(null);
          setQueueReadStatus("unavailable");
          setQueueWarning("Os indicadores de fila estão indisponíveis porque a leitura geral falhou.");
          setError(loadError?.message || "Não foi possível consultar os dados de capacidade e demanda.");
        }
      } finally {
        if (!cancelled && requestRef.current === requestId) setLoading(false);
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [periodDays, unitFilter, refreshKey, isGlobalAdmin, userUnidadeId, user?.id, user?.role, unidadesVisiveis, permissionsLoading, hasPermission]);

  const visibleProfessionals = useMemo(() => {
    if (!snapshot) return [];
    if (specialtyFilter === "all") return snapshot.professionals;
    return snapshot.professionals.filter((row) => row.specialty === specialtyFilter);
  }, [snapshot, specialtyFilter]);

  const visibleSpecialties = useMemo(() => {
    if (!snapshot) return [];
    if (specialtyFilter === "all") return snapshot.specialties;
    return snapshot.specialties.filter((row) => row.specialty === specialtyFilter);
  }, [snapshot, specialtyFilter]);

  const totalConfiguredSlots = visibleSpecialties.reduce((sum, row) => sum + row.configuredSlots, 0);
  const totalAppointments = visibleSpecialties.reduce((sum, row) => sum + row.occupiedAppointments, 0);
  const totalPendingSessions = visibleSpecialties.reduce((sum, row) => sum + row.pendingSessions, 0);
  const totalQueueDemand = visibleSpecialties.reduce((sum, row) => sum + row.queueDemand, 0);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4" aria-label="Visão de capacidade e demanda">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Capacidade e demanda</h2>
          <p className="text-sm text-muted-foreground">Visão gerencial somente para Fisioterapia e Fonoaudiologia. Nenhum agendamento, fila ou tratamento é alterado.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Período da capacidade</p>
          <Select value={periodDays} onValueChange={setPeriodDays}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Próximos 30 dias</SelectItem>
              <SelectItem value="60">Próximos 60 dias</SelectItem>
              <SelectItem value="90">Próximos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Unidade</p>
          {isGlobalAdmin ? (
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as unidades</SelectItem>
                {unidadesVisiveis.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>{unit.nome || unit.nomeExibicao || unit.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex h-10 items-center rounded-md border border-input px-3 text-sm">
              {unidadesVisiveis.find((unit) => unit.id === userUnidadeId)?.nome || userUnidadeId || "Unidade não definida"}
            </div>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Especialidade</p>
          <Select value={specialtyFilter} onValueChange={setSpecialtyFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Fisioterapia e Fonoaudiologia</SelectItem>
              <SelectItem value="Fisioterapia">Fisioterapia</SelectItem>
              <SelectItem value="Fonoaudiologia">Fonoaudiologia</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {queueWarning && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{queueWarning}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-24 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : snapshot ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground"><CalendarDays className="h-4 w-4" /><span className="text-xs">Vagas programadas no período</span></div>
                <p className="text-2xl font-bold tabular-nums">{formatNumber(totalConfiguredSlots)}</p>
                <p className="text-xs text-muted-foreground">Soma bruta de vagas/dia cadastradas, após bloqueios integrais</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground"><Activity className="h-4 w-4" /><span className="text-xs">Agendamentos que ocupam vaga</span></div>
                <p className="text-2xl font-bold tabular-nums">{formatNumber(totalAppointments)}</p>
                <p className="text-xs text-muted-foreground">No mesmo período, conforme a regra atual de status</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground"><Clock3 className="h-4 w-4" /><span className="text-xs">Sessões pendentes</span></div>
                <p className="text-2xl font-bold tabular-nums">{formatNumber(totalPendingSessions)}</p>
                <p className="text-xs text-muted-foreground">Ciclos ativos, sem vínculo de agendamento e sem reserva automática</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground"><Users className="h-4 w-4" /><span className="text-xs">Solicitações aptas na fila</span></div>
                <p className="text-2xl font-bold tabular-nums">{queueReadStatus === "available" ? formatNumber(totalQueueDemand) : "—"}</p>
                <p className="text-xs text-muted-foreground">Backlog apto_atendimento, separado da fila operacional</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {visibleSpecialties.map((row) => (
              <Card key={row.specialty} className={specialtyColor(row.specialty)}>
                <CardHeader className="pb-2"><CardTitle className="text-base">{row.specialty}</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Vagas programadas (brutas)</p><p className="font-semibold tabular-nums">{formatNumber(row.configuredSlots)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Agendamentos ativos</p><p className="font-semibold tabular-nums">{formatNumber(row.occupiedAppointments)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Sessões pendentes</p><p className="font-semibold tabular-nums">{formatNumber(row.pendingSessions)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Solicitações aptas</p><p className="font-semibold tabular-nums">{queueReadStatus === "available" ? formatNumber(row.queueDemand) : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Sessões com data vencida</p><p className="font-semibold tabular-nums">{formatNumber(row.pendingOverdue)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Sessões sem data</p><p className="font-semibold tabular-nums">{formatNumber(row.pendingUndated)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Dias com bloqueio integral</p><p className="font-semibold tabular-nums">{formatNumber(row.blockedDays)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Dias com bloqueio parcial</p><p className="font-semibold tabular-nums">{formatNumber(row.partialBlockDays)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Atribuições compatíveis por CBO</p><p className="font-semibold tabular-nums">{queueReadStatus === "available" ? formatNumber(row.queueAssignedCompatible) : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Atribuições incompatíveis</p><p className="font-semibold tabular-nums">{queueReadStatus === "available" ? formatNumber(row.queueAssignedIncompatible) : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Atribuições não confirmáveis</p><p className="font-semibold tabular-nums">{queueReadStatus === "available" ? formatNumber(row.queueAssignedUnconfirmable) : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Solicitações sem CBO</p><p className="font-semibold tabular-nums">{queueReadStatus === "available" ? formatNumber(row.queueWithoutCbo) : "—"}</p></div>
                  <div className="col-span-2 border-t border-border/60 pt-2">
                    <p className="text-xs text-muted-foreground">Espera com data original válida</p>
                    <p className="font-semibold">{row.averageWaitDays === null ? "Sem base de datas válida" : "Média de " + formatNumber(row.averageWaitDays) + " dia(s) • Mais antiga: " + formatNumber(row.oldestWaitDays || 0) + " dia(s)"}</p>
                    <p className="text-xs text-muted-foreground">{queueReadStatus === "available" ? formatNumber(row.queueWithoutValidRequestDate) : "—"} solicitação(ões) sem data original válida, fora da média</p>
                    <p className="text-xs text-muted-foreground">{queueReadStatus === "available" ? formatNumber(row.queueUnassigned) : "—"} solicitação(ões) sem profissional direcionado</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-[1040px] w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Profissional</th>
                  <th className="px-3 py-2 font-medium">Especialidade / CBO</th>
                  <th className="px-3 py-2 font-medium">Unidade</th>
                  <th className="px-3 py-2 text-right font-medium">Vagas programadas</th>
                  <th className="px-3 py-2 text-right font-medium">Agendamentos</th>
                  <th className="px-3 py-2 text-right font-medium">Sessões pendentes</th>
                  <th className="px-3 py-2 text-right font-medium">Fila compatível</th>
                  <th className="px-3 py-2 text-right font-medium">Fila não confirmável</th>
                </tr>
              </thead>
              <tbody>
                {visibleProfessionals.map((row) => (
                  <tr key={row.professionalId + "|" + row.unitId} className="border-t border-border">
                    <td className="px-3 py-3 font-medium">{row.professionalName}</td>
                    <td className="px-3 py-3">{row.specialty}<p className="text-xs text-muted-foreground">{row.cboCode ? "CBO " + row.cboCode : "CBO não cadastrado"}</p></td>
                    <td className="px-3 py-3">{row.unitName}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatNumber(row.configuredSlots)}<p className="text-xs text-muted-foreground">{formatNumber(row.scheduledDays)} dia(s) programado(s) • {formatNumber(row.multipleWindowDays)} com múltiplas faixas</p></td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatNumber(row.occupiedAppointments)}{row.appointmentsWithoutAvailableSchedule > 0 && <p className="text-xs text-amber-600">{formatNumber(row.appointmentsWithoutAvailableSchedule)} sem grade ou dentro de bloqueio</p>}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatNumber(row.pendingSessions)}<p className="text-xs text-muted-foreground">{formatNumber(row.pendingUndated)} sem data • {formatNumber(row.pendingOverdue)} vencida(s)</p>{row.pendingWithAppointmentLink > 0 && <p className="text-xs text-amber-600">{formatNumber(row.pendingWithAppointmentLink)} pendente(s) com vínculo</p>}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{queueReadStatus === "available" ? formatNumber(row.assignedQueueDemand) : "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{queueReadStatus === "available" ? formatNumber(row.assignedQueueUnconfirmable + row.assignedQueueIncompatible) : "—"}</td>
                  </tr>
                ))}
                {visibleProfessionals.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Nenhum profissional encontrado para os filtros selecionados.</td></tr>}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Leitura gerencial: vagas programadas são a soma de vagas_por_dia na grade, após bloqueios integrais. Não representam horários livres. Bloqueios parciais são sinalizados separadamente; quotas externas, sobreposições de faixas e capacidade interna livre ainda não são deduzidas. Agendamentos ocupantes seguem a regra atual do sistema. Sessões pendentes e fila apta são fontes distintas e não são somadas. A espera considera somente data_solicitacao_original válida. CBO ausente ou divergente nunca é tratado como compatível.
          </p>
          <p className="text-xs text-muted-foreground">
            A capacidade considera o período selecionado; as sessões pendentes e as solicitações aptas representam o estoque atual de demanda, independentemente desse horizonte.
          </p>
        </>
      ) : null}
    </section>
  );
}

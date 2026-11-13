import { containsEvaluationSlot, readRegulationCapacity, type RegulationScope, type RegulationSelection } from "@/services/regulationCapacity";
import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isCompleteAgendaDate } from "@/contexts/_agendamentosBridge";
import { addDaysToDateStr, todayLocalStr } from "@/lib/utils";
import {
  classifyDayAvailability, classifyCardAvailability, breakdownPendingByProfessionalUnit, estimateContinuityByDay, emptyBreakdown,
  totalsByUnitSpecialty, isStrictlyCompatible, strictSpecialtyOf, ACTIVE_CYCLE_STATUSES,
  type DailyContinuityResult, type ContinuityEstimate, type DayAvailabilityState, type PendingBreakdown, type PendingSessionRow, type ManualAvailabilityScope,
} from "@/lib/localizarVagas";
import type { User } from "@/types";

const MAX_DATES_PER_PROF = 5;

interface Props {
  profissionais: User[];
  unidades: { id: string; nome: string }[];
  getAvailableSlots: (profId: string, unidadeId: string, date: string, isPublic?: boolean, lead?: number | null) => string[];
  loadAgendaRange: (start: string, end: string) => Promise<void>;
  regulation?: RegulationScope & { requestId?: string };
  manualScope?: ManualAvailabilityScope;
  onDismissRegulation?: () => void;
  onDismissManualScope?: () => void;
  onUseManualSearch?: () => void;
  onPick: (profissionalId: string, date: string, hora: string, selection?: RegulationSelection) => void;
}

interface ProfResult {
  prof: User;
  compatible: boolean;
  days: { date: string; state: DayAvailabilityState; slots: string[] }[];
  freeSlots: number;
  allLoaded: boolean;
  pending: PendingBreakdown | null;
  continuity: DailyContinuityResult;
}

/** Busca pendências sem vínculo SOMENTE de ciclos ativos, com a unidade do próprio ciclo. */
export async function fetchActivePendingRows(professionalIds: string[], unitId?: string): Promise<PendingSessionRow[] | null> {
  if (!professionalIds.length) return [];
  const cycles = new Map<string, { status: string; unit_id: string }>();
  for (let from = 0; ; from += 1000) {
    let query = supabase.from("treatment_cycles")
      .select("id,status,unit_id").in("professional_id", professionalIds)
      .in("status", [...ACTIVE_CYCLE_STATUSES]);
    if (unitId) query = query.eq("unit_id", unitId);
    const { data, error } = await query.range(from, from + 999);
    if (error || !data) return null;
    data.forEach((c: any) => cycles.set(c.id, { status: c.status, unit_id: c.unit_id }));
    if (data.length < 1000) break;
  }
  const ids = [...cycles.keys()];
  const rows: PendingSessionRow[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("treatment_sessions")
        .select("cycle_id,professional_id,status,appointment_id,scheduled_date")
        .in("cycle_id", chunk).eq("status", "pendente_agendamento").is("appointment_id", null)
        .range(from, from + 999);
      if (error || !data) return null;
      data.forEach((r: any) => {
        const c = cycles.get(r.cycle_id);
        rows.push({ ...r, cycle_status: c?.status ?? null, unit_id: c?.unit_id ?? null });
      });
      if (data.length < 1000) break;
    }
  }
  return rows;
}

const fmt = (d: string) => d.split("-").reverse().join("/");
const continuityLabel: Record<ContinuityEstimate, string> = {
  estimada_favoravel: "Continuidade estimada: há perspectiva de capacidade",
  comprometida: "Continuidade estimada: capacidade comprometida",
  nao_confirmada: "Capacidade não confirmada",
};

export function LocalizarVagasPanel({ profissionais, unidades, getAvailableSlots, loadAgendaRange, onPick, regulation, manualScope, onDismissRegulation, onDismissManualScope, onUseManualSearch }: Props) {
  const [open, setOpen] = useState(!!regulation || !!manualScope);
  const [selectedPatient, setSelectedPatient] = useState<string>();
  const [selectedRequestId, setSelectedRequestId] = useState(regulation?.requestId || "");
  const searchRef = useRef(0);
  const [servico, setServico] = useState(regulation?.specialty || manualScope?.specialty || "");
  const [unidadeId, setUnidadeId] = useState(regulation?.unitId || manualScope?.unitId || "all");
  const [dias, setDias] = useState(String(regulation?.days || manualScope?.days || 15));
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [eligibilityError, setEligibilityError] = useState(false);
  const [pendingAvailable, setPendingAvailable] = useState(true);
  const [results, setResults] = useState<ProfResult[] | null>(null);
  const [unitTotals, setUnitTotals] = useState<{ unitId: string; specialty: string; total: PendingBreakdown | null }[]>([]);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const clinicos = useMemo(() => profissionais.filter((p) => p.ativo !== false && p.role === "profissional"), [profissionais]);
  // Serviços = profissões efetivamente cadastradas e identificáveis.
  const servicos = useMemo(() => {
    const set = new Set<string>();
    clinicos.forEach((p) => { const s = strictSpecialtyOf(p.profissao); if (s) set.add(s); });
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [clinicos]);
  const semProfissao = useMemo(() => clinicos.filter((p) => !strictSpecialtyOf(p.profissao)), [clinicos]);

  const buscar = async (requestId = selectedRequestId) => {
    if (!servico) return;
    const searchId = ++searchRef.current;
    const t0 = performance.now();
    setLoading(true); setResults(null); setLoadError(false); setEligibilityError(false);
    const start = todayLocalStr();
    const end = addDaysToDateStr(start, Number(dias) - 1);
    let agendaError = false;
    try { await loadAgendaRange(start, end); } catch { agendaError = true; }
    if (searchId !== searchRef.current) return;
    let safeSlots: Awaited<ReturnType<typeof readRegulationCapacity>> | undefined;
    let queueError = false;
    if (regulation && !agendaError) {
      try { safeSlots = await readRegulationCapacity(regulation, requestId || undefined); }
      catch { queueError = true; }
    }
    if (searchId !== searchRef.current) return;
    setSelectedPatient(safeSlots?.patientId);
    setLoadError(agendaError);
    setEligibilityError(queueError);
    const err = agendaError || queueError;

    const scopedProfessionalId = regulation?.professionalId || manualScope?.professionalId;
    const alvo = clinicos.filter((p) => (unidadeId === "all" || p.unidadeId === unidadeId) && (!scopedProfessionalId || p.id === scopedProfessionalId));
    const compat = alvo.filter((p) => isStrictlyCompatible(servico, p.profissao));
    const ids = compat.map((p) => p.id);

    let rows: PendingSessionRow[] | null = null;
    try { rows = await fetchActivePendingRows(ids, regulation?.unitId || manualScope?.unitId); } catch { rows = null; }
    if (searchId !== searchRef.current) return;
    const pendingMap = rows ? breakdownPendingByProfessionalUnit(rows, start, end) : null;
    setPendingAvailable(pendingMap !== null);

    const dates: string[] = [];
    for (let d = start; d <= end; d = addDaysToDateStr(d, 1)) dates.push(d);

    const out: ProfResult[] = compat.map((prof) => {
      const days = dates.map((date) => {
        const loaded = isCompleteAgendaDate(date);
        const offered = loaded && !err ? getAvailableSlots(prof.id, prof.unidadeId, date, false, null) : [];
        const slots = regulation ? offered.filter(time => safeSlots && containsEvaluationSlot(safeSlots.offers, date, time)) : offered;
        return { date, state: classifyDayAvailability({ loadError: err, dayLoaded: loaded, slots }), slots };
      });
      const allLoaded = days.every((d) => d.state !== "nao_carregado" && d.state !== "erro");
      const freeSlots = days.reduce((n, d) => n + d.slots.length, 0);
      const pending = pendingMap ? pendingMap.get(`${prof.id}|${prof.unidadeId || ""}`) || emptyBreakdown() : null;
      const freeSlotsByDate: Record<string, number> = {};
      days.forEach((d) => { freeSlotsByDate[d.date] = d.slots.length; });
      return { prof, compatible: true, days, freeSlots, allLoaded, pending,
        continuity: estimateContinuityByDay({ freeSlotsByDate: allLoaded ? freeSlotsByDate : null, pending, allDaysLoaded: allLoaded }) };
    });
    out.sort((a, b) => {
      const fa = a.days.find((d) => d.state === "com_vagas")?.date || "9999";
      const fb = b.days.find((d) => d.state === "com_vagas")?.date || "9999";
      return fa.localeCompare(fb);
    });
    // Totais por unidade (do ciclo) x especialidade, inclusive ciclos em unidade diferente da do profissional.
    const items: { unitId: string; specialty: string; pending: PendingBreakdown | null }[] = [];
    if (pendingMap) {
      pendingMap.forEach((b, key) => {
        const u = key.split("|")[1];
        if (unidadeId === "all" || u === unidadeId) items.push({ unitId: u, specialty: servico, pending: b });
      });
    }
    setUnitTotals(totalsByUnitSpecialty(items));
    setResults(out);
    setLoading(false);
    setElapsedMs(Math.round(performance.now() - t0));
  };

  useEffect(() => {
    if ((regulation || manualScope) && clinicos.length) void buscar();
    // O localizador regulado é montado novamente quando a navegação muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regulation?.professionalId, manualScope?.professionalId, clinicos.length]);

  const unitName = (id: string) => unidades.find((u) => u.id === id)?.nome || "Unidade não identificada";
  const pendLine = (b: PendingBreakdown) => `${b.total} (no período: ${b.noPeriodo} · vencidas: ${b.vencidas} · sem data: ${b.semData} · após o período: ${b.aposPeriodo})`;

  return (
    <Sheet open={open} onOpenChange={value => { setOpen(value); if (!value && regulation) onDismissRegulation?.(); if (!value && manualScope) onDismissManualScope?.(); }}>
      <SheetTrigger asChild>
        <Button variant="outline"><Search className="w-4 h-4 mr-2" /> Localizar Vagas</Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Localizar Vagas</SheetTitle>
          <SheetDescription>Horários reais da Agenda por serviço. Nada é agendado automaticamente.</SheetDescription>
        </SheetHeader>

        {regulation && <p className="mt-3 font-medium">{clinicos.find(p=>p.id===regulation.professionalId)?.nome} · {unitName(regulation.unitId)}</p>}
        {manualScope && <p className="mt-3 font-medium">Busca manual: {clinicos.find(p=>p.id===manualScope.professionalId)?.nome} · {unitName(manualScope.unitId)}. Selecione o paciente no formulário oficial após escolher a vaga.</p>}
        {manualScope && ["Fisioterapia", "Fonoaudiologia"].includes(manualScope.specialty) &&
          <p className="mt-3 rounded-md border border-amber-400/40 bg-amber-50 p-2 text-sm text-amber-950">{manualScope.queueReadUnavailable ? "Não foi possível conferir a fila nesta consulta. " : "Nenhuma solicitação pré-vinculada da fila. "}Selecione o paciente no formulário oficial. Esta busca não altera nem vincula registros da fila.</p>}
        {!!regulation?.candidates?.length && <div className="mt-3">
          <Label htmlFor="regulation-queue-patient">Paciente apto da fila, por data original da solicitação</Label>
          <select id="regulation-queue-patient" className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
            value={selectedRequestId} onChange={e=>{const requestId=e.target.value;searchRef.current++;setSelectedRequestId(requestId);setResults(null);setSelectedPatient(undefined);setLoading(false);void buscar(requestId);}}>
            <option value="">Selecione uma solicitação apta</option>
            {regulation.candidates.map(c=><option key={c.id} value={c.id}>{c.name} · {c.requestDate ? fmt(c.requestDate) : "Data não informada"}</option>)}
          </select>
          {selectedRequestId && <p className="mt-1 text-xs text-muted-foreground">A solicitação e as vagas são conferidas novamente antes de agendar.</p>}
        </div>}
        {regulation && !regulation.candidates?.length && <p className="mt-3 text-xs text-amber-700">Nenhuma solicitação apta com destino e CBO explícitos. Consulte o cadastro da fila antes de agendar por este atalho.</p>}
        <div className="grid gap-3 mt-4">
          <div>
            <Label>Serviço / especialidade</Label>
            <Select disabled={!!regulation || !!manualScope} value={servico} onValueChange={setServico}>
              <SelectTrigger><SelectValue placeholder="Escolha o serviço" /></SelectTrigger>
              <SelectContent>{servicos.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {unidades.length > 1 && (
              <div>
                <Label>Unidade</Label>
                <Select disabled={!!regulation || !!manualScope} value={unidadeId} onValueChange={setUnidadeId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Período</Label>
              <Select disabled={!!regulation || !!manualScope} value={dias} onValueChange={setDias}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Próximos 7 dias</SelectItem>
                  <SelectItem value="15">Próximos 15 dias</SelectItem>
                  <SelectItem value="30">Próximos 30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={() => void buscar()} disabled={!servico || loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />} Buscar
          </Button>
          <p className="text-xs text-muted-foreground flex gap-1"><Info className="w-3 h-3 mt-0.5 shrink-0" />
            Feriados, férias e bloqueios só são considerados quando cadastrados em Feriados e Bloqueios.</p>
          {semProfissao.length > 0 && (
            <p className="text-xs text-muted-foreground">{semProfissao.length} profissional(is) sem profissão identificável: capacidade não confirmada, não recomendados.</p>
          )}
        </div>

        {results && (
          <div className="mt-5 space-y-3">
            {loadError && <p className="text-sm text-destructive">Não foi possível carregar os horários da Agenda. Atualize a busca antes de escolher uma vaga.</p>}
            {eligibilityError && <div className="rounded-md border border-amber-400/40 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
              <p>Não foi possível confirmar a solicitação da fila. Nenhuma vaga regulada será liberada nem vinculada automaticamente.</p>
              {onUseManualSearch && <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onUseManualSearch}>Buscar vagas sem vincular à fila</Button>}
            </div>}
            <div className="rounded-md border p-3 text-sm space-y-1" data-testid="pendentes-totais">
              <p className="font-medium">Sessões pendentes de agendamento — {servico} (ciclos ativos, sem agendamento):</p>
              {!pendingAvailable ? <p>Informação não disponível</p>
                : unitTotals.length === 0 ? <p>{results.length ? "Nenhuma pendência encontrada nos registros acessíveis a este perfil" : "Informação não disponível"}</p>
                : unitTotals.map((t) => <p key={t.unitId}>{unitName(t.unitId)}: {t.total ? pendLine(t.total) : "Informação não disponível"}</p>)}
            </div>
            {results.length === 0 && <p className="text-sm text-muted-foreground">Nenhum profissional com compatibilidade confirmada para este serviço.</p>}
            {results.map((r) => {
              const comVaga = r.days.filter((d) => d.state === "com_vagas").slice(0, regulation || manualScope ? Number(dias) : MAX_DATES_PER_PROF);
              const naoCarregados = r.days.filter((d) => d.state === "nao_carregado").length;
              const card = classifyCardAvailability(r.days.map((d) => d.state));
              const cardLabel = card === "avaliacao_disponivel" ? "Avaliação disponível" : card === "sem_vaga_periodo" ? "Sem vaga no período" : "Disponibilidade não confirmada";
              return (
                <div key={r.prof.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{r.prof.nome}</p>
                      <p className="text-xs text-muted-foreground">{r.prof.profissao}{unidades.length > 1 ? ` · ${unidades.find((u) => u.id === r.prof.unidadeId)?.nome || ""}` : ""}</p>
                    </div>
                    <Badge variant={card === "avaliacao_disponivel" ? "default" : "secondary"}>{cardLabel}</Badge>
                  </div>
                  {comVaga.map((d) => (
                    <div key={d.date} className="flex flex-wrap items-center gap-1">
                      <span className="text-xs w-20">{fmt(d.date)}</span>
                      {d.slots.slice(0, 6).map((h) => (
                        <Button key={h} size="sm" variant="outline" className="h-7 px-2 text-xs"
                          disabled={!!regulation && (!selectedRequestId || !selectedPatient)}
                          onClick={() => { setOpen(false); onPick(r.prof.id, d.date, h, regulation ? { ...regulation, date:d.date, time:h, requestId:selectedRequestId || undefined, patientId:selectedPatient } : undefined); }}>{h}</Button>
                      ))}
                    </div>
                  ))}
                  {naoCarregados > 0 && <p className="text-xs text-muted-foreground">{naoCarregados} dia(s) ainda não carregado(s) — não significa sem vaga.</p>}
                  <p className="text-xs" data-testid="continuity-estimate">{r.continuity.estimate === "estimada_favoravel" && r.continuity.precisaRevisao
                    ? "Capacidade favorável para as sessões datadas neste período"
                    : continuityLabel[r.continuity.estimate]}
                    {r.continuity.estimate !== "nao_confirmada" && r.continuity.naoDistribuivel ? ` · ${r.continuity.naoDistribuivel} sessão(ões) não cabem nos horários livres do próprio dia (${r.continuity.diasEmConflito.map(fmt).join(", ")})` : ""}</p>
                  {r.continuity.precisaRevisao && <p className="text-xs text-warning" data-testid="continuity-review">Revisão necessária: há sessões vencidas ou sem data que precisam ser organizadas antes de confirmar a continuidade.</p>}
                  <p className="text-[11px] text-muted-foreground">A estimativa não reserva horários nem garante a continuidade do tratamento.</p>
                  <p className="text-xs text-muted-foreground">{r.pending ? `Pendentes nesta unidade: ${pendLine(r.pending)}` : "Pendentes: informação não disponível"}
                    {r.pending && r.pending.semData ? " — sessões sem data não entram na estimativa." : ""}</p>
                  <p className="text-xs text-muted-foreground">Continuidade a confirmar: depende do plano definido pelo profissional (simulação no Novo Ciclo).</p>
                </div>
              );
            })}
          </div>
        )}
        {elapsedMs !== null && <p className="mt-3 text-[11px] text-muted-foreground">Consulta concluída em {(elapsedMs / 1000).toFixed(1)} s.</p>}
      </SheetContent>
    </Sheet>
  );
}

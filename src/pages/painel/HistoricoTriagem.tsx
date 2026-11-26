import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOperacional } from "@/contexts/OperacionalContext";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DebouncedInput } from "@/components/ui/debounced-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Eye, Pencil, ChevronLeft, ChevronRight, Loader2, ClipboardList, HeartPulse, UserRound, CalendarClock, SlidersHorizontal, List, LayoutList, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MANCHESTER_LEVELS, getManchesterConfig } from "@/lib/manchesterProtocol";
import { ModalEdicaoTriagem } from "@/components/Triagem/ModalEdicaoTriagem";
import { normalizePatientSearch, searchTriageHistoryIndex, TRIAGE_INDEX_COLUMNS } from '@/services/triageHistorySearch';

interface TriageRecord {
  id: string;
  agendamento_id: string;
  tecnico_id: string;
  classificacao_risco: string;
  peso: number | null;
  altura: number | null;
  pressao_arterial: string | null;
  temperatura: number | null;
  frequencia_cardiaca: number | null;
  saturacao_oxigenio: number | null;
  glicemia: number | null;
  imc: number | null;
  alergias: string[] | null;
  medicamentos: string[] | null;
  queixa: string | null;
  observacoes: string | null;
  iniciado_em: string | null;
  confirmado_em: string | null;
  criado_em: string | null;
}

interface NursingEval {
  anamnese_resumida: string | null;
  observacoes_clinicas: string | null;
  avaliacao_risco: string | null;
  condicao_clinica: string | null;
  motivo_inapto: string | null;
  prioridade: string | null;
  resultado: string | null;
}

interface TriageRecordRow extends TriageRecord {
  custom_data?: { paciente_nome?: string } | null;
}

type TriageIndexRow = Pick<TriageRecordRow,
  "id" | "agendamento_id" | "tecnico_id" | "classificacao_risco" | "criado_em" | "confirmado_em" | "custom_data"
>;

interface EnrichedRecord extends TriageRecord {
  pacienteNome: string;
  profissionalNome: string;
  classificacaoRisco: string;
  nursing?: NursingEval | null;
}

const PAGE_SIZE = 20;
const SCAN_SIZE = 100;


const riskBadge = (risk: string) => {
  const config = getManchesterConfig(risk);
  if (!config) return <Badge variant="outline">—</Badge>;
  return (
    <Badge
      className={cn("gap-1.5 whitespace-normal border text-xs font-semibold", config.bgLight)}
      style={{ borderColor: config.color, color: "inherit" }}
    >
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: config.color }} />
      {config.subtitle}
    </Badge>
  );
};

const HistoricoTriagem: React.FC = () => {
  const { user } = useAuth();
  const { funcionarios } = useOperacional();
  const [records, setRecords] = useState<EnrichedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("todos");
  const [professionalFilter, setProfessionalFilter] = useState("todos");
  const [compact, setCompact] = useState(false);
  // Reuse the existing directory, including inactive staff for historical records.
  const professionals = useMemo(() => funcionarios.filter(f => !user?.unidadeId || user.usuario === "admin.sms" || f.unidadeId === user.unidadeId)
    .slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), [funcionarios, user?.unidadeId, user?.usuario]);
  const professionalAuthId = professionals.find(f => f.id === professionalFilter)?.authUserId || "";
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [selected, setSelected] = useState<EnrichedRecord | null>(null);
  const [editing, setEditing] = useState<EnrichedRecord | null>(null);
  const requestId = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const scanCache = useRef({ key: "", matched: [] as string[], offset: 0, exhausted: false });

  // Only triage records on the requested page receive their clinical details.
  const resolveNames = async <T extends TriageIndexRow,>(rows: T[], signal: AbortSignal) => {
    if (!rows.length) return [];
    const ids = [...new Set(rows.map((r) => r.agendamento_id))];
    const [agRes, filaRes] = await Promise.all([
      supabase.from("agendamentos").select("id, paciente_id, paciente_nome, unidade_id").in("id", ids).abortSignal(signal),
      supabase.from("fila_espera").select("id, paciente_id, paciente_nome, unidade_id").in("id", ids).abortSignal(signal),
    ]);
    if (agRes.error) throw agRes.error;
    if (filaRes.error) throw filaRes.error;
    const agMap = new Map((agRes.data || []).map((a) => [a.id, a]));
    const filaMap = new Map((filaRes.data || []).map((f) => [f.id, f]));
    const patientIds = [...new Set([...agMap.values(), ...filaMap.values()].map((r) => r.paciente_id).filter((id): id is string => !!id))];
    const pacMap = new Map<string, string>();
    if (patientIds.length) {
      const { data, error } = await supabase.from("pacientes").select("id, nome").in("id", patientIds).abortSignal(signal);
      if (error) throw error;
      (data || []).forEach((p) => { if (p.nome) pacMap.set(p.id, p.nome); });
    }
    return rows.map((r) => {
      const ag = agMap.get(r.agendamento_id);
      const filaItem = filaMap.get(r.agendamento_id);
      const pacienteNome =
        (ag?.paciente_id && pacMap.get(ag.paciente_id)) ||
        (filaItem?.paciente_id && pacMap.get(filaItem.paciente_id)) ||
        ag?.paciente_nome || filaItem?.paciente_nome ||
        r.custom_data?.paciente_nome ||
        (r.agendamento_id ? `Agendamento ${String(r.agendamento_id).slice(0, 8)}` : "Paciente não encontrado");
      return { record: r, pacienteNome, unidadeId: ag?.unidade_id, filaUnidadeId: filaItem?.unidade_id };
    });
  };

  const loadData = useCallback(async () => {
    const currentRequest = ++requestId.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    const signal = controller.signal;
    const role = user?.role?.toLowerCase().trim();
    if (role !== "master" && role !== "tecnico") return;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    setLoadError(false);
    try {
      const searchTerm = normalizePatientSearch(search);
      const needsLookup = !!searchTerm || !!(user?.unidadeId && user.usuario !== "admin.sms");
      const makeQuery = (columns: string, count: "exact" | undefined = undefined) => {
        // Supabase's generated SelectQueryError cannot infer a runtime column list.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query = (supabase.from("triage_records") as any).select(columns, count ? { count } : undefined);
        if (riskFilter !== "todos") query = query.ilike("classificacao_risco", riskFilter);
        if (professionalFilter !== "todos") query = query.in("tecnico_id", [...new Set([professionalFilter, professionalAuthId].filter(Boolean))]);
        if (dateFrom || dateTo) {
          const from = dateFrom ? `,confirmado_em.gte.${dateFrom}T00:00:00` : "";
          const to = dateTo ? `,confirmado_em.lte.${dateTo}T23:59:59` : "";
          const createdFrom = dateFrom ? `,criado_em.gte.${dateFrom}T00:00:00` : "";
          const createdTo = dateTo ? `,criado_em.lte.${dateTo}T23:59:59` : "";
          query = query.or(`and(confirmado_em.not.is.null${from}${to}),and(confirmado_em.is.null${createdFrom}${createdTo})`);
        }
        return query.order("criado_em", { ascending: false }).order("id", { ascending: false }).abortSignal(signal);
      };

      let pageIds: string[] = [];
      let count: number | null = null;
      let more = false;
      if (!needsLookup) {
        const { data, count: exactCount, error } = await makeQuery("id", "exact")
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) throw error;
        pageIds = (data || []).map((r) => r.id);
        count = exactCount ?? 0;
        more = (page + 1) * PAGE_SIZE < count;
      } else {
        // Named searches query related IDs first. The unit-only listing retains
        // its existing small-batch scan because there is no appointment FK.
        const key = JSON.stringify([user?.id, user?.role, user?.unidadeId, user?.usuario, search, riskFilter, professionalFilter, professionalAuthId, dateFrom, dateTo]);
        if (scanCache.current.key !== key) {
          scanCache.current = { key, matched: [], offset: 0, exhausted: false };
        }
        const cache = scanCache.current;
        if (searchTerm && !cache.exhausted) {
          const candidates = await searchTriageHistoryIndex<TriageIndexRow>(searchTerm, makeQuery, signal);
          const matched: string[] = [];
          for (let offset = 0; offset < candidates.length; offset += SCAN_SIZE) {
            const resolved = await resolveNames(candidates.slice(offset, offset + SCAN_SIZE), signal);
            if (currentRequest !== requestId.current) return;
            for (const item of resolved) {
              if (user?.unidadeId && user.usuario !== "admin.sms" && item.unidadeId !== user.unidadeId && item.filaUnidadeId !== user.unidadeId) continue;
              if (normalizePatientSearch(item.pacienteNome).includes(searchTerm)) matched.push(item.record.id);
            }
          }
          if (currentRequest !== requestId.current) return;
          cache.matched = matched;
          cache.exhausted = true;
        }
        const target = (page + 1) * PAGE_SIZE + 1;
        while (cache.matched.length < target && !cache.exhausted) {
          const { data, error } = await makeQuery(TRIAGE_INDEX_COLUMNS)
            .range(cache.offset, cache.offset + SCAN_SIZE - 1);
          if (error) throw error;
          if (currentRequest !== requestId.current) return;
          const batch = (data || []) as TriageIndexRow[];
          const resolved = await resolveNames(batch, signal);
          if (currentRequest !== requestId.current) return;
          for (const item of resolved) {
            if (user?.unidadeId && user.usuario !== "admin.sms" && item.unidadeId !== user.unidadeId && item.filaUnidadeId !== user.unidadeId) continue;
            if (searchTerm && !normalizePatientSearch(item.pacienteNome).includes(searchTerm)) continue;
            cache.matched.push(item.record.id);
          }
          cache.offset += batch.length;
          cache.exhausted = batch.length < SCAN_SIZE;
        }
        if (cache.exhausted) count = cache.matched.length;
        pageIds = cache.matched.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        more = cache.matched.length > (page + 1) * PAGE_SIZE;
      }

      if (currentRequest !== requestId.current) return;
      const { data: detailRows, error: detailError } = pageIds.length
        ? await supabase.from("triage_records").select("*").in("id", pageIds).abortSignal(signal)
        : { data: [] as TriageRecordRow[], error: null };
      if (detailError) throw detailError;
      const byId = new Map<string, TriageRecordRow>((detailRows || []).map((r: TriageRecordRow) => [r.id, r] as const));
      const rows = pageIds.map((id) => byId.get(id)).filter((r): r is TriageRecordRow => !!r);
      const names = await resolveNames(rows, signal);
      const appointmentIds = [...new Set(rows.map((r) => r.agendamento_id))];
      // Both funcionario keys are UUIDs, while historical tecnico_id is free text.
      const techIds = [...new Set(rows.map((r) => r.tecnico_id).filter((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
      ))];
      const [nursRes, funcIdRes, funcAuthRes] = await Promise.all([
        appointmentIds.length ? supabase.from("nursing_evaluations").select("agendamento_id, anamnese_resumida, observacoes_clinicas, avaliacao_risco, condicao_clinica, motivo_inapto, prioridade, resultado").in("agendamento_id", appointmentIds).abortSignal(signal) : Promise.resolve({ data: [], error: null }),
        techIds.length ? supabase.from("funcionarios").select("id, nome, auth_user_id").in("id", techIds).abortSignal(signal) : Promise.resolve({ data: [], error: null }),
        techIds.length ? supabase.from("funcionarios").select("id, nome, auth_user_id").in("auth_user_id", techIds).abortSignal(signal) : Promise.resolve({ data: [], error: null }),
      ]);
      if (nursRes.error) throw nursRes.error;
      if (funcIdRes.error) throw funcIdRes.error;
      if (funcAuthRes.error) throw funcAuthRes.error;
      const funcMap = new Map<string, string>();
      [...(funcIdRes.data || []), ...(funcAuthRes.data || [])].forEach((f) => {
        funcMap.set(f.id, f.nome);
        if (f.auth_user_id) funcMap.set(f.auth_user_id, f.nome);
      });
      const nursMap = new Map<string, NursingEval>();
      (nursRes.data || []).forEach((n) => { if (n.agendamento_id) nursMap.set(n.agendamento_id, n); });
      if (currentRequest !== requestId.current) return;
      setRecords(names.map(({ record, pacienteNome }) => ({
        ...record,
        pacienteNome,
        profissionalNome: funcMap.get(record.tecnico_id) || "—",
        classificacaoRisco: record.classificacao_risco || "",
        nursing: nursMap.get(record.agendamento_id) || null,
      })));
      setTotalCount(count);
      setHasNext(more);
      setHasLoaded(true);
    } catch {
      console.error("Erro ao carregar histórico de triagem.");
      if (currentRequest === requestId.current) {
        setLoadError(true);
      }
    } finally {
      window.clearTimeout(timeout);
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [user?.id, user?.role, user?.usuario, user?.unidadeId, page, search, riskFilter, professionalFilter, professionalAuthId, dateFrom, dateTo]);

  useEffect(() => {
    void loadData();
    const activeRequest = requestId.current;
    return () => { requestId.current = activeRequest + 1; requestController.current?.abort(); };
  }, [loadData]);

  const totalPages = totalCount === null ? null : Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paged = records;

  useEffect(() => { setPage(0); }, [search, riskFilter, professionalFilter, dateFrom, dateTo]);
  const clearFilters = () => { setPage(0); setSearch(""); setRiskFilter("todos"); setProfessionalFilter("todos"); setDateFrom(""); setDateTo(""); };
  const hasFilters = !!search || riskFilter !== "todos" || professionalFilter !== "todos" || !!dateFrom || !!dateTo;

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return d; }
  };

  const role = user?.role?.toLowerCase().trim();
  if (role !== "master" && role !== "tecnico") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="text-5xl">🔒</div>
        <h2 className="text-xl font-bold">Acesso não autorizado</h2>
      </div>
    );
  }

  return (
    <div className="space-y-3 min-w-0">
      <header className="clinical-hub-hero flex flex-wrap items-center gap-3">
        <span className="clinical-patient-avatar flex items-center justify-center shrink-0"><ClipboardList className="h-6 w-6" /></span>
        <div className="flex-1 min-w-[12rem]"><p className="clinical-hub-eyebrow">Documentação assistencial</p><h1 className="clinical-hub-name text-xl font-bold font-display">Histórico de Triagem</h1><p className="clinical-patient-sub text-xs mt-1">Consulta clínica · registros e avaliação de enfermagem</p></div>
        <div className="triage-hero-metric min-w-[8rem]"><p className="clinical-patient-sub text-xs">{totalCount === null ? "Nesta página" : "Registros encontrados"}</p><p className="text-2xl font-bold tabular-nums text-white">{loading ? "…" : (totalCount ?? records.length).toLocaleString("pt-BR")}</p><p className="clinical-patient-sub text-xs">{PAGE_SIZE} registros por página</p></div>
      </header>

      {/* Filters */}
      <Card className="clinical-premium">
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-bold"><SlidersHorizontal className="w-4 h-4 text-[var(--cp-blue)]" /> Localizar registro clínico</h2><Button type="button" size="sm" variant="outline" className="clinical-record-action" onClick={clearFilters} disabled={!hasFilters}><RotateCcw className="w-4 h-4" /> Limpar filtros</Button></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div>
              <Label htmlFor="triagem-nome-paciente" className="text-xs">Buscar paciente</Label>
              <form className="relative" onSubmit={(event) => {
                event.preventDefault();
                const input = event.currentTarget.elements.namedItem('pacienteSearch') as HTMLInputElement | null;
                if (input?.value === search && page === 0 && !loading) {
                  scanCache.current.key = '';
                  void loadData();
                  return;
                }
                setPage(0);
                setSearch(input?.value || '');
              }}>
                <DebouncedInput id="triagem-nome-paciente" name="pacienteSearch" autoComplete="off" className="pl-10 bg-background backdrop-blur-none placeholder:text-muted-foreground" placeholder="Nome do paciente..." value={search} onChange={(e) => { setPage(0); setSearch(e.target.value); }} debounceMs={300} />
                <button type="submit" aria-label="Pesquisar paciente" title="Pesquisar paciente"
                  className="absolute left-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#2A6F97] hover:bg-[#2A6F97]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2A6F97] dark:text-sky-300">
                  <Search aria-hidden="true" className="h-4 w-4" />
                </button>
              </form>
            </div>
            <div>
              <Label htmlFor="historico-risco" className="text-xs font-semibold clinical-field-label">Classificação de risco</Label>
              <Select value={riskFilter} onValueChange={v => { setPage(0); setRiskFilter(v); }}>
                <SelectTrigger id="historico-risco" className="text-left"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {MANCHESTER_LEVELS.map((m) => (
                    <SelectItem key={m.level} value={m.level}>
                      <span style={{ color: m.color }}>●</span> {m.subtitle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label htmlFor="historico-profissional" className="text-xs font-semibold clinical-field-label">Triagem realizada por</Label>
              <Select value={professionalFilter} onValueChange={v => { setPage(0); setProfessionalFilter(v); }}><SelectTrigger id="historico-profissional" className="text-left"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os profissionais</SelectItem>{professionals.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}{!f.ativo ? " (inativo)" : ""}</SelectItem>)}</SelectContent></Select>
            </div>
            <div>
              <Label htmlFor="historico-data-de" className="text-xs font-semibold clinical-field-label">Data inicial</Label>
              <Input id="historico-data-de" type="date" value={dateFrom} onChange={(e) => { setPage(0); setDateFrom(e.target.value); }} />
            </div>
            <div>
              <Label htmlFor="historico-data-ate" className="text-xs font-semibold clinical-field-label">Data final</Label>
              <Input id="historico-data-ate" type="date" value={dateTo} onChange={(e) => { setPage(0); setDateTo(e.target.value); }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 border-t pt-3" role="group" aria-label="Filtro rápido de risco">{[{level:"todos",subtitle:"Todos",color:"#64748b"},...MANCHESTER_LEVELS].map(m => <Button key={m.level} type="button" size="sm" variant="outline" aria-pressed={riskFilter === m.level} onClick={() => { setPage(0); setRiskFilter(m.level); }} className={cn("clinical-record-action h-8 text-xs",riskFilter === m.level && "ring-2 ring-primary/60 font-bold")}><span className="h-2 w-2 rounded-full shrink-0" style={{backgroundColor:m.color}} />{m.subtitle}</Button>)}</div>
        </CardContent>
      </Card>

      {/* Table */}
      {loading && !hasLoaded ? (
        <div role="status" aria-label="Carregando histórico de triagem" className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : loadError && paged.length === 0 ? (
        <Card className="border-0 shadow-card">
          <CardContent role="alert" className="p-8 text-center text-destructive">Não foi possível carregar o histórico de triagem. Tente novamente.</CardContent>
        </Card>
      ) : !loading && !loadError && paged.length === 0 ? (
        <Card className="border-0 shadow-card">
          <CardContent className="p-8 text-center text-muted-foreground">Nenhum registro encontrado.</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {loading && <p role="status" className="text-sm text-muted-foreground">Atualizando histórico de triagem...</p>}
          {loadError && <p role="alert" className="text-sm text-destructive">Não foi possível atualizar o histórico de triagem. Exibindo os últimos resultados carregados.</p>}
        <Card className="clinical-premium overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b p-3"><span className="clinical-dock-icon clinical-tone-blue"><List className="w-4 h-4" /></span><div className="flex-1 min-w-0"><h2 className="text-sm font-bold">Registros assistenciais</h2><p className="text-xs clinical-field-label">Mais recentes primeiro · risco registrado na data da triagem</p></div><div className="flex gap-1" role="group" aria-label="Densidade da lista"><Button type="button" size="sm" variant="outline" aria-pressed={!compact} className={cn("clinical-record-action",!compact&&"ring-2 ring-primary/50")} onClick={()=>setCompact(false)}><LayoutList className="w-4 h-4" /> Detalhado</Button><Button type="button" size="sm" variant="outline" aria-pressed={compact} className={cn("clinical-record-action",compact&&"ring-2 ring-primary/50")} onClick={()=>setCompact(true)}><List className="w-4 h-4" /> Compacto</Button></div></div>
          <div className="divide-y">
            {paged.map(r => <article key={r.id} className={cn("grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.75fr)_minmax(0,1.4fr)_auto] gap-2 lg:gap-3 items-center px-3",compact?"py-2":"py-3")}>
              <div className="flex items-center gap-2 min-w-0"><span aria-hidden="true" className="clinical-dock-icon clinical-tone-blue"><UserRound className="w-4 h-4" /></span><div className="min-w-0"><p className="text-sm font-bold break-words">{r.pacienteNome}</p><p className="text-xs clinical-field-label tabular-nums flex items-center gap-1"><CalendarClock className="w-3 h-3 shrink-0" />{formatDate(r.confirmado_em || r.criado_em)}</p></div></div>
              <div>{riskBadge(r.classificacaoRisco)}</div>
              <div className="min-w-0"><p className={cn("text-sm break-words",compact?"line-clamp-1":"line-clamp-3")}>{r.queixa || "—"}</p><p className="text-xs clinical-field-label mt-1">Triagem realizada por</p><p className="text-sm font-semibold clinical-record-type break-words">{r.profissionalNome === "—" ? "Profissional não identificado" : r.profissionalNome}</p></div>
              <div className="flex flex-wrap gap-2 lg:justify-end"><Button type="button" size="sm" variant="outline" className="clinical-record-action clinical-action-main" onClick={()=>setSelected(r)}><Eye className="w-4 h-4" /> Ver ficha</Button><Button type="button" size="sm" variant="outline" className="clinical-record-action clinical-action-edit" onClick={()=>setEditing(r)}><Pencil className="w-4 h-4" /> Editar</Button></div>
            </article>)}
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-3">
            <span className="text-sm text-muted-foreground">Página {page + 1}{totalPages !== null ? ` de ${totalPages}` : ""}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="clinical-record-action" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              <Button size="sm" variant="outline" className="clinical-record-action" disabled={!hasNext || loading} onClick={() => setPage((p) => p + 1)}>
                Próxima <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90dvh] w-[96vw] max-w-3xl overflow-y-auto">
          <DialogHeader className="clinical-hub-hero pr-8"><p className="clinical-hub-eyebrow">Ficha clínica · registro histórico</p><DialogTitle className="clinical-hub-name font-display break-words">{selected?.pacienteNome || "Detalhes da Triagem"}</DialogTitle><p className="clinical-patient-sub text-xs">{selected && formatDate(selected.confirmado_em || selected.criado_em)}</p></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="clinical-premium p-3 space-y-2">
                <p className="text-sm"><strong>Paciente:</strong> {selected.pacienteNome}</p>
                <p className="text-sm"><strong>Triagem realizada por:</strong> {selected.profissionalNome === "—" ? "Profissional não identificado" : selected.profissionalNome}</p>
                <p className="text-sm"><strong>Data:</strong> {formatDate(selected.confirmado_em || selected.criado_em)}</p>
                {selected.classificacaoRisco && (
                  <p className="text-sm flex items-center gap-2"><strong>Risco:</strong> {riskBadge(selected.classificacaoRisco)}</p>
                )}
              </div>

              <div>
                <h4 className="triage-section-title mb-2"><HeartPulse className="w-4 h-4" /> Sinais vitais e biometria</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                  <div className="rounded-lg border bg-muted/30 p-3 font-semibold tabular-nums"><span className="block text-xs font-medium text-muted-foreground mb-1">Peso</span> {selected.peso ? `${selected.peso} kg` : "—"}</div>
                  <div className="rounded-lg border bg-muted/30 p-3 font-semibold tabular-nums"><span className="block text-xs font-medium text-muted-foreground mb-1">Altura</span> {selected.altura ? `${selected.altura} cm` : "—"}</div>
                  <div className="rounded-lg border bg-muted/30 p-3 font-semibold tabular-nums"><span className="block text-xs font-medium text-muted-foreground mb-1">IMC</span> {selected.imc ?? "—"}</div>
                  <div className="rounded-lg border bg-muted/30 p-3 font-semibold tabular-nums"><span className="block text-xs font-medium text-muted-foreground mb-1">PA</span> {selected.pressao_arterial || "—"}</div>
                  <div className="rounded-lg border bg-muted/30 p-3 font-semibold tabular-nums"><span className="block text-xs font-medium text-muted-foreground mb-1">FC</span> {selected.frequencia_cardiaca ? `${selected.frequencia_cardiaca} bpm` : "—"}</div>
                  <div className="rounded-lg border bg-muted/30 p-3 font-semibold tabular-nums"><span className="block text-xs font-medium text-muted-foreground mb-1">Temp</span> {selected.temperatura ? `${selected.temperatura} °C` : "—"}</div>
                  <div className="rounded-lg border bg-muted/30 p-3 font-semibold tabular-nums"><span className="block text-xs font-medium text-muted-foreground mb-1">SatO2</span> {selected.saturacao_oxigenio ? `${selected.saturacao_oxigenio}%` : "—"}</div>
                  <div className="rounded-lg border bg-muted/30 p-3 font-semibold tabular-nums"><span className="block text-xs font-medium text-muted-foreground mb-1">Glicemia</span> {selected.glicemia ? `${selected.glicemia} mg/dL` : "—"}</div>
                </div>
              </div>

              {selected.queixa && (
                <div>
                  <h4 className="text-sm font-semibold mb-1">Queixa Principal</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selected.queixa}</p>
                </div>
              )}

              {selected.alergias && selected.alergias.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-1">Alergias</h4>
                  <div className="flex flex-wrap gap-1">
                    {selected.alergias.map((a, i) => <Badge key={i} variant="destructive" className="text-xs">{a}</Badge>)}
                  </div>
                </div>
              )}

              {selected.medicamentos && selected.medicamentos.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-1">Medicamentos em Uso</h4>
                  <div className="flex flex-wrap gap-1">
                    {selected.medicamentos.map((m, i) => <Badge key={i} variant="secondary" className="text-xs">{m}</Badge>)}
                  </div>
                </div>
              )}

              {selected.observacoes && selected.observacoes.trim() && (
                <div>
                  <h4 className="text-sm font-semibold mb-1">Observações Gerais (Triagem)</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap rounded border bg-muted/30 p-2">{selected.observacoes}</p>
                </div>
              )}

              {selected.nursing && (
                <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <h4 className="text-sm font-semibold text-primary">Avaliação de Enfermagem</h4>

                  {selected.nursing.anamnese_resumida?.trim() && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-0.5">Notações de Enfermagem (Anamnese)</p>
                      <p className="text-sm whitespace-pre-wrap rounded border bg-background p-2">{selected.nursing.anamnese_resumida}</p>
                    </div>
                  )}

                  {selected.nursing.condicao_clinica?.trim() && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-0.5">Condição Clínica</p>
                      <p className="text-sm whitespace-pre-wrap rounded border bg-background p-2">{selected.nursing.condicao_clinica}</p>
                    </div>
                  )}

                  {selected.nursing.avaliacao_risco?.trim() && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-0.5">Avaliação Complementar / Risco</p>
                      <p className="text-sm whitespace-pre-wrap rounded border bg-background p-2">{selected.nursing.avaliacao_risco}</p>
                    </div>
                  )}

                  {selected.nursing.observacoes_clinicas?.trim() && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-0.5">Conduta da Enfermagem / Observações Clínicas</p>
                      <p className="text-sm whitespace-pre-wrap rounded border bg-background p-2">{selected.nursing.observacoes_clinicas}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 text-xs">
                    {selected.nursing.prioridade && (
                      <Badge variant="outline">Prioridade: {selected.nursing.prioridade}</Badge>
                    )}
                    {selected.nursing.resultado && (
                      <Badge variant={selected.nursing.resultado === 'apto' ? 'default' : 'destructive'}>
                        Resultado: {selected.nursing.resultado}
                      </Badge>
                    )}
                  </div>

                  {selected.nursing.motivo_inapto?.trim() && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-0.5">Motivo de Inaptidão</p>
                      <p className="text-sm whitespace-pre-wrap rounded border bg-background p-2">{selected.nursing.motivo_inapto}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ModalEdicaoTriagem
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        record={editing}
        onSuccess={() => { scanCache.current.key = ""; void loadData(); }}
      />
    </div>
  );
};

export default HistoricoTriagem;

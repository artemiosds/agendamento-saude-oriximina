import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Unlock, Search, ShieldCheck, User, Users, Lock, AlertTriangle, CheckCircle2, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getExcecaoLabel } from "@/lib/faltasUtils";

type StatusFilter = "TODOS" | "FALTOSO" | "BLOQUEADO" | "REGULAR";

interface Linha {
  id: string; // paciente_id|profissional_id
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  unidade_id: string | null;
  total_faltas: number;
  status_falta: string;
  ultima_falta: string | null;
  is_tfd: boolean;
  possui_ordem_judicial: boolean;
  motivo_excecao_bloqueio?: string | null;
}

const Faltosos: React.FC = () => {
  const { user, isGlobalAdmin } = useAuth();
  const role = (user?.role || "").toLowerCase();
  const canUnblock = role === "master" || role === "gestor" || role === "admin" || isGlobalAdmin;
  const canAccess =
    ["master", "gestor", "admin", "coordenador", "recepcao", "profissional"].includes(role) || isGlobalAdmin;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sortOrder, setSortOrder] = useState("faltas");
  const [page, setPage] = useState(1);
  const [moreFilters, setMoreFilters] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [status, setStatus] = useState<StatusFilter>("BLOQUEADO");
  const [busca, setBusca] = useState("");
  const [filterProf, setFilterProf] = useState("all");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [mostrarExcecao, setMostrarExcecao] = useState(false);

  // Modal de liberação
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLinha, setModalLinha] = useState<Linha | null>(null);
  const [motivoLib, setMotivoLib] = useState("");
  const [salvando, setSalvando] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await supabase.from("paciente_profissional_status").select(`
          paciente_id,
          profissional_id,
          total_faltas,
          status_falta,
          ultima_falta,
          pacientes:paciente_id (
            nome, is_tfd, possui_ordem_judicial, motivo_excecao_bloqueio, unidade_id
          ),
          funcionarios:profissional_id (
            nome
          )
        `);

      if (error) throw error;

      const userUnit = user?.unidadeId;
      const isolar = !!userUnit && user?.usuario !== "admin.sms";

      let rows: Linha[] = (data || []).map((item: any) => ({
        id: `${item.paciente_id}|${item.profissional_id}`,
        paciente_id: item.paciente_id,
        paciente_nome: item.pacientes?.nome || "Paciente não encontrado",
        profissional_id: item.profissional_id,
        profissional_nome: item.funcionarios?.nome || "Profissional não encontrado",
        unidade_id: item.pacientes?.unidade_id || null,
        total_faltas: item.total_faltas || 0,
        status_falta: item.status_falta,
        ultima_falta: item.ultima_falta,
        is_tfd: item.pacientes?.is_tfd === true,
        possui_ordem_judicial: item.pacientes?.possui_ordem_judicial === true,
        motivo_excecao_bloqueio: item.pacientes?.motivo_excecao_bloqueio,
      }));

      if (isolar) {
        rows = rows.filter((r) => r.unidade_id === userUnit);
      }

      setLinhas(rows);
    } catch (e: any) {
      setLoadError(true);
      console.error("[Faltosos] Erro ao carregar dados", e);
      toast.error("Não foi possível carregar a lista de faltas.");
    } finally {
      setLoading(false);
    }
  }, [user?.unidadeId, user?.usuario]);

  useEffect(() => {
    if (canAccess) fetchData();
  }, [canAccess, fetchData]);

  const filtradas = useMemo(() => {
    const normalize = (value: string) => value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const buscaLower = normalize(busca.trim());
    const profLower = filterProf === "all" ? "" : filterProf;

    return linhas.filter((r) => {
      // 1. Filtro de Exceção (TFD/OJ)
      const temExcecao = r.is_tfd || r.possui_ordem_judicial;
      if (mostrarExcecao) {
        // Modo exceções: mostra somente isentos, independentemente do status
        if (!temExcecao) return false;
      } else {
        if (temExcecao) return false;
        // 2. Filtro de Status
        if (status !== "TODOS") {
          if (r.status_falta !== status) return false;
        } else if (!["FALTOSO", "BLOQUEADO"].includes(r.status_falta)) {
          return false;
        }
      }

      // 3. Filtro de Profissional
      if (profLower && r.profissional_id !== profLower) return false;

      // 4. Filtro de Busca (Paciente ou Profissional)
      if (buscaLower) {
        const matchPaciente = normalize(r.paciente_nome || "").includes(buscaLower);
        const matchProf = normalize(r.profissional_nome || "").includes(buscaLower);
        if (!matchPaciente && !matchProf) return false;
      }

      // 5. Filtro de Datas (Ultima Falta)
      if (dataInicio && r.ultima_falta) {
        if (r.ultima_falta < dataInicio) return false;
      }
      if (dataFim && r.ultima_falta) {
        if (r.ultima_falta > dataFim) return false;
      }

      return true;
    });
  }, [linhas, status, busca, filterProf, dataInicio, dataFim, mostrarExcecao]);

  const uniqueProfs = useMemo(() => {
    const map = new Map();
    linhas.forEach((r) => map.set(r.profissional_id, r.profissional_nome));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [linhas]);

  // Counters describe loaded patient-professional links, not unique patients.
  // They are intentionally independent of the current search/date/professional filters.
  const overview = useMemo(() => {
    const counts = { BLOQUEADO: 0, FALTOSO: 0, REGULAR: 0, EXCECAO: 0 };
    for (const row of linhas) {
      if (row.is_tfd || row.possui_ordem_judicial) counts.EXCECAO++;
      else if (row.status_falta === "BLOQUEADO") counts.BLOQUEADO++;
      else if (row.status_falta === "FALTOSO") counts.FALTOSO++;
      else if (row.status_falta === "REGULAR") counts.REGULAR++;
    }
    return counts;
  }, [linhas]);
  const orderedRows = useMemo(() => {
    const nameOrder = (a: Linha, b: Linha) => a.paciente_nome.localeCompare(b.paciente_nome, "pt-BR") || a.id.localeCompare(b.id);
    return [...filtradas].sort((a, b) => sortOrder === "nome" ? nameOrder(a, b)
      : sortOrder === "recente" ? (b.ultima_falta || "").localeCompare(a.ultima_falta || "") || nameOrder(a, b)
      : b.total_faltas - a.total_faltas || nameOrder(a, b));
  }, [filtradas, sortOrder]);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(orderedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = orderedRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => setPage(1), [status, busca, filterProf, dataInicio, dataFim, mostrarExcecao, sortOrder]);
  const clearFilters = () => {
    setStatus("BLOQUEADO"); setMostrarExcecao(false); setBusca(""); setFilterProf("all");
    setDataInicio(""); setDataFim(""); setSortOrder("faltas"); setPage(1);
  };
  const chooseStatus = (next: StatusFilter | "EXCECAO") => {
    if (next === "EXCECAO") setMostrarExcecao(true);
    else { setMostrarExcecao(false); setStatus(next); }
    setPage(1);
  };
  const formatDate = (date: string | null) => date ? new Date(date + "T12:00:00").toLocaleDateString("pt-BR") : "—";
  const renderStatus = (r: Linha) => {
    const excecao = getExcecaoLabel(r);
    return excecao ? <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">ISENTO</Badge>
      : r.status_falta === "BLOQUEADO" ? <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-200 dark:border-red-800">BLOQUEADO</Badge>
      : r.status_falta === "FALTOSO" ? <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800">FALTOSO</Badge>
      : <Badge variant="outline">REGULAR</Badge>;
  };

  const abrirModal = (linha: Linha) => {
    setModalLinha(linha);
    setMotivoLib("");
    setModalOpen(true);
  };

  const submitLiberacao = async () => {
    if (!modalLinha) return;
    if (!motivoLib.trim()) {
      toast.error("Informe o motivo da liberação.");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await (supabase as any).rpc("liberar_falta", {
        p_paciente_id: modalLinha.paciente_id,
        p_profissional_id: modalLinha.profissional_id,
        p_motivo: motivoLib.trim(),
        p_user_id: user?.id || null,
        p_user_nome: user?.nome || null,
        p_all: true,
      });
      if (error) throw error;
      toast.success("Faltas regularizadas para este profissional.");
      setModalOpen(false);
      await fetchData();
    } catch (e: any) {
      console.error("[Faltosos] Erro ao liberar falta", e);
      toast.error("Não foi possível regularizar as faltas.");
    } finally {
      setSalvando(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="p-10 text-center text-muted-foreground">Você não tem permissão para acessar esta página.</div>
    );
  }

  const cards = [
    { key: "BLOQUEADO" as const, label: "Bloqueados", value: overview.BLOQUEADO, icon: Lock, tone: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200" },
    { key: "FALTOSO" as const, label: "Faltosos", value: overview.FALTOSO, icon: AlertTriangle, tone: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200" },
    { key: "REGULAR" as const, label: "Regulares", value: overview.REGULAR, icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200" },
    { key: "EXCECAO" as const, label: "Isentos TFD/OJ", value: overview.EXCECAO, icon: ShieldCheck, tone: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200" },
  ];
  const dataReady = !loading && !loadError;

  return (
    <div className="space-y-3">
      <div className="clinical-hub-hero flex flex-wrap items-center gap-3">
        <span className="clinical-patient-avatar flex items-center justify-center shrink-0"><ShieldCheck className="h-5 w-5" /></span>
        <div className="flex-1 min-w-[9rem]">
          <p className="clinical-hub-eyebrow">Gestão de acesso assistencial</p>
          <h1 className="clinical-hub-name text-xl font-bold font-display">Pacientes Faltosos / Bloqueados</h1>
          <p className="clinical-patient-sub text-xs mt-1">Faltas injustificadas por vínculo paciente + profissional</p>
        </div>
        <Button type="button" className="clinical-hub-new" disabled={loading || salvando} onClick={() => void fetchData()}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Atualizar</Button>
      </div>

      <section aria-label="Indicadores dos vínculos carregados" className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground"><span>Vínculos carregados · antes dos filtros de busca</span><span>{dataReady ? linhas.length.toLocaleString("pt-BR") : "—"}</span></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {cards.map(({ key, label, value, icon: Icon, tone }) => {
            const active = key === "EXCECAO" ? mostrarExcecao : !mostrarExcecao && status === key;
            return <button key={key} type="button" aria-pressed={active} disabled={!dataReady} onClick={() => chooseStatus(key)} className={cn("clinical-premium p-2.5 flex items-center gap-2.5 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70", active && "clinical-record-expanded ring-1 ring-primary/30")}>
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tone)}><Icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-xs clinical-field-label break-words">{label}</span><strong className="block text-xl leading-tight tabular-nums">{dataReady ? value.toLocaleString("pt-BR") : "—"}</strong></span>
              <ChevronRight className="hidden sm:block h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>;
          })}
        </div>
      </section>

      <section className="clinical-premium p-3 space-y-3" aria-label="Filtros de faltas">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[12rem]"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar paciente ou profissional" value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" placeholder="Buscar paciente ou profissional..." /></div>
          <Button type="button" variant="outline" aria-expanded={moreFilters} onClick={() => setMoreFilters(v => !v)}><SlidersHorizontal className="w-4 h-4" /> Mais filtros <ChevronDown className={cn("w-4 h-4", moreFilters && "rotate-180")} /></Button>
          <Button type="button" variant="outline" onClick={clearFilters}>Limpar</Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1 min-w-0"><Label className="text-xs">Status</Label>
            <Select value={mostrarExcecao ? "EXCECAO" : status} onValueChange={v => chooseStatus(v as StatusFilter | "EXCECAO")}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="TODOS">Faltosos e bloqueados</SelectItem><SelectItem value="BLOQUEADO">Bloqueado</SelectItem><SelectItem value="FALTOSO">Faltoso</SelectItem><SelectItem value="REGULAR">Regular</SelectItem><SelectItem value="EXCECAO">Isentos TFD/OJ</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1 min-w-0"><Label className="text-xs">Profissional</Label><Select value={filterProf} onValueChange={setFilterProf}><SelectTrigger><SelectValue placeholder="Filtrar profissional" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os profissionais</SelectItem>{uniqueProfs.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1 min-w-0"><Label className="text-xs">Ordenar por</Label><Select value={sortOrder} onValueChange={setSortOrder}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="faltas">Maior número de faltas</SelectItem><SelectItem value="recente">Última falta mais recente</SelectItem><SelectItem value="nome">Nome do paciente</SelectItem></SelectContent></Select></div>
        </div>
        {moreFilters && <div className="clinical-inset rounded-lg border p-2.5 grid gap-2 sm:grid-cols-3 items-end">
          <div className="space-y-1"><Label className="text-xs">Última falta desde</Label><Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Última falta até</Label><Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} /></div>
          <div className="flex items-center justify-between gap-2 h-10 rounded-md px-2 border bg-card"><Label htmlFor="excecao" className="text-xs">Exceções (TFD/OJ)</Label><Switch id="excecao" checked={mostrarExcecao} onCheckedChange={setMostrarExcecao} /></div>
        </div>}
        {!moreFilters && (dataInicio || dataFim) && <p className="text-xs clinical-record-type">Período ativo: {formatDate(dataInicio || null)} a {formatDate(dataFim || null)}</p>}
        {mostrarExcecao && <p className="text-xs clinical-record-type flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Exibindo somente pacientes com exceção TFD ou ordem judicial.</p>}
      </section>

      <Card className="clinical-premium">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 p-3 border-b">
            <span className="clinical-dock-icon clinical-tone-blue"><Users className="h-4 w-4" /></span>
            <div className="flex-1 min-w-0"><h2 className="font-semibold text-sm">Vínculos de faltas</h2><p className="text-xs text-muted-foreground">{dataReady ? `${filtradas.length.toLocaleString("pt-BR")} vínculo(s) nos filtros atuais` : "Aguardando dados confirmados"}</p></div>
            {dataReady && filtradas.length > 0 && <span className="text-xs text-muted-foreground">Página {safePage} de {totalPages}</span>}
          </div>
          {loading ? <div role="status" className="flex items-center justify-center py-10 text-sm text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...</div>
            : loadError ? <div className="p-6 text-center space-y-2"><AlertTriangle className="h-7 w-7 mx-auto text-destructive" /><p className="text-sm">Não foi possível confirmar os dados de faltas.</p><Button size="sm" variant="outline" onClick={() => void fetchData()}>Tentar novamente</Button></div>
            : filtradas.length === 0 ? <div className="p-6 text-center space-y-2"><span className="clinical-dock-icon clinical-tone-teal mx-auto"><Search className="h-4 w-4" /></span><p className="text-sm font-medium">Nenhum registro encontrado.</p><p className="text-xs text-muted-foreground">{mostrarExcecao ? "Nenhum paciente com TFD ou ordem judicial encontrado nos filtros atuais. As exceções são definidas no cadastro do paciente." : "Altere a busca ou os filtros para consultar outros vínculos."}</p><Button size="sm" variant="outline" onClick={clearFilters}>Limpar filtros</Button></div>
            : <>
              <div className="hidden lg:block">
                <Table>
                  <TableHeader><TableRow><TableHead>Paciente</TableHead><TableHead>Profissional</TableHead><TableHead className="text-center">Faltas</TableHead><TableHead>Última falta</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                  <TableBody>{pageRows.map(r => {
                    const excecao = getExcecaoLabel(r);
                    return <TableRow key={r.id}>
                      <TableCell className="py-2.5"><div className="flex items-center gap-2"><span className="clinical-dock-icon clinical-tone-blue treatment-avatar shrink-0" aria-hidden="true">{r.paciente_nome.trim().split(/\s+/).slice(0,2).map(s => s[0]).join("").toUpperCase()}</span><div className="min-w-0"><p className="font-medium text-sm break-words">{r.paciente_nome}</p>{excecao && <p className="clinical-record-type text-xs flex items-center gap-1"><ShieldCheck className="h-3 w-3" />{excecao}</p>}</div></div></TableCell>
                      <TableCell className="py-2.5 text-xs text-muted-foreground"><div className="flex items-center gap-1"><User className="h-3.5 w-3.5 shrink-0" />{r.profissional_nome}</div></TableCell>
                      <TableCell className="py-2.5 text-center font-bold tabular-nums">{r.total_faltas}</TableCell>
                      <TableCell className="py-2.5 text-xs whitespace-nowrap tabular-nums">{formatDate(r.ultima_falta)}</TableCell>
                      <TableCell className="py-2.5">{renderStatus(r)}</TableCell>
                      <TableCell className="py-2.5 text-right">{canUnblock && r.total_faltas > 0 ? <Button size="sm" variant="outline" className="clinical-record-action clinical-action-main" onClick={() => abrirModal(r)}><Unlock className="h-4 w-4" /> Regularizar</Button> : "—"}</TableCell>
                    </TableRow>;
                  })}</TableBody>
                </Table>
              </div>
              <div className="lg:hidden p-2 space-y-2">
                {pageRows.map(r => {
                  const excecao = getExcecaoLabel(r);
                  return <div key={r.id} className="clinical-inset rounded-lg border p-2.5 space-y-2">
                    <div className="flex items-start gap-2"><span className="clinical-dock-icon clinical-tone-blue treatment-avatar" aria-hidden="true">{r.paciente_nome.trim().split(/\s+/).slice(0,2).map(s => s[0]).join("").toUpperCase()}</span><div className="flex-1 min-w-0"><p className="font-semibold text-sm break-words">{r.paciente_nome}</p><p className="text-xs text-muted-foreground break-words">{r.profissional_nome}</p>{excecao && <p className="text-xs clinical-record-type">{excecao}</p>}</div>{renderStatus(r)}</div>
                    <div className="flex flex-wrap items-center gap-3"><div><p className="text-[10px] uppercase clinical-field-label">Faltas</p><p className="font-bold text-sm tabular-nums">{r.total_faltas}</p></div><div><p className="text-[10px] uppercase clinical-field-label">Última falta</p><p className="font-semibold text-xs tabular-nums">{formatDate(r.ultima_falta)}</p></div>{canUnblock && r.total_faltas > 0 && <Button className="ml-auto clinical-record-action clinical-action-main" size="sm" onClick={() => abrirModal(r)}><Unlock className="h-4 w-4" /> Regularizar</Button>}</div>
                  </div>;
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-t"><p className="text-xs text-muted-foreground">Exibindo {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, orderedRows.length)} de {orderedRows.length} vínculos</p><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><ChevronLeft className="h-4 w-4" />Anterior</Button><span className="text-xs tabular-nums">{safePage}/{totalPages}</span><Button size="sm" variant="outline" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Próxima<ChevronRight className="h-4 w-4" /></Button></div></div>
            </>}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={open => { if (!salvando) setModalOpen(open); }}>
        <DialogContent className="clinical-premium max-w-xl p-0 gap-0 bg-card motion-reduce:animate-none" onEscapeKeyDown={e => { if (salvando) e.preventDefault(); }} onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader className="clinical-patient-hero text-left pr-12">
            <div className="flex items-center gap-3"><span className="clinical-patient-avatar flex items-center justify-center shrink-0"><Unlock className="h-5 w-5" /></span><div className="min-w-0"><p className="clinical-hub-eyebrow">Regularização administrativa</p><DialogTitle className="clinical-hub-name text-lg">Regularizar faltas</DialogTitle><DialogDescription className="clinical-patient-sub text-xs mt-1">Apenas para o vínculo selecionado.</DialogDescription></div></div>
          </DialogHeader>
          {modalLinha && <div className="p-3 sm:p-4 space-y-3">
            <div className="clinical-inset rounded-lg border p-3 space-y-2.5">
              <div className="flex items-start gap-2"><span className="clinical-dock-icon clinical-tone-blue treatment-avatar"><User className="h-4 w-4" /></span><div className="flex-1 min-w-0"><p className="clinical-field-label text-[10px] uppercase font-semibold">Paciente</p><p className="text-sm font-semibold break-words">{modalLinha.paciente_nome}</p><p className="text-xs text-muted-foreground break-words">Profissional: {modalLinha.profissional_nome}</p></div>{renderStatus(modalLinha)}</div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t"><div><p className="clinical-field-label text-[10px] uppercase font-semibold">Faltas injustificadas</p><p className="text-xl font-bold tabular-nums">{modalLinha.total_faltas}</p></div><div><p className="clinical-field-label text-[10px] uppercase font-semibold">Última falta</p><p className="text-sm font-semibold tabular-nums">{formatDate(modalLinha.ultima_falta)}</p></div></div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100 p-2.5 text-xs flex items-start gap-2"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><p>A regularização impacta somente este vínculo entre paciente e profissional. Informe a justificativa antes de confirmar.</p></div>
            <div className="space-y-1.5"><Label htmlFor="motivo-regularizacao">Motivo da regularização (obrigatório)</Label><Textarea id="motivo-regularizacao" value={motivoLib} disabled={salvando} onChange={e => setMotivoLib(e.target.value)} placeholder="Justificativa administrativa para liberar o agendamento..." rows={3} /></div>
          </div>}
          <DialogFooter className="p-3 border-t gap-2"><Button variant="outline" onClick={() => setModalOpen(false)} disabled={salvando}>Cancelar</Button><Button className="clinical-record-action clinical-action-main" onClick={submitLiberacao} disabled={salvando || !motivoLib.trim()}>{salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}Confirmar regularização</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Faltosos;

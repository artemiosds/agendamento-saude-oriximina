import { useMemo, useState } from "react";
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
  classifyDayAvailability, countUnlinkedPendingByProfessional, estimateContinuity,
  isStrictlyCompatible, strictSpecialtyOf, type ContinuityEstimate, type DayAvailabilityState,
} from "@/lib/localizarVagas";
import type { User } from "@/types";

const MAX_DATES_PER_PROF = 5;

interface Props {
  profissionais: User[];
  unidades: { id: string; nome: string }[];
  getAvailableSlots: (profId: string, unidadeId: string, date: string, isPublic?: boolean, lead?: number | null) => string[];
  loadAgendaRange: (start: string, end: string) => Promise<void>;
  onPick: (profissionalId: string, date: string, hora: string) => void;
}

interface ProfResult {
  prof: User;
  compatible: boolean;
  days: { date: string; state: DayAvailabilityState; slots: string[] }[];
  freeSlots: number;
  allLoaded: boolean;
  pending: number | null;
  continuity: ContinuityEstimate;
}

const fmt = (d: string) => d.split("-").reverse().join("/");
const continuityLabel: Record<ContinuityEstimate, string> = {
  estimada_favoravel: "Continuidade estimada: há perspectiva de capacidade",
  comprometida: "Continuidade estimada: capacidade comprometida",
  nao_confirmada: "Capacidade não confirmada",
};

export function LocalizarVagasPanel({ profissionais, unidades, getAvailableSlots, loadAgendaRange, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [servico, setServico] = useState("");
  const [unidadeId, setUnidadeId] = useState("all");
  const [dias, setDias] = useState("15");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pendingAvailable, setPendingAvailable] = useState(true);
  const [results, setResults] = useState<ProfResult[] | null>(null);

  const clinicos = useMemo(() => profissionais.filter((p) => p.ativo !== false && p.role === "profissional"), [profissionais]);
  // Serviços = profissões efetivamente cadastradas e identificáveis.
  const servicos = useMemo(() => {
    const set = new Set<string>();
    clinicos.forEach((p) => { const s = strictSpecialtyOf(p.profissao); if (s) set.add(s); });
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [clinicos]);
  const semProfissao = useMemo(() => clinicos.filter((p) => !strictSpecialtyOf(p.profissao)), [clinicos]);

  const buscar = async () => {
    if (!servico) return;
    setLoading(true); setResults(null); setLoadError(false);
    const start = todayLocalStr();
    const end = addDaysToDateStr(start, Number(dias) - 1);
    let err = false;
    try { await loadAgendaRange(start, end); } catch { err = true; }
    setLoadError(err);

    const alvo = clinicos.filter((p) => unidadeId === "all" || p.unidadeId === unidadeId);
    const compat = alvo.filter((p) => isStrictlyCompatible(servico, p.profissao));
    const ids = compat.map((p) => p.id);

    let pendingMap: Map<string, number> | null = null;
    if (ids.length) {
      const rows: any[] = [];
      let failed = false;
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("treatment_sessions" as any)
          .select("professional_id,status,appointment_id")
          .in("professional_id", ids).eq("status", "pendente_agendamento").is("appointment_id", null)
          .range(from, from + 999);
        if (error || !data) { failed = true; break; }
        rows.push(...data);
        if (data.length < 1000) break;
      }
      pendingMap = failed ? null : countUnlinkedPendingByProfessional(rows);
    }
    setPendingAvailable(pendingMap !== null);

    const dates: string[] = [];
    for (let d = start; d <= end; d = addDaysToDateStr(d, 1)) dates.push(d);

    const out: ProfResult[] = compat.map((prof) => {
      const days = dates.map((date) => {
        const loaded = isCompleteAgendaDate(date);
        const slots = loaded && !err ? getAvailableSlots(prof.id, prof.unidadeId, date, false, null) : [];
        return { date, state: classifyDayAvailability({ loadError: err, dayLoaded: loaded, slots }), slots };
      });
      const allLoaded = days.every((d) => d.state !== "nao_carregado" && d.state !== "erro");
      const freeSlots = days.reduce((n, d) => n + d.slots.length, 0);
      const pending = pendingMap ? pendingMap.get(prof.id) || 0 : null;
      return { prof, compatible: true, days, freeSlots, allLoaded, pending,
        continuity: estimateContinuity({ freeSlotsInPeriod: allLoaded ? freeSlots : null, pendingUnlinked: pending, allDaysLoaded: allLoaded }) };
    });
    out.sort((a, b) => {
      const fa = a.days.find((d) => d.state === "com_vagas")?.date || "9999";
      const fb = b.days.find((d) => d.state === "com_vagas")?.date || "9999";
      return fa.localeCompare(fb);
    });
    setResults(out);
    setLoading(false);
  };

  const totalPend = results && pendingAvailable ? results.reduce((n, r) => n + (r.pending || 0), 0) : null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline"><Search className="w-4 h-4 mr-2" /> Localizar Vagas</Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Localizar Vagas</SheetTitle>
          <SheetDescription>Horários reais da Agenda por serviço. Nada é agendado automaticamente.</SheetDescription>
        </SheetHeader>

        <div className="grid gap-3 mt-4">
          <div>
            <Label>Serviço / especialidade</Label>
            <Select value={servico} onValueChange={setServico}>
              <SelectTrigger><SelectValue placeholder="Escolha o serviço" /></SelectTrigger>
              <SelectContent>{servicos.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {unidades.length > 1 && (
              <div>
                <Label>Unidade</Label>
                <Select value={unidadeId} onValueChange={setUnidadeId}>
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
              <Select value={dias} onValueChange={setDias}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Próximos 7 dias</SelectItem>
                  <SelectItem value="15">Próximos 15 dias</SelectItem>
                  <SelectItem value="30">Próximos 30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={buscar} disabled={!servico || loading}>
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
            {loadError && <p className="text-sm text-destructive">Erro ao consultar a Agenda. Os dias não foram confirmados — tente novamente.</p>}
            <div className="rounded-md border p-3 text-sm">
              <span className="font-medium">Sessões pendentes de agendamento ({servico}): </span>
              {totalPend === null ? "Informação não disponível" : totalPend}
            </div>
            {results.length === 0 && <p className="text-sm text-muted-foreground">Nenhum profissional com compatibilidade confirmada para este serviço.</p>}
            {results.map((r) => {
              const comVaga = r.days.filter((d) => d.state === "com_vagas").slice(0, MAX_DATES_PER_PROF);
              const naoCarregados = r.days.filter((d) => d.state === "nao_carregado").length;
              return (
                <div key={r.prof.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{r.prof.nome}</p>
                      <p className="text-xs text-muted-foreground">{r.prof.profissao}{unidades.length > 1 ? ` · ${unidades.find((u) => u.id === r.prof.unidadeId)?.nome || ""}` : ""}</p>
                    </div>
                    <Badge variant={comVaga.length ? "default" : "secondary"}>{comVaga.length ? "Avaliação disponível" : "Sem vaga no período"}</Badge>
                  </div>
                  {comVaga.map((d) => (
                    <div key={d.date} className="flex flex-wrap items-center gap-1">
                      <span className="text-xs w-20">{fmt(d.date)}</span>
                      {d.slots.slice(0, 6).map((h) => (
                        <Button key={h} size="sm" variant="outline" className="h-7 px-2 text-xs"
                          onClick={() => { setOpen(false); onPick(r.prof.id, d.date, h); }}>{h}</Button>
                      ))}
                    </div>
                  ))}
                  {naoCarregados > 0 && <p className="text-xs text-muted-foreground">{naoCarregados} dia(s) ainda não carregado(s) — não significa sem vaga.</p>}
                  <p className="text-xs">{continuityLabel[r.continuity]}{r.pending !== null ? ` · ${r.pending} sessão(ões) pendente(s)` : " · pendentes: informação não disponível"}</p>
                  <p className="text-xs text-muted-foreground">Continuidade a confirmar: depende do plano definido pelo profissional (simulação no Novo Ciclo).</p>
                </div>
              );
            })}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

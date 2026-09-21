import React, { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, History, User, Calendar, Stethoscope, Eye, Printer, Copy, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { downloadProntuarioPdf } from "@/lib/prontuarioPdf";
import { supabase } from "@/integrations/supabase/client";

const HISTORY_PAGE_SIZE = 20;
const HISTORY_CARD_COLUMNS = [
  "id",
  "data_atendimento",
  "hora_atendimento",
  "profissional_nome",
  "queixa_principal",
  "cid_codigo",
  "cid_descricao",
  "tipo_registro",
  "paciente_nome",
].join(",");

const HISTORY_DETAIL_COLUMNS = [
  HISTORY_CARD_COLUMNS,
  "conduta",
  "anamnese",
  "evolucao",
  "observacoes",
  "hipotese",
  "exame_fisico",
  "prescricao",
  "solicitacao_exames",
  "procedimentos_texto",
  "soap_subjetivo",
  "soap_objetivo",
  "soap_avaliacao",
  "soap_plano",
  "sinais_sintomas",
  "resultado_exame",
  "indicacao_retorno",
  "custom_data",
].join(",");

type ProntuarioHistEntry = {
  id: string;
  data_atendimento: string;
  hora_atendimento?: string;
  profissional_nome?: string;
  queixa_principal?: string;
  conduta?: string;
  anamnese?: string;
  evolucao?: string;
  observacoes?: string;
  hipotese?: string;
  exame_fisico?: string;
  prescricao?: string;
  solicitacao_exames?: string;
  procedimentos_texto?: string;
  soap_subjetivo?: string;
  soap_objetivo?: string;
  soap_avaliacao?: string;
  soap_plano?: string;
  cid_codigo?: string;
  cid_descricao?: string;
  tipo_registro?: string;
  paciente_nome?: string;
  [k: string]: any;
};

export interface HistoricoPacientePanelProps {
  pacienteId?: string;
  paciente: {
    nome?: string;
    data_nascimento?: string;
    cpf?: string;
    cns?: string;
    sexo?: string;
  } | null;
  currentId?: string;
  unidadeId?: string;
  isGlobalAdmin?: boolean;
  enabled?: boolean;
  onView?: (entry: ProntuarioHistEntry) => void;
}

interface HistoryPage {
  rows: ProntuarioHistEntry[];
  nextOffset?: number;
}

function calcIdade(dataNasc?: string): string {
  if (!dataNasc) return "—";
  try {
    const d = new Date(dataNasc + (dataNasc.length === 10 ? "T12:00:00" : ""));
    if (isNaN(d.getTime())) return "—";
    const diff = Date.now() - d.getTime();
    const age = new Date(diff).getUTCFullYear() - 1970;
    return `${age} anos`;
  } catch {
    return "—";
  }
}

function fmtDate(s?: string): string {
  if (!s) return "";
  try {
    return new Date(s + (s.length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR");
  } catch {
    return s;
  }
}

export function buildEvolucaoText(h: ProntuarioHistEntry): string {
  const parts: string[] = [];
  const add = (label: string, val?: any) => {
    if (!val) return;
    
    let text = "";
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object' && 'texto' in parsed) {
            text = String(parsed.texto || "").trim();
          } else if (parsed && typeof parsed === 'object' && 'medicamentos' in parsed) {
            text = (parsed.medicamentos as any[]).map(m => `• ${m.nome || ''} ${m.dosagem || ''}`).join('\n');
          } else if (parsed && typeof parsed === 'object' && 'exames' in parsed) {
            text = (parsed.exames as any[]).map(e => `• ${e.nome || ''}`).join('\n');
          } else {
            text = trimmed;
          }
        } catch {
          text = trimmed;
        }
      } else {
        text = trimmed;
      }
    } else if (typeof val === 'object') {
      if ('texto' in val) {
        text = String(val.texto || "").trim();
      } else {
        text = JSON.stringify(val);
      }
    }

    if (text) {
      parts.push(`${label}:\n${text}`);
    }
  };
  
  add("Queixa principal", h.queixa_principal);
  add("S — Subjetivo", h.soap_subjetivo);
  add("O — Objetivo", h.soap_objetivo);
  add("A — Avaliação", h.soap_avaliacao);
  add("P — Plano", h.soap_plano);
  add("Anamnese", h.anamnese);
  add("Sinais e Sintomas", h.sinais_sintomas);
  add("Exame físico", h.exame_fisico);
  add("Hipótese diagnóstica", h.hipotese);
  add("Conduta", h.conduta);
  add("Evolução", h.evolucao);
  add("Observações", h.observacoes);
  add("Procedimentos", h.procedimentos_texto);
  add("Prescrição", h.prescricao);
  add("Solicitação de Exames", h.solicitacao_exames);
  add("Resultado de Exame", h.resultado_exame);
  add("Indicação de Retorno", h.indicacao_retorno);

  // Add custom data if present
  if (h.custom_data && typeof h.custom_data === 'object') {
    Object.entries(h.custom_data).forEach(([key, val]) => {
      if (val && !key.startsWith('esp_')) {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        add(label, String(val));
      }
    });
  }

  return parts.join("\n\n");
}

export async function copyEvolucao(h: ProntuarioHistEntry) {
  const text = buildEvolucaoText(h) || "(sem conteúdo de evolução)";
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Evolução copiada para a área de transferência");
  } catch {
    toast.error("Não foi possível copiar");
  }
}

export function printProntuario(h: ProntuarioHistEntry) {
  try {
    downloadProntuarioPdf(h as any);
    toast.success("PDF gerado");
  } catch (e) {
    toast.error("Falha ao gerar PDF");
  }
}

const HistoricoPacientePanel: React.FC<HistoricoPacientePanelProps> = ({
  pacienteId,
  paciente,
  currentId,
  unidadeId,
  isGlobalAdmin = false,
  enabled = true,
  onView,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, ProntuarioHistEntry>>({});
  const queryClient = useQueryClient();

  const scope = isGlobalAdmin ? "all" : (unidadeId || "none");
  const historyQueryKey = useMemo(() => [
    "prontuarios",
    "historico-lateral",
    pacienteId || "sem-paciente",
    currentId || "sem-atual",
    scope,
    dateFrom || "sem-data-inicial",
    dateTo || "sem-data-final",
  ] as const, [currentId, dateFrom, dateTo, pacienteId, scope]);

  const historyQuery = useInfiniteQuery<HistoryPage>({
    queryKey: historyQueryKey,
    initialPageParam: 0,
    enabled: enabled && Boolean(pacienteId) && (isGlobalAdmin || Boolean(unidadeId)),
    queryFn: async ({ pageParam, signal }) => {
      const offset = Number(pageParam) || 0;
      let query = (supabase as any)
        .from("prontuarios")
        .select(HISTORY_CARD_COLUMNS)
        .eq("paciente_id", pacienteId)
        .order("data_atendimento", { ascending: false })
        .order("hora_atendimento", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .range(offset, offset + HISTORY_PAGE_SIZE)
        .abortSignal(signal);

      if (currentId) query = query.neq("id", currentId);
      if (!isGlobalAdmin && unidadeId) query = query.eq("unidade_id", unidadeId);
      if (dateFrom) query = query.gte("data_atendimento", dateFrom);
      if (dateTo) query = query.lte("data_atendimento", dateTo);

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data || []) as ProntuarioHistEntry[];
      return {
        rows: rows.slice(0, HISTORY_PAGE_SIZE),
        nextOffset: rows.length > HISTORY_PAGE_SIZE ? offset + HISTORY_PAGE_SIZE : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  useEffect(() => {
    setExpandedId(null);
    setLoadingDetailId(null);
    setDetails({});
  }, [pacienteId, currentId]);

  useEffect(() => {
    if (!enabled) {
      void queryClient.cancelQueries({ queryKey: ["prontuarios", "historico-lateral"] });
    }
  }, [enabled, queryClient]);

  const loadDetail = async (entry: ProntuarioHistEntry) => {
    if (details[entry.id]) return details[entry.id];
    setLoadingDetailId(entry.id);
    try {
      const detail = await queryClient.fetchQuery<ProntuarioHistEntry>({
        queryKey: ["prontuarios", "historico-lateral-detalhe", pacienteId, entry.id, scope],
        queryFn: async ({ signal }) => {
          let query = (supabase as any)
            .from("prontuarios")
            .select(HISTORY_DETAIL_COLUMNS)
            .eq("id", entry.id)
            .eq("paciente_id", pacienteId)
            .abortSignal(signal);
          if (!isGlobalAdmin && unidadeId) query = query.eq("unidade_id", unidadeId);
          const { data, error } = await query.maybeSingle();
          if (error) throw error;
          if (!data) throw new Error("Prontuário não encontrado");
          return data as ProntuarioHistEntry;
        },
        staleTime: 5 * 60_000,
      });
      setDetails((current) => ({ ...current, [entry.id]: detail }));
      return detail;
    } catch (error) {
      console.error("Erro ao carregar detalhe do histórico lateral:", error);
      toast.error("Não foi possível carregar este atendimento.");
      return null;
    } finally {
      setLoadingDetailId((id) => id === entry.id ? null : id);
    }
  };

  const sorted = useMemo(() => historyQuery.data?.pages.flatMap((page) => page.rows) || [], [historyQuery.data]);

  const hasDateFilter = Boolean(dateFrom || dateTo);

  return (
    <aside className="hidden lg:flex flex-col h-full max-h-screen w-full border-l border-border bg-muted/20 overflow-hidden">
      {/* Patient Card */}
      <div className="p-4 border-b border-border bg-card/50 shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">
              {paciente?.nome || "Nenhum paciente selecionado"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {calcIdade(paciente?.data_nascimento)}
              {paciente?.data_nascimento && ` · ${fmtDate(paciente.data_nascimento)}`}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
          <div>
            <dt className="text-muted-foreground uppercase tracking-wide text-[10px]">CPF</dt>
            <dd className="text-foreground font-mono truncate">{paciente?.cpf || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground uppercase tracking-wide text-[10px]">CNS</dt>
            <dd className="text-foreground font-mono truncate">{paciente?.cns || "—"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted-foreground uppercase tracking-wide text-[10px]">Sexo</dt>
            <dd className="text-foreground capitalize">{paciente?.sexo || "—"}</dd>
          </div>
        </dl>
      </div>

      {/* History Header */}
      <div className="px-4 py-3 flex items-center gap-2 border-b border-border/60 shrink-0">
        <History className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Histórico de Atendimentos
        </h3>
        <Badge variant="secondary" className="ml-auto text-[10px]">{sorted.length}</Badge>
      </div>

      {/* Date Filter */}
      <div className="px-3 py-2 border-b border-border/60 shrink-0 bg-background/40">
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-7 text-[11px] px-2"
            aria-label="Data inicial"
          />
          <span className="text-[10px] text-muted-foreground">até</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-7 text-[11px] px-2"
            aria-label="Data final"
          />
          {hasDateFilter && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 shrink-0"
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              aria-label="Limpar filtro de data"
              title="Limpar filtro"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>


      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-2">
          {!paciente && (
            <p className="text-xs text-muted-foreground italic text-center py-6">
              Selecione um paciente para ver o histórico.
            </p>
          )}
          {paciente && historyQuery.isLoading && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando histórico…
            </div>
          )}
          {paciente && historyQuery.isError && !historyQuery.isLoading && (
            <div className="text-center py-6 space-y-2">
              <p className="text-xs text-destructive">Não foi possível carregar o histórico.</p>
              <Button type="button" size="sm" variant="outline" onClick={() => historyQuery.refetch()}>
                Tentar novamente
              </Button>
            </div>
          )}
          {paciente && historyQuery.isSuccess && sorted.length === 0 && (
            <div className="text-center py-6">
              <p className="text-xs text-muted-foreground italic">
                {hasDateFilter ? "Nenhum atendimento no período selecionado" : "Primeiro atendimento deste paciente"}
              </p>
            </div>
          )}
          {sorted.map((h) => {
            const isExpanded = expandedId === h.id;
            const displayed = details[h.id] || h;
            const queixa = (displayed.queixa_principal || "").trim();
            return (
              <div
                key={h.id}
                className="rounded-lg border border-border bg-card hover:border-primary/40 transition-colors"
              >
                <button
                  type="button"
                  onClick={async () => {
                    if (isExpanded) {
                      setExpandedId(null);
                      return;
                    }
                    setExpandedId(h.id);
                    await loadDetail(h);
                  }}
                  className="w-full text-left px-3 py-2 flex items-start gap-2"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>
                        {fmtDate(h.data_atendimento)}
                        {h.hora_atendimento ? ` · ${h.hora_atendimento}` : ""}
                      </span>
                    </div>
                    <p className="text-[12px] text-foreground mt-0.5 truncate">
                      <Stethoscope className="w-3 h-3 inline mr-1 text-muted-foreground" />
                      {h.profissional_nome || "—"}
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-2">
                      {queixa || <em className="opacity-60">Sem queixa registrada</em>}
                    </p>
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-border/40 space-y-2 text-[12px]">
                    {(h.cid_codigo || h.cid_descricao) && (
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">CID</p>
                        <p className="text-foreground">
                          {[h.cid_codigo, h.cid_descricao].filter(Boolean).join(" — ")}
                        </p>
                      </div>
                    )}
                    {queixa && (
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">Queixa</p>
                        <p className="text-foreground whitespace-pre-wrap">{queixa}</p>
                      </div>
                    )}
                    {loadingDetailId === h.id && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Carregando detalhes…
                      </div>
                    )}
                    {displayed.soap_subjetivo && (
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">Subjetivo (S)</p>
                        <p className="text-foreground whitespace-pre-wrap">{displayed.soap_subjetivo}</p>
                      </div>
                    )}
                    {displayed.soap_objetivo && (
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">Objetivo (O)</p>
                        <p className="text-foreground whitespace-pre-wrap">{displayed.soap_objetivo}</p>
                      </div>
                    )}
                    {displayed.soap_avaliacao && (
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">Avaliação (A)</p>
                        <p className="text-foreground whitespace-pre-wrap">{displayed.soap_avaliacao}</p>
                      </div>
                    )}
                    {displayed.soap_plano && (
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">Plano (P)</p>
                        <p className="text-foreground whitespace-pre-wrap">{displayed.soap_plano}</p>
                      </div>
                    )}
                    {displayed.anamnese && (
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">Anamnese</p>
                        <p className="text-foreground whitespace-pre-wrap">{displayed.anamnese}</p>
                      </div>
                    )}
                    {displayed.conduta && (
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">Conduta</p>
                        <p className="text-foreground whitespace-pre-wrap">{displayed.conduta}</p>
                      </div>
                    )}
                    {displayed.evolucao && (
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">Evolução</p>
                        <p className="text-foreground whitespace-pre-wrap">{displayed.evolucao}</p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/40">
                      {onView && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] px-2"
                          onClick={(e) => { e.stopPropagation(); onView(h); }}
                        >
                          <Eye className="w-3 h-3 mr-1" /> Ver completo
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] px-2"
                        disabled={loadingDetailId === h.id}
                        onClick={async (e) => {
                          e.stopPropagation();
                          const detail = await loadDetail(h);
                          if (detail) printProntuario(detail);
                        }}
                      >
                        <Printer className="w-3 h-3 mr-1" /> Imprimir
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] px-2"
                        disabled={loadingDetailId === h.id}
                        onClick={async (e) => {
                          e.stopPropagation();
                          const detail = await loadDetail(h);
                          if (detail) await copyEvolucao(detail);
                        }}
                      >
                        <Copy className="w-3 h-3 mr-1" /> Copiar evolução
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {historyQuery.hasNextPage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={historyQuery.isFetchingNextPage}
              onClick={() => historyQuery.fetchNextPage()}
            >
              {historyQuery.isFetchingNextPage && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Carregar atendimentos anteriores
            </Button>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
};

export default React.memo(HistoricoPacientePanel);

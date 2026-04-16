import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Eye, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MANCHESTER_LEVELS, getManchesterConfig } from "@/lib/manchesterProtocol";

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

interface EnrichedRecord extends TriageRecord {
  pacienteNome: string;
  profissionalNome: string;
  classificacaoRisco: string;
  nursing?: NursingEval | null;
}

const PAGE_SIZE = 20;

const riskBadge = (risk: string) => {
  const config = getManchesterConfig(risk);
  if (!config) return <Badge variant="outline">—</Badge>;
  return (
    <Badge
      className={`text-white hover:opacity-90 ${config.pulse ? 'animate-[pulse-manchester_1.5s_infinite]' : ''}`}
      style={{ backgroundColor: config.color }}
    >
      {config.subtitle}
    </Badge>
  );
};

const HistoricoTriagem: React.FC = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState<EnrichedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<EnrichedRecord | null>(null);

  // Map tecnico_id -> nome from funcionarios
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let trQuery = supabase.from("triage_records").select("*").order("criado_em", { ascending: false });
      const [trRes, funcRes, agRes, pacRes, nursRes] = await Promise.all([
        trQuery,
        supabase.from("funcionarios").select("id, nome, auth_user_id"),
        supabase.from("agendamentos").select("id, paciente_id, paciente_nome, unidade_id"),
        supabase.from("pacientes").select("id, nome"),
        supabase.from("nursing_evaluations").select("agendamento_id, anamnese_resumida, observacoes_clinicas, avaliacao_risco, condicao_clinica, motivo_inapto, prioridade, resultado"),
      ]);

      const funcMap = new Map<string, string>();
      (funcRes.data || []).forEach((f: any) => {
        funcMap.set(String(f.id), f.nome);
        if (f.auth_user_id) funcMap.set(String(f.auth_user_id), f.nome);
      });

      const pacMap = new Map<string, string>();
      (pacRes.data || []).forEach((p: any) => pacMap.set(String(p.id), p.nome));

      const agMap = new Map<string, { nome: string; pacienteId: string }>();
      const unitAgIds = new Set<string>();
      (agRes.data || []).forEach((a: any) => {
        agMap.set(a.id, { nome: a.paciente_nome, pacienteId: a.paciente_id });
        if (user?.usuario === 'admin.sms' || !user?.unidadeId || a.unidade_id === user?.unidadeId) {
          unitAgIds.add(a.id);
        }
      });

      const nursMap = new Map<string, NursingEval>();
      (nursRes.data || []).forEach((n: any) => {
        if (n.agendamento_id) nursMap.set(n.agendamento_id, n);
      });

      const enriched: EnrichedRecord[] = (trRes.data || [])
        .filter((r: any) => user?.usuario === 'admin.sms' || !user?.unidadeId || unitAgIds.has(r.agendamento_id))
        .map((r: any) => {
          const ag = agMap.get(r.agendamento_id);
          const nomeReal = (ag && pacMap.get(ag.pacienteId)) || ag?.nome || "Paciente não encontrado";
          return {
            ...r,
            pacienteNome: nomeReal,
            profissionalNome: funcMap.get(r.tecnico_id) || "—",
            classificacaoRisco: r.classificacao_risco || "",
            nursing: nursMap.get(r.agendamento_id) || null,
          };
        });

      setRecords(enriched);
    } catch (err) {
      console.error("Erro ao carregar histórico de triagem:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    let list = records;

    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((r) => r.pacienteNome.toLowerCase().includes(s));
    }

    if (riskFilter !== "todos") {
      list = list.filter((r) => r.classificacaoRisco?.toLowerCase() === riskFilter);
    }

    if (dateFrom) {
      list = list.filter((r) => {
        const d = r.confirmado_em || r.criado_em;
        return d && d >= dateFrom;
      });
    }
    if (dateTo) {
      const toEnd = dateTo + "T23:59:59";
      list = list.filter((r) => {
        const d = r.confirmado_em || r.criado_em;
        return d && d <= toEnd;
      });
    }

    return list;
  }, [records, search, riskFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search, riskFilter, dateFrom, dateTo]);

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
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Histórico de Triagem</h1>
        <p className="text-muted-foreground text-sm">{filtered.length} registro(s) encontrado(s)</p>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-card">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-xs">Buscar paciente</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Nome do paciente..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Classificação de Risco</Label>
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
            <div>
              <Label className="text-xs">Data de</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Data até</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : paged.length === 0 ? (
        <Card className="border-0 shadow-card">
          <CardContent className="p-8 text-center text-muted-foreground">Nenhum registro encontrado.</CardContent>
        </Card>
      ) : (
        <Card className="border-0 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Risco</TableHead>
                  <TableHead className="hidden md:table-cell">Queixa</TableHead>
                  <TableHead className="hidden lg:table-cell">Profissional</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.pacienteNome}</TableCell>
                    <TableCell className="text-sm">{formatDate(r.confirmado_em || r.criado_em)}</TableCell>
                    <TableCell>{riskBadge(r.classificacaoRisco)}</TableCell>
                    <TableCell className="hidden md:table-cell max-w-[200px] truncate text-sm text-muted-foreground">{r.queixa || "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">{r.profissionalNome}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelected(r)}>
                        <Eye className="mr-1 h-3.5 w-3.5" /> Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-sm text-muted-foreground">Página {page + 1} de {totalPages}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Detalhes da Triagem</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <p className="text-sm"><strong>Paciente:</strong> {selected.pacienteNome}</p>
                <p className="text-sm"><strong>Profissional:</strong> {selected.profissionalNome}</p>
                <p className="text-sm"><strong>Data:</strong> {formatDate(selected.confirmado_em || selected.criado_em)}</p>
                {selected.classificacaoRisco && (
                  <p className="text-sm flex items-center gap-2"><strong>Risco:</strong> {riskBadge(selected.classificacaoRisco)}</p>
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Sinais Vitais</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded border p-2"><span className="text-muted-foreground">Peso:</span> {selected.peso ? `${selected.peso} kg` : "—"}</div>
                  <div className="rounded border p-2"><span className="text-muted-foreground">Altura:</span> {selected.altura ? `${selected.altura} cm` : "—"}</div>
                  <div className="rounded border p-2"><span className="text-muted-foreground">IMC:</span> {selected.imc ?? "—"}</div>
                  <div className="rounded border p-2"><span className="text-muted-foreground">PA:</span> {selected.pressao_arterial || "—"}</div>
                  <div className="rounded border p-2"><span className="text-muted-foreground">FC:</span> {selected.frequencia_cardiaca ? `${selected.frequencia_cardiaca} bpm` : "—"}</div>
                  <div className="rounded border p-2"><span className="text-muted-foreground">Temp:</span> {selected.temperatura ? `${selected.temperatura} °C` : "—"}</div>
                  <div className="rounded border p-2"><span className="text-muted-foreground">SatO2:</span> {selected.saturacao_oxigenio ? `${selected.saturacao_oxigenio}%` : "—"}</div>
                  <div className="rounded border p-2"><span className="text-muted-foreground">Glicemia:</span> {selected.glicemia ? `${selected.glicemia} mg/dL` : "—"}</div>
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
    </div>
  );
};

export default HistoricoTriagem;

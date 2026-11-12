import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";
import { selecionarMovimentaveis } from "@/lib/remanejamentoLote";

type Ag = { id: string; data: string; hora: string; status: string; profissionalId: string; profissionalNome?: string; pacienteNome?: string; unidadeId?: string };
type Prof = { id: string; nome: string; unidadeId?: string };

type Linha = Ag & { marcado: boolean; aviso: string | null; bloqueado: boolean };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dataOrigem: string;
  agendamentos: Ag[];
  profissionais: Prof[];
  updateAgendamento: (id: string, data: any) => Promise<any>;
  logAction: (input: any) => void;
  user: any;
  onDone: (destino: string) => void;
}

const fmt = (d: string) => d ? d.split("-").reverse().join("/") : "";

export function RemanejarLoteDialog({ open, onOpenChange, dataOrigem, agendamentos, profissionais, updateAgendamento, logAction, user, onDone }: Props) {
  const [profId, setProfId] = useState("todos");
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [progresso, setProgresso] = useState(0);

  const profIds = useMemo(() => new Set(profissionais.map((p) => p.id)), [profissionais]);
  const candidatos = useMemo(
    () => selecionarMovimentaveis(agendamentos, dataOrigem, profId === "todos" ? null : profId).filter((a) => profIds.has(a.profissionalId)),
    [agendamentos, dataOrigem, profId, profIds],
  );

  useEffect(() => { if (!open) { setLinhas(null); setDestino(""); setMotivo(""); setProfId("todos"); setProgresso(0); } }, [open]);
  useEffect(() => { setLinhas(null); }, [profId, destino]);

  const analisar = async () => {
    if (!destino || destino === dataOrigem) { toast.error("Escolha uma data de destino diferente da data de origem."); return; }
    setAnalisando(true);
    try {
      const ids = [...new Set(candidatos.map((c) => c.profissionalId))];
      const { data: noDestino, error } = await supabase.from("agendamentos")
        .select("id, hora, profissional_id, paciente_nome, status").eq("data", destino).in("profissional_id", ids.length ? ids : ["-"]);
      if (error) throw error;
      const bloqueio: Record<string, boolean> = {};
      for (const pid of ids) {
        const prof = profissionais.find((p) => p.id === pid);
        const { data: b } = await (supabase as any).rpc("is_date_blocked", { p_date: destino, p_profissional_id: pid, p_unidade_id: prof?.unidadeId || null });
        bloqueio[pid] = !!b;
      }
      setLinhas(candidatos.map((c) => {
        if (bloqueio[c.profissionalId]) return { ...c, marcado: false, aviso: "Data bloqueada (feriado/folga/bloqueio)", bloqueado: true };
        const conf = (noDestino || []).find((d: any) => d.profissional_id === c.profissionalId
          && String(d.hora || "").slice(0, 5) === String(c.hora || "").slice(0, 5)
          && !["cancelado", "falta", "remarcado"].includes(d.status));
        return { ...c, marcado: !conf, aviso: conf ? `Conflito: ${conf.paciente_nome || "outro paciente"} já às ${String(c.hora).slice(0, 5)}` : null, bloqueado: false };
      }));
    } catch (e: any) {
      toast.error("Não foi possível analisar a data de destino: " + (e?.message || "erro"));
    } finally { setAnalisando(false); }
  };

  const selecionados = (linhas || []).filter((l) => l.marcado);

  const executar = async () => {
    if (motivo.trim().length < 5) { toast.error("Informe o motivo do remanejamento (mínimo 5 caracteres)."); return; }
    if (!selecionados.length) { toast.error("Nenhum agendamento selecionado."); return; }
    setExecutando(true);
    let ok = 0; const falhas: string[] = [];
    for (let i = 0; i < selecionados.length; i++) {
      const l = selecionados[i];
      try {
        await updateAgendamento(l.id, { data: destino, hora: l.hora });
        logAction({
          acao: "remanejamento_lote_agendamento", entidade: "agendamento", entidadeId: l.id, modulo: "agenda", user,
          detalhes: { motivo_alteracao: motivo.trim(), data_origem: dataOrigem, data_destino: destino, hora: l.hora, profissional: l.profissionalNome, encaixe: !!l.aviso },
        });
        ok++;
      } catch (e: any) {
        falhas.push(`${String(l.hora).slice(0, 5)} ${l.pacienteNome || ""}: ${e?.message || "erro"}`);
      }
      setProgresso(Math.round(((i + 1) / selecionados.length) * 100));
    }
    setExecutando(false);
    if (ok) toast.success(`${ok} agendamento(s) movido(s) para ${fmt(destino)}.`);
    if (falhas.length) toast.error(`${falhas.length} não puderam ser movidos:\n${falhas.slice(0, 5).join("\n")}`, { duration: 12000 });
    onDone(destino);
    if (!falhas.length) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !executando && onOpenChange(v)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarClock className="w-5 h-5 text-primary" />Mover agendamentos em lote</DialogTitle>
          <DialogDescription>De {fmt(dataOrigem)}. Os horários são mantidos. Atendidos, faltas e cancelados não são movidos.</DialogDescription>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Profissional</Label>
            <Select value={profId} onValueChange={setProfId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os profissionais</SelectItem>
                {profissionais.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nova data</Label>
            <Input type="date" value={destino} min={dataOrigem ? undefined : undefined} onChange={(e) => setDestino(e.target.value)} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{candidatos.length} agendamento(s) ativo(s) podem ser movidos.</p>
        {!linhas ? (
          <Button onClick={analisar} disabled={!destino || !candidatos.length || analisando}>
            {analisando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Verificar data de destino
          </Button>
        ) : (
          <div className="border rounded-md divide-y max-h-72 overflow-y-auto">
            {linhas.map((l, idx) => (
              <label key={l.id} className="flex items-center gap-3 p-2 text-sm">
                <Checkbox checked={l.marcado} disabled={l.bloqueado || executando}
                  onCheckedChange={(v) => setLinhas((prev) => prev!.map((x, j) => j === idx ? { ...x, marcado: !!v } : x))} />
                <span className="font-mono w-12">{String(l.hora).slice(0, 5)}</span>
                <span className="flex-1 truncate">{l.pacienteNome || "Paciente"} <span className="text-muted-foreground">· {l.profissionalNome}</span></span>
                {l.aviso ? <Badge variant={l.bloqueado ? "destructive" : "outline"} className="text-xs">{l.aviso}{!l.bloqueado && l.marcado ? " (encaixe)" : ""}</Badge>
                  : <Badge variant="secondary" className="text-xs">Livre</Badge>}
              </label>
            ))}
          </div>
        )}
        <div>
          <Label>Motivo do remanejamento *</Label>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: Ponto facultativo municipal" />
        </div>
        {executando && <p className="text-sm">Movendo... {progresso}%</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={executando}>Cancelar</Button>
          <Button onClick={executar} disabled={!linhas || !selecionados.length || executando || motivo.trim().length < 5}>
            {executando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Mover {selecionados.length} para {fmt(destino)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

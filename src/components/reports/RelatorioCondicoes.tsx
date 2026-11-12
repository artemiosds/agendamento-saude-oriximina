import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, RefreshCw } from "lucide-react";
import { openPrintDocument } from "@/lib/printLayout";
import { GRUPOS_RELATORIO, pertenceAoGrupo, type GrupoCondicao } from "@/lib/condicoesRelatorio";
import { toast } from "sonner";

const ATIVOS_AGENDA = ["pendente", "agendado", "confirmado", "confirmado_chegada", "aguardando_triagem", "aguardando_atendimento"];

interface Stats {
  cadastrados: number; emTratamento: number; altas: number; concluidos: number;
  agendados: number; sessoes: number; porEspecialidade: { esp: string; pacientes: number; ciclos: number }[];
}

async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = []; let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return out;
}
const chunks = <T,>(a: T[], n = 150) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export default function RelatorioCondicoes() {
  const { user } = useAuth();
  const unidade = user?.unidadeId && user?.usuario !== "admin.sms" ? user.unidadeId : null;
  const [grupo, setGrupo] = useState<GrupoCondicao>("tea");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pacs = await fetchAll<any>((f, t) => {
        let q = supabase.from("pacientes").select("id,tipo_condicao,cid,is_autista,diagnostico_resumido,descricao_clinica,observacoes,unidade_id").order("id").range(f, t);
        return q;
      });
      const alvo = pacs.filter(p => pertenceAoGrupo(p, grupo));
      const ids = alvo.map(p => p.id);
      const ciclos: any[] = [];
      for (const c of chunks(ids)) {
        let q = supabase.from("treatment_cycles").select("id,patient_id,status,specialty,unit_id").in("patient_id", c);
        if (unidade) q = q.eq("unit_id", unidade);
        const { data, error } = await q; if (error) throw error; ciclos.push(...(data || []));
      }
      const ags: any[] = [];
      for (const c of chunks(ids)) {
        let q = supabase.from("agendamentos").select("paciente_id").in("paciente_id", c).in("status", ATIVOS_AGENDA);
        if (unidade) q = q.eq("unidade_id", unidade);
        const { data, error } = await q; if (error) throw error; ags.push(...(data || []));
      }
      let sessoes = 0;
      for (const c of chunks(ciclos.map(x => x.id))) {
        const { count, error } = await supabase.from("treatment_sessions").select("id", { count: "exact", head: true }).in("cycle_id", c).eq("status", "realizada");
        if (error) throw error; sessoes += count || 0;
      }
      const uniq = (st: string) => new Set(ciclos.filter(c => c.status === st).map(c => c.patient_id)).size;
      const esp = new Map<string, { p: Set<string>; c: number }>();
      ciclos.filter(c => c.status === "em_andamento").forEach(c => {
        const k = c.specialty || "Não informada";
        const e = esp.get(k) || { p: new Set(), c: 0 }; e.p.add(c.patient_id); e.c++; esp.set(k, e);
      });
      const cadastrados = unidade ? new Set([...alvo.filter(p => p.unidade_id === unidade).map(p => p.id), ...ciclos.map(c => c.patient_id)]).size : alvo.length;
      setStats({
        cadastrados, emTratamento: uniq("em_andamento"), altas: uniq("finalizado_alta"), concluidos: uniq("concluido"),
        agendados: new Set(ags.map(a => a.paciente_id)).size, sessoes,
        porEspecialidade: [...esp.entries()].map(([k, v]) => ({ esp: k, pacientes: v.p.size, ciclos: v.c })).sort((a, b) => b.pacientes - a.pacientes),
      });
    } catch (e: any) {
      toast.error("Não foi possível carregar o relatório", { description: e?.message });
    } finally { setLoading(false); }
  }, [grupo, unidade]);

  useEffect(() => { load(); }, [load]);

  const label = GRUPOS_RELATORIO.find(g => g.value === grupo)!.label;
  const cards = stats ? [
    ["Cadastrados", stats.cadastrados], ["Em tratamento ativo", stats.emTratamento], ["Com agendamento ativo", stats.agendados],
    ["Sessões realizadas", stats.sessoes], ["Com alta clínica", stats.altas], ["Ciclos concluídos", stats.concluidos],
  ] as [string, number][] : [];

  const imprimir = () => {
    if (!stats) return;
    const linhas = cards.map(([l, v]) => `<tr><td>${l}</td><td style="text-align:right"><b>${v}</b></td></tr>`).join("");
    const esp = stats.porEspecialidade.map(e => `<tr><td>${e.esp}</td><td style="text-align:right">${e.pacientes}</td><td style="text-align:right">${e.ciclos}</td></tr>`).join("") || `<tr><td colspan="3">Nenhum tratamento ativo.</td></tr>`;
    const body = `<h3>Indicadores — ${label}</h3><table class="doc-table" style="width:100%"><tbody>${linhas}</tbody></table>
      <h3 style="margin-top:16px">Tratamentos ativos por especialidade</h3>
      <table class="doc-table" style="width:100%"><thead><tr><th>Especialidade</th><th>Pacientes</th><th>Ciclos</th></tr></thead><tbody>${esp}</tbody></table>
      <p style="font-size:10px;margin-top:12px">Totais consolidados, sem identificação de pacientes. Um paciente pode estar em mais de uma especialidade. Critérios: condição marcada no cadastro, CID e registro clínico.</p>`;
    openPrintDocument(`Relatório de Atendimento — ${label}`, body, { "Emitido em": new Date().toLocaleString("pt-BR") });
  };

  return (
    <Card className="shadow-card border-0">
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px]">
            <p className="text-xs font-semibold mb-1.5">Condição do paciente</p>
            <Select value={grupo} onValueChange={v => setGrupo(v as GrupoCondicao)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{GRUPOS_RELATORIO.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />Atualizar</Button>
          <Button onClick={imprimir} disabled={!stats || loading}><Printer className="w-4 h-4 mr-2" />Imprimir A4</Button>
        </div>
        {loading && !stats ? <p className="text-sm text-muted-foreground">Carregando…</p> : stats && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {cards.map(([l, v]) => (
                <div key={l} className="rounded-lg border bg-card p-3">
                  <p className="text-2xl font-bold text-primary">{v}</p>
                  <p className="text-xs text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-sm font-semibold mb-2">Tratamentos ativos por especialidade</p>
              {stats.porEspecialidade.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum tratamento ativo para esta condição.</p> : (
                <table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th className="py-1">Especialidade</th><th className="text-right">Pacientes</th><th className="text-right">Ciclos</th></tr></thead>
                  <tbody>{stats.porEspecialidade.map(e => <tr key={e.esp} className="border-t"><td className="py-1.5">{e.esp}</td><td className="text-right">{e.pacientes}</td><td className="text-right">{e.ciclos}</td></tr>)}</tbody></table>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Totais sem nomes. Um paciente pode estar em mais de uma especialidade. Conta pela condição marcada no cadastro, CID e registro clínico.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

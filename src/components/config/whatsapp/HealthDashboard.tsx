// Dashboard de Saúde do Número — Fase 3
// KPIs diários (enviadas/entregues/lidas/erros/respostas), taxa de erro
// e indicador de fila pausada/circuit-breaker.
import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Activity, CheckCircle2, AlertTriangle, MessagesSquare } from 'lucide-react';
import { toast } from 'sonner';

interface Snapshot {
  snapshot_date: string;
  provider: string;
  enviadas: number;
  entregues: number;
  lidas: number;
  falhas: number;
  respostas: number;
  pendentes: number;
  pausadas: number;
  rejeicoes_template: number;
  taxa_erro: number;
  taxa_resposta: number;
  taxa_confirmacao: number;
  status_conexao: string;
}

function Kpi({ label, value, sub, icon: Icon, tone = 'default' }: any) {
  const colors: Record<string, string> = {
    ok: 'border-emerald-200 bg-emerald-50',
    warn: 'border-amber-200 bg-amber-50',
    bad: 'border-red-200 bg-red-50',
    default: 'border-slate-200 bg-slate-50',
  };
  return (
    <Card className={`shadow-none border ${colors[tone]}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-semibold">{value}</div>
            {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
          </div>
          {Icon && <Icon className="w-8 h-8 opacity-30" />}
        </div>
      </CardContent>
    </Card>
  );
}

export const HealthDashboard: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [paused, setPaused] = useState<{ ate: string; motivo: string | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: todayData } = await supabase
        .from('whatsapp_health_snapshots')
        .select('*')
        .eq('snapshot_date', today);
      setSnapshots((todayData || []) as Snapshot[]);

      const { data: histData } = await supabase
        .from('whatsapp_health_snapshots')
        .select('*')
        .order('snapshot_date', { ascending: false })
        .limit(14);
      setHistory((histData || []) as Snapshot[]);

      const { data: conn } = await supabase
        .from('whatsapp_connection_status')
        .select('fila_pausada_ate, fila_pausada_motivo')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (conn?.fila_pausada_ate && new Date(conn.fila_pausada_ate).getTime() > Date.now()) {
        setPaused({ ate: conn.fila_pausada_ate, motivo: conn.fila_pausada_motivo });
      } else setPaused(null);
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runSnapshot = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-health-snapshot', { body: {} });
      if (error) throw error;
      toast.success(`Snapshot gerado para ${data?.snapshots?.length || 0} provider(s)`);
      load();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Saúde do número WhatsApp</h3>
          <p className="text-sm text-muted-foreground">Métricas de hoje · histórico de 14 dias · circuit-breaker</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Atualizar
          </Button>
          <Button size="sm" onClick={runSnapshot} disabled={running}>
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />} Recalcular agora
          </Button>
        </div>
      </div>

      {paused && (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          <div>
            <div className="font-semibold">Fila pausada (circuit breaker)</div>
            <div className="text-xs">Até {new Date(paused.ate).toLocaleString('pt-BR')} · motivo: {paused.motivo || '—'}</div>
          </div>
        </div>
      )}

      {snapshots.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">
            Sem snapshot de hoje ainda. Clique em <strong>Recalcular agora</strong> para gerar.
          </CardContent>
        </Card>
      )}

      {snapshots.map((s) => {
        const errTone = s.taxa_erro > 25 ? 'bad' : s.taxa_erro > 10 ? 'warn' : 'ok';
        return (
          <Card key={s.provider} className="shadow-card border-0">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-base">{s.provider}</Badge>
                  <Badge className={s.status_conexao === 'conectado' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-700'}>
                    {s.status_conexao}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">Snapshot: {s.snapshot_date}</div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Enviadas hoje" value={s.enviadas} icon={CheckCircle2} />
                <Kpi label="Entregues" value={s.entregues} sub={`${s.lidas} lidas`} />
                <Kpi label="Respostas" value={s.respostas} sub={`${s.taxa_resposta.toFixed(1)}% resp.`} icon={MessagesSquare} />
                <Kpi label="Taxa de erro" value={`${s.taxa_erro.toFixed(1)}%`} sub={`${s.falhas} falhas`} tone={errTone} icon={AlertTriangle} />
                <Kpi label="Pendentes" value={s.pendentes} />
                <Kpi label="Bloqueadas/Pausadas" value={s.pausadas} />
                <Kpi label="Rej. template" value={s.rejeicoes_template} tone={s.rejeicoes_template > 0 ? 'warn' : 'default'} />
                <Kpi label="Taxa confirmação" value={`${s.taxa_confirmacao.toFixed(1)}%`} />
              </div>
            </CardContent>
          </Card>
        );
      })}

      {history.length > 0 && (
        <Card className="shadow-card border-0">
          <CardContent className="p-5">
            <h4 className="text-sm font-semibold mb-3">Histórico 14 dias</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3">Data</th>
                    <th className="pr-3">Provider</th>
                    <th className="pr-3 text-right">Enviadas</th>
                    <th className="pr-3 text-right">Entregues</th>
                    <th className="pr-3 text-right">Respostas</th>
                    <th className="pr-3 text-right">% Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5 pr-3">{h.snapshot_date}</td>
                      <td className="pr-3"><Badge variant="outline">{h.provider}</Badge></td>
                      <td className="pr-3 text-right">{h.enviadas}</td>
                      <td className="pr-3 text-right">{h.entregues}</td>
                      <td className="pr-3 text-right">{h.respostas}</td>
                      <td className={`pr-3 text-right ${h.taxa_erro > 25 ? 'text-red-600 font-semibold' : h.taxa_erro > 10 ? 'text-amber-600' : ''}`}>
                        {h.taxa_erro.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
export default HealthDashboard;

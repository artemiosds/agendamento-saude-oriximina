// Painel de Fila do WhatsApp — Fase 3 hardening
// Mostra mensagens pendentes/erro/enviadas com filtros e ações Master.
import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, RotateCcw, XCircle, Play, Pause, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface QueueRow {
  id: string;
  paciente_nome: string;
  telefone: string;
  evento: string;
  status: string;
  provider: string | null;
  tentativas: number;
  priority: number | null;
  agendado_para: string | null;
  processado_em: string | null;
  motivo_erro: string | null;
  error_code: string | null;
  next_retry_at: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  pendente: 'bg-amber-100 text-amber-800 border-amber-200',
  processando: 'bg-blue-100 text-blue-800 border-blue-200',
  enviado: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  entregue: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  lido: 'bg-emerald-200 text-emerald-900 border-emerald-300',
  erro: 'bg-red-100 text-red-800 border-red-200',
  bloqueado: 'bg-zinc-200 text-zinc-700 border-zinc-300',
  cancelado: 'bg-zinc-100 text-zinc-600 border-zinc-200',
};

export const QueueTable: React.FC = () => {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('all');
  const [provider, setProvider] = useState('all');
  const [search, setSearch] = useState('');
  const [paused, setPaused] = useState<{ ate: string | null; motivo: string | null } | null>(null);
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('whatsapp_queue')
        .select('id,paciente_nome,telefone,evento,status,provider,tentativas,priority,agendado_para,processado_em,motivo_erro,error_code,next_retry_at')
        .order('criado_em', { ascending: false })
        .limit(200);
      if (status !== 'all') q = q.eq('status', status);
      if (provider !== 'all') q = q.eq('provider', provider);
      const { data, error } = await q;
      if (error) throw error;
      let list = (data || []) as QueueRow[];
      if (search.trim()) {
        const s = search.toLowerCase();
        list = list.filter(r => (r.paciente_nome || '').toLowerCase().includes(s) || (r.telefone || '').includes(s));
      }
      setRows(list);

      // Estado de pausa do provider
      const { data: conn } = await supabase
        .from('whatsapp_connection_status')
        .select('fila_pausada_ate, fila_pausada_motivo')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (conn?.fila_pausada_ate && new Date(conn.fila_pausada_ate).getTime() > Date.now()) {
        setPaused({ ate: conn.fila_pausada_ate, motivo: conn.fila_pausada_motivo });
      } else {
        setPaused(null);
      }
    } catch (e: any) {
      toast.error('Erro ao carregar fila: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [status, provider, search]);

  useEffect(() => { load(); }, [load]);

  const reprocess = async (id: string) => {
    const { error } = await supabase
      .from('whatsapp_queue')
      .update({ status: 'pendente', tentativas: 0, agendado_para: new Date().toISOString(), motivo_erro: null, error_code: null, next_retry_at: null })
      .eq('id', id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Mensagem retornou para fila'); load(); }
  };

  const cancel = async (id: string) => {
    if (!confirm('Cancelar esta mensagem?')) return;
    const { error } = await supabase.from('whatsapp_queue').update({ status: 'cancelado', motivo_erro: 'Cancelado manualmente' }).eq('id', id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Cancelado'); load(); }
  };

  const togglePause = async () => {
    if (paused) {
      await supabase.from('whatsapp_connection_status').update({ fila_pausada_ate: null, fila_pausada_motivo: null }).neq('id', '00000000-0000-0000-0000-000000000000');
      toast.success('Fila retomada');
    } else {
      const ate = new Date(Date.now() + 30 * 60_000).toISOString();
      await supabase.from('whatsapp_connection_status').update({ fila_pausada_ate: ate, fila_pausada_motivo: 'Pausado manualmente' }).neq('id', '00000000-0000-0000-0000-000000000000');
      toast.success('Fila pausada por 30 min');
    }
    load();
  };

  const runProcessor = async () => {
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-whatsapp-queue', { body: {} });
      if (error) throw error;
      toast.success(`Processados: ${data?.processed || 0} · Falhas: ${data?.failed || 0}`);
      load();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Card className="shadow-card border-0">
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="pendente">Pendentes</SelectItem>
                <SelectItem value="processando">Processando</SelectItem>
                <SelectItem value="enviado">Enviadas</SelectItem>
                <SelectItem value="entregue">Entregues</SelectItem>
                <SelectItem value="lido">Lidas</SelectItem>
                <SelectItem value="erro">Erros</SelectItem>
                <SelectItem value="bloqueado">Bloqueadas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos providers</SelectItem>
                <SelectItem value="evolution">Evolution</SelectItem>
                <SelectItem value="uazapigo">UazapiGO</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Buscar paciente/telefone" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[220px]" />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Atualizar
            </Button>
            <Button size="sm" variant="outline" onClick={runProcessor} disabled={processing}>
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Disparar agora
            </Button>
            <Button size="sm" variant={paused ? 'destructive' : 'secondary'} onClick={togglePause}>
              {paused ? <Play className="w-4 h-4 mr-1" /> : <Pause className="w-4 h-4 mr-1" />}
              {paused ? 'Retomar fila' : 'Pausar fila'}
            </Button>
          </div>
        </div>

        {paused && (
          <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            ⚠️ Fila pausada até {new Date(paused.ate!).toLocaleString('pt-BR')} — motivo: {paused.motivo || '—'}
          </div>
        )}

        <ScrollArea className="h-[480px] rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tent.</TableHead>
                <TableHead>Agendado</TableHead>
                <TableHead>Erro</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Sem mensagens nessa fila.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.paciente_nome || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{r.telefone}</TableCell>
                  <TableCell>{r.evento}</TableCell>
                  <TableCell><Badge variant="outline">{r.provider || '—'}</Badge></TableCell>
                  <TableCell><Badge className={STATUS_BADGE[r.status] || ''}>{r.status}</Badge></TableCell>
                  <TableCell>{r.tentativas || 0}</TableCell>
                  <TableCell className="text-xs">{r.agendado_para ? new Date(r.agendado_para).toLocaleString('pt-BR') : '—'}</TableCell>
                  <TableCell className="text-xs text-red-700 max-w-[200px] truncate" title={r.motivo_erro || ''}>{r.motivo_erro || ''}</TableCell>
                  <TableCell className="text-right">
                    {['erro', 'cancelado', 'bloqueado'].includes(r.status) && (
                      <Button size="sm" variant="ghost" onClick={() => reprocess(r.id)} title="Reprocessar"><RotateCcw className="w-4 h-4" /></Button>
                    )}
                    {['pendente', 'processando'].includes(r.status) && (
                      <Button size="sm" variant="ghost" onClick={() => cancel(r.id)} title="Cancelar"><XCircle className="w-4 h-4 text-red-600" /></Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
export default QueueTable;

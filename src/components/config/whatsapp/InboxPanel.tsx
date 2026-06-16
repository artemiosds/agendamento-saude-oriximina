// Painel de Respostas Recebidas (Inbox) — Fase 3
// Lista mensagens recebidas com intent classificada e indicador de janela 24h.
import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, Loader2, MessageCircle, BanIcon } from 'lucide-react';
import { toast } from 'sonner';

interface InboundRow {
  id: string;
  phone: string;
  paciente_id: string | null;
  body: string;
  intent: string | null;
  recebido_em: string;
  agendamento_id: string | null;
  processed: boolean;
}

const INTENT_COLOR: Record<string, string> = {
  confirmar: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  remarcar: 'bg-blue-100 text-blue-800 border-blue-200',
  atendente: 'bg-violet-100 text-violet-800 border-violet-200',
  sair: 'bg-red-100 text-red-800 border-red-200',
  livre: 'bg-zinc-100 text-zinc-700 border-zinc-200',
};

export const InboxPanel: React.FC = () => {
  const [rows, setRows] = useState<InboundRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [intent, setIntent] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('whatsapp_inbound_messages')
        .select('id,phone,paciente_id,body,intent,recebido_em,agendamento_id,processed')
        .order('recebido_em', { ascending: false })
        .limit(200);
      if (intent !== 'all') q = q.eq('intent', intent);
      const { data, error } = await q;
      if (error) throw error;
      let list = (data || []) as InboundRow[];
      if (search.trim()) {
        const s = search.toLowerCase();
        list = list.filter(r => (r.phone || '').includes(s) || (r.body || '').toLowerCase().includes(s));
      }
      setRows(list);
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [intent, search]);

  useEffect(() => { load(); }, [load]);

  const markOptOut = async (phone: string) => {
    if (!confirm(`Marcar ${phone} como opt-out (não receberá mais mensagens)?`)) return;
    const { error } = await supabase.from('whatsapp_conversations').upsert({
      phone, opted_out: true, opted_out_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'phone' });
    if (error) toast.error('Erro: ' + error.message);
    else toast.success('Opt-out registrado.');
  };

  return (
    <Card className="shadow-card border-0">
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={intent} onValueChange={setIntent}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas intenções</SelectItem>
                <SelectItem value="confirmar">Confirmação</SelectItem>
                <SelectItem value="remarcar">Remarcação</SelectItem>
                <SelectItem value="atendente">Atendente humano</SelectItem>
                <SelectItem value="sair">Opt-out</SelectItem>
                <SelectItem value="livre">Texto livre</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Buscar telefone/mensagem" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[260px]" />
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Atualizar
          </Button>
        </div>

        <ScrollArea className="h-[520px] rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Intent</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma resposta recebida ainda.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{new Date(r.recebido_em).toLocaleString('pt-BR')}</TableCell>
                  <TableCell className="font-mono text-xs">{r.phone}</TableCell>
                  <TableCell>
                    <Badge className={INTENT_COLOR[r.intent || 'livre'] || ''}>
                      <MessageCircle className="w-3 h-3 mr-1" />{r.intent || 'livre'}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[420px] text-sm">{r.body}</TableCell>
                  <TableCell>{r.processed ? <Badge variant="outline">Processado</Badge> : <Badge>Pendente</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" title="Marcar opt-out" onClick={() => markOptOut(r.phone)}>
                      <BanIcon className="w-4 h-4 text-red-600" />
                    </Button>
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
export default InboxPanel;

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Shield, Loader2, Save, Trash2, RefreshCw, AlertTriangle, Clock, PowerOff, Power } from 'lucide-react';
import { toast } from 'sonner';

const DAYS = [
  { v: 0, l: 'Dom' }, { v: 1, l: 'Seg' }, { v: 2, l: 'Ter' },
  { v: 3, l: 'Qua' }, { v: 4, l: 'Qui' }, { v: 5, l: 'Sex' }, { v: 6, l: 'Sáb' },
];

interface UnitCfg {
  id?: string;
  unidade_id: string;
  whatsapp_ativo: boolean;
  max_msgs_paciente_dia: number;
  max_msgs_paciente_semana: number;
  intervalo_minimo_minutos: number;
  delay_aleatorio_min_seg: number;
  delay_aleatorio_max_seg: number;
  limite_global_por_minuto: number;
  horario_inicio: string;
  horario_fim: string;
  dias_permitidos: number[];
  modo_estrito: boolean;
  respeitar_opt_out: boolean;
  bloquear_sem_interacao_previa: boolean;
}

const DEFAULT: UnitCfg = {
  unidade_id: '',
  whatsapp_ativo: true,
  max_msgs_paciente_dia: 5,
  max_msgs_paciente_semana: 10,
  intervalo_minimo_minutos: 10,
  delay_aleatorio_min_seg: 5,
  delay_aleatorio_max_seg: 30,
  limite_global_por_minuto: 20,
  horario_inicio: '08:00',
  horario_fim: '18:00',
  dias_permitidos: [1, 2, 3, 4, 5],
  modo_estrito: true,
  respeitar_opt_out: true,
  bloquear_sem_interacao_previa: false,
};

interface QueueRow {
  id: string;
  paciente_nome: string;
  telefone: string;
  evento: string;
  prioridade: string;
  status: string;
  agendado_para: string;
  tentativas: number;
  motivo_erro: string;
  criado_em: string;
}

const ConfigWhatsAppAntiBan: React.FC = () => {
  const { user } = useAuth();
  const { unidades } = useData();
  const isGlobalAdmin = user?.usuario === 'admin.sms';
  const userUnitId = user?.unidadeId || '';

  const editableUnits = isGlobalAdmin ? unidades : unidades.filter(u => u.id === userUnitId);
  const [selectedUnit, setSelectedUnit] = useState<string>(userUnitId || editableUnits[0]?.id || '');

  const [cfg, setCfg] = useState<UnitCfg>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueFilter, setQueueFilter] = useState<string>('pendente');
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  const load = useCallback(async () => {
    if (!selectedUnit) return;
    setLoading(true);
    const { data } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('unidade_id', selectedUnit)
      .maybeSingle();
    if (data) setCfg(data as any);
    else setCfg({ ...DEFAULT, unidade_id: selectedUnit });
    setLoading(false);
  }, [selectedUnit]);

  useEffect(() => { load(); }, [load]);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    let q = supabase.from('whatsapp_queue').select('*')
      .order('criado_em', { ascending: false }).limit(100);
    if (queueFilter !== 'todos') q = q.eq('status', queueFilter);
    if (!isGlobalAdmin && userUnitId) q = q.eq('unidade_id', userUnitId);
    const { data } = await q;
    setQueue((data as any) || []);
    setQueueLoading(false);
  }, [queueFilter, isGlobalAdmin, userUnitId]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  // Realtime: assina mudanças na config da unidade selecionada para
  // sincronizar o estado entre múltiplas estações instantaneamente.
  useEffect(() => {
    if (!selectedUnit) return;
    const channel = supabase
      .channel(`anti_ban_cfg_${selectedUnit}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'whatsapp_config', filter: `unidade_id=eq.${selectedUnit}` },
        (payload: any) => {
          const next = payload.new;
          if (next) setCfg(prev => ({ ...prev, ...next }));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedUnit]);

  /** Persiste APENAS o campo whatsapp_ativo (toggle imediato, sem clicar Salvar). */
  const persistAtivo = async (novoValor: boolean) => {
    setTogglingActive(true);
    try {
      const payload = { ...cfg, unidade_id: selectedUnit, whatsapp_ativo: novoValor };
      delete (payload as any).id;
      delete (payload as any).created_at;
      delete (payload as any).updated_at;
      const { error } = await supabase
        .from('whatsapp_config')
        .upsert(payload, { onConflict: 'unidade_id' });
      if (error) throw error;
      setCfg(p => ({ ...p, whatsapp_ativo: novoValor }));
      toast.success(novoValor
        ? '✅ WhatsApp reativado — automações voltarão a funcionar'
        : '🔕 WhatsApp pausado — nenhum envio será processado');
    } catch (e: any) {
      toast.error(`Erro ao alterar status: ${e.message}`);
    } finally {
      setTogglingActive(false);
    }
  };

  const handleToggleAtivo = (novoValor: boolean) => {
    if (!selectedUnit) { toast.error('Selecione uma unidade'); return; }
    if (!novoValor) {
      // Desativando → abre confirmação para escolher pausar ou limpar fila
      setConfirmDeactivate(true);
    } else {
      persistAtivo(true);
    }
  };

  /** Apenas pausa: muda flag para false, fila pendente permanece (mas será bloqueada no envio). */
  const pausarEnvios = async () => {
    setConfirmDeactivate(false);
    await persistAtivo(false);
    loadQueue();
  };

  /** Pausa + limpa toda a fila pendente da unidade. */
  const limparFila = async () => {
    setConfirmDeactivate(false);
    await persistAtivo(false);
    try {
      const { error, count } = await supabase
        .from('whatsapp_queue')
        .update({ status: 'cancelado', motivo_erro: 'Cancelado ao desativar WhatsApp da unidade' }, { count: 'exact' })
        .eq('unidade_id', selectedUnit)
        .eq('status', 'pendente');
      if (error) throw error;
      toast.success(`🧹 ${count || 0} mensagem(ns) pendente(s) canceladas`);
      loadQueue();
    } catch (e: any) {
      toast.error(`Erro ao limpar fila: ${e.message}`);
    }
  };


  const save = async () => {
    if (!selectedUnit) { toast.error('Selecione uma unidade'); return; }
    setSaving(true);
    try {
      const payload = { ...cfg, unidade_id: selectedUnit };
      delete (payload as any).id;
      delete (payload as any).created_at;
      delete (payload as any).updated_at;
      const { error } = await supabase
        .from('whatsapp_config')
        .upsert(payload, { onConflict: 'unidade_id' });
      if (error) throw error;
      toast.success('Configuração anti-ban salva!');
      load();
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    }
    setSaving(false);
  };

  const cancelMsg = async (id: string) => {
    await supabase.from('whatsapp_queue').update({ status: 'cancelado' }).eq('id', id);
    toast.success('Mensagem cancelada');
    loadQueue();
  };

  const toggleDay = (d: number) => {
    setCfg(prev => ({
      ...prev,
      dias_permitidos: prev.dias_permitidos.includes(d)
        ? prev.dias_permitidos.filter(x => x !== d)
        : [...prev.dias_permitidos, d].sort(),
    }));
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pendente: 'bg-warning/10 text-warning',
      processando: 'bg-info/10 text-info',
      enviado: 'bg-success/10 text-success',
      erro: 'bg-destructive/10 text-destructive',
      bloqueado: 'bg-muted text-muted-foreground',
      cancelado: 'bg-muted text-muted-foreground',
    };
    return <Badge className={`${map[s] || ''} border-0 text-xs`}>{s}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-warning/10 flex items-center justify-center">
          <Shield className="w-6 h-6 text-warning" />
        </div>
        <div>
          <h2 className="text-xl font-bold font-display text-foreground">Anti-Ban & Fila</h2>
          <p className="text-sm text-muted-foreground">Limites, horários e fila de envios por unidade</p>
        </div>
      </div>

      {/* Seletor de unidade */}
      {editableUnits.length > 1 && (
        <Card className="border-0 shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <Label className="whitespace-nowrap">Unidade:</Label>
            <Select value={selectedUnit} onValueChange={setSelectedUnit}>
              <SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger>
              <SelectContent>
                {editableUnits.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Config form */}
      <Card className="border-0 shadow-card">
        <CardContent className="p-5 space-y-5">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className={`flex items-center justify-between p-4 rounded-xl border-2 transition-colors ${
                cfg.whatsapp_ativo
                  ? 'bg-success/5 border-success/30'
                  : 'bg-destructive/5 border-destructive/30'
              }`}>
                <div className="flex items-center gap-3">
                  {cfg.whatsapp_ativo
                    ? <Power className="w-6 h-6 text-success shrink-0" />
                    : <PowerOff className="w-6 h-6 text-destructive shrink-0" />}
                  <div>
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      WhatsApp {cfg.whatsapp_ativo ? 'ATIVO' : 'PAUSADO'} nesta unidade
                      {togglingActive && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {cfg.whatsapp_ativo
                        ? 'Mensagens automáticas (lembretes, confirmações, cancelamentos) serão enviadas normalmente.'
                        : 'Modo silencioso: nenhuma mensagem será enviada até reativar.'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={cfg.whatsapp_ativo}
                  disabled={togglingActive}
                  onCheckedChange={handleToggleAtivo}
                />
              </div>

              <Separator />

              <div>
                <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning" /> Limites por paciente
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Máx. mensagens/dia</Label>
                    <Input type="number" min={1} value={cfg.max_msgs_paciente_dia}
                      onChange={e => setCfg(p => ({ ...p, max_msgs_paciente_dia: +e.target.value || 1 }))} />
                  </div>
                  <div>
                    <Label>Máx. mensagens/semana</Label>
                    <Input type="number" min={1} value={cfg.max_msgs_paciente_semana}
                      onChange={e => setCfg(p => ({ ...p, max_msgs_paciente_semana: +e.target.value || 1 }))} />
                  </div>
                  <div>
                    <Label>Intervalo mínimo (min)</Label>
                    <Input type="number" min={0} value={cfg.intervalo_minimo_minutos}
                      onChange={e => setCfg(p => ({ ...p, intervalo_minimo_minutos: +e.target.value || 0 }))} />
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" /> Delays anti-spam
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Delay aleatório mínimo (seg)</Label>
                    <Input type="number" min={0} value={cfg.delay_aleatorio_min_seg}
                      onChange={e => setCfg(p => ({ ...p, delay_aleatorio_min_seg: +e.target.value || 0 }))} />
                  </div>
                  <div>
                    <Label>Delay aleatório máximo (seg)</Label>
                    <Input type="number" min={0} value={cfg.delay_aleatorio_max_seg}
                      onChange={e => setCfg(p => ({ ...p, delay_aleatorio_max_seg: +e.target.value || 0 }))} />
                  </div>
                  <div>
                    <Label>Limite global por minuto</Label>
                    <Input type="number" min={1} value={cfg.limite_global_por_minuto}
                      onChange={e => setCfg(p => ({ ...p, limite_global_por_minuto: +e.target.value || 1 }))} />
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium text-foreground mb-3">Janela de envio</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                  <div>
                    <Label>Horário início</Label>
                    <Input type="time" value={cfg.horario_inicio}
                      onChange={e => setCfg(p => ({ ...p, horario_inicio: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Horário fim</Label>
                    <Input type="time" value={cfg.horario_fim}
                      onChange={e => setCfg(p => ({ ...p, horario_fim: e.target.value }))} />
                  </div>
                </div>
                <Label className="mb-2 block">Dias permitidos</Label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS.map(d => (
                    <button key={d.v} type="button" onClick={() => toggleDay(d.v)}
                      className={`px-3 py-1.5 rounded-md text-sm border transition ${
                        cfg.dias_permitidos.includes(d.v)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:bg-muted'
                      }`}>
                      {d.l}
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium text-foreground mb-3">Compliance</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Modo estrito anti-spam</Label>
                      <p className="text-xs text-muted-foreground">Aplica todas as validações de forma rígida</p>
                    </div>
                    <Switch checked={cfg.modo_estrito} onCheckedChange={v => setCfg(p => ({ ...p, modo_estrito: v }))} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Respeitar opt-out de pacientes</Label>
                      <p className="text-xs text-muted-foreground">Bloqueia envio para quem solicitou descadastro</p>
                    </div>
                    <Switch checked={cfg.respeitar_opt_out} onCheckedChange={v => setCfg(p => ({ ...p, respeitar_opt_out: v }))} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Exigir interação prévia do paciente</Label>
                      <p className="text-xs text-muted-foreground">Só envia para quem já respondeu/iniciou contato</p>
                    </div>
                    <Switch checked={cfg.bloquear_sem_interacao_previa}
                      onCheckedChange={v => setCfg(p => ({ ...p, bloquear_sem_interacao_previa: v }))} />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={save} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar Configuração
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Fila */}
      <Card className="border-0 shadow-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Fila de envios</h3>
            <div className="flex items-center gap-2">
              <Select value={queueFilter} onValueChange={setQueueFilter}>
                <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendente">Pendentes</SelectItem>
                  <SelectItem value="processando">Processando</SelectItem>
                  <SelectItem value="enviado">Enviadas</SelectItem>
                  <SelectItem value="erro">Erros</SelectItem>
                  <SelectItem value="cancelado">Canceladas</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={loadQueue} disabled={queueLoading}>
                <RefreshCw className={`w-4 h-4 ${queueLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    {queueLoading ? 'Carregando...' : 'Nenhuma mensagem na fila'}
                  </TableCell></TableRow>
                ) : queue.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">{m.paciente_nome || '—'}</TableCell>
                    <TableCell className="text-xs font-mono">{m.telefone}</TableCell>
                    <TableCell className="text-xs">{m.evento}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{m.prioridade}</Badge></TableCell>
                    <TableCell>{statusBadge(m.status)}</TableCell>
                    <TableCell className="text-xs">{m.tentativas}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(m.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    </TableCell>
                    <TableCell>
                      {m.status === 'pendente' && (
                        <Button size="sm" variant="ghost" onClick={() => cancelMsg(m.id)}
                          className="h-7 px-2 text-destructive hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConfigWhatsAppAntiBan;

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOperacional } from '@/contexts/OperacionalContext';
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
import CircuitBreakerCard from './whatsapp/CircuitBreakerCard';
import { toast } from 'sonner';
import type {Tables,TablesUpdate} from '@/integrations/supabase/types';
import {nextVersion} from '@/lib/adminWhatsApp';

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
  const { unidades } = useOperacional();
  const isGlobalAdmin = user?.usuario === 'admin.sms';
  const userUnitId = user?.unidadeId || '';

  const editableUnits = isGlobalAdmin ? unidades : unidades.filter(u => u.id === userUnitId);
  const [selectedUnit, setSelectedUnit] = useState<string>(userUnitId || editableUnits[0]?.id || '');

  const [cfg, setCfg] = useState<UnitCfg>(DEFAULT);
  const [failed,setFailed]=useState(false);
  const baseline=useRef<{unit:string;row:Tables<'whatsapp_config'>|null}|null>(null);
  const lock=useRef(false),generation=useRef(0);
  const confirmSession=async()=>{const {data,error}=await supabase.auth.getSession();if(error||!user?.authUserId||user.role!=='master'||user.ativo!==true||data.session?.user.id!==user.authUserId)throw Error('Sessão não confirmada.');};
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueFilter, setQueueFilter] = useState<string>('pendente');
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  // Contador soberano da fila pendente (independente do filtro da tabela)
  const [pendingCount, setPendingCount] = useState<number>(0);
  // Pacientes agendados sem telefone ou com telefone inválido (<10 dígitos)
  const [pendenciasCadastro, setPendenciasCadastro] = useState<Array<{
    paciente_id: string;
    paciente_nome: string;
    telefone: string;
    motivo: string;
    data: string;
    hora: string;
  }>>([]);
  const [pendenciasLoading, setPendenciasLoading] = useState(false);

  const load=useCallback(async()=>{
    const request=++generation.current;baseline.current=null;setLoading(true);setFailed(false);
    try{if(!selectedUnit)throw Error('Selecione a unidade.');
      const {data,error}=await supabase.from('whatsapp_config').select('*').eq('unidade_id',selectedUnit).maybeSingle();
      if(error)throw error;if(request!==generation.current)return;
      baseline.current={unit:selectedUnit,row:data};setCfg(data??{...DEFAULT,unidade_id:selectedUnit});
    }catch{if(request===generation.current)setFailed(true);}
    finally{if(request===generation.current)setLoading(false);}
  },[selectedUnit]);
  useEffect(()=>{void load();return()=>{generation.current++;baseline.current=null;};},[load]);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    let q = supabase.from('whatsapp_queue').select('*')
      .order('criado_em', { ascending: false }).limit(100);
    if (queueFilter !== 'todos') q = q.eq('status', queueFilter);
    if (!isGlobalAdmin && userUnitId) q = q.eq('unidade_id', userUnitId);
    const { data } = await q;
    setQueue((data as any) || []);

    // Contador soberano da fila pendente da unidade
    let countQ = supabase.from('whatsapp_queue').select('id', { count: 'exact', head: true }).eq('status', 'pendente');
    if (!isGlobalAdmin && userUnitId) countQ = countQ.eq('unidade_id', userUnitId);
    const { count } = await countQ;
    setPendingCount(count ?? 0);

    setQueueLoading(false);
  }, [queueFilter, isGlobalAdmin, userUnitId]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  // Auditoria: pacientes agendados (futuro) sem telefone ou com nº inválido
  const loadPendenciasCadastro = useCallback(async () => {
    setPendenciasLoading(true);
    try {
      const hojeISO = new Date().toISOString().slice(0, 10);
      let agQuery = supabase
        .from('agendamentos')
        .select('id, paciente_id, paciente_nome, data, hora, unidade_id, status')
        .gte('data', hojeISO)
        .not('status', 'in', '(cancelado,falta,concluido)')
        .order('data', { ascending: true })
        .limit(500);
      if (!isGlobalAdmin && userUnitId) agQuery = agQuery.eq('unidade_id', userUnitId);
      const { data: ags } = await agQuery;
      const ids = Array.from(new Set((ags || []).map((a: any) => a.paciente_id).filter(Boolean)));
      if (ids.length === 0) { setPendenciasCadastro([]); setPendenciasLoading(false); return; }

      const { data: pacs } = await supabase
        .from('pacientes')
        .select('id, telefone')
        .in('id', ids);
      const phoneMap = new Map<string, string>();
      (pacs || []).forEach((p: any) => phoneMap.set(p.id, (p.telefone || '').trim()));

      const seen = new Set<string>();
      const pend = (ags || []).reduce((acc: any[], a: any) => {
        if (seen.has(a.paciente_id)) return acc;
        const tel = phoneMap.get(a.paciente_id) || '';
        const digits = tel.replace(/\D/g, '');
        let motivo = '';
        if (!digits) motivo = 'Sem telefone cadastrado';
        else if (digits.length < 10) motivo = `Telefone inválido (${digits.length} dígitos)`;
        if (motivo) {
          seen.add(a.paciente_id);
          acc.push({
            paciente_id: a.paciente_id,
            paciente_nome: a.paciente_nome,
            telefone: tel,
            motivo,
            data: a.data,
            hora: a.hora,
          });
        }
        return acc;
      }, []);
      setPendenciasCadastro(pend);
    } catch (err) {
      console.error('[Pendências cadastro]', err);
    }
    setPendenciasLoading(false);
  }, [isGlobalAdmin, userUnitId]);

  useEffect(() => { loadPendenciasCadastro(); }, [loadPendenciasCadastro]);

  // Explicit reload and version check prevent an external update replacing a local draft.
  const write=async(patch:TablesUpdate<'whatsapp_config'>)=>{
    await confirmSession();const old=baseline.current;
    if(!old||old.unit!==selectedUnit||failed||loading)throw Error('Configuração não confirmada.');
    const payload={...patch,updated_at:old.row?nextVersion(old.row.updated_at):new Date().toISOString()};
    const result=old.row?await supabase.from('whatsapp_config').update(payload).eq('id',old.row.id).eq('unidade_id',selectedUnit).eq('updated_at',old.row.updated_at).select('*').maybeSingle():await supabase.from('whatsapp_config').insert({...DEFAULT,...payload,unidade_id:selectedUnit}).select('*').single();
    if(result.error||!result.data||result.data.unidade_id!==selectedUnit)throw Error('Gravação não confirmada.');
    baseline.current={unit:selectedUnit,row:result.data};return result.data;
  };
  const persistAtivo=async(novoValor:boolean,clear=false)=>{
    if(lock.current||failed||loading||!selectedUnit)return;
    lock.current=true;setTogglingActive(true);setConfirmDeactivate(false);
    try{
      const data=await write({whatsapp_ativo:novoValor});
      if(data.whatsapp_ativo!==novoValor)throw Error('Pausa/reativação não confirmada.');
      setCfg(p=>({...p,whatsapp_ativo:novoValor}));
      if(clear){
        const {error,count}=await supabase.from('whatsapp_queue').update({status:'cancelado',motivo_erro:'Cancelado ao desativar WhatsApp da unidade'},{count:'exact'}).eq('unidade_id',selectedUnit).eq('status','pendente');
        if(error||count===null){toast.error('Pausa confirmada; cancelamento da fila não confirmado. Confira antes de repetir.');return;}
        toast.success(`Pausa confirmada · ${count} mensagens pendentes canceladas.`);
      }else toast.success(novoValor?'WhatsApp reativado.':'WhatsApp pausado.');
    }catch{setFailed(true);toast.error('Operação não confirmada. Nenhuma limpeza adicional será iniciada.');}
    finally{lock.current=false;setTogglingActive(false);void loadQueue();}
  };
  const handleToggleAtivo=(novoValor:boolean)=>{if(!selectedUnit||failed||loading||lock.current)return;if(!novoValor)setConfirmDeactivate(true);else if(window.confirm('Reativar os envios da unidade?'))void persistAtivo(true);};
  const pausarEnvios=()=>void persistAtivo(false);
  const limparFila=()=>void persistAtivo(false,true);
  const save=async()=>{
    if(lock.current||failed||loading||!selectedUnit)return;
    lock.current=true;setSaving(true);
    try{
      const {max_msgs_paciente_dia,max_msgs_paciente_semana,intervalo_minimo_minutos,delay_aleatorio_min_seg,delay_aleatorio_max_seg,limite_global_por_minuto,horario_inicio,horario_fim,dias_permitidos}=cfg;
      const data=await write({max_msgs_paciente_dia,max_msgs_paciente_semana,intervalo_minimo_minutos,delay_aleatorio_min_seg,delay_aleatorio_max_seg,limite_global_por_minuto,horario_inicio,horario_fim,dias_permitidos});
      setCfg(data);toast.success('Configuração confirmada.');
    }catch{setFailed(true);toast.error('Gravação não confirmada. Recarregue antes de repetir.');}
    finally{lock.current=false;setSaving(false);}
  };
  const cancelMsg=async(id:string)=>{
    if(lock.current||!window.confirm('Cancelar esta mensagem pendente?'))return;
    lock.current=true;setSaving(true);
    try{await confirmSession();let query=supabase.from('whatsapp_queue').update({status:'cancelado'}).eq('id',id).eq('status','pendente');if(!isGlobalAdmin)query=query.eq('unidade_id',userUnitId);const {data,error}=await query.select('id').maybeSingle();if(error||!data)throw Error('Cancelamento não confirmado.');toast.success('Mensagem cancelada.');}
    catch{toast.error('Cancelamento não confirmado. Confira a fila.');}
    finally{lock.current=false;setSaving(false);void loadQueue();}
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

      {/* Circuit breaker + envio humanizado */}
      <CircuitBreakerCard />

      {/* Seletor de unidade */}

      {editableUnits.length > 1 && (
        <Card className="config-admin-card border-0 shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <Label className="whitespace-nowrap">Unidade:</Label>
            <Select disabled={saving||togglingActive||confirmDeactivate} value={selectedUnit} onValueChange={v=>{if(!lock.current&&!confirmDeactivate)setSelectedUnit(v);}}>
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
      <Card className="config-admin-card border-0 shadow-card">
        <CardContent className="p-3 sm:p-4 space-y-5">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : failed ? <div role="alert" className="space-y-2"><p>Configuração não confirmada. Edição bloqueada.</p><Button variant="outline" onClick={()=>void load()}>Recarregar</Button></div> : (
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
                  disabled={togglingActive||saving||failed}
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


              <div className="flex justify-end pt-2">
                <Button onClick={save} disabled={saving||togglingActive||failed} className="gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar Configuração
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pendências de Cadastro: pacientes agendados sem telefone válido */}
      <Card className="config-admin-card border-0 shadow-card">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                Pendências de Cadastro
              </h3>
              <Badge className="bg-warning/10 text-warning border-0">
                {pendenciasCadastro.length} paciente{pendenciasCadastro.length === 1 ? '' : 's'}
              </Badge>
            </div>
            <Button size="sm" variant="outline" onClick={loadPendenciasCadastro} disabled={pendenciasLoading}>
              <RefreshCw className={`w-4 h-4 ${pendenciasLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Pacientes agendados (hoje em diante) sem telefone ou com número inválido (&lt;10 dígitos).
            O sistema ignora automaticamente esses registros e marca o log como <strong>"Falha: Sem Telefone"</strong>.
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Próximo agendamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendenciasCadastro.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    {pendenciasLoading ? 'Carregando...' : '✅ Nenhuma pendência — todos os pacientes têm telefone válido'}
                  </TableCell></TableRow>
                ) : pendenciasCadastro.map(p => (
                  <TableRow key={p.paciente_id}>
                    <TableCell className="text-sm">{p.paciente_nome}</TableCell>
                    <TableCell className="text-xs font-mono">{p.telefone || '—'}</TableCell>
                    <TableCell className="text-xs">
                      <Badge className="bg-destructive/10 text-destructive border-0 text-xs">{p.motivo}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.data} {p.hora}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Fila */}
      <Card className="config-admin-card border-0 shadow-card">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-foreground">Fila de envios</h3>
              <Badge className="bg-primary/10 text-primary border-0">
                Fila atual: {pendingCount} pendente{pendingCount === 1 ? '' : 's'}
              </Badge>
            </div>
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
                        <Button size="sm" variant="ghost" disabled={saving||togglingActive} onClick={() => cancelMsg(m.id)}
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

      {/* Diálogo: confirmar desativação do WhatsApp */}
      <AlertDialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <AlertDialogContent className="config-admin-modal config-admin-confirm">
          <AlertDialogHeader className="config-admin-modal-header">
            <AlertDialogTitle className="config-admin-modal-title flex items-center gap-2">
              <PowerOff className="w-5 h-5 text-destructive" />
              Pausar automações de WhatsApp?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 pt-2">
              <span className="block">
                O sistema entrará em <strong>modo silencioso</strong>: nenhum lembrete, confirmação ou
                notificação será enviado para os pacientes desta unidade.
              </span>
              <span className="block">
                Você ainda tem mensagens pendentes na fila. O que deseja fazer com elas?
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="config-admin-modal-footer flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={pausarEnvios} className="gap-2">
              <PowerOff className="w-4 h-4" /> Apenas pausar (mantém fila)
            </Button>
            <AlertDialogAction onClick={limparFila} className="gap-2 bg-destructive hover:bg-destructive/90">
              <Trash2 className="w-4 h-4" /> Pausar e limpar fila
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ConfigWhatsAppAntiBan;

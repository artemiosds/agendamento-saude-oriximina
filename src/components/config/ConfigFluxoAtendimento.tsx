import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOperacional } from '@/contexts/OperacionalContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Loader2, Pencil, Clock } from 'lucide-react';
import { toast } from 'sonner';
import {useAdministrativeConfigSection} from '@/hooks/useProntuarioSettings';
import {configObject,sameConfigSection} from '@/lib/configSectionGuard';
import {mergeFlowSettings,validTurno} from '@/lib/adminFlowSettings';

const CONFIG_KEY = 'config_fluxo_atendimento';

export interface TurnoDefinition {
  id: string;
  nome: string;
  horaInicio: string;
  horaFim: string;
  ativo: boolean;
}

interface FluxoConfig {
  tiposAtendimento: { key: string; label: string; habilitado: boolean; isBuiltin: boolean }[];
  triagem: {
    camposObrigatorios: { key: string; label: string; obrigatorio: boolean }[];
    camposOpcionais: { key: string; label: string; habilitado: boolean }[];
  };
  classificacaoRisco: { key: string; label: string; cor: string }[];
  regrasAgendamento: {
    tempoConsulta: number; tempoSessao: number; intervalo: number;
    maxPacientesDia: number; permitirEncaixe: boolean;
    antecedenciaMinima: number; antecedenciaMaxima: number;
  };
  ptsCiclo: {
    exigirPts: boolean; exigirCiclo: boolean;
    sessoesPadrao: number; frequenciaPadrao: string;
    alertarUltimaSessao: boolean; alertarPtsVencido: boolean;
    prazoAlertaPts: number;
  };
  turnos: TurnoDefinition[];
  alerta_minutos_em_atendimento?:number;
  coordenador_pode_concluir?:boolean;
}

const DEFAULT: FluxoConfig = {
  tiposAtendimento: [
    { key: 'avaliacao_inicial', label: 'Avaliação Inicial', habilitado: true, isBuiltin: true },
    { key: 'retorno', label: 'Retorno', habilitado: true, isBuiltin: true },
    { key: 'sessao', label: 'Sessão de Tratamento', habilitado: true, isBuiltin: true },
    { key: 'urgencia', label: 'Urgência', habilitado: true, isBuiltin: true },
    { key: 'procedimento', label: 'Exame/Procedimento', habilitado: true, isBuiltin: true },
  ],
  triagem: {
    camposObrigatorios: [
      { key: 'pressao_arterial', label: 'Pressão Arterial', obrigatorio: true },
      { key: 'temperatura', label: 'Temperatura', obrigatorio: true },
      { key: 'saturacao_oxigenio', label: 'Saturação', obrigatorio: true },
      { key: 'frequencia_cardiaca', label: 'Frequência Cardíaca', obrigatorio: true },
      { key: 'classificacao_risco', label: 'Classificação de Risco', obrigatorio: true },
    ],
    camposOpcionais: [
      { key: 'peso', label: 'Peso', habilitado: false },
      { key: 'glicemia', label: 'Glicemia Capilar', habilitado: false },
    ],
  },
  classificacaoRisco: [
    { key: 'nao_urgente', label: 'Não urgente', cor: '#22c55e' },
    { key: 'pouco_urgente', label: 'Pouco urgente', cor: '#eab308' },
    { key: 'urgente', label: 'Urgente', cor: '#f97316' },
    { key: 'muito_urgente', label: 'Muito urgente', cor: '#ef4444' },
    { key: 'emergencia', label: 'Emergência', cor: '#dc2626' },
  ],
  regrasAgendamento: {
    tempoConsulta: 30, tempoSessao: 45, intervalo: 15,
    maxPacientesDia: 20, permitirEncaixe: true,
    antecedenciaMinima: 2, antecedenciaMaxima: 60,
  },
  ptsCiclo: {
    exigirPts: false, exigirCiclo: false,
    sessoesPadrao: 10, frequenciaPadrao: 'semanal',
    alertarUltimaSessao: true, alertarPtsVencido: true, prazoAlertaPts: 6,
  },
  turnos: [
    { id: 'turno_manha', nome: 'Manhã', horaInicio: '07:00', horaFim: '12:00', ativo: true },
    { id: 'turno_tarde', nome: 'Tarde', horaInicio: '13:00', horaFim: '18:00', ativo: true },
    { id: 'turno_noite', nome: 'Noite', horaInicio: '18:00', horaFim: '22:00', ativo: false },
  ],
};

const ConfigFluxoAtendimento: React.FC = () => {
  const { funcionarios } = useOperacional();
  const { user } = useAuth();
  const [config, setConfig] = useState<FluxoConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving,setSaving]=useState(false);
  const [failed,setFailed]=useState(false);
  const [status,setStatus]=useState('');
  const draft=useRef(DEFAULT),confirmed=useRef(DEFAULT),lock=useRef(false);
  const {load,save:writeSection}=useAdministrativeConfigSection(CONFIG_KEY);
  const [triageFailed,setTriageFailed]=useState(false);
  const triageLock=useRef(false);
  const triageRaw=useRef<boolean|null>(null);
  const [triageEnabled, setTriageEnabled] = useState(false);
  const [triageLoading, setTriageLoading] = useState(true);
  const [triageSettingId, setTriageSettingId] = useState<string | null>(null);

  // Turno editing
  const [editingTurno, setEditingTurno] = useState<TurnoDefinition | null>(null);
  const [newTurno, setNewTurno] = useState<{ nome: string; horaInicio: string; horaFim: string }>({ nome: '', horaInicio: '08:00', horaFim: '12:00' });
  const [showNewTurno, setShowNewTurno] = useState(false);

  const confirmSession=useCallback(async()=>{
    const {data,error}=await supabase.auth.getSession();
    if(error||!user?.authUserId||user.role!=='master'||user.ativo!==true||data.session?.user.id!==user.authUserId)throw Error('Sessão não confirmada.');
  },[user?.authUserId,user?.role,user?.ativo]);
  const loadConfig=useCallback(async()=>{
    setLoading(true);setFailed(false);setStatus('');
    setTriageLoading(true);setTriageFailed(false);setTriageSettingId(null);
    try{
      const raw=await load();
      const saved=raw===undefined?{}:configObject(raw) as Partial<FluxoConfig>;
      const next={...DEFAULT,...saved,triagem:{...DEFAULT.triagem,...saved.triagem},regrasAgendamento:{...DEFAULT.regrasAgendamento,...saved.regrasAgendamento},ptsCiclo:{...DEFAULT.ptsCiclo,...saved.ptsCiclo},turnos:saved.turnos||DEFAULT.turnos};
      if(!Array.isArray(next.turnos)||!Array.isArray(next.tiposAtendimento)||!Array.isArray(next.classificacaoRisco)||!Array.isArray(next.triagem.camposObrigatorios)||!Array.isArray(next.triagem.camposOpcionais))throw Error('Estrutura inválida.');
      draft.current=next;confirmed.current=next;setConfig(next);setStatus('Configuração carregada');
    }catch{setFailed(true);setStatus('Leitura não confirmada. Edição bloqueada.');}
    finally{setLoading(false);}
    try{
      await confirmSession();
      const {data,error}=await supabase.from('triage_settings').select('*').is('profissional_id',null).is('unidade_id',null).maybeSingle();
      if(error)throw error;
      setTriageEnabled(data?.enabled??false);setTriageSettingId(data?.id??null);triageRaw.current=data?.enabled??null;
    }catch{setTriageFailed(true);}
    finally{setTriageLoading(false);}
  },[load,confirmSession]);
  useEffect(()=>{void loadConfig();},[loadConfig]);
  const edit=(fn:(prev:FluxoConfig)=>FluxoConfig)=>{const next=fn(draft.current);draft.current=next;setConfig(next);setStatus('Alterações não confirmadas');};
  const save=async(updated:FluxoConfig):Promise<boolean>=>{
    if(lock.current||failed||loading)return false;
    if(sameConfigSection(updated,confirmed.current))return true;
    const check=(value:number,old:number,min:number,max=Number.MAX_SAFE_INTEGER)=>value===old||(Number.isSafeInteger(value)&&value>=min&&value<=max);
    const a=updated.regrasAgendamento,o=confirmed.current.regrasAgendamento,n=updated.ptsCiclo,prev=confirmed.current.ptsCiclo;
    if(![check(a.tempoConsulta,o.tempoConsulta,5),check(a.tempoSessao,o.tempoSessao,5),check(a.intervalo,o.intervalo,0),check(a.maxPacientesDia,o.maxPacientesDia,1),check(a.antecedenciaMinima,o.antecedenciaMinima,0),check(a.antecedenciaMaxima,o.antecedenciaMaxima,1),check(n.sessoesPadrao,prev.sessoesPadrao,1),check(n.prazoAlertaPts,prev.prazoAlertaPts,1),check(updated.alerta_minutos_em_atendimento??60,confirmed.current.alerta_minutos_em_atendimento??60,5,600)].every(Boolean)){toast.error('Confira os limites numéricos da configuração.');return false;}
    lock.current=true;setSaving(true);setStatus('Salvando…');draft.current=updated;setConfig(updated);
    try{
      const ok=await writeSection(previous=>mergeFlowSettings(previous===undefined?{}:configObject(previous),{...updated}));
      if(!ok){setFailed(true);setStatus('Gravação não confirmada. Recarregue antes de editar.');return false;}
      confirmed.current=updated;setStatus('Gravação confirmada');toast.success('Configuração salva');return true;
    }catch{setFailed(true);setStatus('Gravação não confirmada.');return false;}
    finally{lock.current=false;setSaving(false);}
  };
  const toggleGlobal=async(v:boolean)=>{
    if(triageLock.current||triageLoading||triageFailed||!window.confirm('Alterar a regra global de triagem?'))return;
    triageLock.current=true;setTriageLoading(true);
    try{
      await confirmSession();
      const {data:current,error}=await supabase.from('triage_settings').select('id,enabled').is('profissional_id',null).is('unidade_id',null).maybeSingle();
      if(error||current?.id!==(triageSettingId??undefined)||(current?.enabled??null)!==triageRaw.current)throw Error('Regra global alterada. Recarregue antes de repetir.');
      const payload={enabled:v,updated_at:new Date().toISOString()};
      const result=current?await (current.enabled===null?supabase.from('triage_settings').update(payload).eq('id',current.id).is('enabled',null):supabase.from('triage_settings').update(payload).eq('id',current.id).eq('enabled',current.enabled)).is('profissional_id',null).is('unidade_id',null).select('id,enabled').maybeSingle():await supabase.from('triage_settings').insert({...payload,profissional_id:null,unidade_id:null}).select('id,enabled').single();
      if(result.error||!result.data||result.data.enabled!==v)throw Error('Alteração não confirmada.');
      setTriageSettingId(result.data.id);triageRaw.current=v;setTriageEnabled(v);toast.success('Regra global confirmada.');
    }catch(error){setTriageFailed(true);toast.error(error instanceof Error?error.message:'Gravação não confirmada.');}
    finally{triageLock.current=false;setTriageLoading(false);}
  };

  const handleAddTurno = async () => {
    if (!validTurno(newTurno.nome,newTurno.horaInicio,newTurno.horaFim)) { toast.error('Confira nome e horários do turno'); return; }
    const turno: TurnoDefinition = {
      id: 'turno_'+crypto.randomUUID().replace(/-/g,'_'),
      nome: newTurno.nome.trim(),
      horaInicio: newTurno.horaInicio,
      horaFim: newTurno.horaFim,
      ativo: true,
    };
    const updated = { ...config, turnos: [...config.turnos, turno] };
    if(!await save(updated))return;
    setNewTurno({ nome: '', horaInicio: '08:00', horaFim: '12:00' });
    setShowNewTurno(false);
  };

  const handleDeleteTurno = (id: string) => {
    if(!window.confirm('Remover este turno da configuração? Confira os profissionais que o utilizam.'))return;
    const updated = { ...config, turnos: config.turnos.filter(t => t.id !== id) };
    save(updated);
  };

  const handleUpdateTurno = async (id: string, changes: Partial<TurnoDefinition>) => {
    const current=config.turnos.find(t=>t.id===id);if(!current)return;const next={...current,...changes};
    if((changes.nome!==undefined||changes.horaInicio!==undefined||changes.horaFim!==undefined)&&!validTurno(next.nome,next.horaInicio,next.horaFim)){toast.error('Confira nome e horários do turno');return;}
    const updated = { ...config, turnos: config.turnos.map(t => t.id === id ? { ...t, ...changes } : t) };
    if(!await save(updated))return;
    if (editingTurno?.id === id) setEditingTurno(null);
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Fluxo assistencial e regras operacionais</h3><p role="status" className="text-xs text-muted-foreground">{status}</p></div><Button size="sm" variant="outline" disabled={saving||triageLoading} onClick={()=>{if(!failed||window.confirm('Descartar alterações não confirmadas e recarregar?'))void loadConfig();}}>Atualizar configurações</Button></div>
      <fieldset disabled={saving||failed} className="space-y-4 min-w-0">
      {/* 5.1 Tipos de atendimento */}
      <Card className="config-admin-card shadow-card border-0">
        <CardContent className="p-3 sm:p-4">
          <h3 className="font-semibold font-display text-foreground mb-4">Tipos de Atendimento</h3>
          <div className="space-y-2">
            {config.tiposAtendimento.map(tipo => (
              <div key={tipo.key} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm font-medium">{tipo.label}</span>
                <Switch checked={tipo.habilitado} onCheckedChange={v => {
                  const updated = { ...config, tiposAtendimento: config.tiposAtendimento.map(t => t.key === tipo.key ? { ...t, habilitado: v } : t) };
                  save(updated);
                }} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 5.2 Triagem */}
      <Card className="config-admin-card shadow-card border-0">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold font-display text-foreground">Triagem — regra global</h3>
            {triageLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : triageFailed ? <span role="alert" className="text-xs text-destructive">Regra global não confirmada</span> : <Switch checked={triageEnabled} onCheckedChange={toggleGlobal}/>}
          </div>
          <div className="space-y-2">
            {config.triagem.camposObrigatorios.map(c => (
              <div key={c.key} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                <span className="text-sm">{c.label}</span>
                <Badge variant="outline" className="text-[9px]">Obrigatório</Badge>
              </div>
            ))}
            {config.triagem.camposOpcionais.map(c => (
              <div key={c.key} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                <span className="text-sm">{c.label}</span>
                <Switch checked={c.habilitado} onCheckedChange={v => {
                  const updated = { ...config, triagem: { ...config.triagem, camposOpcionais: config.triagem.camposOpcionais.map(x => x.key === c.key ? { ...x, habilitado: v } : x) } };
                  save(updated);
                }} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 5.3 Classificação de risco */}
      <Card className="config-admin-card shadow-card border-0">
        <CardContent className="p-3 sm:p-4">
          <h3 className="font-semibold font-display text-foreground mb-4">Classificação de Risco</h3>
          <div className="space-y-2">
            {config.classificacaoRisco.map(cr => (
              <div key={cr.key} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                <div className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: cr.cor }} />
                <Input
                  value={cr.label} className="h-8 text-sm border-0 bg-transparent focus-visible:ring-0 flex-1"
                  onChange={e => edit(prev => ({ ...prev, classificacaoRisco: prev.classificacaoRisco.map(x => x.key === cr.key ? { ...x, label: e.target.value } : x) }))}
                  onBlur={() => save(draft.current)}
                />
                <Input
                  type="color" value={cr.cor} className="w-10 h-8 p-0.5 border-0"
                  onChange={e => {
                    const updated = { ...config, classificacaoRisco: config.classificacaoRisco.map(x => x.key === cr.key ? { ...x, cor: e.target.value } : x) };
                    save(updated);
                  }}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 5.4 Regras de agendamento */}
      <Card className="config-admin-card shadow-card border-0">
        <CardContent className="p-3 sm:p-4">
          <h3 className="font-semibold font-display text-foreground mb-4">Regras de Agendamento</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { key: 'tempoConsulta', label: 'Tempo consulta (min)', min: 5 },
              { key: 'tempoSessao', label: 'Tempo sessão (min)', min: 5 },
              { key: 'intervalo', label: 'Intervalo entre atend. (min)', min: 0 },
              { key: 'maxPacientesDia', label: 'Máx pacientes/dia/profissional', min: 1 },
              { key: 'antecedenciaMinima', label: 'Antecedência mínima (horas)', min: 0 },
              { key: 'antecedenciaMaxima', label: 'Antecedência máxima (dias)', min: 1 },
            ].map(item => (
              <div key={item.key}>
                <Label className="text-xs">{item.label}</Label>
                <Input type="number" min={item.min}
                  value={(config.regrasAgendamento as any)[item.key]}
                  onChange={e => edit(prev => ({ ...prev, regrasAgendamento: { ...prev.regrasAgendamento, [item.key]: parseInt(e.target.value) || 0 } }))}
                  onBlur={() => save(draft.current)} className="h-9"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between p-3 mt-3 bg-muted/50 rounded-lg">
            <span className="text-sm">Permitir encaixe</span>
            <Switch checked={config.regrasAgendamento.permitirEncaixe} onCheckedChange={v => save({ ...draft.current, regrasAgendamento: { ...config.regrasAgendamento, permitirEncaixe: v } })} />
          </div>
        </CardContent>
      </Card>

      {/* 5.5 PTS e Ciclo */}
      <Card className="config-admin-card shadow-card border-0">
        <CardContent className="p-3 sm:p-4">
          <h3 className="font-semibold font-display text-foreground mb-4">PTS e Ciclo de Tratamento</h3>
          <div className="space-y-3">
            {[
              { key: 'exigirPts', label: 'Exigir PTS na primeira consulta' },
              { key: 'exigirCiclo', label: 'Exigir Ciclo de Tratamento na primeira consulta' },
              { key: 'alertarUltimaSessao', label: 'Alertar quando na última sessão' },
              { key: 'alertarPtsVencido', label: 'Alertar quando PTS estiver vencido' },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                <span className="text-sm">{item.label}</span>
                <Switch checked={(config.ptsCiclo as any)[item.key]} onCheckedChange={v => save({ ...draft.current, ptsCiclo: { ...config.ptsCiclo, [item.key]: v } })} />
              </div>
            ))}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Sessões padrão</Label>
                <Input type="number" min={1} value={config.ptsCiclo.sessoesPadrao} onChange={e => edit(p => ({ ...p, ptsCiclo: { ...p.ptsCiclo, sessoesPadrao: parseInt(e.target.value) || 10 } }))} onBlur={() => save(draft.current)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Frequência padrão</Label>
                <Select value={config.ptsCiclo.frequenciaPadrao} onValueChange={v => save({ ...draft.current, ptsCiclo: { ...config.ptsCiclo, frequenciaPadrao: v } })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="quinzenal">Quinzenal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Prazo alerta PTS (meses)</Label>
                <Input type="number" min={1} value={config.ptsCiclo.prazoAlertaPts} onChange={e => edit(p => ({ ...p, ptsCiclo: { ...p.ptsCiclo, prazoAlertaPts: parseInt(e.target.value) || 6 } }))} onBlur={() => save(draft.current)} className="h-9" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5.6 Turnos */}
      <Card className="config-admin-card shadow-card border-0">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold font-display text-foreground">Turnos</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Turnos disponíveis para profissionais no modo "Por Turno"</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowNewTurno(true)}>
              <Plus className="w-4 h-4 mr-1" />Adicionar
            </Button>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-0 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
              <span>Turno</span>
              <span className="text-center px-3">Início</span>
              <span className="text-center px-3">Fim</span>
              <span className="text-center px-3">Ativo</span>
              <span className="text-center px-2">Ações</span>
            </div>
            {config.turnos.map(turno => (
              <div key={turno.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-0 items-center px-3 py-2.5 border-b border-border last:border-b-0">
                {editingTurno?.id === turno.id ? (
                  <>
                    <Input
                      value={editingTurno.nome}
                      onChange={e => setEditingTurno({ ...editingTurno, nome: e.target.value })}
                      className="h-8 text-sm"
                    />
                    <Input type="time" value={editingTurno.horaInicio} onChange={e => setEditingTurno({ ...editingTurno, horaInicio: e.target.value })} className="h-8 text-xs mx-1 w-24" />
                    <Input type="time" value={editingTurno.horaFim} onChange={e => setEditingTurno({ ...editingTurno, horaFim: e.target.value })} className="h-8 text-xs mx-1 w-24" />
                    <div className="px-3 flex justify-center">
                      <Switch checked={editingTurno.ativo} onCheckedChange={v => setEditingTurno({ ...editingTurno, ativo: v })} />
                    </div>
                    <div className="flex gap-1 px-2">
                      <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => handleUpdateTurno(turno.id, editingTurno)}>Salvar</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingTurno(null)}>✕</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      {turno.nome}
                    </span>
                    <span className="text-xs text-muted-foreground text-center px-3">{turno.horaInicio}</span>
                    <span className="text-xs text-muted-foreground text-center px-3">{turno.horaFim}</span>
                    <div className="px-3 flex justify-center">
                      <Switch checked={turno.ativo} onCheckedChange={v => handleUpdateTurno(turno.id, { ativo: v })} />
                    </div>
                    <div className="flex gap-1 px-2">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingTurno({ ...turno })}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteTurno(turno.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {config.turnos.length === 0 && (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">Nenhum turno cadastrado</div>
            )}
          </div>

          {showNewTurno && (
            <div className="mt-3 p-3 rounded-lg border border-border bg-muted/30 space-y-3">
              <h4 className="text-sm font-medium">Novo Turno</h4>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Nome</Label>
                  <Input value={newTurno.nome} onChange={e => setNewTurno(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Integral" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Início</Label>
                  <Input type="time" value={newTurno.horaInicio} onChange={e => setNewTurno(p => ({ ...p, horaInicio: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Fim</Label>
                  <Input type="time" value={newTurno.horaFim} onChange={e => setNewTurno(p => ({ ...p, horaFim: e.target.value }))} className="h-8 text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddTurno}>Adicionar</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowNewTurno(false)}>Cancelar</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ControleAtendimentosCard config={config} edit={edit} save={()=>save(draft.current)} />
      </fieldset>
      <ControleFaltasCard />
    </div>
  );
};

export default ConfigFluxoAtendimento;

// ─── Cartão: Controle de Faltas ───────────────────────────────────────────────
const FALTAS_KEY = 'config_fluxo_faltas';

const ControleFaltasCard: React.FC = () => {
  const [cfg, setCfg] = useState({ limite_alerta: 2, limite_bloqueio: 4, canal_sistema: true, canal_whatsapp: false });
  const confirmedFaltas=useRef(cfg);
  const {load,save:writeSection}=useAdministrativeConfigSection(FALTAS_KEY);
  const [failed,setFailed]=useState(false);
  const [status,setStatus]=useState('');
  const lock=useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload=useCallback(async()=>{
    setLoading(true);setFailed(false);setStatus('');
    try{const raw=await load();const next={limite_alerta:2,limite_bloqueio:4,canal_sistema:true,canal_whatsapp:false,...(raw===undefined?{}:configObject(raw))};confirmedFaltas.current=next;setCfg(next);}
    catch{setFailed(true);setStatus('Leitura não confirmada.');}finally{setLoading(false);}
  },[load]);
  useEffect(()=>{void reload();},[reload]);
  const reavaliar=async()=>{
    const {data,error}=await (supabase as any).rpc('reavaliar_todos_status_falta');
    if(error||!data){toast.error('Reavaliação não confirmada.');return null;}return data;
  };
  const save=async(next:typeof cfg)=>{
    if(lock.current||failed||loading||sameConfigSection(next,confirmedFaltas.current))return;
    if(![next.limite_alerta,next.limite_bloqueio].every(v=>Number.isInteger(v)&&v>=1&&v<=20)){toast.error('Informe limites inteiros entre 1 e 20.');return;}
    if(!window.confirm('Salvar regras de faltas e reavaliar todos os pacientes?'))return;
    lock.current=true;setSaving(true);
    try{
      if(!await writeSection(previous=>mergeFlowSettings(previous===undefined?{}:configObject(previous),next))){setFailed(true);setStatus('Gravação não confirmada.');return;}
      confirmedFaltas.current=next;setCfg(next);setStatus('Configuração confirmada; reavaliando pacientes…');
      const r=await reavaliar();setStatus(r?'Configuração e reavaliação confirmadas':'Configuração salva; reavaliação não confirmada.');
      if(r)toast.success('Configuração e reavaliação confirmadas.');
    }catch{setFailed(true);setStatus('Operação não confirmada. Recarregue.');}
    finally{lock.current=false;setSaving(false);}
  };

  if (loading) return <p role="status" className="text-sm">Carregando controle de faltas…</p>;

  return (
    <Card className="config-admin-card shadow-card border-0">
      <CardContent className="p-3 sm:p-4 space-y-4">
        <div>
          <h3 className="font-semibold font-display text-foreground">Controle de Faltas</h3>
          <p role="status" className="text-xs text-muted-foreground">{status}</p>{failed&&<Button size="sm" variant="outline" onClick={()=>void reload()}>Recarregar</Button>}
          <p className="text-xs text-muted-foreground mt-1">Define quando um paciente é marcado como FALTOSO ou BLOQUEADO da agenda.</p>
        </div>

        <fieldset disabled={saving||failed} className="space-y-4 min-w-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Faltas para alerta FALTOSO</Label>
            <Input
              type="number" min={1} max={20}
              value={cfg.limite_alerta}
              onChange={(e) => setCfg((p) => ({ ...p, limite_alerta: Math.max(1, Number(e.target.value) || 1) }))}
              onBlur={() => save(cfg)}
              disabled={saving}
            />
          </div>
          <div>
            <Label className="text-xs">Faltas para BLOQUEIO</Label>
            <Input
              type="number" min={1} max={20}
              value={cfg.limite_bloqueio}
              onChange={(e) => setCfg((p) => ({ ...p, limite_bloqueio: Math.max(1, Number(e.target.value) || 1) }))}
              onBlur={() => save(cfg)}
              disabled={saving}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Canais de notificação</Label>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch
                checked={cfg.canal_sistema}
                onCheckedChange={(v) => save({ ...cfg, canal_sistema: v })}
              />
              Sistema
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch
                checked={cfg.canal_whatsapp}
                onCheckedChange={(v) => save({ ...cfg, canal_whatsapp: v })}
              />
              WhatsApp
            </label>
          </div>
        </div>

        <div className="pt-2 border-t">
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={async () => {
              if(lock.current||failed||!window.confirm('Reavaliar todos os pacientes usando as regras salvas?'))return;
              lock.current=true;setSaving(true);try{const r=await reavaliar();if(r)toast.success('Reavaliação confirmada.');}catch{toast.error('Reavaliação não confirmada.');}finally{lock.current=false;setSaving(false);}
            }}
          >
            {saving ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : null}
            Reavaliar todos os pacientes agora
          </Button>
          <p className="text-[11px] text-muted-foreground mt-2">
            Recalcula o status (REGULAR/FALTOSO/BLOQUEADO) de todos os pacientes com base nos limites atuais.
          </p>
        </div>
        </fieldset>
      </CardContent>
    </Card>
  );
};

// ─── Cartão: Controle de Atendimentos (Master) ────────────────────────────────
const ControleAtendimentosCard:React.FC<{config:FluxoConfig;edit:(fn:(p:FluxoConfig)=>FluxoConfig)=>void;save:()=>Promise<boolean>}>=({config,edit,save})=>{
  return (
    <Card className="config-admin-card shadow-card border-0">
      <CardContent className="p-3 sm:p-4 space-y-4">
        <div>
          <h3 className="font-semibold font-display text-foreground">Controle de Atendimentos</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Define o alerta de atendimentos em aberto e quem pode concluir atendimentos de outros profissionais.
            O Master sempre pode concluir; a produção e o BPA permanecem em nome do profissional executor.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Tempo máximo sem finalização (minutos)</Label>
            <Input
              type="number" min={5} max={600}
              value={config.alerta_minutos_em_atendimento??60}
              onChange={e=>edit(p=>({...p,alerta_minutos_em_atendimento:Math.max(5,Number(e.target.value)||60)}))}
              onBlur={()=>void save()}
            />
            <p className="text-[11px] text-muted-foreground mt-1">Padrão: 60 minutos.</p>
          </div>
          <div className="flex items-center gap-3 pt-5">
            <Switch
              checked={config.coordenador_pode_concluir??false}
              onCheckedChange={v=>{if(window.confirm('Alterar a autorização de conclusão pelo Coordenador?')){edit(p=>({...p,coordenador_pode_concluir:v}));void save();}}}
            />
            <Label className="text-xs cursor-pointer">Permitir Coordenador concluir atendimentos</Label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useData } from '@/contexts/DataContext';
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
import ConfiguracaoTriagem from '@/components/ConfiguracaoTriagem';
import { toast } from 'sonner';

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
  const { funcionarios } = useData();
  const { user } = useAuth();
  const [config, setConfig] = useState<FluxoConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [triageEnabled, setTriageEnabled] = useState(false);
  const [triageLoading, setTriageLoading] = useState(true);
  const [triageSettingId, setTriageSettingId] = useState<string | null>(null);

  // Turno editing
  const [editingTurno, setEditingTurno] = useState<TurnoDefinition | null>(null);
  const [newTurno, setNewTurno] = useState<{ nome: string; horaInicio: string; horaFim: string }>({ nome: '', horaInicio: '08:00', horaFim: '12:00' });
  const [showNewTurno, setShowNewTurno] = useState(false);

  const loadConfig = useCallback(async () => {
    const [cfgRes, triageRes] = await Promise.all([
      supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle(),
      supabase.from('triage_settings').select('*').is('profissional_id', null).maybeSingle(),
    ]);
    const cfg = cfgRes.data?.configuracoes as any;
    if (cfg?.[CONFIG_KEY]) {
      const saved = cfg[CONFIG_KEY];
      setConfig({ ...DEFAULT, ...saved, turnos: saved.turnos || DEFAULT.turnos });
    }
    if (triageRes.data) { setTriageEnabled(triageRes.data.enabled ?? false); setTriageSettingId(triageRes.data.id); }
    setTriageLoading(false);
    setLoading(false);
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const save = async (updated: FluxoConfig) => {
    const { data: existing } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
    const existingConfig = (existing?.configuracoes as any) || {};
    await supabase.from('system_config').upsert({
      id: 'default',
      configuracoes: { ...existingConfig, [CONFIG_KEY]: updated },
      updated_at: new Date().toISOString(),
    });
    setConfig(updated);
    toast.success('Configuração salva');
  };

  const handleAddTurno = () => {
    if (!newTurno.nome.trim()) { toast.error('Informe o nome do turno'); return; }
    const turno: TurnoDefinition = {
      id: `turno_${Date.now()}`,
      nome: newTurno.nome.trim(),
      horaInicio: newTurno.horaInicio,
      horaFim: newTurno.horaFim,
      ativo: true,
    };
    const updated = { ...config, turnos: [...config.turnos, turno] };
    save(updated);
    setNewTurno({ nome: '', horaInicio: '08:00', horaFim: '12:00' });
    setShowNewTurno(false);
  };

  const handleDeleteTurno = (id: string) => {
    const updated = { ...config, turnos: config.turnos.filter(t => t.id !== id) };
    save(updated);
  };

  const handleUpdateTurno = (id: string, changes: Partial<TurnoDefinition>) => {
    const updated = { ...config, turnos: config.turnos.map(t => t.id === id ? { ...t, ...changes } : t) };
    save(updated);
    if (editingTurno?.id === id) setEditingTurno(null);
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* 5.1 Tipos de atendimento */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
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
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold font-display text-foreground">Triagem</h3>
            {triageLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <Switch checked={triageEnabled} onCheckedChange={async v => {
                setTriageEnabled(v);
                if (triageSettingId) {
                  await supabase.from('triage_settings').update({ enabled: v }).eq('id', triageSettingId);
                } else {
                  const { data } = await supabase.from('triage_settings').insert({ enabled: v }).select('id').single();
                  if (data) setTriageSettingId(data.id);
                }
                toast.success(v ? 'Triagem habilitada' : 'Triagem desabilitada');
              }} />
            )}
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
          <ConfiguracaoTriagem />
        </CardContent>
      </Card>

      {/* 5.3 Classificação de risco */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <h3 className="font-semibold font-display text-foreground mb-4">Classificação de Risco</h3>
          <div className="space-y-2">
            {config.classificacaoRisco.map(cr => (
              <div key={cr.key} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                <div className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: cr.cor }} />
                <Input
                  value={cr.label} className="h-8 text-sm border-0 bg-transparent focus-visible:ring-0 flex-1"
                  onChange={e => setConfig(prev => ({ ...prev, classificacaoRisco: prev.classificacaoRisco.map(x => x.key === cr.key ? { ...x, label: e.target.value } : x) }))}
                  onBlur={() => save(config)}
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
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
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
                  onChange={e => setConfig(prev => ({ ...prev, regrasAgendamento: { ...prev.regrasAgendamento, [item.key]: parseInt(e.target.value) || 0 } }))}
                  onBlur={() => save(config)} className="h-9"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between p-3 mt-3 bg-muted/50 rounded-lg">
            <span className="text-sm">Permitir encaixe</span>
            <Switch checked={config.regrasAgendamento.permitirEncaixe} onCheckedChange={v => save({ ...config, regrasAgendamento: { ...config.regrasAgendamento, permitirEncaixe: v } })} />
          </div>
        </CardContent>
      </Card>

      {/* 5.5 PTS e Ciclo */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
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
                <Switch checked={(config.ptsCiclo as any)[item.key]} onCheckedChange={v => save({ ...config, ptsCiclo: { ...config.ptsCiclo, [item.key]: v } })} />
              </div>
            ))}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Sessões padrão</Label>
                <Input type="number" min={1} value={config.ptsCiclo.sessoesPadrao} onChange={e => setConfig(p => ({ ...p, ptsCiclo: { ...p.ptsCiclo, sessoesPadrao: parseInt(e.target.value) || 10 } }))} onBlur={() => save(config)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Frequência padrão</Label>
                <Select value={config.ptsCiclo.frequenciaPadrao} onValueChange={v => save({ ...config, ptsCiclo: { ...config.ptsCiclo, frequenciaPadrao: v } })}>
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
                <Input type="number" min={1} value={config.ptsCiclo.prazoAlertaPts} onChange={e => setConfig(p => ({ ...p, ptsCiclo: { ...p.ptsCiclo, prazoAlertaPts: parseInt(e.target.value) || 6 } }))} onBlur={() => save(config)} className="h-9" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5.6 Turnos */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
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
    </div>
  );
};

export default ConfigFluxoAtendimento;
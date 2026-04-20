import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Lock, Plus, Trash2, GripVertical, Pencil, AlertTriangle, Loader2, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { toast } from 'sonner';
import EditorProntuarioConfig from '@/components/EditorProntuarioConfig';
import ConstrutorProntuarioModal from '@/components/ConstrutorProntuarioModal';

const CONFIG_KEY = 'config_prontuario_tipos';

const TIPOS_PRONTUARIO = [
  { key: 'primeira_consulta', label: 'Avaliação Inicial', color: 'bg-success/10 text-success' },
  { key: 'retorno', label: 'Retorno', color: 'bg-info/10 text-info' },
  { key: 'sessao', label: 'Sessão', color: 'bg-warning/10 text-warning' },
  { key: 'urgencia', label: 'Urgência', color: 'bg-destructive/10 text-destructive' },
  { key: 'procedimento', label: 'Procedimento', color: 'bg-accent text-accent-foreground' },
];

const CAMPOS_FIXOS = [
  'evolucao.subjetivo', 'evolucao.objetivo', 'evolucao.avaliacao', 'evolucao.plano',
  'queixa_principal', 'sinais_vitais_urgencia', 'contador_sessao',
];

interface CampoConfig {
  id: string;
  key: string;
  label: string;
  tipo: string;
  obrigatorio: boolean;
  habilitado: boolean;
  opcoes?: string[];
  isBuiltin: boolean;
  order: number;
  tiposProntuario: string[];
}

interface AlertaConfig {
  id: string;
  condicao: string;
  campo?: string;
  operador?: string;
  valor?: string;
  mensagem: string;
  habilitado: boolean;
  isBuiltin: boolean;
}

interface ProntuarioConfig {
  campos: CampoConfig[];
  soapLabels: { subjetivo: string; objetivo: string; avaliacao: string; plano: string };
  alertas: AlertaConfig[];
  tempoLimiteEdicao: number;
  exigirSenhaAoSalvar: boolean;
}

const DEFAULT_CAMPOS: CampoConfig[] = [
  { id: 'c1', key: 'queixa_principal', label: 'Queixa Principal', tipo: 'textarea', obrigatorio: true, habilitado: true, isBuiltin: true, order: 1, tiposProntuario: ['primeira_consulta', 'urgencia'] },
  { id: 'c2', key: 'historia_doenca', label: 'História da Doença Atual', tipo: 'textarea', obrigatorio: true, habilitado: true, isBuiltin: false, order: 2, tiposProntuario: ['primeira_consulta'] },
  { id: 'c3', key: 'historico_saude', label: 'Histórico de Saúde', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: false, order: 3, tiposProntuario: ['primeira_consulta'] },
  { id: 'c4', key: 'medicacoes_uso', label: 'Medicações em Uso', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: false, order: 4, tiposProntuario: ['primeira_consulta'] },
  { id: 'c5', key: 'alergias', label: 'Alergias', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: false, order: 5, tiposProntuario: ['primeira_consulta'] },
  { id: 'c6', key: 'diagnostico_funcional', label: 'Diagnóstico Funcional', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: false, order: 6, tiposProntuario: ['primeira_consulta'] },
  { id: 'c7', key: 'conduta', label: 'Conduta', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: false, order: 7, tiposProntuario: ['primeira_consulta', 'urgencia'] },
  { id: 'c8', key: 'reavaliacao', label: 'Reavaliação', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: false, order: 1, tiposProntuario: ['retorno'] },
  { id: 'c9', key: 'evolucao_clinica', label: 'Evolução Clínica', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: false, order: 2, tiposProntuario: ['retorno'] },
  { id: 'c10', key: 'ajuste_conduta', label: 'Ajuste de Conduta', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: false, order: 3, tiposProntuario: ['retorno'] },
  { id: 'c11', key: 'contador_sessao', label: 'Contador de Sessão', tipo: 'text', obrigatorio: true, habilitado: true, isBuiltin: true, order: 1, tiposProntuario: ['sessao'] },
  { id: 'c12', key: 'procedimentos_realizados', label: 'Procedimentos Realizados', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: false, order: 2, tiposProntuario: ['sessao'] },
  { id: 'c13', key: 'resposta_paciente', label: 'Resposta do Paciente', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: false, order: 3, tiposProntuario: ['sessao'] },
  { id: 'c14', key: 'intercorrencias', label: 'Intercorrências', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: false, order: 4, tiposProntuario: ['sessao'] },
  { id: 'c15', key: 'sinais_vitais_urgencia', label: 'Sinais Vitais Ampliados', tipo: 'text', obrigatorio: true, habilitado: true, isBuiltin: true, order: 1, tiposProntuario: ['urgencia'] },
  { id: 'c16', key: 'conduta_rapida', label: 'Conduta Rápida', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: false, order: 3, tiposProntuario: ['urgencia'] },
  { id: 'c17', key: 'encaminhamento', label: 'Encaminhamento', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: false, order: 4, tiposProntuario: ['urgencia'] },
  { id: 'c18', key: 'tipo_procedimento', label: 'Tipo de Exame/Procedimento', tipo: 'text', obrigatorio: false, habilitado: true, isBuiltin: false, order: 1, tiposProntuario: ['procedimento'] },
  { id: 'c19', key: 'resultado', label: 'Resultado', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: false, order: 2, tiposProntuario: ['procedimento'] },
  { id: 'c20', key: 'conduta_pos', label: 'Conduta Pós-Procedimento', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: false, order: 3, tiposProntuario: ['procedimento'] },
];

const DEFAULT_ALERTAS: AlertaConfig[] = [
  { id: 'a1', condicao: 'risco_alto', mensagem: '⚠️ Acionar protocolo de segurança', habilitado: true, isBuiltin: true },
  { id: 'a2', condicao: 'dor_eva_alta', campo: 'eva', operador: '>=', valor: '8', mensagem: '⚠️ Dor severa — avaliar conduta imediata', habilitado: true, isBuiltin: true },
  { id: 'a3', condicao: 'imc_fora', campo: 'imc', operador: 'fora', valor: '18.5-30', mensagem: '⚠️ IMC fora da faixa ideal', habilitado: true, isBuiltin: true },
  { id: 'a4', condicao: 'emergencia', mensagem: '🚨 Classificação de risco: Emergência', habilitado: true, isBuiltin: true },
];

const DEFAULT_CONFIG: ProntuarioConfig = {
  campos: DEFAULT_CAMPOS,
  soapLabels: { subjetivo: 'Subjetivo', objetivo: 'Objetivo', avaliacao: 'Avaliação', plano: 'Plano' },
  alertas: DEFAULT_ALERTAS,
  tempoLimiteEdicao: 24,
  exigirSenhaAoSalvar: false,
};

const FIELD_TYPES = [
  { value: 'texto', label: 'Texto' },
  { value: 'numero', label: 'Número' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'select', label: 'Seleção' },
  { value: 'data', label: 'Data' },
  { value: 'checkbox', label: 'Checkbox' },
];

const ConfigProntuario: React.FC = () => {
  const [config, setConfig] = useState<ProntuarioConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tipoSelecionado, setTipoSelecionado] = useState('primeira_consulta');
  const [addFieldDialog, setAddFieldDialog] = useState(false);
  const [addAlertDialog, setAddAlertDialog] = useState(false);
  const [newField, setNewField] = useState({ label: '', tipo: 'textarea', obrigatorio: false, opcoes: '', tiposProntuario: ['primeira_consulta'] as string[] });
  const [newAlert, setNewAlert] = useState({ campo: '', operador: '>=', valor: '', mensagem: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState<{ key: string; label: string } | null>(null);
  const loadConfig = useCallback(async () => {
    try {
      const { data } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
      const cfg = data?.configuracoes as any;
      if (cfg?.[CONFIG_KEY]) {
        setConfig({ ...DEFAULT_CONFIG, ...cfg[CONFIG_KEY] });
      }
    } catch { /* use defaults */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const saveConfig = async (updated: ProntuarioConfig) => {
    setSaving(true);
    try {
      const { data: existing } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
      const existingConfig = (existing?.configuracoes as any) || {};
      await supabase.from('system_config').upsert({
        id: 'default',
        configuracoes: { ...existingConfig, [CONFIG_KEY]: updated },
        updated_at: new Date().toISOString(),
      });
      setConfig(updated);
      toast.success('Configuração salva');
    } catch {
      toast.error('Erro ao salvar');
    }
    setSaving(false);
  };

  const isFixedField = (key: string) => CAMPOS_FIXOS.includes(key) || key.startsWith('evolucao.');

  const camposFiltrados = config.campos
    .filter(c => c.tiposProntuario.includes(tipoSelecionado))
    .sort((a, b) => a.order - b.order);

  const soapFields = [
    { key: 'subjetivo', fixedKey: 'evolucao.subjetivo' },
    { key: 'objetivo', fixedKey: 'evolucao.objetivo' },
    { key: 'avaliacao', fixedKey: 'evolucao.avaliacao' },
    { key: 'plano', fixedKey: 'evolucao.plano' },
  ];

  const toggleCampo = (id: string) => {
    const campo = config.campos.find(c => c.id === id);
    if (!campo || isFixedField(campo.key)) return;
    const updated = { ...config, campos: config.campos.map(c => c.id === id ? { ...c, habilitado: !c.habilitado } : c) };
    saveConfig(updated);
  };

  const toggleObrigatorio = (id: string) => {
    const campo = config.campos.find(c => c.id === id);
    if (!campo || isFixedField(campo.key)) return;
    const updated = { ...config, campos: config.campos.map(c => c.id === id ? { ...c, obrigatorio: !c.obrigatorio } : c) };
    saveConfig(updated);
  };

  const updateLabel = (id: string, label: string) => {
    const updated = { ...config, campos: config.campos.map(c => c.id === id ? { ...c, label } : c) };
    setConfig(updated);
  };

  const saveLabelChange = (id: string) => {
    saveConfig(config);
  };

  const moveCampo = (id: string, dir: -1 | 1) => {
    const filtered = camposFiltrados;
    const idx = filtered.findIndex(c => c.id === id);
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === filtered.length - 1)) return;
    const swapWith = filtered[idx + dir];
    const updated = {
      ...config,
      campos: config.campos.map(c => {
        if (c.id === id) return { ...c, order: swapWith.order };
        if (c.id === swapWith.id) return { ...c, order: filtered[idx].order };
        return c;
      }),
    };
    saveConfig(updated);
  };

  const addCampo = () => {
    if (!newField.label.trim()) return;
    const campo: CampoConfig = {
      id: `custom_${Date.now()}`,
      key: `custom_${Date.now()}`,
      label: newField.label.trim(),
      tipo: newField.tipo,
      obrigatorio: newField.obrigatorio,
      habilitado: true,
      isBuiltin: false,
      order: camposFiltrados.length + 1,
      tiposProntuario: newField.tiposProntuario,
      opcoes: newField.tipo === 'select' ? newField.opcoes.split(',').map(o => o.trim()).filter(Boolean) : undefined,
    };
    const updated = { ...config, campos: [...config.campos, campo] };
    saveConfig(updated);
    setAddFieldDialog(false);
    setNewField({ label: '', tipo: 'textarea', obrigatorio: false, opcoes: '', tiposProntuario: ['primeira_consulta'] });
  };

  const deleteCampo = (id: string) => {
    const campo = config.campos.find(c => c.id === id);
    if (!campo || campo.isBuiltin) return;
    const updated = { ...config, campos: config.campos.filter(c => c.id !== id) };
    saveConfig(updated);
    setDeleteConfirm(null);
  };

  const toggleAlerta = (id: string) => {
    const updated = { ...config, alertas: config.alertas.map(a => a.id === id ? { ...a, habilitado: !a.habilitado } : a) };
    saveConfig(updated);
  };

  const addAlerta = () => {
    if (!newAlert.mensagem.trim()) return;
    const alerta: AlertaConfig = {
      id: `alert_${Date.now()}`,
      condicao: 'personalizado',
      campo: newAlert.campo,
      operador: newAlert.operador,
      valor: newAlert.valor,
      mensagem: newAlert.mensagem.trim(),
      habilitado: true,
      isBuiltin: false,
    };
    const updated = { ...config, alertas: [...config.alertas, alerta] };
    saveConfig(updated);
    setAddAlertDialog(false);
    setNewAlert({ campo: '', operador: '>=', valor: '', mensagem: '' });
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Modelos de Prontuário — abre o construtor visual em modal */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold font-display text-foreground">Modelos de Prontuário</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Edite o formulário de cada tipo. As alterações ficam ativas imediatamente para todos os profissionais.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {TIPOS_PRONTUARIO.map(t => (
              <div
                key={t.key}
                className="border border-border rounded-lg p-4 bg-background hover:shadow-sm transition-shadow flex items-center gap-3"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${t.color}`}>
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{t.label}</p>
                  <p className="text-[10px] text-muted-foreground">slug: {t.key}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBuilderOpen({ key: t.key, label: t.label })}
                >
                  <Pencil className="w-3.5 h-3.5 mr-1.5" /> Editar
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <EditorProntuarioConfig />

      <Separator />

      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <h3 className="font-semibold font-display text-foreground mb-4">Campos por Tipo de Prontuário</h3>

          <div className="flex flex-wrap gap-2 mb-4">
            {TIPOS_PRONTUARIO.map(t => (
              <Button
                key={t.key}
                variant={tipoSelecionado === t.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTipoSelecionado(t.key)}
                className="text-xs"
              >
                {t.label}
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            {camposFiltrados.map((campo, idx) => (
              <div key={campo.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${campo.habilitado ? 'bg-background border-border' : 'bg-muted/50 border-border/50 opacity-60'}`}>
                <div className="flex flex-col gap-0.5">
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => moveCampo(campo.id, -1)} disabled={idx === 0}><ChevronUp className="w-3 h-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => moveCampo(campo.id, 1)} disabled={idx === camposFiltrados.length - 1}><ChevronDown className="w-3 h-3" /></Button>
                </div>
                <div className="flex-1 min-w-0">
                  <Input
                    value={campo.label}
                    onChange={e => updateLabel(campo.id, e.target.value)}
                    onBlur={() => saveLabelChange(campo.id)}
                    className="h-8 text-sm font-medium border-0 bg-transparent p-0 focus-visible:ring-0"
                    disabled={isFixedField(campo.key)}
                  />
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground capitalize">{campo.tipo}</span>
                    {campo.obrigatorio && <Badge variant="outline" className="text-[9px] h-4 px-1">Obrigatório</Badge>}
                    {!campo.isBuiltin && <Badge variant="secondary" className="text-[9px] h-4 px-1">Personalizado</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!isFixedField(campo.key) && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleObrigatorio(campo.id)}>
                      <span className={`text-xs font-bold ${campo.obrigatorio ? 'text-destructive' : 'text-muted-foreground'}`}>*</span>
                    </Button>
                  )}
                  {isFixedField(campo.key) ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Lock className="w-4 h-4" />
                            <Switch checked disabled className="opacity-50" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent><p>Campo obrigatório — não pode ser desabilitado</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <>
                      <Switch checked={campo.habilitado} onCheckedChange={() => toggleCampo(campo.id)} />
                      {!campo.isBuiltin && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={() => setDeleteConfirm(campo.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Evolução SOAP (sempre obrigatório)</span>
            </div>
            {soapFields.map(sf => (
              <div key={sf.key} className="flex items-center gap-2 py-1">
                <Lock className="w-3 h-3 text-muted-foreground" />
                <span className="text-sm text-muted-foreground w-20">
                  {config.soapLabels[sf.key as keyof typeof config.soapLabels]}:
                </span>
                <Switch checked disabled className="opacity-50" />
              </div>
            ))}
          </div>

          <Button variant="outline" className="w-full mt-4" onClick={() => setAddFieldDialog(true)}>
            <Plus className="w-4 h-4 mr-2" /> Adicionar Campo Personalizado
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <h3 className="font-semibold font-display text-foreground mb-4">Labels da Evolução SOAP</h3>
          <p className="text-xs text-muted-foreground mb-3">Renomeie os campos SOAP para adequar ao vocabulário da equipe. Os 4 campos são sempre obrigatórios.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {soapFields.map(sf => (
              <div key={sf.key}>
                <Label className="text-xs text-muted-foreground capitalize">{sf.key}</Label>
                <Input
                  value={config.soapLabels[sf.key as keyof typeof config.soapLabels]}
                  onChange={e => setConfig(prev => ({ ...prev, soapLabels: { ...prev.soapLabels, [sf.key]: e.target.value } }))}
                  onBlur={() => saveConfig(config)}
                  className="h-9"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <h3 className="font-semibold font-display text-foreground mb-4">Alertas Clínicos</h3>
          <div className="space-y-2">
            {config.alertas.map(alerta => (
              <div key={alerta.id} className="flex items-center gap-3 p-3 rounded-lg border bg-background">
                <Switch checked={alerta.habilitado} onCheckedChange={() => toggleAlerta(alerta.id)} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm">{alerta.mensagem}</span>
                  {alerta.campo && <span className="text-[10px] text-muted-foreground ml-2">({alerta.campo} {alerta.operador} {alerta.valor})</span>}
                </div>
                {alerta.isBuiltin && <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                {!alerta.isBuiltin && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70" onClick={() => {
                    const updated = { ...config, alertas: config.alertas.filter(a => a.id !== alerta.id) };
                    saveConfig(updated);
                  }}><Trash2 className="w-3.5 h-3.5" /></Button>
                )}
              </div>
            ))}
          </div>
          <Button variant="outline" className="w-full mt-3" onClick={() => setAddAlertDialog(true)}>
            <Plus className="w-4 h-4 mr-2" /> Adicionar Alerta Personalizado
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-card border-0">
        <CardContent className="p-5 space-y-4">
          <div>
            <h3 className="font-semibold font-display text-foreground mb-2">Tempo Limite de Edição</h3>
            <p className="text-xs text-muted-foreground mb-2">Após salvar, profissional pode editar por este período. Depois, somente Master desbloqueia.</p>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={1} max={168}
                value={config.tempoLimiteEdicao}
                onChange={e => setConfig(prev => ({ ...prev, tempoLimiteEdicao: parseInt(e.target.value) || 24 }))}
                onBlur={() => saveConfig(config)}
                className="w-24 h-9"
              />
              <span className="text-sm text-muted-foreground">horas (padrão: 24h)</span>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold font-display text-foreground">Assinatura Digital</h3>
              <p className="text-xs text-muted-foreground">Exigir confirmação de senha ao salvar prontuário</p>
            </div>
            <Switch
              checked={config.exigirSenhaAoSalvar}
              onCheckedChange={v => {
                const updated = { ...config, exigirSenhaAoSalvar: v };
                saveConfig(updated);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Dialog open={addFieldDialog} onOpenChange={setAddFieldDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Campo Personalizado</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome do campo</Label><Input value={newField.label} onChange={e => setNewField(p => ({ ...p, label: e.target.value }))} /></div>
            <div><Label>Tipo</Label>
              <Select value={newField.tipo} onValueChange={v => setNewField(p => ({ ...p, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FIELD_TYPES.map(ft => <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {newField.tipo === 'select' && (
              <div><Label>Opções (separadas por vírgula)</Label><Input value={newField.opcoes} onChange={e => setNewField(p => ({ ...p, opcoes: e.target.value }))} placeholder="Opção 1, Opção 2, Opção 3" /></div>
            )}
            <div className="flex items-center gap-2"><Switch checked={newField.obrigatorio} onCheckedChange={v => setNewField(p => ({ ...p, obrigatorio: v }))} /><Label>Obrigatório</Label></div>
            <div>
              <Label>Aparece nos tipos:</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {TIPOS_PRONTUARIO.map(t => (
                  <Button key={t.key} size="sm" variant={newField.tiposProntuario.includes(t.key) ? 'default' : 'outline'} className="text-xs"
                    onClick={() => setNewField(p => ({
                      ...p,
                      tiposProntuario: p.tiposProntuario.includes(t.key)
                        ? p.tiposProntuario.filter(x => x !== t.key)
                        : [...p.tiposProntuario, t.key]
                    }))}
                  >{t.label}</Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFieldDialog(false)}>Cancelar</Button>
            <Button onClick={addCampo} disabled={!newField.label.trim()}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addAlertDialog} onOpenChange={setAddAlertDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Alerta Personalizado</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Campo</Label><Input value={newAlert.campo} onChange={e => setNewAlert(p => ({ ...p, campo: e.target.value }))} placeholder="Ex: imc, eva, pressao" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Operador</Label>
                <Select value={newAlert.operador} onValueChange={v => setNewAlert(p => ({ ...p, operador: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=">=">≥</SelectItem>
                    <SelectItem value="<=">≤</SelectItem>
                    <SelectItem value="==">= (igual)</SelectItem>
                    <SelectItem value="fora">Fora da faixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Valor</Label><Input value={newAlert.valor} onChange={e => setNewAlert(p => ({ ...p, valor: e.target.value }))} placeholder="8" /></div>
            </div>
            <div><Label>Mensagem</Label><Input value={newAlert.mensagem} onChange={e => setNewAlert(p => ({ ...p, mensagem: e.target.value }))} placeholder="⚠️ Mensagem de alerta" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddAlertDialog(false)}>Cancelar</Button>
            <Button onClick={addAlerta} disabled={!newAlert.mensagem.trim()}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campo personalizado?</AlertDialogTitle>
            <AlertDialogDescription>O campo será removido da configuração. Registros já salvos em prontuários anteriores não são afetados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirm && deleteCampo(deleteConfirm)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {builderOpen && (
        <ConstrutorProntuarioModal
          open={!!builderOpen}
          onOpenChange={(o) => { if (!o) setBuilderOpen(null); }}
          tipoKey={builderOpen.key}
          tipoLabel={builderOpen.label}
        />
      )}
    </div>
  );
};

export default ConfigProntuario;

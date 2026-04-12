import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Pencil, Trash2, Loader2, Lock, ChevronUp, ChevronDown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';

const CONFIG_KEY = 'config_especialidades_campos';

interface CampoEspecialidade {
  id: string; key: string; label: string; tipo: string; obrigatorio: boolean;
  habilitado: boolean; opcoes?: string[]; isBuiltin: boolean; order: number;
}

interface EspecialidadeConfig {
  key: string; label: string; ativa: boolean;
  profissoes: string[];
  campos: CampoEspecialidade[];
}

const DEFAULT_ESPECIALIDADES: EspecialidadeConfig[] = [
  { key: 'fisioterapia', label: 'Fisioterapia', ativa: true, profissoes: ['fisioterapia'],
    campos: [
      { id: 'f1', key: 'avaliacao_funcional', label: 'Avaliação Funcional', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'f2', key: 'adm', label: 'ADM (Amplitude de Movimento)', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'f3', key: 'forca_muscular', label: 'Força Muscular (MRC 0-5)', tipo: 'number', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
      { id: 'f4', key: 'dor_eva', label: 'Dor EVA (0-10)', tipo: 'number', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4 },
      { id: 'f5', key: 'postura_marcha', label: 'Postura e Marcha', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 5 },
    ],
  },
  { key: 'psicologia', label: 'Psicologia', ativa: true, profissoes: ['psicologia'],
    campos: [
      { id: 'p1', key: 'estado_emocional', label: 'Estado Emocional', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'p2', key: 'comportamento', label: 'Comportamento Observado', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'p3', key: 'relato_subjetivo', label: 'Relato Subjetivo', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
      { id: 'p4', key: 'risco', label: 'Risco Auto/Heteroagressão', tipo: 'select', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4, opcoes: ['Ausente', 'Baixo', 'Moderado', 'Alto'] },
    ],
  },
  { key: 'fonoaudiologia', label: 'Fonoaudiologia', ativa: true, profissoes: ['fonoaudiologia'],
    campos: [
      { id: 'fo1', key: 'comunicacao', label: 'Avaliação da Comunicação', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'fo2', key: 'linguagem', label: 'Linguagem', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'fo3', key: 'degluticao', label: 'Deglutição', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
      { id: 'fo4', key: 'voz', label: 'Voz', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4 },
    ],
  },
  { key: 'nutricao', label: 'Nutrição', ativa: true, profissoes: ['nutricao'],
    campos: [
      { id: 'n1', key: 'peso', label: 'Peso (kg)', tipo: 'number', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'n2', key: 'altura', label: 'Altura (m)', tipo: 'number', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'n3', key: 'imc', label: 'IMC (calculado)', tipo: 'text', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
      { id: 'n4', key: 'avaliacao_nutricional', label: 'Avaliação Nutricional', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4 },
      { id: 'n5', key: 'habitos', label: 'Hábitos Alimentares', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 5 },
      { id: 'n6', key: 'plano_alimentar', label: 'Plano Alimentar', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 6 },
    ],
  },
  { key: 'terapia_ocupacional', label: 'Terapia Ocupacional', ativa: true, profissoes: ['terapia_ocupacional'],
    campos: [
      { id: 'to1', key: 'mif', label: 'MIF (18-126)', tipo: 'number', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'to2', key: 'avd', label: 'AVD', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'to3', key: 'aivd', label: 'AIVD', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
      { id: 'to4', key: 'contexto', label: 'Contexto Ambiental e Social', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4 },
    ],
  },
  { key: 'medicina', label: 'Medicina', ativa: true, profissoes: ['medicina'],
    campos: [
      { id: 'm1', key: 'exame_fisico', label: 'Exame Físico Geral', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'm2', key: 'sistemas', label: 'Sistemas Avaliados', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'm3', key: 'hipotese_cid', label: 'Hipótese Diagnóstica com CID', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
    ],
  },
  { key: 'odontologia', label: 'Odontologia', ativa: true, profissoes: ['odontologia'],
    campos: [
      { id: 'o1', key: 'exame_intrabucal', label: 'Exame Intrabucal', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'o2', key: 'queixa_odonto', label: 'Queixa Odontológica', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'o3', key: 'plano_tratamento', label: 'Plano de Tratamento', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
    ],
  },
  { key: 'enfermagem', label: 'Enfermagem', ativa: true, profissoes: ['enfermagem'],
    campos: [
      { id: 'e1', key: 'avaliacao_enfermagem', label: 'Avaliação de Enfermagem', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'e2', key: 'cuidados', label: 'Cuidados Realizados', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'e3', key: 'intercorrencias', label: 'Intercorrências', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
    ],
  },
];

const PROFISSOES = ['fisioterapia', 'psicologia', 'fonoaudiologia', 'nutricao', 'terapia_ocupacional', 'medicina', 'odontologia', 'enfermagem'];

const ConfigEspecialidades: React.FC = () => {
  const [especialidades, setEspecialidades] = useState<EspecialidadeConfig[]>(DEFAULT_ESPECIALIDADES);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState('fisioterapia');
  const [addFieldDialog, setAddFieldDialog] = useState(false);
  const [addEspDialog, setAddEspDialog] = useState(false);
  const [newField, setNewField] = useState({ label: '', tipo: 'textarea', obrigatorio: false, opcoes: '' });
  const [newEsp, setNewEsp] = useState({ label: '', profissoes: [] as string[] });

  const loadConfig = useCallback(async () => {
    const { data } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
    const cfg = data?.configuracoes as any;
    if (cfg?.[CONFIG_KEY]) setEspecialidades(cfg[CONFIG_KEY]);
    setLoading(false);
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const save = async (updated: EspecialidadeConfig[]) => {
    const { data: existing } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
    const existingConfig = (existing?.configuracoes as any) || {};
    await supabase.from('system_config').upsert({
      id: 'default',
      configuracoes: { ...existingConfig, [CONFIG_KEY]: updated },
      updated_at: new Date().toISOString(),
    });
    setEspecialidades(updated);
    toast.success('Configuração salva');
  };

  const esp = especialidades.find(e => e.key === selected);

  const toggleCampo = (campoId: string) => {
    if (!esp) return;
    const updated = especialidades.map(e =>
      e.key === selected ? { ...e, campos: e.campos.map(c => c.id === campoId ? { ...c, habilitado: !c.habilitado } : c) } : e
    );
    save(updated);
  };

  const toggleObrig = (campoId: string) => {
    if (!esp) return;
    const updated = especialidades.map(e =>
      e.key === selected ? { ...e, campos: e.campos.map(c => c.id === campoId ? { ...c, obrigatorio: !c.obrigatorio } : c) } : e
    );
    save(updated);
  };

  const updateLabel = (campoId: string, label: string) => {
    setEspecialidades(prev => prev.map(e =>
      e.key === selected ? { ...e, campos: e.campos.map(c => c.id === campoId ? { ...c, label } : c) } : e
    ));
  };

  const saveLabelChange = () => save(especialidades);

  const addCampoEsp = () => {
    if (!newField.label.trim() || !esp) return;
    const campo: CampoEspecialidade = {
      id: `custom_${Date.now()}`, key: `custom_${Date.now()}`, label: newField.label.trim(),
      tipo: newField.tipo, obrigatorio: newField.obrigatorio, habilitado: true, isBuiltin: false,
      order: esp.campos.length + 1,
      opcoes: newField.tipo === 'select' ? newField.opcoes.split(',').map(o => o.trim()).filter(Boolean) : undefined,
    };
    const updated = especialidades.map(e =>
      e.key === selected ? { ...e, campos: [...e.campos, campo] } : e
    );
    save(updated);
    setAddFieldDialog(false);
    setNewField({ label: '', tipo: 'textarea', obrigatorio: false, opcoes: '' });
  };

  const deleteCampo = (campoId: string) => {
    const campo = esp?.campos.find(c => c.id === campoId);
    if (!campo || campo.isBuiltin) return;
    const updated = especialidades.map(e =>
      e.key === selected ? { ...e, campos: e.campos.filter(c => c.id !== campoId) } : e
    );
    save(updated);
  };

  const addNovaEspecialidade = () => {
    if (!newEsp.label.trim()) return;
    const key = newEsp.label.toLowerCase().replace(/\s+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const nova: EspecialidadeConfig = {
      key, label: newEsp.label.trim(), ativa: true,
      profissoes: newEsp.profissoes, campos: [],
    };
    const updated = [...especialidades, nova];
    save(updated);
    setSelected(key);
    setAddEspDialog(false);
    setNewEsp({ label: '', profissoes: [] });
  };

  const toggleEspAtiva = (key: string) => {
    const updated = especialidades.map(e => e.key === key ? { ...e, ativa: !e.ativa } : e);
    save(updated);
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Especialidade selector */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold font-display text-foreground">Campos por Especialidade</h3>
            <Button size="sm" variant="outline" onClick={() => setAddEspDialog(true)}>
              <Plus className="w-4 h-4 mr-1" /> Nova Especialidade
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {especialidades.map(e => (
              <Button
                key={e.key}
                variant={selected === e.key ? 'default' : 'outline'}
                size="sm"
                className={`text-xs ${!e.ativa ? 'opacity-50' : ''}`}
                onClick={() => setSelected(e.key)}
              >
                {e.label}
                {!e.ativa && <span className="ml-1 text-[9px]">(inativa)</span>}
              </Button>
            ))}
          </div>

          {esp && (
            <>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg mb-4">
                <div>
                  <span className="text-sm font-medium">{esp.label}</span>
                  <p className="text-[10px] text-muted-foreground">Profissões: {esp.profissoes.join(', ')}</p>
                </div>
                <Switch checked={esp.ativa} onCheckedChange={() => toggleEspAtiva(esp.key)} />
              </div>

              <div className="space-y-2">
                {esp.campos.sort((a, b) => a.order - b.order).map(campo => (
                  <div key={campo.id} className={`flex items-center gap-3 p-3 rounded-lg border ${campo.habilitado ? 'bg-background border-border' : 'bg-muted/50 border-border/50 opacity-60'}`}>
                    <div className="flex-1 min-w-0">
                      <Input
                        value={campo.label} onChange={e => updateLabel(campo.id, e.target.value)}
                        onBlur={saveLabelChange}
                        className="h-8 text-sm font-medium border-0 bg-transparent p-0 focus-visible:ring-0"
                      />
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground capitalize">{campo.tipo}</span>
                        {campo.obrigatorio && <Badge variant="outline" className="text-[9px] h-4 px-1">Obrigatório</Badge>}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleObrig(campo.id)}>
                      <span className={`text-xs font-bold ${campo.obrigatorio ? 'text-destructive' : 'text-muted-foreground'}`}>*</span>
                    </Button>
                    <Switch checked={campo.habilitado} onCheckedChange={() => toggleCampo(campo.id)} />
                    {!campo.isBuiltin && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70" onClick={() => deleteCampo(campo.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <Button variant="outline" className="w-full mt-3" onClick={() => setAddFieldDialog(true)}>
                <Plus className="w-4 h-4 mr-2" /> Adicionar Campo
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add field dialog */}
      <Dialog open={addFieldDialog} onOpenChange={setAddFieldDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Campo para {esp?.label}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome do campo</Label><Input value={newField.label} onChange={e => setNewField(p => ({ ...p, label: e.target.value }))} /></div>
            <div><Label>Tipo</Label>
              <Select value={newField.tipo} onValueChange={v => setNewField(p => ({ ...p, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="textarea">Texto longo</SelectItem>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="number">Número</SelectItem>
                  <SelectItem value="select">Seleção</SelectItem>
                  <SelectItem value="checkbox">Checkbox</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newField.tipo === 'select' && (
              <div><Label>Opções (vírgula)</Label><Input value={newField.opcoes} onChange={e => setNewField(p => ({ ...p, opcoes: e.target.value }))} /></div>
            )}
            <div className="flex items-center gap-2"><Switch checked={newField.obrigatorio} onCheckedChange={v => setNewField(p => ({ ...p, obrigatorio: v }))} /><Label>Obrigatório</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFieldDialog(false)}>Cancelar</Button>
            <Button onClick={addCampoEsp} disabled={!newField.label.trim()}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add especialidade dialog */}
      <Dialog open={addEspDialog} onOpenChange={setAddEspDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Especialidade</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={newEsp.label} onChange={e => setNewEsp(p => ({ ...p, label: e.target.value }))} /></div>
            <div>
              <Label>Profissões vinculadas</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {PROFISSOES.map(p => (
                  <div key={p} className="flex items-center gap-2">
                    <Checkbox checked={newEsp.profissoes.includes(p)} onCheckedChange={v => setNewEsp(prev => ({
                      ...prev, profissoes: v ? [...prev.profissoes, p] : prev.profissoes.filter(x => x !== p)
                    }))} />
                    <span className="text-sm capitalize">{p.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddEspDialog(false)}>Cancelar</Button>
            <Button onClick={addNovaEspecialidade} disabled={!newEsp.label.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConfigEspecialidades;

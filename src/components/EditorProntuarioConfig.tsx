import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText, Plus, GripVertical, Pencil, Trash2, Eye, EyeOff, Save,
  ChevronUp, ChevronDown, Loader2, RotateCcw, Settings2, Layers
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export interface ProntuarioField {
  id: string;
  key: string;       // maps to DB column or custom_<id>
  label: string;
  type: 'textarea' | 'text' | 'number' | 'date' | 'select' | 'checkbox';
  required: boolean;
  enabled: boolean;
  options?: string[]; // for select type
  isBuiltin: boolean; // true = maps to DB column
  order: number;
}

export interface ProntuarioSection {
  id: string;
  title: string;
  enabled: boolean;
  order: number;
  fields: ProntuarioField[];
}

export interface ProntuarioStructure {
  sections: ProntuarioSection[];
  version: number;
  updatedAt: string;
}

const DEFAULT_SECTIONS: ProntuarioSection[] = [
  {
    id: 'sec_queixa',
    title: 'Queixa e Anamnese',
    enabled: true,
    order: 0,
    fields: [
      { id: 'f_queixa', key: 'queixa_principal', label: 'Queixa Principal', type: 'textarea', required: false, enabled: true, isBuiltin: true, order: 0 },
      { id: 'f_anamnese', key: 'anamnese', label: 'Anamnese', type: 'textarea', required: false, enabled: true, isBuiltin: true, order: 1 },
      { id: 'f_sinais', key: 'sinais_sintomas', label: 'Sinais e Sintomas', type: 'textarea', required: false, enabled: true, isBuiltin: true, order: 2 },
    ],
  },
  {
    id: 'sec_exame',
    title: 'Exame e Avaliação',
    enabled: true,
    order: 1,
    fields: [
      { id: 'f_exame', key: 'exame_fisico', label: 'Exame Físico', type: 'textarea', required: false, enabled: true, isBuiltin: true, order: 0 },
      { id: 'f_hipotese', key: 'hipotese', label: 'Hipótese / Avaliação', type: 'textarea', required: false, enabled: true, isBuiltin: true, order: 1 },
    ],
  },
  {
    id: 'sec_conduta',
    title: 'Conduta e Prescrição',
    enabled: true,
    order: 2,
    fields: [
      { id: 'f_conduta', key: 'conduta', label: 'Conduta', type: 'textarea', required: false, enabled: true, isBuiltin: true, order: 0 },
      { id: 'f_prescricao', key: 'prescricao', label: 'Prescrição / Orientações', type: 'textarea', required: false, enabled: true, isBuiltin: true, order: 1 },
      { id: 'f_exames', key: 'solicitacao_exames', label: 'Solicitação de Exames', type: 'textarea', required: false, enabled: true, isBuiltin: true, order: 2 },
    ],
  },
  {
    id: 'sec_evolucao',
    title: 'Evolução e Observações',
    enabled: true,
    order: 3,
    fields: [
      { id: 'f_evolucao', key: 'evolucao', label: 'Evolução', type: 'textarea', required: false, enabled: true, isBuiltin: true, order: 0 },
      { id: 'f_obs', key: 'observacoes', label: 'Observações Gerais', type: 'textarea', required: false, enabled: true, isBuiltin: true, order: 1 },
      { id: 'f_retorno', key: 'indicacao_retorno', label: 'Indicação de Retorno', type: 'select', required: false, enabled: true, isBuiltin: true, order: 2 },
    ],
  },
  {
    id: 'sec_soap',
    title: 'SOAP (Sessão)',
    enabled: true,
    order: 4,
    fields: [
      { id: 'f_soap_s', key: 'soap_subjetivo', label: 'S — Subjetivo', type: 'textarea', required: false, enabled: true, isBuiltin: true, order: 0 },
      { id: 'f_soap_o', key: 'soap_objetivo', label: 'O — Objetivo', type: 'textarea', required: false, enabled: true, isBuiltin: true, order: 1 },
      { id: 'f_soap_a', key: 'soap_avaliacao', label: 'A — Avaliação', type: 'textarea', required: false, enabled: true, isBuiltin: true, order: 2 },
      { id: 'f_soap_p', key: 'soap_plano', label: 'P — Plano', type: 'textarea', required: false, enabled: true, isBuiltin: true, order: 3 },
    ],
  },
];

const FIELD_TYPES = [
  { value: 'textarea', label: 'Texto longo' },
  { value: 'text', label: 'Texto curto' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Data' },
  { value: 'select', label: 'Seleção' },
  { value: 'checkbox', label: 'Checkbox' },
];

const CONFIG_KEY = 'estrutura_prontuario';

const EditorProntuarioConfig: React.FC = () => {
  const [sections, setSections] = useState<ProntuarioSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [addFieldSection, setAddFieldSection] = useState<string | null>(null);
  const [newField, setNewField] = useState({ label: '', type: 'textarea' as string, required: false, options: '' });
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [editingField, setEditingField] = useState<{ sectionId: string; fieldId: string } | null>(null);
  const [editFieldData, setEditFieldData] = useState({ label: '', type: 'textarea', required: false, options: '' });

  useEffect(() => {
    loadStructure();
  }, []);

  const loadStructure = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('system_config')
        .select('configuracoes')
        .eq('id', 'default')
        .single();

      const config = data?.configuracoes as any;
      if (config?.[CONFIG_KEY]?.sections) {
        setSections(config[CONFIG_KEY].sections);
      } else {
        setSections(JSON.parse(JSON.stringify(DEFAULT_SECTIONS)));
      }
    } catch {
      setSections(JSON.parse(JSON.stringify(DEFAULT_SECTIONS)));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: current } = await supabase
        .from('system_config')
        .select('configuracoes')
        .eq('id', 'default')
        .single();

      const existingConfig = (current?.configuracoes as any) || {};
      const structure: ProntuarioStructure = {
        sections,
        version: (existingConfig[CONFIG_KEY]?.version || 0) + 1,
        updatedAt: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('system_config')
        .update({
          configuracoes: { ...existingConfig, [CONFIG_KEY]: structure },
          updated_at: new Date().toISOString(),
        })
        .eq('id', 'default');

      if (error) throw error;
      toast.success('Estrutura do prontuário salva com sucesso! As alterações já estão ativas.');
    } catch (err: any) {
      toast.error(`Erro ao salvar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = () => {
    setSections(JSON.parse(JSON.stringify(DEFAULT_SECTIONS)));
    toast.info('Estrutura restaurada ao padrão. Clique em "Salvar" para aplicar.');
  };

  // Section operations
  const toggleSection = (sectionId: string) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, enabled: !s.enabled } : s));
  };

  const moveSectionUp = (idx: number) => {
    if (idx === 0) return;
    setSections(prev => {
      const arr = [...prev];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      return arr.map((s, i) => ({ ...s, order: i }));
    });
  };

  const moveSectionDown = (idx: number) => {
    setSections(prev => {
      if (idx >= prev.length - 1) return prev;
      const arr = [...prev];
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      return arr.map((s, i) => ({ ...s, order: i }));
    });
  };

  const removeSection = (sectionId: string) => {
    const sec = sections.find(s => s.id === sectionId);
    if (sec?.fields.some(f => f.isBuiltin)) {
      toast.error('Não é possível remover uma seção com campos nativos do sistema.');
      return;
    }
    setSections(prev => prev.filter(s => s.id !== sectionId).map((s, i) => ({ ...s, order: i })));
  };

  const addSection = () => {
    if (!newSectionTitle.trim()) return;
    const id = `sec_custom_${Date.now()}`;
    setSections(prev => [...prev, { id, title: newSectionTitle.trim(), enabled: true, order: prev.length, fields: [] }]);
    setNewSectionTitle('');
    setAddSectionOpen(false);
    toast.success('Seção adicionada.');
  };

  // Field operations
  const toggleField = (sectionId: string, fieldId: string) => {
    setSections(prev => prev.map(s => s.id === sectionId ? {
      ...s,
      fields: s.fields.map(f => f.id === fieldId ? { ...f, enabled: !f.enabled } : f),
    } : s));
  };

  const toggleRequired = (sectionId: string, fieldId: string) => {
    setSections(prev => prev.map(s => s.id === sectionId ? {
      ...s,
      fields: s.fields.map(f => f.id === fieldId ? { ...f, required: !f.required } : f),
    } : s));
  };

  const moveFieldUp = (sectionId: string, idx: number) => {
    if (idx === 0) return;
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const fields = [...s.fields];
      [fields[idx - 1], fields[idx]] = [fields[idx], fields[idx - 1]];
      return { ...s, fields: fields.map((f, i) => ({ ...f, order: i })) };
    }));
  };

  const moveFieldDown = (sectionId: string, idx: number) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      if (idx >= s.fields.length - 1) return s;
      const fields = [...s.fields];
      [fields[idx], fields[idx + 1]] = [fields[idx + 1], fields[idx]];
      return { ...s, fields: fields.map((f, i) => ({ ...f, order: i })) };
    }));
  };

  const removeField = (sectionId: string, fieldId: string) => {
    const sec = sections.find(s => s.id === sectionId);
    const field = sec?.fields.find(f => f.id === fieldId);
    if (field?.isBuiltin) {
      toast.error('Campos nativos não podem ser removidos, apenas desabilitados.');
      return;
    }
    setSections(prev => prev.map(s => s.id === sectionId ? {
      ...s,
      fields: s.fields.filter(f => f.id !== fieldId).map((f, i) => ({ ...f, order: i })),
    } : s));
  };

  const addField = (sectionId: string) => {
    if (!newField.label.trim()) return;
    const id = `f_custom_${Date.now()}`;
    const field: ProntuarioField = {
      id,
      key: `custom_${id}`,
      label: newField.label.trim(),
      type: newField.type as any,
      required: newField.required,
      enabled: true,
      isBuiltin: false,
      order: 0,
      options: newField.type === 'select' ? newField.options.split(',').map(o => o.trim()).filter(Boolean) : undefined,
    };
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const fields = [...s.fields, field].map((f, i) => ({ ...f, order: i }));
      return { ...s, fields };
    }));
    setNewField({ label: '', type: 'textarea', required: false, options: '' });
    setAddFieldSection(null);
    toast.success('Campo adicionado.');
  };

  const startEditField = (sectionId: string, fieldId: string) => {
    const sec = sections.find(s => s.id === sectionId);
    const field = sec?.fields.find(f => f.id === fieldId);
    if (!field) return;
    setEditingField({ sectionId, fieldId });
    setEditFieldData({
      label: field.label,
      type: field.type,
      required: field.required,
      options: field.options?.join(', ') || '',
    });
  };

  const saveEditField = () => {
    if (!editingField || !editFieldData.label.trim()) return;
    setSections(prev => prev.map(s => {
      if (s.id !== editingField.sectionId) return s;
      return {
        ...s,
        fields: s.fields.map(f => {
          if (f.id !== editingField.fieldId) return f;
          return {
            ...f,
            label: editFieldData.label.trim(),
            type: editFieldData.type as any,
            required: editFieldData.required,
            options: editFieldData.type === 'select' ? editFieldData.options.split(',').map(o => o.trim()).filter(Boolean) : f.options,
          };
        }),
      };
    }));
    setEditingField(null);
    toast.success('Campo atualizado.');
  };

  const totalFields = sections.reduce((a, s) => a + s.fields.length, 0);
  const enabledFields = sections.reduce((a, s) => a + s.fields.filter(f => f.enabled && s.enabled).length, 0);

  if (loading) {
    return (
      <Card className="shadow-card border border-border/50">
        <CardContent className="p-6 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm text-muted-foreground">Carregando estrutura...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="shadow-card border border-border/50">
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Settings2 className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold font-display text-foreground">Editor de Prontuário</h3>
              <p className="text-sm text-muted-foreground">Personalize campos, seções e ordenação do prontuário clínico</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Badge variant="secondary" className="text-xs">{enabledFields}/{totalFields} campos ativos</Badge>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
              <Eye className="w-3.5 h-3.5 mr-1" /> Pré-visualizar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAddSectionOpen(true)}>
              <Layers className="w-3.5 h-3.5 mr-1" /> Nova Seção
            </Button>
            <Button variant="ghost" size="sm" onClick={resetToDefault}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Restaurar Padrão
            </Button>
          </div>

          <Separator className="mb-4" />

          {/* Sections list */}
          <div className="space-y-4">
            {sections.map((section, sIdx) => (
              <div key={section.id} className={`border rounded-lg overflow-hidden ${section.enabled ? 'border-border' : 'border-border/30 opacity-60'}`}>
                {/* Section header */}
                <div className="bg-muted/40 px-4 py-3 flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-muted-foreground/50" />
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveSectionUp(sIdx)} disabled={sIdx === 0}>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveSectionDown(sIdx)} disabled={sIdx === sections.length - 1}>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <h4 className="font-semibold text-sm flex-1">{section.title}</h4>
                  <Badge variant="outline" className="text-[10px]">{section.fields.filter(f => f.enabled).length} campos</Badge>
                  <Switch checked={section.enabled} onCheckedChange={() => toggleSection(section.id)} />
                  {!section.fields.some(f => f.isBuiltin) && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeSection(section.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>

                {/* Fields */}
                {section.enabled && (
                  <div className="divide-y divide-border/50">
                    {section.fields.map((field, fIdx) => (
                      <div key={field.id} className={`px-4 py-2.5 flex items-center gap-2 ${!field.enabled ? 'opacity-40' : ''}`}>
                        <div className="flex items-center gap-0.5">
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => moveFieldUp(section.id, fIdx)} disabled={fIdx === 0}>
                            <ChevronUp className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => moveFieldDown(section.id, fIdx)} disabled={fIdx === section.fields.length - 1}>
                            <ChevronDown className="w-3 h-3" />
                          </Button>
                        </div>
                        <span className="text-sm flex-1 font-medium">{field.label}</span>
                        <Badge variant="outline" className="text-[10px] capitalize">{FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}</Badge>
                        {field.required && <Badge className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">Obrigatório</Badge>}
                        {field.isBuiltin && <Badge variant="secondary" className="text-[10px]">Nativo</Badge>}
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleRequired(section.id, field.id)} title={field.required ? 'Tornar opcional' : 'Tornar obrigatório'}>
                          {field.required ? <span className="text-[10px] font-bold text-destructive">*</span> : <span className="text-[10px] text-muted-foreground">○</span>}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEditField(section.id, field.id)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleField(section.id, field.id)}>
                          {field.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        </Button>
                        {!field.isBuiltin && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeField(section.id, field.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    ))}

                    {/* Add field button */}
                    {addFieldSection === section.id ? (
                      <div className="px-4 py-3 bg-muted/20 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs">Nome do Campo</Label>
                            <Input value={newField.label} onChange={e => setNewField(p => ({ ...p, label: e.target.value }))} placeholder="Ex: Peso Atual" className="h-8 text-sm" />
                          </div>
                          <div>
                            <Label className="text-xs">Tipo</Label>
                            <Select value={newField.type} onValueChange={v => setNewField(p => ({ ...p, type: v }))}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-end gap-2">
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                              <input type="checkbox" checked={newField.required} onChange={e => setNewField(p => ({ ...p, required: e.target.checked }))} className="rounded" />
                              Obrigatório
                            </label>
                          </div>
                        </div>
                        {newField.type === 'select' && (
                          <div>
                            <Label className="text-xs">Opções (separadas por vírgula)</Label>
                            <Input value={newField.options} onChange={e => setNewField(p => ({ ...p, options: e.target.value }))} placeholder="Opção 1, Opção 2, Opção 3" className="h-8 text-sm" />
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => addField(section.id)} disabled={!newField.label.trim()}>
                            <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setAddFieldSection(null)}>Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="px-4 py-2">
                        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setAddFieldSection(section.id); setNewField({ label: '', type: 'textarea', required: false, options: '' }); }}>
                          <Plus className="w-3 h-3 mr-1" /> Adicionar campo
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <Separator className="my-4" />

          {/* Save button */}
          <Button onClick={handleSave} disabled={saving} className="w-full gradient-primary text-primary-foreground">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar Estrutura
          </Button>
        </CardContent>
      </Card>

      {/* Edit field dialog */}
      <Dialog open={!!editingField} onOpenChange={() => setEditingField(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Campo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome do Campo</Label>
              <Input value={editFieldData.label} onChange={e => setEditFieldData(p => ({ ...p, label: e.target.value }))} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={editFieldData.type} onValueChange={v => setEditFieldData(p => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {editFieldData.type === 'select' && (
              <div>
                <Label>Opções (separadas por vírgula)</Label>
                <Input value={editFieldData.options} onChange={e => setEditFieldData(p => ({ ...p, options: e.target.value }))} />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={editFieldData.required} onChange={e => setEditFieldData(p => ({ ...p, required: e.target.checked }))} className="rounded" />
              Obrigatório
            </label>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setEditingField(null)}>Cancelar</Button>
              <Button onClick={saveEditField}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add section dialog */}
      <Dialog open={addSectionOpen} onOpenChange={setAddSectionOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Seção</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Título da Seção</Label>
              <Input value={newSectionTitle} onChange={e => setNewSectionTitle(e.target.value)} placeholder="Ex: Dados Complementares" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setAddSectionOpen(false)}>Cancelar</Button>
              <Button onClick={addSection} disabled={!newSectionTitle.trim()}>Criar Seção</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5" /> Pré-visualização do Prontuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {sections.filter(s => s.enabled).map(section => (
              <div key={section.id}>
                <h3 className="font-semibold text-sm text-foreground mb-3 border-b pb-1">{section.title}</h3>
                <div className="space-y-3">
                  {section.fields.filter(f => f.enabled).map(field => (
                    <div key={field.id}>
                      <Label className="text-sm">{field.label}{field.required && <span className="text-destructive ml-0.5">*</span>}</Label>
                      {field.type === 'textarea' && (
                        <div className="w-full border rounded-md p-2 h-16 bg-muted/20 text-xs text-muted-foreground">Campo de texto...</div>
                      )}
                      {field.type === 'text' && (
                        <div className="w-full border rounded-md p-2 h-9 bg-muted/20 text-xs text-muted-foreground">Texto curto...</div>
                      )}
                      {field.type === 'number' && (
                        <div className="w-full border rounded-md p-2 h-9 bg-muted/20 text-xs text-muted-foreground">0</div>
                      )}
                      {field.type === 'date' && (
                        <div className="w-full border rounded-md p-2 h-9 bg-muted/20 text-xs text-muted-foreground">dd/mm/aaaa</div>
                      )}
                      {field.type === 'select' && (
                        <div className="w-full border rounded-md p-2 h-9 bg-muted/20 text-xs text-muted-foreground">Selecione...</div>
                      )}
                      {field.type === 'checkbox' && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <div className="w-4 h-4 border rounded" /> {field.label}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EditorProntuarioConfig;

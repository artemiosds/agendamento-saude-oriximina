import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Type, AlignLeft, CheckSquare, ChevronDownSquare, Calendar as CalendarIcon,
  Trash2, ChevronUp, ChevronDown, Loader2, Save, X, Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export type BuilderFieldType = 'text' | 'textarea' | 'checkbox' | 'select' | 'date';

export interface BuilderField {
  id: string;
  type: BuilderFieldType;
  label: string;
  required: boolean;
  options?: string[]; // checkbox/select
}

export interface BuilderSchema {
  fields: BuilderField[];
  version: number;
  updatedAt: string;
}

const FIELD_TOOLS: { type: BuilderFieldType; label: string; icon: React.ElementType; defaultLabel: string }[] = [
  { type: 'text', label: 'Texto Curto', icon: Type, defaultLabel: 'Novo campo de texto' },
  { type: 'textarea', label: 'Texto Longo', icon: AlignLeft, defaultLabel: 'Nova descrição' },
  { type: 'checkbox', label: 'Checkbox', icon: CheckSquare, defaultLabel: 'Marque as opções' },
  { type: 'select', label: 'Dropdown', icon: ChevronDownSquare, defaultLabel: 'Selecione uma opção' },
  { type: 'date', label: 'Data', icon: CalendarIcon, defaultLabel: 'Data' },
];

interface ConstrutorProntuarioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipoKey: string;       // ex: 'primeira_consulta'
  tipoLabel: string;     // ex: 'Avaliação Inicial'
}

const configKeyFor = (tipoKey: string) => `estrutura_prontuario_${tipoKey}`;

const ConstrutorProntuarioModal: React.FC<ConstrutorProntuarioModalProps> = ({
  open, onOpenChange, tipoKey, tipoLabel,
}) => {
  const [fields, setFields] = useState<BuilderField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('system_config')
        .select('configuracoes')
        .eq('id', 'default')
        .maybeSingle();
      const cfg = (data?.configuracoes as any) || {};
      const stored = cfg[configKeyFor(tipoKey)] as BuilderSchema | undefined;
      setFields(stored?.fields ?? []);
    } catch {
      setFields([]);
    } finally {
      setLoading(false);
    }
  }, [tipoKey]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const addField = (type: BuilderFieldType) => {
    const tool = FIELD_TOOLS.find(t => t.type === type)!;
    const newField: BuilderField = {
      id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      label: tool.defaultLabel,
      required: false,
      options: type === 'checkbox' || type === 'select' ? ['Opção 1', 'Opção 2'] : undefined,
    };
    setFields(prev => [...prev, newField]);
  };

  const updateField = (id: string, patch: Partial<BuilderField>) => {
    setFields(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
  };

  const moveField = (idx: number, dir: -1 | 1) => {
    setFields(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const updateOption = (fieldId: string, optIdx: number, value: string) => {
    setFields(prev => prev.map(f => {
      if (f.id !== fieldId) return f;
      const opts = [...(f.options || [])];
      opts[optIdx] = value;
      return { ...f, options: opts };
    }));
  };

  const addOption = (fieldId: string) => {
    setFields(prev => prev.map(f => {
      if (f.id !== fieldId) return f;
      const opts = [...(f.options || []), `Opção ${(f.options?.length ?? 0) + 1}`];
      return { ...f, options: opts };
    }));
  };

  const removeOption = (fieldId: string, optIdx: number) => {
    setFields(prev => prev.map(f => {
      if (f.id !== fieldId) return f;
      const opts = (f.options || []).filter((_, i) => i !== optIdx);
      return { ...f, options: opts };
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: current } = await supabase
        .from('system_config')
        .select('configuracoes')
        .eq('id', 'default')
        .maybeSingle();
      const existingConfig = (current?.configuracoes as any) || {};
      const prev = existingConfig[configKeyFor(tipoKey)] as BuilderSchema | undefined;
      const schema: BuilderSchema = {
        fields,
        version: (prev?.version || 0) + 1,
        updatedAt: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('system_config')
        .upsert({
          id: 'default',
          configuracoes: { ...existingConfig, [configKeyFor(tipoKey)]: schema },
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
      toast.success(`Modelo "${tipoLabel}" salvo com sucesso`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Erro ao salvar: ${err.message ?? 'desconhecido'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-base font-display">
            Editar Modelo de Prontuário · <span className="text-primary">{tipoLabel}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Monte o formulário arrastando ou adicionando campos. As alterações ficam ativas para todos os profissionais ao salvar.
          </p>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-[220px_1fr] overflow-hidden">
          {/* Painel Esquerdo - Ferramentas */}
          <div className="border-b md:border-b-0 md:border-r bg-muted/30 p-4">
            <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
              Adicionar Campo
            </Label>
            <div className="mt-3 space-y-2">
              {FIELD_TOOLS.map(tool => {
                const Icon = tool.icon;
                return (
                  <Button
                    key={tool.type}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2 h-9"
                    onClick={() => addField(tool.type)}
                    disabled={loading}
                  >
                    <Icon className="w-4 h-4 text-primary" />
                    <span className="text-xs">+ {tool.label}</span>
                  </Button>
                );
              })}
            </div>

            <Separator className="my-4" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p>{fields.length} campo(s) configurado(s)</p>
              <p className="text-[10px]">As respostas são salvas em formato JSON.</p>
            </div>
          </div>

          {/* Painel Direito - Canvas */}
          <ScrollArea className="h-[60vh] md:h-auto">
            <div className="p-6">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Carregando modelo…
                </div>
              ) : fields.length === 0 ? (
                <div className="border-2 border-dashed border-border rounded-xl py-16 text-center">
                  <p className="text-sm text-muted-foreground">
                    Nenhum campo configurado ainda.
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Use os botões à esquerda para adicionar campos.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {fields.map((field, idx) => (
                    <div
                      key={field.id}
                      className="border rounded-lg bg-background p-4 hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-start gap-3">
                        {/* Reorder controls */}
                        <div className="flex flex-col gap-0.5 pt-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => moveField(idx, -1)}
                            disabled={idx === 0}
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => moveField(idx, 1)}
                            disabled={idx === fields.length - 1}
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        <div className="flex-1 min-w-0 space-y-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                              {FIELD_TOOLS.find(t => t.type === field.type)?.label ?? field.type}
                            </Badge>
                            {field.required && (
                              <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                                Obrigatório
                              </Badge>
                            )}
                          </div>

                          <div>
                            <Label className="text-xs text-muted-foreground">Pergunta / Label</Label>
                            <Input
                              value={field.label}
                              onChange={e => updateField(field.id, { label: e.target.value })}
                              className="h-9 mt-1"
                              placeholder="Ex: Queixa principal do paciente"
                            />
                          </div>

                          {(field.type === 'checkbox' || field.type === 'select') && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Opções de resposta</Label>
                              <div className="mt-1 space-y-1.5">
                                {(field.options || []).map((opt, oi) => (
                                  <div key={oi} className="flex items-center gap-2">
                                    <Input
                                      value={opt}
                                      onChange={e => updateOption(field.id, oi, e.target.value)}
                                      className="h-8 text-sm"
                                      placeholder={`Opção ${oi + 1}`}
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                      onClick={() => removeOption(field.id, oi)}
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => addOption(field.id)}
                                >
                                  <Plus className="w-3 h-3 mr-1" /> Adicionar opção
                                </Button>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-1">
                            <Switch
                              checked={field.required}
                              onCheckedChange={v => updateField(field.id, { required: v })}
                              id={`req-${field.id}`}
                            />
                            <Label htmlFor={`req-${field.id}`} className="text-xs cursor-pointer">
                              Campo obrigatório
                            </Label>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive/70 hover:text-destructive shrink-0"
                          onClick={() => removeField(field.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar Modelo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConstrutorProntuarioModal;

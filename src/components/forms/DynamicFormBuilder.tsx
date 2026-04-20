import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, Plus, Trash2, Pencil, Save, Eye, EyeOff,
  ChevronDown, ChevronUp, Loader2, Settings2, X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { supabase } from '@/integrations/supabase/client';
import { DynamicFormRenderer } from '@/components/forms/DynamicFormRenderer';
import type {
  FieldType, FormField, FormFieldOption, FormSchema, FormSection, FormTemplate,
} from '@/types/formTemplate';

const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: 'Texto curto',
  textarea: 'Texto longo',
  number: 'Número',
  date: 'Data',
  select: 'Lista (Dropdown)',
  radio: 'Escolha única (Radio)',
  checkbox: 'Múltipla escolha (Checkbox)',
};

const TYPE_NEEDS_OPTIONS: FieldType[] = ['select', 'radio', 'checkbox'];

interface DynamicFormBuilderProps {
  /** Lista de slugs canônicos para o seletor superior */
  availableSlugs: { slug: string; label: string }[];
  /** Escopo atual (vazio = global). Master define; profissional vê o seu. */
  scope: { unidadeId: string; profissionalId: string };
  /** Quando muda, refaz fetch */
  onAfterSave?: () => void;
}

export function DynamicFormBuilder({ availableSlugs, scope, onAfterSave }: DynamicFormBuilderProps) {
  const queryClient = useQueryClient();
  const [slug, setSlug] = useState<string>(availableSlugs[0]?.slug ?? '');
  const [template, setTemplate] = useState<FormTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'editor' | 'preview'>('editor');

  // Carrega template para esse escopo+slug. Se não existir, abre um draft vazio.
  useEffect(() => {
    let active = true;
    if (!slug) return;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('form_templates')
        .select('*')
        .eq('form_slug', slug)
        .eq('unidade_id', scope.unidadeId)
        .eq('profissional_id', scope.profissionalId)
        .maybeSingle();

      if (!active) return;

      if (error && error.code !== 'PGRST116') {
        toast.error('Erro ao carregar modelo: ' + error.message);
      }

      if (data) {
        setTemplate({
          ...(data as any),
          schema: ensureSchema((data as any).schema),
        } as FormTemplate);
      } else {
        // Draft local
        setTemplate({
          id: '',
          form_slug: slug,
          display_name: availableSlugs.find(s => s.slug === slug)?.label ?? slug,
          descricao: '',
          unidade_id: scope.unidadeId,
          profissional_id: scope.profissionalId,
          ativo: true,
          versao: 1,
          criado_por: '',
          schema: { sections: [] },
          created_at: '',
          updated_at: '',
        });
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [slug, scope.unidadeId, scope.profissionalId, availableSlugs]);

  const updateSchema = (mut: (s: FormSchema) => FormSchema) => {
    setTemplate(prev => (prev ? { ...prev, schema: mut(prev.schema) } : prev));
  };

  const handleSave = async () => {
    if (!template) return;
    setSaving(true);
    try {
      const payload = {
        form_slug: template.form_slug,
        display_name: template.display_name,
        descricao: template.descricao,
        unidade_id: scope.unidadeId,
        profissional_id: scope.profissionalId,
        schema: template.schema as any,
        ativo: template.ativo,
        versao: (template.versao ?? 0) + 1,
      };
      const { data, error } = template.id
        ? await supabase.from('form_templates').update(payload).eq('id', template.id).select().maybeSingle()
        : await supabase.from('form_templates').insert(payload).select().maybeSingle();

      if (error) throw error;
      if (data) {
        setTemplate({ ...(data as any), schema: ensureSchema((data as any).schema) } as FormTemplate);
      }
      queryClient.invalidateQueries({ queryKey: ['form_template', slug] });
      toast.success('Modelo salvo com sucesso');
      onAfterSave?.();
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[220px]">
              <Label>Formulário (slug interno)</Label>
              <Select value={slug} onValueChange={setSlug}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableSlugs.map(s => (
                    <SelectItem key={s.slug} value={s.slug}>
                      {s.label} <span className="text-muted-foreground ml-1">({s.slug})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[220px]">
              <Label>Nome exibido (editável)</Label>
              <Input
                value={template?.display_name ?? ''}
                onChange={e => setTemplate(p => (p ? { ...p, display_name: e.target.value } : p))}
                placeholder="Ex.: Triagem Inicial"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={template?.ativo ?? true}
                onCheckedChange={v => setTemplate(p => (p ? { ...p, ativo: v } : p))}
              />
              <span className="text-sm">{template?.ativo ? 'Ativo' : 'Inativo'}</span>
            </div>
            <Button onClick={handleSave} disabled={saving || loading || !template}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar modelo
            </Button>
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea
              value={template?.descricao ?? ''}
              onChange={e => setTemplate(p => (p ? { ...p, descricao: e.target.value } : p))}
              placeholder="Descrição interna deste modelo"
              className="min-h-[60px]"
            />
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
            <span>Slug interno: <Badge variant="outline">{slug}</Badge></span>
            <span>Escopo: <Badge variant="outline">
              {scope.profissionalId ? 'Profissional' : scope.unidadeId ? 'Unidade' : 'Global'}
            </Badge></span>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={v => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="editor"><Settings2 className="h-4 w-4 mr-1" />Editor</TabsTrigger>
          <TabsTrigger value="preview"><Eye className="h-4 w-4 mr-1" />Pré-visualização</TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="space-y-3">
          {loading || !template ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <SectionsEditor
              schema={template.schema}
              onChange={mut => updateSchema(mut)}
            />
          )}
        </TabsContent>

        <TabsContent value="preview">
          {template && (
            <DynamicFormRenderer
              schema={template.schema}
              onSubmit={() => { toast.info('Preview: envio desabilitado'); }}
              submitLabel="Enviar (preview)"
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Sections (drag and drop) ---------------- */

function SectionsEditor({
  schema,
  onChange,
}: {
  schema: FormSchema;
  onChange: (mut: (s: FormSchema) => FormSchema) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sections = useMemo(
    () => [...(schema.sections ?? [])].sort((a, b) => a.order - b.order),
    [schema.sections],
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = sections.findIndex(s => s.id === active.id);
    const newIdx = sections.findIndex(s => s.id === over.id);
    const reordered = arrayMove(sections, oldIdx, newIdx).map((s, i) => ({ ...s, order: i }));
    onChange(s => ({ ...s, sections: reordered }));
  };

  const addSection = () => {
    const id = `sec_${Date.now()}`;
    onChange(s => ({
      ...s,
      sections: [
        ...sections,
        { id, title: 'Nova seção', enabled: true, order: sections.length, fields: [] },
      ],
    }));
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={addSection}><Plus className="h-4 w-4 mr-1" />Nova seção</Button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {sections.map(section => (
              <SortableSectionCard
                key={section.id}
                section={section}
                onUpdate={updater =>
                  onChange(s => ({
                    ...s,
                    sections: s.sections.map(x => (x.id === section.id ? updater(x) : x)),
                  }))
                }
                onRemove={() =>
                  onChange(s => ({ ...s, sections: s.sections.filter(x => x.id !== section.id) }))
                }
              />
            ))}
            {sections.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhuma seção criada ainda. Clique em "Nova seção".
              </p>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableSectionCard({
  section,
  onUpdate,
  onRemove,
}: {
  section: FormSection;
  onUpdate: (mut: (s: FormSection) => FormSection) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const [collapsed, setCollapsed] = useState(false);
  const [editingField, setEditingField] = useState<FormField | null>(null);

  return (
    <Card ref={setNodeRef} style={style} className="border-2">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground p-1" type="button">
            <GripVertical className="h-4 w-4" />
          </button>
          <Input
            value={section.title}
            onChange={e => onUpdate(s => ({ ...s, title: e.target.value }))}
            className="font-semibold flex-1"
          />
          <Switch
            checked={section.enabled}
            onCheckedChange={v => onUpdate(s => ({ ...s, enabled: v }))}
          />
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(c => !c)}>
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent className="space-y-2">
          <FieldsEditor
            fields={section.fields ?? []}
            onChange={mut => onUpdate(s => ({ ...s, fields: mut(s.fields ?? []) }))}
            onEdit={f => setEditingField(f)}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const id = `f_${Date.now()}`;
                const newField: FormField = {
                  id,
                  key: id,
                  label: 'Novo campo',
                  type: 'text',
                  required: false,
                  enabled: true,
                  order: (section.fields ?? []).length,
                };
                onUpdate(s => ({ ...s, fields: [...(s.fields ?? []), newField] }));
                setEditingField(newField);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />Adicionar campo
            </Button>
          </div>
        </CardContent>
      )}

      <FieldEditDialog
        field={editingField}
        existingKeys={(section.fields ?? []).map(f => f.key)}
        onClose={() => setEditingField(null)}
        onSave={updated => {
          onUpdate(s => ({
            ...s,
            fields: (s.fields ?? []).map(f => (f.id === updated.id ? updated : f)),
          }));
          setEditingField(null);
        }}
      />
    </Card>
  );
}

/* ---------------- Fields ---------------- */

function FieldsEditor({
  fields,
  onChange,
  onEdit,
}: {
  fields: FormField[];
  onChange: (mut: (f: FormField[]) => FormField[]) => void;
  onEdit: (field: FormField) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const sorted = useMemo(() => [...fields].sort((a, b) => a.order - b.order), [fields]);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = sorted.findIndex(f => f.id === active.id);
    const newIdx = sorted.findIndex(f => f.id === over.id);
    onChange(() => arrayMove(sorted, oldIdx, newIdx).map((f, i) => ({ ...f, order: i })));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sorted.map(f => f.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {sorted.map(field => (
            <SortableFieldRow
              key={field.id}
              field={field}
              onToggle={enabled =>
                onChange(list => list.map(f => (f.id === field.id ? { ...f, enabled } : f)))
              }
              onRemove={() => onChange(list => list.filter(f => f.id !== field.id))}
              onEdit={() => onEdit(field)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableFieldRow({
  field,
  onToggle,
  onRemove,
  onEdit,
}: {
  field: FormField;
  onToggle: (v: boolean) => void;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 border rounded-md bg-background"
    >
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground" type="button">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1">
        <div className="text-sm font-medium">{field.label}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">{FIELD_TYPE_LABEL[field.type]}</Badge>
          <span>chave: <code>{field.key}</code></span>
          {field.required && <Badge variant="destructive" className="text-[10px] py-0">obrigatório</Badge>}
        </div>
      </div>
      <Switch checked={field.enabled} onCheckedChange={onToggle} />
      <Button variant="ghost" size="icon" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" onClick={onRemove}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

/* ---------------- Field Edit Dialog ---------------- */

function FieldEditDialog({
  field,
  existingKeys,
  onClose,
  onSave,
}: {
  field: FormField | null;
  existingKeys: string[];
  onClose: () => void;
  onSave: (f: FormField) => void;
}) {
  const [draft, setDraft] = useState<FormField | null>(field);
  useEffect(() => setDraft(field), [field]);

  if (!draft) return null;

  const needsOptions = TYPE_NEEDS_OPTIONS.includes(draft.type);

  const updateOption = (idx: number, patch: Partial<FormFieldOption>) => {
    setDraft(d => {
      if (!d) return d;
      const opts = [...(d.options ?? [])];
      opts[idx] = { ...opts[idx], ...patch };
      return { ...d, options: opts };
    });
  };
  const addOption = () =>
    setDraft(d =>
      d ? { ...d, options: [...(d.options ?? []), { value: `opt_${Date.now()}`, label: 'Nova opção' }] } : d,
    );
  const removeOption = (idx: number) =>
    setDraft(d => (d ? { ...d, options: (d.options ?? []).filter((_, i) => i !== idx) } : d));

  const keyConflict =
    draft.key.trim() &&
    existingKeys.filter(k => k !== field?.key).includes(draft.key.trim());

  return (
    <Dialog open={!!field} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar campo</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Rótulo (visível)</Label>
              <Input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} />
            </div>
            <div>
              <Label>Chave interna (payload)</Label>
              <Input
                value={draft.key}
                onChange={e =>
                  setDraft({ ...draft, key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })
                }
              />
              {keyConflict && (
                <p className="text-xs text-destructive mt-1">Esta chave já existe nesta seção.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select
                value={draft.type}
                onValueChange={v =>
                  setDraft({
                    ...draft,
                    type: v as FieldType,
                    options: TYPE_NEEDS_OPTIONS.includes(v as FieldType)
                      ? draft.options ?? [{ value: 'opt_1', label: 'Opção 1' }]
                      : undefined,
                  })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map(t => (
                    <SelectItem key={t} value={t}>{FIELD_TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                checked={draft.required}
                onCheckedChange={v => setDraft({ ...draft, required: v })}
              />
              <Label>Obrigatório</Label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Placeholder</Label>
              <Input value={draft.placeholder ?? ''} onChange={e => setDraft({ ...draft, placeholder: e.target.value })} />
            </div>
            <div>
              <Label>Texto auxiliar</Label>
              <Input value={draft.helper ?? ''} onChange={e => setDraft({ ...draft, helper: e.target.value })} />
            </div>
          </div>

          {needsOptions && (
            <div className="space-y-2 border rounded-md p-3">
              <div className="flex items-center justify-between">
                <Label>Opções</Label>
                <Button size="sm" variant="outline" onClick={addOption}>
                  <Plus className="h-4 w-4 mr-1" />Adicionar opção
                </Button>
              </div>
              {(draft.options ?? []).map((opt, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    placeholder="Valor (interno)"
                    value={opt.value}
                    onChange={e => updateOption(i, { value: e.target.value })}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Texto exibido"
                    value={opt.label}
                    onChange={e => updateOption(i, { label: e.target.value })}
                    className="flex-1"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeOption(i)}>
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {(draft.options ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">Adicione ao menos uma opção.</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => onSave(draft)}
            disabled={!draft.label.trim() || !draft.key.trim() || !!keyConflict ||
              (needsOptions && (draft.options ?? []).length === 0)}
          >
            Salvar campo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ensureSchema(raw: any): FormSchema {
  if (!raw || typeof raw !== 'object') return { sections: [] };
  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  return { sections };
}

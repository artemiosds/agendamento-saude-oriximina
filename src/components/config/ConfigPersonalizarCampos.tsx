import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, GripVertical, Settings2, Type,
  Hash, Calendar, CheckSquare, List, AlignLeft, ArrowUp, ArrowDown, Lock,
  Phone, IdCard, Mail, Clock, CircleDot, ListChecks,
} from 'lucide-react';
import { toast } from 'sonner';
import { useOperacional } from '@/contexts/OperacionalContext';
import {
  useCustomFields,
  CustomFieldDef,
  CustomFieldType,
  ScreenKey,
  SCREEN_LABELS,
  ScreenConfig,
  NATIVE_FIELDS,
  CustomFieldCondition,
  CustomFieldScope,
  CustomFieldValidation,
} from '@/hooks/useCustomFields';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';

const FIELD_TYPE_LABELS: Record<CustomFieldType, { label: string; icon: React.ElementType }> = {
  text: { label: 'Texto Curto', icon: Type },
  textarea: { label: 'Texto Longo', icon: AlignLeft },
  number: { label: 'Número', icon: Hash },
  date: { label: 'Data', icon: Calendar },
  time: { label: 'Hora', icon: Clock },
  select: { label: 'Seleção', icon: List },
  multiselect: { label: 'Múltipla Escolha', icon: ListChecks },
  checkbox: { label: 'Checkbox', icon: CheckSquare },
  radio: { label: 'Rádio', icon: CircleDot },
  phone: { label: 'Telefone', icon: Phone },
  cpf: { label: 'CPF', icon: IdCard },
  cns: { label: 'CNS', icon: IdCard },
  email: { label: 'E-mail', icon: Mail },
};

const TIPOS_PRONTUARIO_PADRAO = [
  'primeira_consulta',
  'retorno',
  'avaliacao_inicial',
  'sessao',
  'urgencia',
];

const CONDITION_OPS: { value: 'eq' | 'neq' | 'in' | 'notin' | 'empty' | 'notempty'; label: string }[] = [
  { value: 'eq', label: 'Igual a' },
  { value: 'neq', label: 'Diferente de' },
  { value: 'in', label: 'Está em (lista)' },
  { value: 'notin', label: 'Não está em (lista)' },
  { value: 'empty', label: 'Está vazio' },
  { value: 'notempty', label: 'Não está vazio' },
];

const generateId = () => `cf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// -------- Unified row type --------
type UnifiedRow =
  | { kind: 'native'; key: string; nome: string; rotuloOriginal: string }
  | { kind: 'custom'; key: string; field: CustomFieldDef };

// -------- Sortable item --------
interface SortableItemProps {
  row: UnifiedRow;
  hidden: boolean;
  effectiveLabel: string;
  isRenamed: boolean;
  onRename?: () => void;
  onToggleHidden?: () => void;
  onEditCustom?: () => void;
  onDeleteCustom?: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canUp: boolean;
  canDown: boolean;
}

const SortableItem: React.FC<SortableItemProps> = ({
  row, hidden, effectiveLabel, isRenamed, onRename, onToggleHidden,
  onEditCustom, onDeleteCustom, onMoveUp, onMoveDown, canUp, canDown,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.key });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const TypeIcon = row.kind === 'custom' ? (FIELD_TYPE_LABELS[row.field.tipo]?.icon || Type) : Lock;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center justify-between gap-2 py-2 px-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors',
        hidden && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          aria-label="Arrastar para reordenar"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <TypeIcon className={cn('w-4 h-4 shrink-0', row.kind === 'custom' ? 'text-primary' : 'text-muted-foreground')} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                'text-sm font-medium truncate',
                hidden && 'line-through text-muted-foreground',
              )}
            >
              {effectiveLabel}
            </span>
            {row.kind === 'native' && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Nativo</Badge>
            )}
            {row.kind === 'custom' && (
              <span className="text-[10px] text-muted-foreground">
                {FIELD_TYPE_LABELS[row.field.tipo]?.label}
              </span>
            )}
            {isRenamed && row.kind === 'native' && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">Renomeado</Badge>
            )}
            {hidden && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">Oculto</Badge>
            )}
            {row.kind === 'custom' && row.field.obrigatorio && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">Obrigatório</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveUp} disabled={!canUp} title="Mover para cima">
          <ArrowUp className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveDown} disabled={!canDown} title="Mover para baixo">
          <ArrowDown className="w-3.5 h-3.5" />
        </Button>
        {row.kind === 'native' ? (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRename} title="Renomear">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleHidden} title={hidden ? 'Mostrar' : 'Ocultar'}>
              {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEditCustom} title="Editar">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleHidden} title={hidden ? 'Ativar' : 'Desativar'}>
              {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDeleteCustom} title="Excluir">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

// -------- Main component --------
const ConfigPersonalizarCampos: React.FC = () => {
  const { unidades } = useOperacional();
  const { getRawScreenConfig, updateScreenConfig, loading } = useCustomFields();

  const [selectedScreen, setSelectedScreen] = useState<ScreenKey>('paciente');
  const [selectedUnit, setSelectedUnit] = useState<string>('__global__');
  const [screenConfig, setScreenConfig] = useState<ScreenConfig>({
    fields: [], hiddenNative: [], labelOverrides: {}, orderedNames: [],
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDef | null>(null);
  const [renameModal, setRenameModal] = useState<{ nome: string; rotulo: string } | null>(null);

  const [fieldForm, setFieldForm] = useState({
    rotulo: '', tipo: 'text' as CustomFieldType, obrigatorio: false,
    opcoes: '', valorPadrao: '', mostrarListagem: false,
    secao: '', helpText: '',
    scopeGlobal: true,
    especialidades: '',           // comma-separated
    tiposProntuario: [] as string[],
    valMin: '', valMax: '', valMaxLength: '', valMask: '', valRegex: '',
    condEnabled: false,
    condField: '',
    condOp: 'notempty' as CustomFieldCondition['op'],
    condValue: '',
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!loading) {
      setScreenConfig(getRawScreenConfig(selectedScreen, selectedUnit));
    }
  }, [selectedScreen, selectedUnit, loading, getRawScreenConfig]);

  const save = useCallback(async (cfg: ScreenConfig) => {
    setScreenConfig(cfg);
    await updateScreenConfig(selectedScreen, selectedUnit, cfg);
    toast.success('Configuração salva');
  }, [selectedScreen, selectedUnit, updateScreenConfig]);

  // Build unified ordered list — uses orderedNames if present, otherwise [natives..., customs by ordem]
  const unifiedRows: UnifiedRow[] = useMemo(() => {
    const natives = NATIVE_FIELDS[selectedScreen] || [];
    const customs = screenConfig.fields;

    const allByName = new Map<string, UnifiedRow>();
    natives.forEach((n) => {
      allByName.set(n.nome, { kind: 'native', key: `native:${n.nome}`, nome: n.nome, rotuloOriginal: n.rotulo });
    });
    customs.forEach((c) => {
      allByName.set(c.nome, { kind: 'custom', key: `custom:${c.nome}`, field: c });
    });

    const order = screenConfig.orderedNames || [];
    const result: UnifiedRow[] = [];
    const consumed = new Set<string>();

    order.forEach((n) => {
      const r = allByName.get(n);
      if (r && !consumed.has(n)) {
        result.push(r);
        consumed.add(n);
      }
    });
    // Append any new fields (not yet ordered) at the end
    natives.forEach((n) => {
      if (!consumed.has(n.nome)) {
        result.push(allByName.get(n.nome)!);
        consumed.add(n.nome);
      }
    });
    customs
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .forEach((c) => {
        if (!consumed.has(c.nome)) {
          result.push(allByName.get(c.nome)!);
          consumed.add(c.nome);
        }
      });

    return result;
  }, [selectedScreen, screenConfig]);

  const persistOrder = useCallback(async (rows: UnifiedRow[]) => {
    const orderedNames = rows.map((r) => r.kind === 'native' ? r.nome : r.field.nome);
    // Also recompute custom ordem so existing renderers sort consistently
    const newCustoms = screenConfig.fields.map((f) => {
      const idx = orderedNames.indexOf(f.nome);
      return { ...f, ordem: (idx >= 0 ? idx : orderedNames.length) * 10 };
    });
    await save({ ...screenConfig, fields: newCustoms, orderedNames });
  }, [screenConfig, save]);

  const handleDragEnd = useCallback(async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = unifiedRows.findIndex((r) => r.key === active.id);
    const newIndex = unifiedRows.findIndex((r) => r.key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const moved = arrayMove(unifiedRows, oldIndex, newIndex);
    await persistOrder(moved);
  }, [unifiedRows, persistOrder]);

  const moveByArrow = useCallback(async (idx: number, dir: 'up' | 'down') => {
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= unifiedRows.length) return;
    const moved = arrayMove(unifiedRows, idx, swap);
    await persistOrder(moved);
  }, [unifiedRows, persistOrder]);

  // ---------- Custom field CRUD ----------
  const EMPTY_FORM = {
    rotulo: '', tipo: 'text' as CustomFieldType, obrigatorio: false,
    opcoes: '', valorPadrao: '', mostrarListagem: false,
    secao: '', helpText: '',
    scopeGlobal: true,
    especialidades: '',
    tiposProntuario: [] as string[],
    valMin: '', valMax: '', valMaxLength: '', valMask: '', valRegex: '',
    condEnabled: false,
    condField: '',
    condOp: 'notempty' as CustomFieldCondition['op'],
    condValue: '',
  };

  const openAddModal = () => {
    setEditingField(null);
    setFieldForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEditModal = (field: CustomFieldDef) => {
    setEditingField(field);
    setFieldForm({
      rotulo: field.rotulo,
      tipo: field.tipo,
      obrigatorio: field.obrigatorio,
      opcoes: field.opcoes.join(', '),
      valorPadrao: field.valorPadrao,
      mostrarListagem: field.mostrarListagem,
      secao: field.secao ?? '',
      helpText: field.helpText ?? '',
      scopeGlobal: field.escopo?.global ?? true,
      especialidades: (field.escopo?.especialidades || []).join(', '),
      tiposProntuario: field.escopo?.tiposProntuario || [],
      valMin: field.validacao?.min != null ? String(field.validacao.min) : '',
      valMax: field.validacao?.max != null ? String(field.validacao.max) : '',
      valMaxLength: field.validacao?.maxLength != null ? String(field.validacao.maxLength) : '',
      valMask: field.validacao?.mask ?? '',
      valRegex: field.validacao?.regex ?? '',
      condEnabled: !!field.condicao?.fieldName,
      condField: field.condicao?.fieldName ?? '',
      condOp: field.condicao?.op ?? 'notempty',
      condValue: Array.isArray(field.condicao?.value) ? field.condicao!.value.join(', ') : (field.condicao?.value ?? ''),
    });
    setModalOpen(true);
  };

  const buildValidation = (): CustomFieldValidation | undefined => {
    const v: CustomFieldValidation = {};
    if (fieldForm.valMin !== '') v.min = Number(fieldForm.valMin);
    if (fieldForm.valMax !== '') v.max = Number(fieldForm.valMax);
    if (fieldForm.valMaxLength !== '') v.maxLength = Number(fieldForm.valMaxLength);
    if (fieldForm.valMask) v.mask = fieldForm.valMask;
    if (fieldForm.valRegex) v.regex = fieldForm.valRegex;
    return Object.keys(v).length ? v : undefined;
  };

  const buildScope = (): CustomFieldScope | undefined => {
    if (fieldForm.scopeGlobal && !fieldForm.especialidades && fieldForm.tiposProntuario.length === 0) {
      return { global: true };
    }
    const esp = fieldForm.especialidades.split(',').map(s => s.trim()).filter(Boolean);
    return {
      global: fieldForm.scopeGlobal,
      especialidades: esp.length ? esp : undefined,
      tiposProntuario: fieldForm.tiposProntuario.length ? fieldForm.tiposProntuario : undefined,
    };
  };

  const buildCondition = (): CustomFieldCondition | undefined => {
    if (!fieldForm.condEnabled || !fieldForm.condField) return undefined;
    const op = fieldForm.condOp;
    const needsValue = op !== 'empty' && op !== 'notempty';
    const value = needsValue
      ? (op === 'in' || op === 'notin'
          ? fieldForm.condValue.split(',').map(s => s.trim()).filter(Boolean)
          : fieldForm.condValue)
      : undefined;
    return { fieldName: fieldForm.condField, op, value };
  };

  const saveField = async () => {
    if (!fieldForm.rotulo.trim()) {
      toast.error('Rótulo é obrigatório');
      return;
    }

    const nome = editingField?.nome || fieldForm.rotulo
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    const hasOptions = fieldForm.tipo === 'select' || fieldForm.tipo === 'multiselect' || fieldForm.tipo === 'radio';

    const field: CustomFieldDef = {
      id: editingField?.id || generateId(),
      nome,
      rotulo: fieldForm.rotulo.trim(),
      tipo: fieldForm.tipo,
      opcoes: hasOptions ? fieldForm.opcoes.split(',').map((o) => o.trim()).filter(Boolean) : [],
      obrigatorio: fieldForm.obrigatorio,
      ativo: editingField?.ativo ?? true,
      ordem: editingField?.ordem ?? (screenConfig.fields.length + 1) * 10,
      valorPadrao: fieldForm.valorPadrao,
      mostrarListagem: fieldForm.mostrarListagem,
      secao: fieldForm.secao.trim() || undefined,
      helpText: fieldForm.helpText.trim() || undefined,
      validacao: buildValidation(),
      escopo: buildScope(),
      condicao: buildCondition(),
    };

    const newFields = editingField
      ? screenConfig.fields.map((f) => (f.id === editingField.id ? field : f))
      : [...screenConfig.fields, field];

    // Append new field name to orderedNames if missing
    const order = screenConfig.orderedNames || [];
    const newOrder = order.includes(nome) ? order : [...order, nome];

    await save({ ...screenConfig, fields: newFields, orderedNames: newOrder });
    setModalOpen(false);
  };

  const deleteField = async (fieldId: string) => {
    if (!confirm('Excluir este campo personalizado? Os dados já preenchidos serão mantidos no banco.')) return;
    const target = screenConfig.fields.find((f) => f.id === fieldId);
    const newFields = screenConfig.fields.filter((f) => f.id !== fieldId);
    const newOrder = (screenConfig.orderedNames || []).filter((n) => n !== target?.nome);
    await save({ ...screenConfig, fields: newFields, orderedNames: newOrder });
  };

  const toggleCustomActive = async (fieldId: string) => {
    await save({
      ...screenConfig,
      fields: screenConfig.fields.map((f) => (f.id === fieldId ? { ...f, ativo: !f.ativo } : f)),
    });
  };

  // ---------- Native field management ----------
  const toggleNativeHidden = async (fieldName: string) => {
    const hidden = screenConfig.hiddenNative.includes(fieldName)
      ? screenConfig.hiddenNative.filter((n) => n !== fieldName)
      : [...screenConfig.hiddenNative, fieldName];
    await save({ ...screenConfig, hiddenNative: hidden });
  };

  const openRenameNative = (field: { nome: string; rotulo: string }) => {
    setRenameModal({ nome: field.nome, rotulo: screenConfig.labelOverrides[field.nome] || field.rotulo });
  };

  const saveRename = async () => {
    if (!renameModal) return;
    const overrides = { ...screenConfig.labelOverrides, [renameModal.nome]: renameModal.rotulo.trim() };
    // If user clears the rename, remove the override
    if (!renameModal.rotulo.trim()) delete overrides[renameModal.nome];
    await save({ ...screenConfig, labelOverrides: overrides });
    setRenameModal(null);
  };

  // ---------- Helpers for rendering ----------
  const isHiddenForRow = (row: UnifiedRow): boolean => {
    if (row.kind === 'native') return screenConfig.hiddenNative.includes(row.nome);
    return !row.field.ativo;
  };

  const labelForRow = (row: UnifiedRow): string => {
    if (row.kind === 'native') return screenConfig.labelOverrides[row.nome] || row.rotuloOriginal;
    return row.field.rotulo;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Settings2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold font-display text-foreground">Personalizar Campos</h2>
          <p className="text-sm text-muted-foreground">
            Renomeie, reordene (com arrastar ou setas), oculte ou adicione campos. Mudanças refletem em tempo real em todo o sistema.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-medium">Tela</Label>
          <Select value={selectedScreen} onValueChange={(v) => setSelectedScreen(v as ScreenKey)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(SCREEN_LABELS) as ScreenKey[]).map((k) => (
                <SelectItem key={k} value={k}>{SCREEN_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-sm font-medium">Unidade</Label>
          <Select value={selectedUnit} onValueChange={setSelectedUnit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__global__">Global (Todas as unidades)</SelectItem>
              {unidades.filter((u) => u.ativo).map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div>
              <h3 className="font-semibold text-foreground">Campos da Tela</h3>
              <p className="text-xs text-muted-foreground">
                Lista unificada — nativos e personalizados podem ser misturados em qualquer ordem.
              </p>
            </div>
            <Button size="sm" onClick={openAddModal}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar Campo
            </Button>
          </div>

          {unifiedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum campo nessa tela.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={unifiedRows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {unifiedRows.map((row, idx) => (
                    <SortableItem
                      key={row.key}
                      row={row}
                      hidden={isHiddenForRow(row)}
                      effectiveLabel={labelForRow(row)}
                      isRenamed={row.kind === 'native' && !!screenConfig.labelOverrides[row.nome] && screenConfig.labelOverrides[row.nome] !== row.rotuloOriginal}
                      onRename={row.kind === 'native' ? () => openRenameNative({ nome: row.nome, rotulo: row.rotuloOriginal }) : undefined}
                      onToggleHidden={() => row.kind === 'native' ? toggleNativeHidden(row.nome) : toggleCustomActive(row.field.id)}
                      onEditCustom={row.kind === 'custom' ? () => openEditModal(row.field) : undefined}
                      onDeleteCustom={row.kind === 'custom' ? () => deleteField(row.field.id) : undefined}
                      onMoveUp={() => moveByArrow(idx, 'up')}
                      onMoveDown={() => moveByArrow(idx, 'down')}
                      canUp={idx > 0}
                      canDown={idx < unifiedRows.length - 1}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingField ? 'Editar Campo Personalizado' : 'Novo Campo Personalizado'}</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Configure o campo e defina em quais contextos ele será exibido. As mudanças refletem em todas as telas e na impressão/PDF.
            </p>
          </DialogHeader>

          <div className="space-y-5">
            {/* --- Básico --- */}
            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identificação</h4>
              <div>
                <Label>Rótulo (nome exibido)</Label>
                <Input
                  value={fieldForm.rotulo}
                  onChange={(e) => setFieldForm((p) => ({ ...p, rotulo: e.target.value }))}
                  placeholder="Ex: Queixa principal, Escala de dor..."
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Tipo do campo</Label>
                  <Select value={fieldForm.tipo} onValueChange={(v) => setFieldForm((p) => ({ ...p, tipo: v as CustomFieldType }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(FIELD_TYPE_LABELS) as CustomFieldType[]).map((t) => (
                        <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Seção / Agrupador</Label>
                  <Input
                    value={fieldForm.secao}
                    onChange={(e) => setFieldForm((p) => ({ ...p, secao: e.target.value }))}
                    placeholder="Ex: Avaliação Física"
                  />
                </div>
              </div>
              {(fieldForm.tipo === 'select' || fieldForm.tipo === 'multiselect' || fieldForm.tipo === 'radio') && (
                <div>
                  <Label>Opções (separadas por vírgula)</Label>
                  <Input
                    value={fieldForm.opcoes}
                    onChange={(e) => setFieldForm((p) => ({ ...p, opcoes: e.target.value }))}
                    placeholder="Opção 1, Opção 2, Opção 3"
                  />
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Valor padrão</Label>
                  <Input
                    value={fieldForm.valorPadrao}
                    onChange={(e) => setFieldForm((p) => ({ ...p, valorPadrao: e.target.value }))}
                    placeholder="Opcional"
                  />
                </div>
                <div>
                  <Label>Texto de ajuda</Label>
                  <Input
                    value={fieldForm.helpText}
                    onChange={(e) => setFieldForm((p) => ({ ...p, helpText: e.target.value }))}
                    placeholder="Exibido abaixo do campo"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch checked={fieldForm.obrigatorio} onCheckedChange={(v) => setFieldForm((p) => ({ ...p, obrigatorio: v }))} />
                  <Label className="cursor-pointer">Obrigatório</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={fieldForm.mostrarListagem} onCheckedChange={(v) => setFieldForm((p) => ({ ...p, mostrarListagem: v }))} />
                  <Label className="cursor-pointer">Mostrar na listagem</Label>
                </div>
              </div>
            </section>

            {/* --- Escopo --- */}
            <section className="space-y-3 border-t pt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Onde aparece</h4>
              <div className="flex items-center gap-2">
                <Switch
                  checked={fieldForm.scopeGlobal}
                  onCheckedChange={(v) => setFieldForm((p) => ({ ...p, scopeGlobal: v }))}
                />
                <Label className="cursor-pointer">Campo global (todas as especialidades e tipos)</Label>
              </div>
              {!fieldForm.scopeGlobal && (
                <>
                  <div>
                    <Label>Especialidades (separadas por vírgula)</Label>
                    <Input
                      value={fieldForm.especialidades}
                      onChange={(e) => setFieldForm((p) => ({ ...p, especialidades: e.target.value }))}
                      placeholder="Ex: Fisioterapia, Fonoaudiologia"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">Vazio = todas as especialidades.</p>
                  </div>
                  <div>
                    <Label>Tipos de Prontuário</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {TIPOS_PRONTUARIO_PADRAO.map(t => {
                        const checked = fieldForm.tiposProntuario.includes(t);
                        return (
                          <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Switch
                              checked={checked}
                              onCheckedChange={(c) => setFieldForm(p => ({
                                ...p,
                                tiposProntuario: c
                                  ? [...p.tiposProntuario, t]
                                  : p.tiposProntuario.filter(x => x !== t),
                              }))}
                            />
                            {t}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </section>

            {/* --- Validação --- */}
            <section className="space-y-3 border-t pt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Validação</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Mínimo</Label>
                  <Input value={fieldForm.valMin} onChange={e => setFieldForm(p => ({ ...p, valMin: e.target.value }))} placeholder="—" />
                </div>
                <div>
                  <Label className="text-xs">Máximo</Label>
                  <Input value={fieldForm.valMax} onChange={e => setFieldForm(p => ({ ...p, valMax: e.target.value }))} placeholder="—" />
                </div>
                <div>
                  <Label className="text-xs">Máx. caracteres</Label>
                  <Input value={fieldForm.valMaxLength} onChange={e => setFieldForm(p => ({ ...p, valMaxLength: e.target.value }))} placeholder="—" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Máscara (9 = dígito, A = letra)</Label>
                  <Input value={fieldForm.valMask} onChange={e => setFieldForm(p => ({ ...p, valMask: e.target.value }))} placeholder="999.999.999-99" />
                </div>
                <div>
                  <Label className="text-xs">Regex</Label>
                  <Input value={fieldForm.valRegex} onChange={e => setFieldForm(p => ({ ...p, valRegex: e.target.value }))} placeholder="^[A-Z]{2}\\d+$" />
                </div>
              </div>
            </section>

            {/* --- Condicional --- */}
            <section className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Regra Condicional</h4>
                <Switch checked={fieldForm.condEnabled} onCheckedChange={(v) => setFieldForm((p) => ({ ...p, condEnabled: v }))} />
              </div>
              {fieldForm.condEnabled && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Campo de referência</Label>
                    <Input
                      value={fieldForm.condField}
                      onChange={e => setFieldForm(p => ({ ...p, condField: e.target.value }))}
                      placeholder="ex: escala_dor"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Operador</Label>
                    <Select value={fieldForm.condOp} onValueChange={(v) => setFieldForm(p => ({ ...p, condOp: v as CustomFieldCondition['op'] }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CONDITION_OPS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Valor</Label>
                    <Input
                      value={fieldForm.condValue}
                      onChange={e => setFieldForm(p => ({ ...p, condValue: e.target.value }))}
                      placeholder="ex: 5"
                      disabled={fieldForm.condOp === 'empty' || fieldForm.condOp === 'notempty'}
                    />
                  </div>
                </div>
              )}
            </section>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={saveField}>{editingField ? 'Salvar' : 'Adicionar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Modal */}
      <Dialog open={!!renameModal} onOpenChange={() => setRenameModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear Campo</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Novo rótulo (deixe vazio para restaurar o original)</Label>
            <Input
              value={renameModal?.rotulo || ''}
              onChange={(e) => setRenameModal((prev) => (prev ? { ...prev, rotulo: e.target.value } : null))}
            />
            <p className="text-xs text-muted-foreground mt-2">
              O nome do campo no banco não muda — apenas o que aparece na tela.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameModal(null)}>Cancelar</Button>
            <Button onClick={saveRename}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConfigPersonalizarCampos;

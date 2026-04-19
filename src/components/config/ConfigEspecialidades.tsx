import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Plus, Pencil, Trash2, Loader2, ChevronUp, ChevronDown, Eye, Copy, GripVertical, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const CONFIG_KEY = 'config_especialidades_campos';

export type TipoProntuario = 'avaliacao' | 'retorno' | 'sessao' | 'urgencia' | 'procedimento';

const TIPOS_PRONTUARIO: { key: TipoProntuario; label: string; short: string }[] = [
  { key: 'avaliacao', label: 'Avaliação Inicial', short: 'Avaliação' },
  { key: 'retorno', label: 'Retorno', short: 'Retorno' },
  { key: 'sessao', label: 'Sessão', short: 'Sessão' },
  { key: 'urgencia', label: 'Urgência', short: 'Urgência' },
  { key: 'procedimento', label: 'Procedimento', short: 'Procedimento' },
];

const DEFAULT_TIPOS: TipoProntuario[] = ['avaliacao', 'retorno'];

interface CondicaoVisibilidade {
  campo: string;        // key do outro campo
  operador: 'igual' | 'diferente' | 'maior' | 'menor' | 'preenchido';
  valor?: string;
}

export interface CampoEspecialidade {
  id: string;
  key: string;
  label: string;
  tipo: string;          // textarea | text | number | slider | select | date | checkbox
  obrigatorio: boolean;
  habilitado: boolean;
  opcoes?: string[];
  isBuiltin: boolean;
  order: number;
  // Novos campos (todos opcionais para retro-compat)
  tipos_prontuario?: TipoProntuario[];
  ajuda?: string;
  valor_padrao?: string;
  condicao?: CondicaoVisibilidade;
}

export interface EspecialidadeConfig {
  key: string;
  label: string;
  ativa: boolean;
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
  { key: 'servico_social', label: 'Serviço Social', ativa: true, profissoes: ['servico_social', 'assistente_social'],
    campos: [
      { id: 'ss1', key: 'situacao_socioeconomica', label: 'Situação Socioeconômica', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'ss2', key: 'rede_apoio', label: 'Rede de Apoio', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'ss3', key: 'vulnerabilidade', label: 'Vulnerabilidade Social', tipo: 'select', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3, opcoes: ['Baixa', 'Média', 'Alta', 'Extrema'] },
      { id: 'ss4', key: 'encaminhamentos_sociais', label: 'Encaminhamentos Sociais', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4 },
      { id: 'ss5', key: 'parecer_social', label: 'Parecer Social', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 5 },
    ],
  },
  { key: 'cirurgia_geral', label: 'Cirurgia Geral', ativa: true, profissoes: ['cirurgia_geral', 'cirurgiao'],
    campos: [
      { id: 'cg1', key: 'indicacao_cirurgica', label: 'Indicação Cirúrgica', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'cg2', key: 'avaliacao_preop', label: 'Avaliação Pré-operatória', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'cg3', key: 'descricao_procedimento', label: 'Descrição do Procedimento', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
      { id: 'cg4', key: 'orientacoes_posop', label: 'Orientações Pós-operatórias', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4 },
    ],
  },
  { key: 'infectologia', label: 'Infectologia', ativa: true, profissoes: ['infectologia', 'infectologista'],
    campos: [
      { id: 'inf1', key: 'agente_infeccioso', label: 'Agente Infeccioso / Suspeita', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 1 },
      { id: 'inf2', key: 'exames_lab', label: 'Exames Laboratoriais', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 2 },
      { id: 'inf3', key: 'esquema_terapeutico', label: 'Esquema Terapêutico', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 3 },
      { id: 'inf4', key: 'medidas_controle', label: 'Medidas de Controle', tipo: 'textarea', obrigatorio: false, habilitado: true, isBuiltin: true, order: 4 },
    ],
  },
];

const PROFISSOES = ['fisioterapia', 'psicologia', 'fonoaudiologia', 'nutricao', 'terapia_ocupacional', 'medicina', 'odontologia', 'enfermagem', 'servico_social', 'assistente_social', 'cirurgia_geral', 'cirurgiao', 'infectologia', 'infectologista'];

// Garantir que campos antigos tenham os defaults (Avaliação + Retorno)
const normalizeCampo = (c: CampoEspecialidade): CampoEspecialidade => ({
  ...c,
  tipos_prontuario: c.tipos_prontuario && c.tipos_prontuario.length > 0 ? c.tipos_prontuario : [...DEFAULT_TIPOS],
});

const normalizeEspecialidade = (e: EspecialidadeConfig): EspecialidadeConfig => ({
  ...e,
  campos: e.campos.map(normalizeCampo),
});

// ---------- Sortable item ----------
interface SortableCampoProps {
  campo: CampoEspecialidade;
  onToggleHabilitado: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

const SortableCampo: React.FC<SortableCampoProps> = ({
  campo, onToggleHabilitado, onEdit, onDelete, onCopy, onMoveUp, onMoveDown, isFirst, isLast,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: campo.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const tipos = campo.tipos_prontuario || DEFAULT_TIPOS;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 p-3 rounded-lg border ${campo.habilitado ? 'bg-background border-border' : 'bg-muted/50 border-border/50 opacity-60'}`}
    >
      <button
        type="button"
        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground mt-1"
        {...attributes}
        {...listeners}
        aria-label="Arrastar"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div className="flex flex-col gap-0.5">
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onMoveUp} disabled={isFirst} aria-label="Subir">
          <ChevronUp className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onMoveDown} disabled={isLast} aria-label="Descer">
          <ChevronDown className="w-3 h-3" />
        </Button>
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{campo.label}</div>
        <div className="flex flex-wrap items-center gap-1 mt-1">
          <span className="text-[10px] text-muted-foreground capitalize">{campo.tipo}</span>
          {campo.obrigatorio && <Badge variant="outline" className="text-[9px] h-4 px-1">Obrigatório</Badge>}
          {campo.condicao && <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-500/40 text-amber-600">Condicional</Badge>}
          {tipos.map(t => (
            <Badge key={t} variant="secondary" className="text-[9px] h-4 px-1">
              {TIPOS_PRONTUARIO.find(x => x.key === t)?.short || t}
            </Badge>
          ))}
        </div>
        {campo.ajuda && (
          <p className="text-[10px] text-muted-foreground italic mt-1 truncate">💡 {campo.ajuda}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="Editar">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCopy} title="Copiar para outra especialidade">
          <Copy className="w-3.5 h-3.5" />
        </Button>
        <Switch checked={campo.habilitado} onCheckedChange={onToggleHabilitado} />
        {!campo.isBuiltin && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70" onClick={onDelete} title="Excluir">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
};

// ---------- Main component ----------
const ConfigEspecialidades: React.FC = () => {
  const [especialidades, setEspecialidades] = useState<EspecialidadeConfig[]>(DEFAULT_ESPECIALIDADES);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState('fisioterapia');
  const [addFieldDialog, setAddFieldDialog] = useState(false);
  const [addEspDialog, setAddEspDialog] = useState(false);
  const [editingCampo, setEditingCampo] = useState<CampoEspecialidade | null>(null);
  const [copyDialog, setCopyDialog] = useState<{ campo: CampoEspecialidade; targets: string[] } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTipo, setPreviewTipo] = useState<TipoProntuario>('avaliacao');
  const [newField, setNewField] = useState({ label: '', tipo: 'textarea', obrigatorio: false, opcoes: '' });
  const [newEsp, setNewEsp] = useState({ label: '', profissoes: [] as string[] });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const loadConfig = useCallback(async () => {
    const { data } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
    const cfg = data?.configuracoes as any;
    if (cfg?.[CONFIG_KEY]) {
      const stored: EspecialidadeConfig[] = cfg[CONFIG_KEY];
      setEspecialidades(stored.map(normalizeEspecialidade));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadConfig();
    // Realtime sync
    const channel = supabase
      .channel('config_especialidades_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_config', filter: 'id=eq.default' },
        () => loadConfig(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadConfig]);

  const save = async (updated: EspecialidadeConfig[], silent = false) => {
    const { data: existing } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
    const existingConfig = (existing?.configuracoes as any) || {};
    await supabase.from('system_config').upsert({
      id: 'default',
      configuracoes: { ...existingConfig, [CONFIG_KEY]: updated },
      updated_at: new Date().toISOString(),
    });
    setEspecialidades(updated);
    if (!silent) toast.success('Configuração salva');
  };

  const esp = especialidades.find(e => e.key === selected);
  const camposOrdenados = useMemo(
    () => esp ? [...esp.campos].sort((a, b) => a.order - b.order) : [],
    [esp],
  );

  const updateEsp = (mutator: (e: EspecialidadeConfig) => EspecialidadeConfig) => {
    const updated = especialidades.map(e => e.key === selected ? mutator(e) : e);
    save(updated);
  };

  const toggleCampo = (campoId: string) => {
    updateEsp(e => ({ ...e, campos: e.campos.map(c => c.id === campoId ? { ...c, habilitado: !c.habilitado } : c) }));
  };

  const reorderCampos = (newOrderIds: string[]) => {
    if (!esp) return;
    const map = new Map(esp.campos.map(c => [c.id, c]));
    const reordered = newOrderIds
      .map((id, idx) => { const c = map.get(id); return c ? { ...c, order: idx + 1 } : null; })
      .filter(Boolean) as CampoEspecialidade[];
    updateEsp(e => ({ ...e, campos: reordered }));
  };

  const moveCampo = (campoId: string, direction: -1 | 1) => {
    const ids = camposOrdenados.map(c => c.id);
    const idx = ids.indexOf(campoId);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= ids.length) return;
    const reordered = arrayMove(ids, idx, newIdx);
    reorderCampos(reordered);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = camposOrdenados.map(c => c.id);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    reorderCampos(arrayMove(ids, oldIdx, newIdx));
  };

  const saveEditedCampo = (updated: CampoEspecialidade) => {
    updateEsp(e => ({ ...e, campos: e.campos.map(c => c.id === updated.id ? updated : c) }));
    setEditingCampo(null);
  };

  const addCampoEsp = () => {
    if (!newField.label.trim() || !esp) return;
    const campo: CampoEspecialidade = {
      id: `custom_${Date.now()}`,
      key: `custom_${Date.now()}`,
      label: newField.label.trim(),
      tipo: newField.tipo,
      obrigatorio: newField.obrigatorio,
      habilitado: true,
      isBuiltin: false,
      order: esp.campos.length + 1,
      tipos_prontuario: [...DEFAULT_TIPOS],
      opcoes: newField.tipo === 'select' ? newField.opcoes.split(',').map(o => o.trim()).filter(Boolean) : undefined,
    };
    updateEsp(e => ({ ...e, campos: [...e.campos, campo] }));
    setAddFieldDialog(false);
    setNewField({ label: '', tipo: 'textarea', obrigatorio: false, opcoes: '' });
  };

  const deleteCampo = (campoId: string) => {
    const campo = esp?.campos.find(c => c.id === campoId);
    if (!campo || campo.isBuiltin) return;
    updateEsp(e => ({ ...e, campos: e.campos.filter(c => c.id !== campoId) }));
  };

  const copyCampoToEspecialidades = (campo: CampoEspecialidade, targets: string[]) => {
    if (targets.length === 0) return;
    const updated = especialidades.map(e => {
      if (!targets.includes(e.key)) return e;
      const newId = `copy_${campo.key}_${Date.now()}`;
      const novo: CampoEspecialidade = {
        ...campo,
        id: newId,
        key: newId,
        isBuiltin: false,
        order: e.campos.length + 1,
      };
      return { ...e, campos: [...e.campos, novo] };
    });
    save(updated);
    setCopyDialog(null);
    toast.success(`Campo copiado para ${targets.length} especialidade(s)`);
  };

  const addNovaEspecialidade = () => {
    if (!newEsp.label.trim()) return;
    const key = newEsp.label.toLowerCase().replace(/\s+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const nova: EspecialidadeConfig = {
      key, label: newEsp.label.trim(), ativa: true,
      profissoes: newEsp.profissoes, campos: [],
    };
    save([...especialidades, nova]);
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
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="font-semibold font-display text-foreground">Campos por Especialidade</h3>
            <div className="flex gap-2">
              {esp && (
                <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
                  <Eye className="w-4 h-4 mr-1" /> Visualizar Prontuário
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setAddEspDialog(true)}>
                <Plus className="w-4 h-4 mr-1" /> Nova Especialidade
              </Button>
            </div>
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
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg mb-4 flex-wrap gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{esp.label}</span>
                  <p className="text-[10px] text-muted-foreground truncate">Profissões: {esp.profissoes.join(', ')}</p>
                </div>
                <Switch checked={esp.ativa} onCheckedChange={() => toggleEspAtiva(esp.key)} />
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={camposOrdenados.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {camposOrdenados.map((campo, idx) => (
                      <SortableCampo
                        key={campo.id}
                        campo={campo}
                        onToggleHabilitado={() => toggleCampo(campo.id)}
                        onEdit={() => setEditingCampo(campo)}
                        onDelete={() => deleteCampo(campo.id)}
                        onCopy={() => setCopyDialog({ campo, targets: [] })}
                        onMoveUp={() => moveCampo(campo.id, -1)}
                        onMoveDown={() => moveCampo(campo.id, 1)}
                        isFirst={idx === 0}
                        isLast={idx === camposOrdenados.length - 1}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

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
                  <SelectItem value="slider">Slider (0-10)</SelectItem>
                  <SelectItem value="select">Seleção</SelectItem>
                  <SelectItem value="date">Data</SelectItem>
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

      {/* Edit field dialog */}
      <EditCampoDialog
        campo={editingCampo}
        outrosCampos={esp?.campos.filter(c => c.id !== editingCampo?.id) || []}
        onClose={() => setEditingCampo(null)}
        onSave={saveEditedCampo}
      />

      {/* Copy field dialog */}
      <Dialog open={!!copyDialog} onOpenChange={(o) => !o && setCopyDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copiar campo para outras especialidades</DialogTitle>
            <DialogDescription>Selecione as especialidades que devem receber uma cópia de "{copyDialog?.campo.label}".</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {especialidades.filter(e => e.key !== selected).map(e => (
              <div key={e.key} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50">
                <Checkbox
                  checked={copyDialog?.targets.includes(e.key) || false}
                  onCheckedChange={(v) => {
                    if (!copyDialog) return;
                    setCopyDialog({
                      ...copyDialog,
                      targets: v ? [...copyDialog.targets, e.key] : copyDialog.targets.filter(x => x !== e.key),
                    });
                  }}
                />
                <span className="text-sm">{e.label}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialog(null)}>Cancelar</Button>
            <Button
              disabled={!copyDialog?.targets.length}
              onClick={() => copyDialog && copyCampoToEspecialidades(copyDialog.campo, copyDialog.targets)}
            >
              Copiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Preview — {esp?.label}</DialogTitle>
            <DialogDescription>Como ficará o prontuário para esta especialidade no tipo selecionado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {TIPOS_PRONTUARIO.map(t => (
                <Button
                  key={t.key}
                  size="sm"
                  variant={previewTipo === t.key ? 'default' : 'outline'}
                  onClick={() => setPreviewTipo(t.key)}
                >
                  {t.short}
                </Button>
              ))}
            </div>
            <PreviewCampos campos={camposOrdenados} tipo={previewTipo} />
          </div>
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

// ---------- Edit dialog ----------
interface EditCampoDialogProps {
  campo: CampoEspecialidade | null;
  outrosCampos: CampoEspecialidade[];
  onClose: () => void;
  onSave: (c: CampoEspecialidade) => void;
}

const EditCampoDialog: React.FC<EditCampoDialogProps> = ({ campo, outrosCampos, onClose, onSave }) => {
  const [draft, setDraft] = useState<CampoEspecialidade | null>(null);

  useEffect(() => {
    if (campo) setDraft({ ...campo, tipos_prontuario: campo.tipos_prontuario || [...DEFAULT_TIPOS] });
    else setDraft(null);
  }, [campo]);

  if (!draft) return null;

  const toggleTipo = (t: TipoProntuario) => {
    const cur = draft.tipos_prontuario || [];
    setDraft({
      ...draft,
      tipos_prontuario: cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t],
    });
  };

  const setCondicao = (cond: CondicaoVisibilidade | undefined) => {
    setDraft({ ...draft, condicao: cond });
  };

  return (
    <Dialog open={!!campo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar campo</DialogTitle>
          <DialogDescription>Altere as propriedades deste campo. Mudanças refletem em tempo real no prontuário.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Label exibido no prontuário</Label>
            <Input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={draft.tipo} onValueChange={(v) => setDraft({ ...draft, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="textarea">Texto longo</SelectItem>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="number">Número</SelectItem>
                  <SelectItem value="slider">Slider (0-10)</SelectItem>
                  <SelectItem value="select">Seleção</SelectItem>
                  <SelectItem value="date">Data</SelectItem>
                  <SelectItem value="checkbox">Checkbox</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Switch checked={draft.obrigatorio} onCheckedChange={(v) => setDraft({ ...draft, obrigatorio: v })} />
              <Label>Obrigatório</Label>
            </div>
          </div>

          {draft.tipo === 'select' && (
            <div>
              <Label>Opções (vírgula)</Label>
              <Input
                value={(draft.opcoes || []).join(', ')}
                onChange={e => setDraft({ ...draft, opcoes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              />
            </div>
          )}

          <div>
            <Label>Valor padrão (opcional)</Label>
            <Input value={draft.valor_padrao || ''} onChange={e => setDraft({ ...draft, valor_padrao: e.target.value })} />
          </div>

          <div>
            <Label>Texto de ajuda (aparece abaixo do campo)</Label>
            <Textarea
              rows={2}
              value={draft.ajuda || ''}
              onChange={e => setDraft({ ...draft, ajuda: e.target.value })}
              placeholder="Ex: Use a escala MRC de 0 a 5."
            />
          </div>

          <div>
            <Label className="mb-1 block">Aparece em quais tipos de prontuário</Label>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_PRONTUARIO.map(t => (
                <label key={t.key} className="flex items-center gap-2 p-2 rounded border bg-muted/30 cursor-pointer">
                  <Checkbox
                    checked={(draft.tipos_prontuario || []).includes(t.key)}
                    onCheckedChange={() => toggleTipo(t.key)}
                  />
                  <span className="text-sm">{t.label}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Por padrão: Avaliação Inicial e Retorno.
            </p>
          </div>

          {/* Campo condicional */}
          <div className="rounded-lg border p-3 bg-muted/20 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Visibilidade condicional (opcional)</Label>
              <Switch
                checked={!!draft.condicao}
                onCheckedChange={(v) => setCondicao(v ? { campo: outrosCampos[0]?.key || '', operador: 'preenchido' } : undefined)}
              />
            </div>
            {draft.condicao && (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">Mostrar este campo apenas se:</p>
                <div className="grid grid-cols-3 gap-2">
                  <Select
                    value={draft.condicao.campo}
                    onValueChange={(v) => setCondicao({ ...draft.condicao!, campo: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Campo" /></SelectTrigger>
                    <SelectContent>
                      {outrosCampos.map(c => (
                        <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={draft.condicao.operador}
                    onValueChange={(v: any) => setCondicao({ ...draft.condicao!, operador: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preenchido">estiver preenchido</SelectItem>
                      <SelectItem value="igual">for igual a</SelectItem>
                      <SelectItem value="diferente">for diferente de</SelectItem>
                      <SelectItem value="maior">for maior que</SelectItem>
                      <SelectItem value="menor">for menor que</SelectItem>
                    </SelectContent>
                  </Select>
                  {draft.condicao.operador !== 'preenchido' && (
                    <Input
                      placeholder="Valor"
                      value={draft.condicao.valor || ''}
                      onChange={e => setCondicao({ ...draft.condicao!, valor: e.target.value })}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(draft)} disabled={!draft.label.trim()}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Preview ----------
const PreviewCampos: React.FC<{ campos: CampoEspecialidade[]; tipo: TipoProntuario }> = ({ campos, tipo }) => {
  const visiveis = campos
    .filter(c => c.habilitado && (c.tipos_prontuario || DEFAULT_TIPOS).includes(tipo))
    .sort((a, b) => a.order - b.order);

  if (visiveis.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic p-6 text-center border border-dashed rounded-lg">
        Nenhum campo habilitado para este tipo de prontuário.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 rounded-lg border bg-background">
      {visiveis.map(c => (
        <div key={c.id} className="space-y-1">
          <Label>
            {c.label}
            {c.obrigatorio && <span className="text-destructive ml-1">*</span>}
          </Label>
          {c.tipo === 'textarea' && <Textarea rows={2} disabled placeholder={c.valor_padrao} />}
          {c.tipo === 'text' && <Input disabled placeholder={c.valor_padrao} />}
          {c.tipo === 'number' && <Input type="number" disabled placeholder={c.valor_padrao} />}
          {c.tipo === 'date' && <Input type="date" disabled />}
          {c.tipo === 'slider' && <Slider disabled value={[0]} min={0} max={10} step={1} />}
          {c.tipo === 'checkbox' && <Checkbox disabled />}
          {c.tipo === 'select' && (
            <Select disabled>
              <SelectTrigger><SelectValue placeholder={c.valor_padrao || 'Selecione...'} /></SelectTrigger>
              <SelectContent>{(c.opcoes || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {c.ajuda && <p className="text-[11px] text-muted-foreground italic">💡 {c.ajuda}</p>}
          {c.condicao && (
            <p className="text-[10px] text-amber-600">↳ visível só se "{c.condicao.campo}" {c.condicao.operador} {c.condicao.valor || ''}</p>
          )}
        </div>
      ))}
    </div>
  );
};

export default ConfigEspecialidades;

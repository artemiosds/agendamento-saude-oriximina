import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, GripVertical, Settings2, Type,
  Hash, Calendar, CheckSquare, List, AlignLeft, ArrowUp, ArrowDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '@/contexts/DataContext';
import {
  useCustomFields,
  CustomFieldDef,
  CustomFieldType,
  ScreenKey,
  SCREEN_LABELS,
  ScreenConfig,
} from '@/hooks/useCustomFields';

// Native fields per screen (cannot be deleted, only hidden/renamed)
const NATIVE_FIELDS: Record<ScreenKey, { nome: string; rotulo: string }[]> = {
  paciente: [
    { nome: 'nome', rotulo: 'Nome' },
    { nome: 'dataNascimento', rotulo: 'Data de Nascimento' },
    { nome: 'cpf', rotulo: 'CPF' },
    { nome: 'cns', rotulo: 'CNS' },
    { nome: 'telefone', rotulo: 'Telefone' },
    { nome: 'email', rotulo: 'E-mail' },
    { nome: 'endereco', rotulo: 'Endereço' },
    { nome: 'municipio', rotulo: 'Município' },
    { nome: 'nomeMae', rotulo: 'Nome da Mãe' },
    { nome: 'observacoes', rotulo: 'Observações' },
    { nome: 'isGestante', rotulo: 'Gestante' },
    { nome: 'isPne', rotulo: 'PNE' },
    { nome: 'isAutista', rotulo: 'Autista (TEA)' },
  ],
  agendamento: [
    { nome: 'pacienteNome', rotulo: 'Paciente' },
    { nome: 'profissionalNome', rotulo: 'Profissional' },
    { nome: 'data', rotulo: 'Data' },
    { nome: 'hora', rotulo: 'Hora' },
    { nome: 'tipo', rotulo: 'Tipo' },
    { nome: 'observacoes', rotulo: 'Observações' },
  ],
  gestao_tratamento: [
    { nome: 'specialty', rotulo: 'Especialidade' },
    { nome: 'frequency', rotulo: 'Frequência' },
    { nome: 'total_sessions', rotulo: 'Total de Sessões' },
    { nome: 'clinical_notes', rotulo: 'Notas Clínicas' },
  ],
  pts: [
    { nome: 'diagnostico_funcional', rotulo: 'Diagnóstico Funcional' },
    { nome: 'objetivos_terapeuticos', rotulo: 'Objetivos Terapêuticos' },
    { nome: 'metas_curto_prazo', rotulo: 'Metas Curto Prazo' },
    { nome: 'metas_medio_prazo', rotulo: 'Metas Médio Prazo' },
    { nome: 'metas_longo_prazo', rotulo: 'Metas Longo Prazo' },
  ],
  relatorio_multiprof: [
    { nome: 'clinical_evaluation', rotulo: 'Avaliação Clínica' },
    { nome: 'parecer', rotulo: 'Parecer' },
    { nome: 'observations', rotulo: 'Observações' },
  ],
  relatorio_alta: [
    { nome: 'reason', rotulo: 'Motivo da Alta' },
    { nome: 'final_notes', rotulo: 'Notas Finais' },
  ],
  funcionario: [
    { nome: 'nome', rotulo: 'Nome' },
    { nome: 'email', rotulo: 'E-mail' },
    { nome: 'cpf', rotulo: 'CPF' },
    { nome: 'usuario', rotulo: 'Usuário' },
    { nome: 'profissao', rotulo: 'Profissão' },
    { nome: 'cargo', rotulo: 'Cargo' },
    { nome: 'setor', rotulo: 'Setor' },
    { nome: 'tipo_conselho', rotulo: 'Tipo de Conselho' },
    { nome: 'numero_conselho', rotulo: 'Nº do Conselho' },
    { nome: 'uf_conselho', rotulo: 'UF do Conselho' },
    { nome: 'tempo_atendimento', rotulo: 'Tempo de Atendimento' },
  ],
  unidade: [
    { nome: 'nome', rotulo: 'Nome' },
    { nome: 'endereco', rotulo: 'Endereço' },
    { nome: 'telefone', rotulo: 'Telefone' },
    { nome: 'whatsapp', rotulo: 'WhatsApp' },
  ],
  triagem: [
    { nome: 'peso', rotulo: 'Peso' },
    { nome: 'altura', rotulo: 'Altura' },
    { nome: 'pressaoArterial', rotulo: 'Pressão Arterial' },
    { nome: 'temperatura', rotulo: 'Temperatura' },
    { nome: 'frequenciaCardiaca', rotulo: 'Frequência Cardíaca' },
    { nome: 'saturacaoOxigenio', rotulo: 'Saturação de Oxigênio' },
    { nome: 'glicemia', rotulo: 'Glicemia' },
    { nome: 'queixaPrincipal', rotulo: 'Queixa Principal' },
    { nome: 'classificacaoRisco', rotulo: 'Classificação de Risco' },
  ],
  prontuario: [
    { nome: 'soap_subjetivo', rotulo: 'Subjetivo (S)' },
    { nome: 'soap_objetivo', rotulo: 'Objetivo (O)' },
    { nome: 'soap_avaliacao', rotulo: 'Avaliação (A)' },
    { nome: 'soap_plano', rotulo: 'Plano (P)' },
    { nome: 'evolucao', rotulo: 'Evolução' },
    { nome: 'queixa_principal', rotulo: 'Queixa Principal' },
    { nome: 'anamnese', rotulo: 'Anamnese' },
    { nome: 'exame_fisico', rotulo: 'Exame Físico' },
    { nome: 'hipotese', rotulo: 'Hipótese' },
    { nome: 'conduta', rotulo: 'Conduta' },
    { nome: 'prescricao', rotulo: 'Prescrição' },
    { nome: 'observacoes', rotulo: 'Observações' },
  ],
  encaminhamento: [
    { nome: 'profissionalDestino', rotulo: 'Profissional de Destino' },
    { nome: 'especialidadeDestino', rotulo: 'Especialidade de Destino' },
    { nome: 'motivo', rotulo: 'Motivo' },
    { nome: 'observacoes', rotulo: 'Observações' },
  ],
  fila_espera: [
    { nome: 'pacienteNome', rotulo: 'Paciente' },
    { nome: 'prioridade', rotulo: 'Prioridade' },
    { nome: 'setor', rotulo: 'Setor' },
    { nome: 'especialidadeDestino', rotulo: 'Especialidade' },
    { nome: 'descricaoClinica', rotulo: 'Descrição Clínica' },
    { nome: 'observacoes', rotulo: 'Observações' },
  ],
  atendimento: [
    { nome: 'pacienteNome', rotulo: 'Paciente' },
    { nome: 'profissionalNome', rotulo: 'Profissional' },
    { nome: 'procedimento', rotulo: 'Procedimento' },
    { nome: 'observacoes', rotulo: 'Observações' },
  ],
};

const FIELD_TYPE_LABELS: Record<CustomFieldType, { label: string; icon: React.ElementType }> = {
  text: { label: 'Texto', icon: Type },
  number: { label: 'Número', icon: Hash },
  date: { label: 'Data', icon: Calendar },
  checkbox: { label: 'Checkbox', icon: CheckSquare },
  select: { label: 'Seleção', icon: List },
  textarea: { label: 'Texto Longo', icon: AlignLeft },
};

const generateId = () => `cf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const ConfigPersonalizarCampos: React.FC = () => {
  const { unidades } = useData();
  const { getRawScreenConfig, updateScreenConfig, loading } = useCustomFields();

  const [selectedScreen, setSelectedScreen] = useState<ScreenKey>('paciente');
  const [selectedUnit, setSelectedUnit] = useState<string>('__global__');
  const [screenConfig, setScreenConfig] = useState<ScreenConfig>({ fields: [], hiddenNative: [], labelOverrides: {} });

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDef | null>(null);
  const [renameModal, setRenameModal] = useState<{ nome: string; rotulo: string } | null>(null);

  // Field form
  const [fieldForm, setFieldForm] = useState({
    rotulo: '',
    tipo: 'text' as CustomFieldType,
    obrigatorio: false,
    opcoes: '',
    valorPadrao: '',
    mostrarListagem: false,
  });

  // Load config when screen/unit changes
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

  // Add/Edit field
  const openAddModal = () => {
    setEditingField(null);
    setFieldForm({ rotulo: '', tipo: 'text', obrigatorio: false, opcoes: '', valorPadrao: '', mostrarListagem: false });
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
    });
    setModalOpen(true);
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

    const field: CustomFieldDef = {
      id: editingField?.id || generateId(),
      nome,
      rotulo: fieldForm.rotulo.trim(),
      tipo: fieldForm.tipo,
      opcoes: fieldForm.tipo === 'select' ? fieldForm.opcoes.split(',').map(o => o.trim()).filter(Boolean) : [],
      obrigatorio: fieldForm.obrigatorio,
      ativo: editingField?.ativo ?? true,
      ordem: editingField?.ordem ?? (screenConfig.fields.length + 1) * 10,
      valorPadrao: fieldForm.valorPadrao,
      mostrarListagem: fieldForm.mostrarListagem,
    };

    const newFields = editingField
      ? screenConfig.fields.map(f => f.id === editingField.id ? field : f)
      : [...screenConfig.fields, field];

    await save({ ...screenConfig, fields: newFields });
    setModalOpen(false);
  };

  const deleteField = async (fieldId: string) => {
    if (!confirm('Excluir este campo personalizado? Os dados já preenchidos serão mantidos.')) return;
    await save({ ...screenConfig, fields: screenConfig.fields.filter(f => f.id !== fieldId) });
  };

  const toggleFieldActive = async (fieldId: string) => {
    await save({
      ...screenConfig,
      fields: screenConfig.fields.map(f => f.id === fieldId ? { ...f, ativo: !f.ativo } : f),
    });
  };

  const moveField = async (idx: number, direction: 'up' | 'down') => {
    const fields = [...screenConfig.fields];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= fields.length) return;
    [fields[idx], fields[swapIdx]] = [fields[swapIdx], fields[idx]];
    fields.forEach((f, i) => f.ordem = (i + 1) * 10);
    await save({ ...screenConfig, fields });
  };

  // Native field management
  const toggleNativeHidden = async (fieldName: string) => {
    const hidden = screenConfig.hiddenNative.includes(fieldName)
      ? screenConfig.hiddenNative.filter(n => n !== fieldName)
      : [...screenConfig.hiddenNative, fieldName];
    await save({ ...screenConfig, hiddenNative: hidden });
  };

  const openRenameNative = (field: { nome: string; rotulo: string }) => {
    setRenameModal({ nome: field.nome, rotulo: screenConfig.labelOverrides[field.nome] || field.rotulo });
  };

  const saveRename = async () => {
    if (!renameModal) return;
    const overrides = { ...screenConfig.labelOverrides, [renameModal.nome]: renameModal.rotulo };
    await save({ ...screenConfig, labelOverrides: overrides });
    setRenameModal(null);
  };

  const nativeFields = NATIVE_FIELDS[selectedScreen] || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Settings2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold font-display text-foreground">Personalizar Campos</h2>
          <p className="text-sm text-muted-foreground">Adicione, oculte e renomeie campos em qualquer tela do sistema</p>
        </div>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-medium">Tela</Label>
          <Select value={selectedScreen} onValueChange={v => setSelectedScreen(v as ScreenKey)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(SCREEN_LABELS) as ScreenKey[]).map(k => (
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
              {unidades.filter(u => u.ativo).map(u => (
                <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Native Fields */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <h3 className="font-semibold text-foreground mb-3">Campos Nativos</h3>
          <p className="text-xs text-muted-foreground mb-3">Campos do sistema que não podem ser excluídos, mas podem ser ocultados ou renomeados.</p>
          <div className="space-y-2">
            {nativeFields.map(nf => {
              const isHidden = screenConfig.hiddenNative.includes(nf.nome);
              const overriddenLabel = screenConfig.labelOverrides[nf.nome];
              return (
                <div key={nf.nome} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${isHidden ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {overriddenLabel || nf.rotulo}
                    </span>
                    {overriddenLabel && overriddenLabel !== nf.rotulo && (
                      <Badge variant="outline" className="text-xs">Renomeado</Badge>
                    )}
                    {isHidden && <Badge variant="secondary" className="text-xs">Oculto</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openRenameNative(nf)} title="Renomear">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleNativeHidden(nf.nome)} title={isHidden ? 'Mostrar' : 'Ocultar'}>
                      {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Custom Fields */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-foreground">Campos Personalizados</h3>
              <p className="text-xs text-muted-foreground">Campos criados pelo Master para essa tela e unidade.</p>
            </div>
            <Button size="sm" onClick={openAddModal}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar Campo
            </Button>
          </div>

          {screenConfig.fields.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum campo personalizado criado ainda.</p>
          ) : (
            <div className="space-y-2">
              {screenConfig.fields.map((field, idx) => {
                const TypeIcon = FIELD_TYPE_LABELS[field.tipo]?.icon || Type;
                return (
                  <div key={field.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                      <TypeIcon className="w-4 h-4 text-primary" />
                      <div>
                        <span className={`text-sm font-medium ${!field.ativo ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {field.rotulo}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {FIELD_TYPE_LABELS[field.tipo]?.label}
                        </span>
                      </div>
                      {field.obrigatorio && <Badge variant="destructive" className="text-[10px] px-1.5">Obrigatório</Badge>}
                      {!field.ativo && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveField(idx, 'up')} disabled={idx === 0}>
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveField(idx, 'down')} disabled={idx === screenConfig.fields.length - 1}>
                        <ArrowDown className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditModal(field)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleFieldActive(field.id)}>
                        {field.ativo ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteField(field.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingField ? 'Editar Campo' : 'Adicionar Campo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Rótulo (nome exibido)</Label>
              <Input
                value={fieldForm.rotulo}
                onChange={e => setFieldForm(p => ({ ...p, rotulo: e.target.value }))}
                placeholder="Ex: Nome do acompanhante"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={fieldForm.tipo} onValueChange={v => setFieldForm(p => ({ ...p, tipo: v as CustomFieldType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(FIELD_TYPE_LABELS) as CustomFieldType[]).map(t => (
                    <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {fieldForm.tipo === 'select' && (
              <div>
                <Label>Opções (separadas por vírgula)</Label>
                <Input
                  value={fieldForm.opcoes}
                  onChange={e => setFieldForm(p => ({ ...p, opcoes: e.target.value }))}
                  placeholder="Opção 1, Opção 2, Opção 3"
                />
              </div>
            )}
            <div>
              <Label>Valor padrão</Label>
              <Input
                value={fieldForm.valorPadrao}
                onChange={e => setFieldForm(p => ({ ...p, valorPadrao: e.target.value }))}
                placeholder="Deixe vazio se não houver"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Obrigatório?</Label>
              <Switch checked={fieldForm.obrigatorio} onCheckedChange={v => setFieldForm(p => ({ ...p, obrigatorio: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Mostrar na listagem?</Label>
              <Switch checked={fieldForm.mostrarListagem} onCheckedChange={v => setFieldForm(p => ({ ...p, mostrarListagem: v }))} />
            </div>
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
            <Label>Novo rótulo</Label>
            <Input
              value={renameModal?.rotulo || ''}
              onChange={e => setRenameModal(prev => prev ? { ...prev, rotulo: e.target.value } : null)}
            />
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

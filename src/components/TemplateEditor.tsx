import React, { useEffect, useMemo, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Mark, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Bold, Italic, UnderlineIcon, Heading1, Heading2, Heading3,
  List, ListOrdered, Table as TableIcon, Plus, Save, Eye, X,
  Type, Calendar, CheckSquare, ShieldQuestion, Trash2, Pencil, FileText, Loader2,
} from 'lucide-react';

// -------- Types --------
type Categoria = 'Cadastro' | 'Clínico' | 'Regulação' | 'CER';
const CATEGORIAS: Categoria[] = ['Cadastro', 'Clínico', 'Regulação', 'CER'];

const PACIENTE_VARS = [
  { key: 'nome_paciente', label: 'Nome do paciente' },
  { key: 'cpf', label: 'CPF' },
  { key: 'cid', label: 'CID' },
  { key: 'cartao_sus', label: 'Cartão SUS' },
  { key: 'endereco', label: 'Endereço' },
  { key: 'bairro', label: 'Bairro' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'data_nascimento', label: 'Data de nascimento' },
  { key: 'nome_mae', label: 'Nome da mãe' },
];

const SISTEMA_VARS = [
  { key: 'data_atual', label: 'Data atual' },
  { key: 'profissional_logado', label: 'Profissional logado' },
  { key: 'nome_unidade', label: 'Nome da unidade' },
];

const PREVIEW_VALUES: Record<string, string> = {
  nome_paciente: 'Maria Silva (exemplo)',
  cpf: '000.000.000-00',
  cid: 'F32.0',
  cartao_sus: '000 0000 0000 0000',
  endereco: 'Rua Exemplo, 123',
  bairro: 'Centro',
  telefone: '(93) 90000-0000',
  data_nascimento: '01/01/2000',
  nome_mae: 'Ana Silva',
  data_atual: new Date().toLocaleDateString('pt-BR'),
  profissional_logado: 'Dr. Exemplo',
  nome_unidade: 'Unidade Exemplo',
};

interface ManualField {
  key: string;
  label: string;
  type: 'texto' | 'checkbox' | 'data';
  options?: string[];
}

interface CondicaoOption { value: string; label: string; }
const CONDITIONS: CondicaoOption[] = [
  { value: 'menor_18', label: 'Somente se paciente for menor de 18 anos' },
  { value: 'tem_cid', label: 'Somente se paciente tiver CID preenchido' },
];

interface TemplateRow {
  id: string;
  nome: string;
  tipo: string;
  conteudo: string;
  ativo: boolean;
  blocos_clinicos: any;
}

// -------- TipTap custom marks --------
const VariableMark = Mark.create({
  name: 'templateVariable',
  inclusive: false,
  addAttributes() {
    return { 'data-var': { default: null } };
  },
  parseHTML() { return [{ tag: 'span[data-var]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'tpl-var' }), 0];
  },
});

const ConditionalMark = Mark.create({
  name: 'conditionalBlock',
  inclusive: false,
  addAttributes() {
    return { 'data-cond': { default: null } };
  },
  parseHTML() { return [{ tag: 'span[data-cond]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'tpl-cond' }), 0];
  },
});

// -------- Editor Panel --------
interface EditorPanelProps {
  templateId?: string | null;
  onDone: () => void;
}

const TemplateEditorPanel: React.FC<EditorPanelProps> = ({ templateId, onDone }) => {
  const { user } = useAuth();
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState<Categoria>('Clínico');
  const [camposManuais, setCamposManuais] = useState<ManualField[]>([]);
  const [loading, setLoading] = useState(!!templateId);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [addFieldOpen, setAddFieldOpen] = useState<null | ManualField['type']>(null);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldOptions, setNewFieldOptions] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Table.configure({ resizable: false }),
      TableRow, TableHeader, TableCell,
      VariableMark,
      ConditionalMark,
    ],
    content: '<p></p>',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[400px] p-4 bg-background rounded-md border',
      },
    },
    onUpdate: () => setDirty(true),
  });

  // Load existing
  useEffect(() => {
    if (!templateId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('document_templates')
        .select('id, nome, tipo, conteudo, blocos_clinicos, ativo')
        .eq('id', templateId)
        .maybeSingle();
      if (error || !data) {
        toast.error('Erro ao carregar template');
        setLoading(false);
        return;
      }
      setNome(data.nome || '');
      setCategoria((CATEGORIAS.includes(data.tipo as Categoria) ? data.tipo : 'Clínico') as Categoria);
      const meta = (data.blocos_clinicos as any) || {};
      setCamposManuais(meta.campos_manuais || []);
      if (editor) {
        editor.commands.setContent(data.conteudo || '<p></p>');
        setDirty(false);
      }
      setLoading(false);
    })();
  }, [templateId, editor]);

  // -------- Insert helpers --------
  const insertVariable = (key: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent({
      type: 'text',
      text: `{{${key}}}`,
      marks: [{ type: 'templateVariable', attrs: { 'data-var': key } }],
    }).insertContent(' ').run();
  };

  const addManualField = (type: ManualField['type']) => {
    if (!newFieldLabel.trim()) { toast.error('Informe o rótulo do campo'); return; }
    const key = `${type}_${Date.now().toString(36)}`;
    const options = type === 'checkbox'
      ? newFieldOptions.split(',').map(o => o.trim()).filter(Boolean)
      : undefined;
    if (type === 'checkbox' && (!options || options.length === 0)) {
      toast.error('Informe ao menos uma opção separada por vírgula');
      return;
    }
    const field: ManualField = { key, label: newFieldLabel.trim(), type, options };
    setCamposManuais(prev => [...prev, field]);
    insertVariable(key);
    setAddFieldOpen(null);
    setNewFieldLabel('');
    setNewFieldOptions('');
    setDirty(true);
  };

  const removeManualField = (key: string) => {
    setCamposManuais(prev => prev.filter(f => f.key !== key));
    setDirty(true);
  };

  const applyCondition = (value: string) => {
    if (!editor) return;
    if (editor.state.selection.empty) {
      toast.error('Selecione o trecho de texto primeiro');
      return;
    }
    if (value === 'sempre') {
      editor.chain().focus().unsetMark('conditionalBlock').run();
    } else {
      editor.chain().focus().setMark('conditionalBlock', { 'data-cond': value }).run();
    }
  };

  // -------- Save --------
  const handleSave = async () => {
    if (!nome.trim()) { toast.error('Informe o nome do documento'); return; }
    if (!editor) return;
    setSaving(true);
    const html = editor.getHTML();
    const payload: any = {
      nome: nome.trim(),
      tipo: categoria,
      conteudo: html,
      ativo: true,
      blocos_clinicos: { campos_manuais: camposManuais },
      updated_at: new Date().toISOString(),
    };
    if (templateId) {
      const { error } = await supabase.from('document_templates').update(payload).eq('id', templateId);
      if (error) { toast.error('Erro ao salvar: ' + error.message); setSaving(false); return; }
      toast.success('Template atualizado');
    } else {
      payload.criado_por = user?.id || '';
      payload.criado_por_nome = user?.nome || '';
      payload.tipo_modelo = 'UNIDADE';
      payload.unidade_id = user?.unidadeId || '';
      const { error } = await supabase.from('document_templates').insert(payload);
      if (error) { toast.error('Erro ao criar: ' + error.message); setSaving(false); return; }
      toast.success('Template criado');
    }
    setDirty(false);
    setSaving(false);
    onDone();
  };

  const handleCancel = () => {
    if (dirty && !window.confirm('Descartar alterações não salvas?')) return;
    onDone();
  };

  // -------- Preview --------
  const renderPreview = (): string => {
    if (!editor) return '';
    let html = editor.getHTML();
    // Substitui variáveis por valores fictícios
    html = html.replace(/\{\{([\w_]+)\}\}/g, (_m, k) => {
      if (PREVIEW_VALUES[k]) return PREVIEW_VALUES[k];
      const manual = camposManuais.find(f => f.key === k);
      if (manual) {
        if (manual.type === 'checkbox') return `[${(manual.options || []).join(' / ')}]`;
        if (manual.type === 'data') return '__/__/____';
        return `[${manual.label}]`;
      }
      return `{{${k}}}`;
    });
    return html;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Carregando template...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <style>{`
        .tpl-var { background: hsl(210 100% 92%); color: hsl(210 80% 30%); padding: 1px 6px; border-radius: 4px; font-weight: 500; font-size: 0.9em; }
        .tpl-cond { border: 1px dashed hsl(340 70% 55%); background: hsl(340 80% 97%); padding: 2px 4px; border-radius: 4px; }
        .prose table { border-collapse: collapse; }
        .prose th, .prose td { border: 1px solid hsl(var(--border)); padding: 4px 8px; }
      `}</style>

      {/* Header form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 space-y-1.5">
          <Label>Nome do documento *</Label>
          <Input value={nome} onChange={e => { setNome(e.target.value); setDirty(true); }} placeholder="Ex.: Atestado Médico" />
        </div>
        <div className="space-y-1.5">
          <Label>Categoria *</Label>
          <Select value={categoria} onValueChange={(v) => { setCategoria(v as Categoria); setDirty(true); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        {/* Left: editor */}
        <div className="space-y-2 min-w-0">
          {/* Toolbar */}
          <div className="flex flex-wrap gap-1 border rounded-md p-1.5 bg-muted/40">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editor?.chain().focus().toggleBold().run()} title="Negrito"><Bold className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editor?.chain().focus().toggleItalic().run()} title="Itálico"><Italic className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Sublinhado"><UnderlineIcon className="w-4 h-4" /></Button>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} title="Título 1"><Heading1 className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Título 2"><Heading2 className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} title="Título 3"><Heading3 className="w-4 h-4" /></Button>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Lista"><List className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Lista numerada"><ListOrdered className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Tabela"><TableIcon className="w-4 h-4" /></Button>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <Select onValueChange={applyCondition}>
              <SelectTrigger className="h-8 w-auto gap-1 text-xs"><ShieldQuestion className="w-3.5 h-3.5" /> <SelectValue placeholder="Bloco condicional" /></SelectTrigger>
              <SelectContent>
                {CONDITIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                <SelectItem value="sempre">Sempre exibir (remover)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <EditorContent editor={editor} />
        </div>

        {/* Right: variables sidebar */}
        <aside className="space-y-4 border rounded-md p-3 bg-card/50 max-h-[600px] overflow-y-auto">
          <section>
            <h4 className="text-xs font-semibold uppercase text-primary mb-2">Dados do Paciente</h4>
            <div className="flex flex-wrap gap-1.5">
              {PACIENTE_VARS.map(v => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v.key)}
                  className="text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  title={`Inserir {{${v.key}}}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </section>

          <Separator />

          <section>
            <h4 className="text-xs font-semibold uppercase text-primary mb-2">Campos Manuais</h4>
            <div className="grid grid-cols-1 gap-1.5 mb-2">
              <Button size="sm" variant="outline" className="gap-1 justify-start h-8" onClick={() => setAddFieldOpen('texto')}><Type className="w-3.5 h-3.5" /> + Campo de texto livre</Button>
              <Button size="sm" variant="outline" className="gap-1 justify-start h-8" onClick={() => setAddFieldOpen('checkbox')}><CheckSquare className="w-3.5 h-3.5" /> + Checkbox</Button>
              <Button size="sm" variant="outline" className="gap-1 justify-start h-8" onClick={() => setAddFieldOpen('data')}><Calendar className="w-3.5 h-3.5" /> + Campo de data</Button>
            </div>
            {camposManuais.length > 0 && (
              <div className="space-y-1">
                {camposManuais.map(f => (
                  <div key={f.key} className="flex items-center gap-1 text-xs bg-muted/60 rounded px-2 py-1">
                    <button
                      type="button"
                      className="flex-1 text-left truncate hover:underline"
                      onClick={() => insertVariable(f.key)}
                      title="Inserir novamente"
                    >
                      {f.label} <span className="text-muted-foreground">({f.type})</span>
                    </button>
                    <button type="button" onClick={() => removeManualField(f.key)} className="text-destructive hover:text-destructive/70">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <Separator />

          <section>
            <h4 className="text-xs font-semibold uppercase text-primary mb-2">Sistema</h4>
            <div className="flex flex-wrap gap-1.5">
              {SISTEMA_VARS.map(v => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v.key)}
                  className="text-xs px-2 py-1 rounded bg-accent hover:bg-accent/70 transition-colors"
                >
                  {v.label}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" onClick={handleCancel}>Cancelar</Button>
        <Button variant="outline" onClick={() => setPreviewOpen(true)} className="gap-1.5"><Eye className="w-4 h-4" /> Preview</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar Template
        </Button>
      </div>

      {/* Add manual field dialog */}
      <Dialog open={!!addFieldOpen} onOpenChange={(o) => { if (!o) setAddFieldOpen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo campo — {addFieldOpen === 'texto' ? 'Texto livre' : addFieldOpen === 'checkbox' ? 'Checkbox' : 'Data'}</DialogTitle>
            <DialogDescription>Defina o rótulo que aparecerá na hora de gerar o documento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Rótulo</Label>
              <Input value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)} placeholder="Ex.: Observações" autoFocus />
            </div>
            {addFieldOpen === 'checkbox' && (
              <div className="space-y-1.5">
                <Label>Opções (separadas por vírgula)</Label>
                <Textarea value={newFieldOptions} onChange={e => setNewFieldOptions(e.target.value)} placeholder="Psicologia, Fonoaudiologia, Fisioterapia" rows={2} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFieldOpen(null)}>Cancelar</Button>
            <Button onClick={() => addFieldOpen && addManualField(addFieldOpen)}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview — {nome || 'Sem nome'}</DialogTitle>
            <DialogDescription>Visualização com dados fictícios de exemplo.</DialogDescription>
          </DialogHeader>
          <style>{`.preview-doc .tpl-cond { border: 1px dashed hsl(340 70% 55%); padding: 2px 4px; border-radius: 4px; }`}</style>
          <div
            className="preview-doc border rounded-md p-6 bg-white text-black prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderPreview(), { ADD_ATTR: ['data-var', 'data-cond'] }) }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

// -------- List (default export) --------
const TemplateEditor: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManage = useMemo(() => hasPermission(['master', 'coordenador']), [hasPermission]);

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined); // undefined=lista, null=novo, string=id

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('document_templates')
      .select('id, nome, tipo, conteudo, ativo, blocos_clinicos')
      .order('nome');
    setTemplates((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Auto-abrir modo criação quando URL contiver ?novo=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('novo') === '1' && canManage) setEditingId(null);
  }, [canManage]);

  if (!canManage) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
        Apenas Master ou Coordenação podem gerenciar modelos de documentos.
      </div>
    );
  }

  if (editingId !== undefined) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">
            {editingId ? 'Editar template' : 'Novo template'}
          </h3>
        </div>
        <TemplateEditorPanel templateId={editingId} onDone={() => { setEditingId(undefined); load(); }} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Modelos de Documentos</h3>
        </div>
        <Button onClick={() => setEditingId(null)} className="gap-1.5">
          <Plus className="w-4 h-4" /> Criar novo tipo de documento
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : templates.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum template cadastrado.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 font-medium">Nome</th>
                <th className="text-left p-2 font-medium">Categoria</th>
                <th className="text-left p-2 font-medium">Status</th>
                <th className="text-right p-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id} className="border-t hover:bg-muted/30">
                  <td className="p-2">{t.nome}</td>
                  <td className="p-2">{t.tipo}</td>
                  <td className="p-2">{t.ativo ? 'Ativo' : 'Inativo'}</td>
                  <td className="p-2 text-right">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditingId(t.id)}>
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TemplateEditor;

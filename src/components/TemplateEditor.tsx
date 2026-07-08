import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Mark, Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader as BaseTableHeader } from '@tiptap/extension-table-header';
import { TableCell as BaseTableCell } from '@tiptap/extension-table-cell';
import Image from '@tiptap/extension-image';
import Dropcursor from '@tiptap/extension-dropcursor';
import DOMPurify from 'dompurify';
import { applyExampleValues, normalizeTemplateAliases, TEMPLATE_VARIABLE_GROUPS } from '@/lib/templateVariables';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
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
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Strikethrough, Subscript as SubIcon, Superscript as SupIcon, Undo2, Redo2, Minus,
  FileImage, PenLine, QrCode, Barcode, Upload, Clock, Hash, DollarSign, Mail, Link as LinkIcon,
  Phone, MapPin, IdCard, CircleDot, AlignVerticalSpaceAround, SeparatorHorizontal, Palette,
  Square, ImageIcon, Rows, Columns, ChevronDown,
} from 'lucide-react';

const FONT_FAMILIES = [
  { label: 'Padrão', value: '' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, sans-serif' },
];

const FONT_SIZES = ['10px', '11px', '12px', '13px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];

// -------- Types --------
type Categoria = 'Cadastro' | 'Clínico' | 'Regulação' | 'CER';
const CATEGORIAS: Categoria[] = ['Cadastro', 'Clínico', 'Regulação', 'CER'];

type ManualFieldType =
  | 'texto' | 'textarea' | 'checkbox' | 'radio' | 'data' | 'hora' | 'datahora'
  | 'numero' | 'moeda' | 'cpf' | 'cns' | 'telefone' | 'cep' | 'email' | 'url'
  | 'assinatura' | 'imagem' | 'upload' | 'qrcode' | 'barcode';

interface ManualField {
  key: string;
  label: string;
  type: ManualFieldType;
  options?: string[];
}

const FIELD_TYPES: { type: ManualFieldType; label: string; icon: any; needsOptions?: boolean }[] = [
  { type: 'texto', label: 'Campo texto', icon: Type },
  { type: 'textarea', label: 'Textarea', icon: AlignLeft },
  { type: 'numero', label: 'Campo número', icon: Hash },
  { type: 'moeda', label: 'Campo moeda', icon: DollarSign },
  { type: 'cpf', label: 'Campo CPF', icon: IdCard },
  { type: 'cns', label: 'Campo CNS', icon: IdCard },
  { type: 'telefone', label: 'Campo telefone', icon: Phone },
  { type: 'cep', label: 'Campo CEP', icon: MapPin },
  { type: 'email', label: 'Campo e-mail', icon: Mail },
  { type: 'url', label: 'Campo URL', icon: LinkIcon },
  { type: 'data', label: 'Campo Data', icon: Calendar },
  { type: 'hora', label: 'Campo Hora', icon: Clock },
  { type: 'datahora', label: 'Data/Hora', icon: Calendar },
  { type: 'checkbox', label: 'Checkbox', icon: CheckSquare, needsOptions: true },
  { type: 'radio', label: 'Radio Button', icon: CircleDot, needsOptions: true },
  { type: 'assinatura', label: 'Assinatura', icon: PenLine },
  { type: 'imagem', label: 'Imagem', icon: FileImage },
  { type: 'upload', label: 'Upload', icon: Upload },
  { type: 'qrcode', label: 'Código QR', icon: QrCode },
  { type: 'barcode', label: 'Código de barras', icon: Barcode },
];

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

// Subscript / Superscript
const SubMark = Mark.create({
  name: 'subscript',
  parseHTML() { return [{ tag: 'sub' }]; },
  renderHTML() { return ['sub', 0]; },
});
const SupMark = Mark.create({
  name: 'superscript',
  parseHTML() { return [{ tag: 'sup' }]; },
  renderHTML() { return ['sup', 0]; },
});

// Extended TextStyle attributes (color + fontSize)
const TextStyleExt = TextStyle.extend({
  addAttributes() {
    return {
      ...(this.parent?.() || {}),
      color: {
        default: null,
        parseHTML: el => (el as HTMLElement).style.color || null,
        renderHTML: attrs => attrs.color ? { style: `color:${attrs.color}` } : {},
      },
      fontSize: {
        default: null,
        parseHTML: el => (el as HTMLElement).style.fontSize || null,
        renderHTML: attrs => attrs.fontSize ? { style: `font-size:${attrs.fontSize}` } : {},
      },
    };
  },
});

// Page break + Spacer nodes
const PageBreakNode = Node.create({
  name: 'pageBreak', group: 'block', atom: true, selectable: true,
  parseHTML() { return [{ tag: 'div[data-page-break]' }]; },
  renderHTML() {
    return ['div', { 'data-page-break': 'true', class: 'tpl-page-break', style: 'page-break-after:always;border-top:2px dashed #94a3b8;margin:8px 0;height:0;' }];
  },
});
const SpacerNode = Node.create({
  name: 'spacer', group: 'block', atom: true, selectable: true,
  addAttributes() { return { size: { default: '16px' } }; },
  parseHTML() { return [{ tag: 'div[data-spacer]' }]; },
  renderHTML({ HTMLAttributes }) {
    const size = HTMLAttributes.size || '16px';
    return ['div', { 'data-spacer': 'true', style: `height:${size};` }];
  },
});

// Caixa de texto arrastável
const TextBoxNode = Node.create({
  name: 'textbox', group: 'block', content: 'block+', draggable: true, defining: true,
  parseHTML() { return [{ tag: 'div[data-type="textbox"]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'textbox', class: 'tpl-textbox' }), 0];
  },
});

// -------- Table cell/header with border & background styling --------
const cellStyleAttrs = {
  backgroundColor: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.style.backgroundColor || null,
    renderHTML: (attrs: any) => (attrs.backgroundColor ? { 'data-bg': attrs.backgroundColor } : {}),
  },
  borderColor: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-border-color'),
    renderHTML: (attrs: any) => (attrs.borderColor ? { 'data-border-color': attrs.borderColor } : {}),
  },
  borderWidth: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-border-width'),
    renderHTML: (attrs: any) => (attrs.borderWidth ? { 'data-border-width': attrs.borderWidth } : {}),
  },
  borderStyleAttr: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-border-style'),
    renderHTML: (attrs: any) => (attrs.borderStyleAttr ? { 'data-border-style': attrs.borderStyleAttr } : {}),
  },
};
const buildCellStyle = (attrs: any, existing: Record<string, any> = {}) => {
  const parts: string[] = [];
  if (attrs.backgroundColor) parts.push(`background-color:${attrs.backgroundColor}`);
  if (attrs.borderColor) parts.push(`border-color:${attrs.borderColor}`);
  if (attrs.borderWidth) parts.push(`border-width:${attrs.borderWidth}`);
  if (attrs.borderStyleAttr) parts.push(`border-style:${attrs.borderStyleAttr}`);
  if (existing.style) parts.push(String(existing.style));
  return parts.length ? { ...existing, style: parts.join(';') } : existing;
};
const TableCell = BaseTableCell.extend({
  addAttributes() { return { ...this.parent?.(), ...cellStyleAttrs }; },
  renderHTML({ HTMLAttributes, node }) { return ['td', buildCellStyle(node.attrs, HTMLAttributes), 0]; },
});
const TableHeader = BaseTableHeader.extend({
  addAttributes() { return { ...this.parent?.(), ...cellStyleAttrs }; },
  renderHTML({ HTMLAttributes, node }) { return ['th', buildCellStyle(node.attrs, HTMLAttributes), 0]; },
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
  const [pageSize, setPageSize] = useState<'A4' | 'A5' | 'Letter' | 'Legal'>('A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [pageMargin, setPageMargin] = useState<number>(20); // mm
  const [zoom, setZoom] = useState<number>(100); // %
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [showRuler, setShowRuler] = useState<boolean>(true);

  const PAGE_DIMS = { A4: [210, 297], A5: [148, 210], Letter: [216, 279], Legal: [216, 356] } as const;
  const [pageW, pageH] = orientation === 'portrait' ? PAGE_DIMS[pageSize] : [PAGE_DIMS[pageSize][1], PAGE_DIMS[pageSize][0]];

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ dropcursor: false }),
      Underline,
      TextStyleExt,
      FontFamily.configure({ types: ['textStyle'] }),
      TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
      Image.configure({ inline: false, allowBase64: true }),
      Dropcursor.configure({ color: '#2A6F97', width: 3 }),
      SubMark, SupMark, PageBreakNode, SpacerNode, TextBoxNode,
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
        editor.commands.setContent(normalizeTemplateAliases(data.conteudo || '<p></p>'));
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

  const addManualField = (type: ManualFieldType) => {
    if (!newFieldLabel.trim()) { toast.error('Informe o rótulo do campo'); return; }
    const key = `${type}_${Date.now().toString(36)}`;
    const needsOptions = type === 'checkbox' || type === 'radio';
    const options = needsOptions
      ? newFieldOptions.split(',').map(o => o.trim()).filter(Boolean)
      : undefined;
    if (needsOptions && (!options || options.length === 0)) {
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

  // Insert block/inline helpers for editor components
  const insertHR = () => editor?.chain().focus().setHorizontalRule().run();
  const insertPageBreak = () => editor?.chain().focus().insertContent({ type: 'pageBreak' }).run();
  const insertSpacer = () => editor?.chain().focus().insertContent({ type: 'spacer', attrs: { size: '24px' } }).run();
  const insertTable = (rows: number, cols: number) => editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
  const insertTextBox = () => editor?.chain().focus().insertContent({
    type: 'textbox',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nova caixa de texto — digite aqui...' }] }],
  }).run();
  const insertImage = () => {
    const url = window.prompt('URL da imagem:');
    if (url) editor?.chain().focus().setImage({ src: url }).run();
  };
  const setColor = (color: string) => {
    if (!editor) return;
    editor.chain().focus().setMark('textStyle', { color }).run();
  };
  const setFontSize = (size: string) => {
    if (!editor) return;
    if (!size || size === '__default__') editor.chain().focus().setMark('textStyle', { fontSize: null }).run();
    else editor.chain().focus().setMark('textStyle', { fontSize: size }).run();
  };
  const doCopy = async () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, '\n');
    if (text) { try { await navigator.clipboard.writeText(text); toast.success('Copiado'); } catch { toast.error('Falha ao copiar'); } }
  };
  const doPastePlain = async () => {
    if (!editor) return;
    try { const t = await navigator.clipboard.readText(); editor.chain().focus().insertContent(t).run(); } catch { toast.error('Sem permissão de leitura da área de transferência'); }
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
    const html = normalizeTemplateAliases(editor.getHTML());
    const { data, error } = await (supabase as any).rpc('save_document_template', {
      p_template_id: templateId || null,
      p_nome: nome.trim(),
      p_tipo: categoria,
      p_conteudo: html,
      p_ativo: true,
      p_perfis_permitidos: templateId ? null : ['master', 'profissional', 'coordenador', 'gestao'],
      p_tipo_modelo: templateId ? null : 'UNIDADE',
      p_unidade_id: templateId ? null : (user?.unidadeId || ''),
      p_blocos_clinicos: { campos_manuais: camposManuais },
      p_versoes: templateId ? null : [],
    });
    if (error) {
      toast.error('Erro ao salvar template: ' + error.message);
      setSaving(false);
      return;
    }
    const saved = Array.isArray(data) ? data[0] : data;
    if (!saved?.id) {
      toast.error('Template não foi salvo. Tente novamente ou verifique sua permissão.');
      setSaving(false);
      return;
    }
    toast.success(templateId ? 'Template atualizado' : 'Template criado');

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
    let html = applyExampleValues(editor.getHTML());
    html = html.replace(/\{\{([\w_]+)\}\}/g, (_m, k) => {
      const manual = camposManuais.find(f => f.key === k);
      if (manual) {
        switch (manual.type) {
          case 'checkbox': return `[${(manual.options || []).join(' / ')}]`;
          case 'radio': return (manual.options || []).map(o => `( ) ${o}`).join(' &nbsp; ');
          case 'data': return '__/__/____';
          case 'hora': return '__:__';
          case 'datahora': return '__/__/____ __:__';
          case 'assinatura': return '__________________________';
          case 'imagem':
          case 'upload': return `[${manual.label} — anexar]`;
          case 'qrcode': return '[ QR ]';
          case 'barcode': return '[ ||||| ]';
          default: return `[${manual.label}]`;
        }
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
        .prose table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 8px 0; }
        .prose th, .prose td { border: 1px solid hsl(var(--border)); padding: 4px 8px; vertical-align: top; position: relative; }
        .prose th { background: hsl(var(--muted)); font-weight: 700; }
        .ProseMirror .selectedCell::after { content: ''; position: absolute; inset: 0; background: hsl(var(--primary) / 0.15); pointer-events: none; }
        .tpl-textbox { border: 1px dashed hsl(var(--border)); background: hsl(var(--muted) / 0.35); padding: 10px 12px; margin: 8px 0; border-radius: 8px; position: relative; }
        .tpl-textbox::before { content: '⋮⋮ caixa de texto (arraste)'; position: absolute; top: -9px; left: 10px; font-size: 9px; background: hsl(var(--background)); color: hsl(var(--muted-foreground)); padding: 0 6px; letter-spacing: 0.5px; text-transform: uppercase; border-radius: 3px; }
        .prose img { max-width: 100%; height: auto; }
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
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editor?.chain().focus().toggleStrike().run()} title="Riscado"><Strikethrough className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { editor?.chain().focus().unsetMark('superscript').toggleMark('subscript').run(); }} title="Subscrito"><SubIcon className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { editor?.chain().focus().unsetMark('subscript').toggleMark('superscript').run(); }} title="Sobrescrito"><SupIcon className="w-4 h-4" /></Button>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editor?.chain().focus().undo().run()} title="Desfazer"><Undo2 className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editor?.chain().focus().redo().run()} title="Refazer"><Redo2 className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={doCopy} title="Copiar seleção"><FileText className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={doPastePlain} title="Colar sem formatação"><Upload className="w-4 h-4" /></Button>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} title="Título 1"><Heading1 className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Título 2"><Heading2 className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} title="Título 3"><Heading3 className="w-4 h-4" /></Button>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Lista"><List className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Lista numerada"><ListOrdered className="w-4 h-4" /></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" title="Tabela">
                  <TableIcon className="w-4 h-4" /> <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-xs">Inserir</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => insertTable(2, 2)}>Tabela 2 × 2</DropdownMenuItem>
                <DropdownMenuItem onClick={() => insertTable(3, 3)}>Tabela 3 × 3</DropdownMenuItem>
                <DropdownMenuItem onClick={() => insertTable(4, 4)}>Tabela 4 × 4</DropdownMenuItem>
                <DropdownMenuItem onClick={() => insertTable(5, 3)}>Tabela 5 × 3</DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const r = Number(window.prompt('Linhas:', '3')) || 3;
                  const c = Number(window.prompt('Colunas:', '3')) || 3;
                  insertTable(Math.max(1, r), Math.max(1, c));
                }}>Personalizada…</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Linha</DropdownMenuLabel>
                <DropdownMenuItem disabled={!editor?.isActive('table')} onClick={() => editor?.chain().focus().addRowBefore().run()}><Rows className="w-3.5 h-3.5 mr-2" />Adicionar acima</DropdownMenuItem>
                <DropdownMenuItem disabled={!editor?.isActive('table')} onClick={() => editor?.chain().focus().addRowAfter().run()}><Rows className="w-3.5 h-3.5 mr-2" />Adicionar abaixo</DropdownMenuItem>
                <DropdownMenuItem disabled={!editor?.isActive('table')} onClick={() => editor?.chain().focus().deleteRow().run()}><Trash2 className="w-3.5 h-3.5 mr-2" />Excluir linha</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Coluna</DropdownMenuLabel>
                <DropdownMenuItem disabled={!editor?.isActive('table')} onClick={() => editor?.chain().focus().addColumnBefore().run()}><Columns className="w-3.5 h-3.5 mr-2" />Adicionar à esquerda</DropdownMenuItem>
                <DropdownMenuItem disabled={!editor?.isActive('table')} onClick={() => editor?.chain().focus().addColumnAfter().run()}><Columns className="w-3.5 h-3.5 mr-2" />Adicionar à direita</DropdownMenuItem>
                <DropdownMenuItem disabled={!editor?.isActive('table')} onClick={() => editor?.chain().focus().deleteColumn().run()}><Trash2 className="w-3.5 h-3.5 mr-2" />Excluir coluna</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Células</DropdownMenuLabel>
                <DropdownMenuItem disabled={!editor?.isActive('table')} onClick={() => editor?.chain().focus().mergeCells().run()}>Mesclar células</DropdownMenuItem>
                <DropdownMenuItem disabled={!editor?.isActive('table')} onClick={() => editor?.chain().focus().splitCell().run()}>Dividir célula</DropdownMenuItem>
                <DropdownMenuItem disabled={!editor?.isActive('table')} onClick={() => editor?.chain().focus().toggleHeaderRow().run()}>Alternar cabeçalho</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Estilo da célula</DropdownMenuLabel>
                <DropdownMenuItem disabled={!editor?.isActive('table')} onSelect={(e) => e.preventDefault()} className="p-0">
                  <label className="flex items-center justify-between gap-2 w-full px-2 py-1.5 cursor-pointer text-xs">
                    <span>Cor de fundo</span>
                    <input type="color" className="h-6 w-8 p-0 border rounded cursor-pointer"
                      onChange={(e) => (editor?.chain().focus() as any).setCellAttribute('backgroundColor', e.target.value).run()} />
                  </label>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!editor?.isActive('table')}
                  onClick={() => (editor?.chain().focus() as any).setCellAttribute('backgroundColor', null).run()}>
                  Remover cor de fundo
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Bordas</DropdownMenuLabel>
                <DropdownMenuItem disabled={!editor?.isActive('table')} onSelect={(e) => e.preventDefault()} className="p-0">
                  <label className="flex items-center justify-between gap-2 w-full px-2 py-1.5 cursor-pointer text-xs">
                    <span>Cor da borda</span>
                    <input type="color" defaultValue="#94a3b8" className="h-6 w-8 p-0 border rounded cursor-pointer"
                      onChange={(e) => (editor?.chain().focus() as any).setCellAttribute('borderColor', e.target.value).run()} />
                  </label>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!editor?.isActive('table')} onSelect={(e) => e.preventDefault()} className="p-0">
                  <div className="flex items-center justify-between gap-2 w-full px-2 py-1.5 text-xs">
                    <span>Espessura</span>
                    <div className="flex gap-1">
                      {['1px', '2px', '3px', '4px'].map((w) => (
                        <button key={w} type="button" className="px-1.5 py-0.5 border rounded hover:bg-accent text-[10px]"
                          onClick={() => (editor?.chain().focus() as any).setCellAttribute('borderWidth', w).run()}>{w}</button>
                      ))}
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!editor?.isActive('table')} onSelect={(e) => e.preventDefault()} className="p-0">
                  <div className="flex items-center justify-between gap-2 w-full px-2 py-1.5 text-xs">
                    <span>Estilo</span>
                    <div className="flex gap-1">
                      {[{ l: 'Sólida', v: 'solid' }, { l: 'Tracej.', v: 'dashed' }, { l: 'Pontil.', v: 'dotted' }, { l: 'Dupla', v: 'double' }].map((s) => (
                        <button key={s.v} type="button" className="px-1.5 py-0.5 border rounded hover:bg-accent text-[10px]"
                          onClick={() => (editor?.chain().focus() as any).setCellAttribute('borderStyleAttr', s.v).run()}>{s.l}</button>
                      ))}
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!editor?.isActive('table')}
                  onClick={() => (editor?.chain().focus() as any).setCellAttribute('borderStyleAttr', 'hidden').run()}>
                  Remover borda desta célula
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!editor?.isActive('table')}
                  onClick={() => {
                    const c: any = editor?.chain().focus();
                    c.setCellAttribute('borderColor', null).setCellAttribute('borderWidth', null).setCellAttribute('borderStyleAttr', null).run();
                  }}>
                  Resetar borda ao padrão
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!editor?.isActive('table')} className="text-destructive" onClick={() => editor?.chain().focus().deleteTable().run()}><Trash2 className="w-3.5 h-3.5 mr-2" />Excluir tabela</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={insertTextBox} title="Caixa de texto (arrastável)"><Square className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={insertImage} title="Imagem"><ImageIcon className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={insertHR} title="Linha horizontal"><Minus className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={insertPageBreak} title="Quebra de página"><SeparatorHorizontal className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={insertSpacer} title="Espaçador"><AlignVerticalSpaceAround className="w-4 h-4" /></Button>
            <Separator orientation="vertical" className="h-6 mx-1" />
            {/* Alinhamento */}
            <Button size="icon" variant={editor?.isActive({ textAlign: 'left' }) ? 'secondary' : 'ghost'} className="h-8 w-8" onClick={() => editor?.chain().focus().setTextAlign('left').run()} title="Alinhar à esquerda"><AlignLeft className="w-4 h-4" /></Button>
            <Button size="icon" variant={editor?.isActive({ textAlign: 'center' }) ? 'secondary' : 'ghost'} className="h-8 w-8" onClick={() => editor?.chain().focus().setTextAlign('center').run()} title="Centralizar"><AlignCenter className="w-4 h-4" /></Button>
            <Button size="icon" variant={editor?.isActive({ textAlign: 'right' }) ? 'secondary' : 'ghost'} className="h-8 w-8" onClick={() => editor?.chain().focus().setTextAlign('right').run()} title="Alinhar à direita"><AlignRight className="w-4 h-4" /></Button>
            <Button size="icon" variant={editor?.isActive({ textAlign: 'justify' }) ? 'secondary' : 'ghost'} className="h-8 w-8" onClick={() => editor?.chain().focus().setTextAlign('justify').run()} title="Justificar"><AlignJustify className="w-4 h-4" /></Button>
            <Separator orientation="vertical" className="h-6 mx-1" />
            {/* Fonte */}
            <Select
              value=""
              onValueChange={(v) => {
                if (!editor) return;
                if (!v || v === '__default__') editor.chain().focus().unsetFontFamily().run();
                else editor.chain().focus().setFontFamily(v).run();
              }}
            >
              <SelectTrigger className="h-8 w-[140px] gap-1 text-xs"><Type className="w-3.5 h-3.5" /> <SelectValue placeholder="Fonte" /></SelectTrigger>
              <SelectContent>
                {FONT_FAMILIES.map(f => <SelectItem key={f.label} value={f.value || '__default__'}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* Tamanho */}
            <Select value="" onValueChange={setFontSize}>
              <SelectTrigger className="h-8 w-[90px] gap-1 text-xs"><SelectValue placeholder="Tam." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">Padrão</SelectItem>
                {FONT_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* Cor */}
            <label className="inline-flex items-center gap-1 border rounded h-8 px-2 text-xs cursor-pointer bg-background" title="Cor do texto">
              <Palette className="w-3.5 h-3.5" />
              <input type="color" className="w-5 h-5 border-0 bg-transparent p-0 cursor-pointer" onChange={e => setColor(e.target.value)} />
            </label>
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
          {TEMPLATE_VARIABLE_GROUPS.map(group => (
            <section key={group.group}>
              <h4 className="text-xs font-semibold uppercase text-primary mb-2">{group.group}</h4>
              <div className="flex flex-wrap gap-1.5">
                {group.variables.map(variable => (
                  <button
                    key={variable.key}
                    type="button"
                    onClick={() => insertVariable(variable.key)}
                    className="text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    title={`Inserir ${variable.token}`}
                  >
                    {variable.label}
                  </button>
                ))}
              </div>
            </section>
          ))}

          <Separator />

          <section>
            <h4 className="text-xs font-semibold uppercase text-primary mb-2">Componentes / Campos Manuais</h4>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {FIELD_TYPES.map(ft => {
                const Icon = ft.icon;
                return (
                  <Button key={ft.type} size="sm" variant="outline" className="gap-1 justify-start h-8 text-[11px] px-2" onClick={() => setAddFieldOpen(ft.type)}>
                    <Icon className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{ft.label}</span>
                  </Button>
                );
              })}
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
            <DialogTitle>Novo campo — {FIELD_TYPES.find(f => f.type === addFieldOpen)?.label || addFieldOpen}</DialogTitle>
            <DialogDescription>Defina o rótulo que aparecerá na hora de gerar o documento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Rótulo</Label>
              <Input value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)} placeholder="Ex.: Observações" autoFocus />
            </div>
            {(addFieldOpen === 'checkbox' || addFieldOpen === 'radio') && (
              <div className="space-y-1.5">
                <Label>Opções (separadas por vírgula)</Label>
                <Textarea value={newFieldOptions} onChange={e => setNewFieldOptions(e.target.value)} placeholder="Opção 1, Opção 2, Opção 3" rows={2} />
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

import React, { useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Heading1, Heading2, Heading3,
  Table as TableIcon, Highlighter, Undo, Redo, Variable, Minus,
} from 'lucide-react';

const VARIAVEIS_CATEGORIAS = [
  {
    label: 'Paciente',
    items: [
      { tag: '{{nome_paciente}}', desc: 'Nome' },
      { tag: '{{cpf}}', desc: 'CPF' },
      { tag: '{{cns}}', desc: 'CNS' },
      { tag: '{{data_nascimento}}', desc: 'Data nasc.' },
      { tag: '{{cid}}', desc: 'CID' },
      { tag: '{{especialidade}}', desc: 'Especialidade' },
    ],
  },
  {
    label: 'Atendimento',
    items: [
      { tag: '{{data_atendimento}}', desc: 'Data atendimento' },
      { tag: '{{profissional}}', desc: 'Profissional' },
      { tag: '{{carimbo_profissional}}', desc: 'Carimbo profissional' },
      { tag: '{{data_hoje}}', desc: 'Data de hoje' },
      { tag: '{{hora_entrada}}', desc: 'Hora entrada' },
      { tag: '{{hora_saida}}', desc: 'Hora saída' },
    ],
  },
  {
    label: 'Declaração / Comparecimento',
    items: [
      { tag: '{{horario_entrada}}', desc: 'Horário entrada' },
      { tag: '{{horario_saida}}', desc: 'Horário saída' },
      { tag: '{{finalidade}}', desc: 'Finalidade' },
      { tag: '{{motivo_falta}}', desc: 'Motivo da falta' },
      { tag: '{{data_falta}}', desc: 'Data da falta' },
      { tag: '{{profissional_agendado}}', desc: 'Profissional agendado' },
    ],
  },
  {
    label: 'Documento',
    items: [
      { tag: '{{dias_afastamento}}', desc: 'Dias afastamento' },
      { tag: '{{data_inicio}}', desc: 'Data início' },
      { tag: '{{data_fim}}', desc: 'Data fim' },
      { tag: '{{medicamentos}}', desc: 'Medicamentos' },
      { tag: '{{especialidade_destino}}', desc: 'Espec. destino' },
      { tag: '{{unidade_destino}}', desc: 'Unidade destino' },
      { tag: '{{motivo}}', desc: 'Motivo' },
      { tag: '{{observacoes}}', desc: 'Observações' },
      { tag: '{{prioridade}}', desc: 'Prioridade' },
      { tag: '{{validade_receita}}', desc: 'Validade receita' },
      { tag: '{{objetivo}}', desc: 'Objetivo' },
      { tag: '{{historico}}', desc: 'Histórico' },
      { tag: '{{exame_fisico}}', desc: 'Exame físico' },
      { tag: '{{conclusao}}', desc: 'Conclusão' },
      { tag: '{{recomendacoes}}', desc: 'Recomendações' },
      { tag: '{{queixa_principal}}', desc: 'Queixa principal' },
      { tag: '{{evolucao_clinica}}', desc: 'Evolução clínica' },
      { tag: '{{conduta}}', desc: 'Conduta' },
      { tag: '{{plano}}', desc: 'Plano' },
      { tag: '{{orientacoes}}', desc: 'Orientações' },
      { tag: '{{finalidade}}', desc: 'Finalidade' },
    ],
  },
  {
    label: 'Unidade',
    items: [
      { tag: '{{unidade}}', desc: 'Unidade de saúde' },
    ],
  },
];

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
}

const ToolbarButton: React.FC<{
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}> = ({ onClick, active, title, children, disabled }) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    className={`h-7 w-7 ${active ? 'bg-accent text-accent-foreground' : ''}`}
    onClick={onClick}
    title={title}
    disabled={disabled}
  >
    {children}
  </Button>
);

const RichTextEditor: React.FC<Props> = ({ content, onChange, placeholder, className, editable = true }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: placeholder || 'Digite o conteúdo...' }),
      Highlight,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content,
    editable,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-3',
      },
    },
  });

  const insertVariable = useCallback(
    (tag: string) => {
      if (!editor) return;
      editor.chain().focus().insertContent(`<span class="variable-tag" style="background:#dbeafe;padding:1px 4px;border-radius:4px;font-family:monospace;font-size:12px;color:#1e40af;">${tag}</span>&nbsp;`).run();
    },
    [editor],
  );

  if (!editor) return null;

  return (
    <div className={`border rounded-lg overflow-hidden bg-background ${className || ''}`}>
      {editable && (
        <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b bg-muted/30">
          <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Desfazer" disabled={!editor.can().undo()}>
            <Undo className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Refazer" disabled={!editor.can().redo()}>
            <Redo className="w-3.5 h-3.5" />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-5" />

          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Negrito">
            <Bold className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Itálico">
            <Italic className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Sublinhado">
            <UnderlineIcon className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Tachado">
            <Strikethrough className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="Destaque">
            <Highlighter className="w-3.5 h-3.5" />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-5" />

          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Título 1">
            <Heading1 className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Título 2">
            <Heading2 className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Título 3">
            <Heading3 className="w-3.5 h-3.5" />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-5" />

          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Lista">
            <List className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Lista numerada">
            <ListOrdered className="w-3.5 h-3.5" />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-5" />

          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Esquerda">
            <AlignLeft className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Centro">
            <AlignCenter className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Direita">
            <AlignRight className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justificado">
            <AlignJustify className="w-3.5 h-3.5" />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-5" />

          <ToolbarButton
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            title="Inserir tabela"
          >
            <TableIcon className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Linha horizontal"
          >
            <Minus className="w-3.5 h-3.5" />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-5" />

          {/* Variables Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 px-2">
                <Variable className="w-3.5 h-3.5" /> Variáveis
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 max-h-[400px] overflow-y-auto p-3" align="start">
              <div className="space-y-3">
                {VARIAVEIS_CATEGORIAS.map(cat => (
                  <div key={cat.label}>
                    <p className="text-xs font-bold text-muted-foreground uppercase mb-1.5">{cat.label}</p>
                    <div className="flex flex-wrap gap-1">
                      {cat.items.map(v => (
                        <Button
                          key={v.tag}
                          variant="outline"
                          size="sm"
                          className="text-[10px] h-6 px-1.5 font-mono"
                          onClick={() => insertVariable(v.tag)}
                          title={v.desc}
                        >
                          {v.tag}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  );
};

export default RichTextEditor;

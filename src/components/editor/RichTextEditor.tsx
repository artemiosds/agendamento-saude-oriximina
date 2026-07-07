import React, { useCallback } from 'react';
import { useEditor, EditorContent, Node, mergeAttributes } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { FontSize } from '@tiptap/extension-font-size';
import FontFamily from '@tiptap/extension-font-family';
import Dropcursor from '@tiptap/extension-dropcursor';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { TEMPLATE_VARIABLE_GROUPS } from '@/lib/templateVariables';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Heading1, Heading2, Heading3,
  Table as TableIcon, Highlighter, Undo, Redo, Variable, Minus,
  Image as ImageIcon, Square, Palette, Rows, Columns, Trash2, ChevronDown,
} from 'lucide-react';

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
}

/** Node customizado: caixa de texto (bloco arrastável) */
const TextBox = Node.create({
  name: 'textbox',
  group: 'block',
  content: 'block+',
  draggable: true,
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-type="textbox"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'textbox', class: 'tt-textbox' }), 0];
  },
  addCommands() {
    return {
      insertTextBox:
        () =>
        ({ commands }: any) =>
          commands.insertContent({
            type: 'textbox',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nova caixa de texto — digite aqui...' }] }],
          }),
    } as any;
  },
});

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

const FONT_FAMILIES = [
  { label: 'Padrão', value: '' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times', value: '"Times New Roman", serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier', value: '"Courier New", monospace' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
];

const FONT_SIZES = ['10px', '11px', '12px', '13px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];

const COLORS = ['#000000', '#334155', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777'];

const RichTextEditor: React.FC<Props> = ({ content, onChange, placeholder, className, editable = true }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        dropcursor: false,
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: placeholder || 'Digite o conteúdo...' }),
      Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image.configure({ inline: false, allowBase64: true }),
      TextStyle,
      Color,
      FontSize,
      FontFamily,
      Dropcursor.configure({ color: '#2A6F97', width: 3 }),
      TextBox,
    ],
    content,
    editable,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[240px] px-4 py-3',
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

  const insertImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt('URL da imagem:');
    if (url) editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  const insertTable = useCallback(
    (rows: number, cols: number) => {
      if (!editor) return;
      editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    },
    [editor],
  );

  if (!editor) return null;

  const inTable = editor.isActive('table');

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

          {/* Fonte */}
          <Select onValueChange={v => editor.chain().focus().setFontFamily(v).run()}>
            <SelectTrigger className="h-7 w-[110px] text-xs px-2"><SelectValue placeholder="Fonte" /></SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map(f => (
                <SelectItem key={f.label} value={f.value || 'default'} onClick={() => f.value ? editor.chain().focus().setFontFamily(f.value).run() : editor.chain().focus().unsetFontFamily().run()}>
                  <span style={{ fontFamily: f.value || undefined }}>{f.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Tamanho */}
          <Select onValueChange={v => editor.chain().focus().setFontSize(v).run()}>
            <SelectTrigger className="h-7 w-[70px] text-xs px-2"><SelectValue placeholder="Tam." /></SelectTrigger>
            <SelectContent>
              {FONT_SIZES.map(s => (
                <SelectItem key={s} value={s}>{s.replace('px', '')}</SelectItem>
              ))}
            </SelectContent>
          </Select>

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

          {/* Cor do texto */}
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Cor do texto">
                <Palette className="w-3.5 h-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
              <div className="grid grid-cols-5 gap-1">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className="w-6 h-6 rounded border"
                    style={{ background: c }}
                    onClick={() => editor.chain().focus().setColor(c).run()}
                    title={c}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center gap-1">
                <Input type="color" className="h-7 w-12 p-1" onChange={e => editor.chain().focus().setColor(e.target.value).run()} />
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => editor.chain().focus().unsetColor().run()}>Remover</Button>
              </div>
            </PopoverContent>
          </Popover>

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

          {/* Tabela — menu completo */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" title="Tabela">
                <TableIcon className="w-3.5 h-3.5" /> Tabela <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-xs">Inserir</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => insertTable(2, 2)}>Tabela 2 × 2</DropdownMenuItem>
              <DropdownMenuItem onClick={() => insertTable(3, 3)}>Tabela 3 × 3</DropdownMenuItem>
              <DropdownMenuItem onClick={() => insertTable(4, 4)}>Tabela 4 × 4</DropdownMenuItem>
              <DropdownMenuItem onClick={() => insertTable(5, 3)}>Tabela 5 × 3</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const r = Number(window.prompt('Linhas:', '3')) || 3;
                  const c = Number(window.prompt('Colunas:', '3')) || 3;
                  insertTable(Math.max(1, r), Math.max(1, c));
                }}
              >
                Personalizada…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">Linha</DropdownMenuLabel>
              <DropdownMenuItem disabled={!inTable} onClick={() => editor.chain().focus().addRowBefore().run()}>
                <Rows className="w-3.5 h-3.5 mr-2" /> Adicionar linha acima
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!inTable} onClick={() => editor.chain().focus().addRowAfter().run()}>
                <Rows className="w-3.5 h-3.5 mr-2" /> Adicionar linha abaixo
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!inTable} onClick={() => editor.chain().focus().deleteRow().run()}>
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir linha
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">Coluna</DropdownMenuLabel>
              <DropdownMenuItem disabled={!inTable} onClick={() => editor.chain().focus().addColumnBefore().run()}>
                <Columns className="w-3.5 h-3.5 mr-2" /> Adicionar coluna à esquerda
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!inTable} onClick={() => editor.chain().focus().addColumnAfter().run()}>
                <Columns className="w-3.5 h-3.5 mr-2" /> Adicionar coluna à direita
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!inTable} onClick={() => editor.chain().focus().deleteColumn().run()}>
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir coluna
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">Células</DropdownMenuLabel>
              <DropdownMenuItem disabled={!inTable} onClick={() => editor.chain().focus().mergeCells().run()}>Mesclar células</DropdownMenuItem>
              <DropdownMenuItem disabled={!inTable} onClick={() => editor.chain().focus().splitCell().run()}>Dividir célula</DropdownMenuItem>
              <DropdownMenuItem disabled={!inTable} onClick={() => editor.chain().focus().toggleHeaderRow().run()}>Alternar cabeçalho</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!inTable} className="text-destructive" onClick={() => editor.chain().focus().deleteTable().run()}>
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir tabela
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ToolbarButton
            onClick={() => (editor.chain().focus() as any).insertTextBox().run()}
            title="Inserir caixa de texto (arrastável)"
          >
            <Square className="w-3.5 h-3.5" />
          </ToolbarButton>

          <ToolbarButton onClick={insertImage} title="Inserir imagem">
            <ImageIcon className="w-3.5 h-3.5" />
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
                {TEMPLATE_VARIABLE_GROUPS.map(cat => (
                  <div key={cat.group}>
                    <p className="text-xs font-bold text-muted-foreground uppercase mb-1.5">{cat.group}</p>
                    <div className="flex flex-wrap gap-1">
                      {cat.variables.map(v => (
                        <Button
                          key={v.key}
                          variant="outline"
                          size="sm"
                          className="text-[10px] h-6 px-1.5 font-mono"
                          onClick={() => insertVariable(v.token)}
                          title={v.label}
                        >
                          {v.token}
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

      <style>{`
        .tt-textbox {
          border: 1px dashed hsl(var(--border));
          background: hsl(var(--muted) / 0.35);
          padding: 10px 12px;
          margin: 8px 0;
          border-radius: 8px;
          position: relative;
        }
        .tt-textbox::before {
          content: '⋮⋮ caixa de texto (arraste)';
          position: absolute;
          top: -9px;
          left: 10px;
          font-size: 9px;
          background: hsl(var(--background));
          color: hsl(var(--muted-foreground));
          padding: 0 6px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          border-radius: 3px;
        }
        .ProseMirror table {
          border-collapse: collapse;
          margin: 8px 0;
          width: 100%;
          table-layout: fixed;
        }
        .ProseMirror table td, .ProseMirror table th {
          border: 1px solid hsl(var(--border));
          padding: 6px 8px;
          vertical-align: top;
          position: relative;
        }
        .ProseMirror table th {
          background: hsl(var(--muted));
          font-weight: 700;
        }
        .ProseMirror .selectedCell::after {
          content: '';
          position: absolute; inset: 0;
          background: hsl(var(--primary) / 0.15);
          pointer-events: none;
        }
        .ProseMirror img { max-width: 100%; height: auto; }
      `}</style>
    </div>
  );
};

export default RichTextEditor;

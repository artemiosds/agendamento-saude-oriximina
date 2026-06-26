// ABNT-compliant DOCX export for Relatório Fonoaudiológico Avaliativo.
// Uses the same structured data as the print/PDF output to avoid divergence.
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel,
  PageOrientation, ImageRun, Header, Footer, PageNumber,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
} from "docx";
import { saveAs } from "file-saver";
import { loadDocumentConfig } from "@/lib/printLayout";

export interface ReportField { label: string; value: string }
export interface ReportTable { headers: string[]; rows: string[][] }
export interface ReportSection {
  title: string;
  fields?: ReportField[];
  paragraphs?: string[];
  table?: ReportTable;
  highlight?: boolean;
  emptyMessage?: string;
}
export interface FonoDocxInput {
  pacienteNome: string;
  dataRelatorio: string; // dd/mm/yyyy
  profissionalNome: string;
  conselho: string;
  unidadeNome: string;
  sections: ReportSection[];
}

const ABNT = {
  // ABNT margins (3/2/3/2 cm) in DXA (1 cm ≈ 567 DXA)
  top: 1701, right: 1134, bottom: 1134, left: 1701,
  // A4 in DXA
  pageW: 11906, pageH: 16838,
};

const FONT = "Arial";

const p = (text: string, opts: any = {}) =>
  new Paragraph({
    alignment: opts.align ?? AlignmentType.JUSTIFIED,
    spacing: { line: 360, after: 120 }, // 1.5 line spacing
    heading: opts.heading,
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 24, font: FONT })],
  });

const fieldPara = (label: string, value: string) =>
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 360, after: 80 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 24, font: FONT }),
      new TextRun({ text: value || "—", size: 24, font: FONT }),
    ],
  });

async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch { return null; }
}

function detectImageType(url: string): "png" | "jpg" | "gif" | "bmp" {
  const u = url.toLowerCase();
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "jpg";
  if (u.endsWith(".gif")) return "gif";
  if (u.endsWith(".bmp")) return "bmp";
  return "png";
}

async function buildHeader(): Promise<Header> {
  const cfg = await loadDocumentConfig();
  const slots: { url: string; cfg: any }[] = [
    { url: cfg.logoEsquerda, cfg: cfg.logosConfig?.esquerda },
    { url: cfg.logoCentral, cfg: cfg.logosConfig?.central },
    { url: cfg.logoDireita, cfg: cfg.logosConfig?.direita },
  ].filter(s => s.url && s.cfg?.ativo);

  const imgRuns: ImageRun[] = [];
  for (const slot of slots) {
    const bytes = await fetchImageBytes(slot.url);
    if (!bytes) continue;
    const px = Math.min(140, Math.max(30, Number(slot.cfg?.altura) || 70));
    imgRuns.push(new ImageRun({
      type: detectImageType(slot.url) as any,
      data: bytes,
      transformation: { width: px, height: px },
      altText: { title: "Logo", description: "Logo institucional", name: "logo" },
    }));
  }

  const headerChildren: Paragraph[] = [];
  if (imgRuns.length) {
    headerChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: imgRuns.flatMap((r, i) => i === 0 ? [r] : [new TextRun({ text: "    " }), r]),
    }));
  }
  [cfg.linha1, cfg.linha2, cfg.linha3, cfg.linha4].forEach((line, i) => {
    if (line) headerChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: line, bold: i === 0, size: 22, font: FONT })],
    }));
  });
  if (!headerChildren.length) headerChildren.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
  return new Header({ children: headerChildren });
}

function buildFooter(): Footer {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Página ", size: 20, font: FONT }),
        new TextRun({ children: [PageNumber.CURRENT], size: 20, font: FONT }),
        new TextRun({ text: " de ", size: 20, font: FONT }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 20, font: FONT }),
      ],
    })],
  });
}

// Build a 2-column "label : value" identification grid as a borderless table
function buildIdGrid(rows: [string, string][]): Table {
  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const cellBorders = { top: noBorder, bottom: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" }, left: noBorder, right: noBorder };
  const tblRows: TableRow[] = [];
  for (let i = 0; i < rows.length; i += 2) {
    const a = rows[i]; const b = rows[i + 1];
    const mkCell = (label: string, value: string) => [
      new TableCell({
        width: { size: 1800, type: WidthType.DXA },
        borders: cellBorders,
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        children: [new Paragraph({ children: [new TextRun({ text: label.toUpperCase(), bold: true, size: 16, font: FONT, color: "475569" })] })],
      }),
      new TableCell({
        width: { size: 2700, type: WidthType.DXA },
        borders: cellBorders,
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        children: [new Paragraph({ children: [new TextRun({ text: value || "—", size: 20, font: FONT })] })],
      }),
    ];
    const cells = [...mkCell(a[0], a[1])];
    if (b) cells.push(...mkCell(b[0], b[1]));
    else cells.push(
      new TableCell({ width: { size: 1800, type: WidthType.DXA }, borders: cellBorders, children: [new Paragraph("")] }),
      new TableCell({ width: { size: 2700, type: WidthType.DXA }, borders: cellBorders, children: [new Paragraph("")] }),
    );
    tblRows.push(new TableRow({ children: cells }));
  }
  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: [1800, 2700, 1800, 2700],
    rows: tblRows,
  });
}

function buildDataTable(headers: string[], rows: string[][]): Table {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };
  const cellBorders = { top: border, bottom: border, left: border, right: border };
  const colCount = headers.length;
  const totalWidth = 9000;
  const colW = Math.floor(totalWidth / colCount);
  const columnWidths = new Array(colCount).fill(colW);
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(h => new TableCell({
      width: { size: colW, type: WidthType.DXA },
      borders: cellBorders,
      shading: { fill: "1E3A5F", type: ShadingType.CLEAR, color: "auto" },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 20, font: FONT })] })],
    })),
  });
  const bodyRows = rows.map((r, i) => new TableRow({
    children: r.map((cell, ci) => new TableCell({
      width: { size: colW, type: WidthType.DXA },
      borders: cellBorders,
      shading: i === rows.length - 1 ? { fill: "E2E8F0", type: ShadingType.CLEAR, color: "auto" } : (i % 2 ? { fill: "F8FAFC", type: ShadingType.CLEAR, color: "auto" } : undefined),
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({
        alignment: ci === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
        children: [new TextRun({ text: cell, size: 20, font: FONT, bold: i === rows.length - 1 })],
      })],
    })),
  }));
  return new Table({ width: { size: totalWidth, type: WidthType.DXA }, columnWidths, rows: [headerRow, ...bodyRows] });
}

function buildHighlightBox(title: string, paragraphs: string[]): (Paragraph | Table)[] {
  const border = { style: BorderStyle.SINGLE, size: 12, color: "1E3A5F" };
  const cellBorders = { top: border, bottom: border, left: border, right: border };
  const inner: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: title.toUpperCase(), bold: true, color: "1E3A5F", size: 22, font: FONT })],
    }),
    ...paragraphs.map(t => new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { line: 320, after: 80 },
      children: [new TextRun({ text: t, size: 22, font: FONT })],
    })),
  ];
  return [new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: [9000],
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: 9000, type: WidthType.DXA },
        borders: cellBorders,
        shading: { fill: "F0F9FF", type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 200, bottom: 200, left: 240, right: 240 },
        children: inner,
      })],
    })],
  })];
}

export async function exportFonoAvaliativoDocx(input: FonoDocxInput): Promise<void> {
  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({ text: "RELATÓRIO FONOAUDIOLÓGICO AVALIATIVO", bold: true, size: 28, font: FONT })],
  }));

  // 1. Identificação as a clean 2-col grid
  children.push(p("1. Identificação", { bold: true, heading: HeadingLevel.HEADING_1, align: AlignmentType.LEFT, size: 26 }));
  children.push(buildIdGrid([
    ["Paciente", input.pacienteNome],
    ["Data do Relatório", input.dataRelatorio],
    ["Profissional", input.profissionalNome],
    ["CBO / Conselho", `223810 — ${input.conselho}`],
    ["Unidade", input.unidadeNome],
    ["", ""],
  ]));

  // Custom sections
  input.sections.forEach(sec => {
    if (sec.highlight && sec.paragraphs?.length) {
      children.push(...buildHighlightBox(sec.title, sec.paragraphs));
      return;
    }
    children.push(p(sec.title, { bold: true, heading: HeadingLevel.HEADING_1, align: AlignmentType.LEFT, size: 26 }));
    const hasFields = sec.fields && sec.fields.length > 0;
    const hasParas = sec.paragraphs && sec.paragraphs.length > 0;
    const hasTable = !!sec.table;
    if (!hasFields && !hasParas && !hasTable) {
      if (sec.emptyMessage) children.push(p(sec.emptyMessage, { align: AlignmentType.LEFT }));
      return;
    }
    if (sec.table) children.push(buildDataTable(sec.table.headers, sec.table.rows));
    sec.fields?.forEach(f => children.push(fieldPara(f.label, f.value)));
    sec.paragraphs?.forEach(t => children.push(p(t)));
  });


  // Signature
  children.push(new Paragraph({ spacing: { before: 720 }, children: [new TextRun({ text: "" })] }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "_______________________________________", size: 24, font: FONT })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: input.profissionalNome, bold: true, size: 24, font: FONT })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: `Fonoaudiólogo(a) — CBO 223810 — ${input.conselho}`, size: 22, font: FONT })],
  }));

  const header = await buildHeader();
  const footer = buildFooter();

  const doc = new Document({
    styles: {
      default: { document: { run: { font: FONT, size: 24 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 26, bold: true, font: FONT },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: ABNT.pageW, height: ABNT.pageH, orientation: PageOrientation.PORTRAIT },
          margin: { top: ABNT.top, right: ABNT.right, bottom: ABNT.bottom, left: ABNT.left },
        },
      },
      headers: { default: header },
      footers: { default: footer },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const safeName = input.pacienteNome.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const safeDate = input.dataRelatorio.replace(/\D/g, "");
  saveAs(blob, `Relatorio_Fonoaudiologico_Avaliativo_${safeName}_${safeDate}.docx`);
}

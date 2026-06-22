// ABNT-compliant DOCX export for Relatório Fonoaudiológico Avaliativo.
// Uses the same structured data as the print/PDF output to avoid divergence.
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel,
  PageOrientation, ImageRun, Header, Footer, PageNumber, LevelFormat,
} from "docx";
import { saveAs } from "file-saver";
import { loadDocumentConfig } from "@/lib/printLayout";

export interface ReportField { label: string; value: string }
export interface ReportSection { title: string; fields?: ReportField[]; paragraphs?: string[]; emptyMessage?: string }
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
  const logos = (cfg.logos || []).filter((l: any) => l?.enabled && l?.url);
  const imgRuns: ImageRun[] = [];
  for (const logo of logos) {
    const bytes = await fetchImageBytes(logo.url);
    if (!bytes) continue;
    const px = Math.min(120, Math.max(30, Number(logo.size) || 80));
    imgRuns.push(new ImageRun({
      type: detectImageType(logo.url) as any,
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
  const inst = (cfg as any).institutionName || (cfg as any).header?.institutionName || "";
  if (inst) headerChildren.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: inst, bold: true, size: 22, font: FONT })],
  }));
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

export async function exportFonoAvaliativoDocx(input: FonoDocxInput): Promise<void> {
  const children: Paragraph[] = [];

  // Title
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({ text: "RELATÓRIO FONOAUDIOLÓGICO AVALIATIVO", bold: true, size: 28, font: FONT })],
  }));

  // 1. Identificação
  children.push(p("1. Identificação do Paciente e Profissional", { bold: true, heading: HeadingLevel.HEADING_1, align: AlignmentType.LEFT, size: 26 }));
  children.push(fieldPara("Paciente", input.pacienteNome));
  children.push(fieldPara("Data do Relatório", input.dataRelatorio));
  children.push(fieldPara("Profissional", input.profissionalNome));
  children.push(fieldPara("CBO / Conselho", `223810 — ${input.conselho}`));
  children.push(fieldPara("Unidade", input.unidadeNome));

  // Custom sections (already pre-numbered by caller)
  input.sections.forEach(sec => {
    children.push(p(sec.title, { bold: true, heading: HeadingLevel.HEADING_1, align: AlignmentType.LEFT, size: 26 }));
    const hasFields = sec.fields && sec.fields.length > 0;
    const hasParas = sec.paragraphs && sec.paragraphs.length > 0;
    if (!hasFields && !hasParas) {
      children.push(p(sec.emptyMessage || "Sem informações.", { align: AlignmentType.LEFT }));
      return;
    }
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

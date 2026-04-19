import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ProntuarioLike {
  id: string;
  paciente_nome: string;
  profissional_nome: string;
  data_atendimento: string;
  hora_atendimento?: string;
  setor?: string;
  queixa_principal?: string;
  anamnese?: string;
  exame_fisico?: string;
  hipotese?: string;
  conduta?: string;
  prescricao?: string;
  solicitacao_exames?: string;
  evolucao?: string;
  observacoes?: string;
  procedimentos_texto?: string;
  soap_subjetivo?: string;
  soap_objetivo?: string;
  soap_avaliacao?: string;
  soap_plano?: string;
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

function safe(str: string | undefined | null): string {
  if (!str) return "";
  // try to parse JSON shaped fields and stringify nicely
  if (str.trim().startsWith("{") || str.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(str);
      if (parsed?.medicamentos && Array.isArray(parsed.medicamentos)) {
        return parsed.medicamentos
          .map((m: any, i: number) => `${i + 1}. ${m.nome} — ${m.dosagem || ""} ${m.via || ""} ${m.posologia || ""} ${m.duracao || ""}`)
          .join("\n");
      }
      if (parsed?.exames && Array.isArray(parsed.exames)) {
        return parsed.exames
          .map((e: any) => `• ${e.nome}${e.codigo_sus ? ` (${e.codigo_sus})` : ""}${e.indicacao ? ` — ${e.indicacao}` : ""}`)
          .join("\n");
      }
    } catch { /* not JSON */ }
  }
  return str;
}

function header(doc: jsPDF, title: string, clinica: string) {
  doc.setFillColor(42, 111, 151); // azul saúde
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(clinica, 14, 10);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(title, 14, 17);
  doc.setTextColor(0, 0, 0);
}

function footer(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, h - 8);
    doc.text(`Página ${i}/${pageCount}`, w - 14, h - 8, { align: "right" });
  }
}

function addSection(doc: jsPDF, label: string, value: string, startY: number): number {
  if (!value) return startY;
  if (startY > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage();
    startY = 30;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(42, 111, 151);
  doc.text(label.toUpperCase(), 14, startY);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(value, doc.internal.pageSize.getWidth() - 28);
  doc.text(lines, 14, startY + 5);
  return startY + 5 + lines.length * 5 + 4;
}

export function downloadProntuarioPdf(p: ProntuarioLike, clinica = "Secretaria Municipal de Saúde — Oriximiná") {
  const doc = new jsPDF();
  header(doc, `Prontuário Clínico — ${fmtDate(p.data_atendimento)}`, clinica);

  // patient/professional table
  autoTable(doc, {
    startY: 28,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.5 },
    body: [
      ["Paciente:", p.paciente_nome || "—", "Data:", fmtDate(p.data_atendimento)],
      ["Profissional:", p.profissional_nome || "—", "Hora:", p.hora_atendimento || "—"],
      ["Setor:", p.setor || "—", "ID:", p.id?.slice(0, 8) || "—"],
    ],
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 25 },
      2: { fontStyle: "bold", cellWidth: 18 },
    },
  });

  let y = (doc as any).lastAutoTable.finalY + 6;

  y = addSection(doc, "Queixa Principal", safe(p.queixa_principal), y);
  y = addSection(doc, "S — Subjetivo", safe(p.soap_subjetivo), y);
  y = addSection(doc, "O — Objetivo", safe(p.soap_objetivo), y);
  y = addSection(doc, "A — Avaliação", safe(p.soap_avaliacao), y);
  y = addSection(doc, "P — Plano", safe(p.soap_plano), y);
  y = addSection(doc, "Anamnese", safe(p.anamnese), y);
  y = addSection(doc, "Exame Físico", safe(p.exame_fisico), y);
  y = addSection(doc, "Hipótese Diagnóstica", safe(p.hipotese), y);
  y = addSection(doc, "Conduta", safe(p.conduta), y);
  y = addSection(doc, "Procedimentos", safe(p.procedimentos_texto), y);
  y = addSection(doc, "Prescrição", safe(p.prescricao), y);
  y = addSection(doc, "Solicitação de Exames", safe(p.solicitacao_exames), y);
  y = addSection(doc, "Evolução", safe(p.evolucao), y);
  y = addSection(doc, "Observações", safe(p.observacoes), y);

  // signature line
  if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 30; }
  doc.setDrawColor(150);
  doc.line(60, y + 20, doc.internal.pageSize.getWidth() - 60, y + 20);
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(p.profissional_nome || "Profissional", doc.internal.pageSize.getWidth() / 2, y + 26, { align: "center" });

  footer(doc);
  doc.save(`prontuario_${(p.paciente_nome || "paciente").replace(/\s+/g, "_")}_${p.data_atendimento || ""}.pdf`);
}

interface TimelineEntry {
  date: string;
  type?: string;
  professional?: string;
  specialty?: string;
  summary?: string;
  unidade?: string;
  sessionInfo?: string;
}

export function downloadFullHistoryPdf(
  pacienteNome: string,
  entries: TimelineEntry[],
  clinica = "Secretaria Municipal de Saúde — Oriximiná",
) {
  const doc = new jsPDF();
  header(doc, `Histórico Clínico Completo — ${pacienteNome}`, clinica);

  doc.setFontSize(9);
  doc.setTextColor(80);
  const sorted = [...entries].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const first = sorted[0]?.date ? fmtDate(sorted[0].date) : "—";
  const last = sorted[sorted.length - 1]?.date ? fmtDate(sorted[sorted.length - 1].date) : "—";
  doc.text(`Total de eventos: ${entries.length}   |   Primeiro: ${first}   |   Último: ${last}`, 14, 28);

  autoTable(doc, {
    startY: 33,
    head: [["Data", "Tipo", "Profissional", "Especialidade", "Resumo"]],
    body: [...entries]
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .map((e) => [
        fmtDate(e.date),
        [e.type || "—", e.sessionInfo].filter(Boolean).join(" "),
        e.professional || "—",
        e.specialty || "—",
        (e.summary || "").slice(0, 220),
      ]),
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [42, 111, 151], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 26 },
      2: { cellWidth: 38 },
      3: { cellWidth: 28 },
      4: { cellWidth: "auto" },
    },
  });

  footer(doc);
  doc.save(`historico_${pacienteNome.replace(/\s+/g, "_")}.pdf`);
}

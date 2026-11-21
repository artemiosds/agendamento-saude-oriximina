import { examesAgendados } from "@/lib/agendamentoSigtap";
import { formatCNS } from "@/lib/cnsUtils";
import type { Agendamento, Paciente } from "@/types";

const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => entities[char]);
export const escapeAgendaPrintMeta = (meta: Record<string, string>) =>
  Object.fromEntries(Object.entries(meta).map(([key, value]) => [key, escapeHtml(value)]));

function formatPhone(phone?: string) {
  const digits = phone?.replace(/\D/g, "") || "";
  const national = /^55\d{10,11}$/.test(digits) ? digits.slice(2) : digits;
  return national.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") || "—";
}

export function buildAgendaListPrint(
  rows: readonly Agendamento[],
  patients: ReadonlyMap<string, Pick<Paciente, "cpf" | "cns" | "telefone">>,
  resolvePatient: (id: string, fallback: string) => string,
) {
  const body = rows.map((appointment, index) => {
    const patient = patients.get(appointment.pacienteId);
    const cpf = patient?.cpf?.replace(/\D/g, "").replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    const docs = [cpf && `CPF ${cpf}`, patient?.cns && `CNS ${formatCNS(patient.cns)}`].filter(Boolean);
    const exams = examesAgendados(appointment.customData, appointment.procedimentoSigtap, appointment.nomeProcedimento);
    const procedureNames = exams.map(exam => exam.nome);
    if (!procedureNames.length && appointment.nomeProcedimento) procedureNames.push(appointment.nomeProcedimento);
    const diagnosticName = appointment.customData?.sala_tipo === "aparelho_diagnostico"
      ? appointment.customData.exame_nome : undefined;
    if (typeof diagnosticName === "string" && diagnosticName && !procedureNames.includes(diagnosticName)) {
      procedureNames.push(diagnosticName);
    }
    const cells = [
      [String(index + 1)], [appointment.hora?.slice(0, 5) || "—"],
      [resolvePatient(appointment.pacienteId, appointment.pacienteNome) || "—"], docs.length ? docs : ["—"],
      [formatPhone(patient?.telefone)], [appointment.profissionalNome || "—"],
      [appointment.tipo || "—", ...procedureNames],
    ];
    return `<tr>${cells.map(lines => `<td>${lines.map(escapeHtml).join("<br>")}</td>`).join("")}</tr>`;
  }).join("");

  return `
    <style>
      .doc-meta { overflow-wrap: anywhere; }
      .agenda-print-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-family: Arial, sans-serif; }
      .agenda-print-table thead { display: table-header-group; }
      .agenda-print-table tr { break-inside: avoid; }
      .agenda-print-table th, .agenda-print-table td {
        border: 1px solid #596575; padding: 4px 3px; font-size: 8.5pt;
        vertical-align: top; overflow-wrap: anywhere; line-height: 1.25;
      }
      .agenda-print-table th { background: #e8eef5; text-align: left; }
      .agenda-print-table td:first-child, .agenda-print-table td:nth-child(2) { text-align: center; }
      .agenda-print-table tbody tr:nth-child(even) td { background: #f7f9fc; }
    </style>
    <table class="agenda-print-table">
      <colgroup>
        <col style="width:4%"><col style="width:7%"><col style="width:22%"><col style="width:18%">
        <col style="width:13%"><col style="width:17%"><col style="width:19%">
      </colgroup>
      <thead><tr><th scope="col">Nº</th><th scope="col">Hora</th><th scope="col">Paciente</th><th scope="col">CPF/CNS</th>
        <th scope="col">Telefone</th><th scope="col">Profissional responsável</th><th scope="col">Tipo / Procedimento</th></tr></thead>
      <tbody>${body || '<tr><td colspan="7">Nenhum agendamento para os filtros selecionados.</td></tr>'}</tbody>
    </table>`;
}

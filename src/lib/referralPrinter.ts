/**
 * Impressão de Guia de Encaminhamento — usa o shell institucional global
 * (`buildDocumentShell` + `printViaIframe`). Toda a aparência segue o que
 * estiver em Configurações → Impressão e Documentos.
 */
import { PatientReferral } from "@/services/patientReferralService";
import { format } from "date-fns";
import { buildDocumentShell, loadDocumentConfig, printViaIframe } from "@/lib/printLayout";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function field(label: string, value: any): string {
  const v = (value ?? "").toString().trim() || "—";
  return `
    <div class="field">
      <div class="field-label">${escapeHtml(label)}</div>
      <div class="field-value">${escapeHtml(v)}</div>
    </div>`;
}

function section(title: string, inner: string): string {
  return `
    <div class="section">
      <div class="section-title">${escapeHtml(title)}</div>
      <div class="section-content">${inner}</div>
    </div>`;
}

export async function printReferral(referral: PatientReferral, patient: any): Promise<void> {
  const config = await loadDocumentConfig();

  const dataEncaminhamento = referral.data_encaminhamento
    ? format(new Date(referral.data_encaminhamento), "dd/MM/yyyy")
    : format(new Date(), "dd/MM/yyyy");

  const dataNasc = patient.data_nascimento
    ? format(new Date(patient.data_nascimento), "dd/MM/yyyy")
    : "—";

  const dadosPaciente = `
    <div class="info-grid">
      ${field("Nome", patient.nome)}
      ${field("CPF", patient.cpf)}
      ${field("CNS", patient.cns)}
      ${field("Data de Nascimento", dataNasc)}
    </div>`;

  const dadosEncaminhamento = `
    <div class="info-grid">
      ${field("Especialidade Destino", (referral.especialidade_destino || "").toUpperCase())}
      ${field("Data", dataEncaminhamento)}
      ${field("UBS de Origem", referral.ubs_origem)}
      ${field("Tipo", referral.tipo_encaminhamento)}
      ${field("Profissional Solicitante", referral.profissional_solicitante)}
      ${field("CID-10", referral.cid)}
    </div>`;

  const diagnostico = `
    <div class="section-content">
      ${escapeHtml(referral.diagnostico_resumido || "Não informado.")}
    </div>`;

  const justificativa = `
    <div class="section-content" style="border:1px solid #e2e8f0;padding:12px;border-radius:4px;min-height:80px;white-space:pre-wrap;">
      ${escapeHtml(referral.justificativa || "Nenhuma justificativa fornecida.")}
    </div>`;

  const body = `
    ${section("Dados do Paciente", dadosPaciente)}
    ${section("Informações do Encaminhamento", dadosEncaminhamento)}
    ${section("Diagnóstico Resumido", diagnostico)}
    ${section("Justificativa Clínica", justificativa)}

    <div class="signature">
      <div class="signature-line"></div>
      <div class="name">${escapeHtml((referral.profissional_solicitante || "Profissional Solicitante").toUpperCase())}</div>
      <div class="role">Assinatura e Carimbo</div>
    </div>`;

  const html = buildDocumentShell("Guia de Encaminhamento", body, config, {
    Paciente: patient.nome || "—",
    Destino: referral.especialidade_destino || "—",
    Emissão: dataEncaminhamento,
  });

  printViaIframe(html);
}

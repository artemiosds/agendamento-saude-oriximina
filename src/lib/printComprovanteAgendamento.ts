import { openPrintDocument } from "@/lib/printLayout";

export interface ComprovanteAgendamentoInput {
  id: string;
  data: string; // YYYY-MM-DD
  hora: string;
  tipo?: string;
  status?: string;
  profissionalNome?: string;
  pacienteNome?: string;
  pacienteCpf?: string;
  pacienteCns?: string;
  unidadeNome?: string;
  unidadeEndereco?: string;
  unidadeTelefone?: string;
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente", confirmado: "Confirmado", confirmado_chegada: "Chegada confirmada",
  aguardando_triagem: "Aguardando triagem", aguardando_atendimento: "Aguardando atendimento",
  apto_atendimento: "Apto para atendimento", em_atendimento: "Em atendimento",
  concluido: "Concluído", cancelado: "Cancelado", falta: "Faltou", atraso: "Atraso", remarcado: "Remarcado",
};

const turnoDe = (hora: string) => {
  const h = parseInt((hora || "").slice(0, 2), 10);
  if (isNaN(h)) return "";
  return h < 12 ? "Manhã" : h < 18 ? "Tarde" : "Noite";
};

export function printComprovanteAgendamento(ag: ComprovanteAgendamentoInput) {
  const d = new Date(`${ag.data}T12:00:00`);
  const dataExt = isNaN(d.getTime())
    ? ag.data
    : d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const codigo = (ag.id || "").replace(/-/g, "").slice(0, 8).toUpperCase();
  const emitido = new Date().toLocaleString("pt-BR");
  const f = (label: string, value?: string) =>
    value ? `<div class="field"><div class="field-label">${esc(label)}</div><div class="field-value">${esc(value)}</div></div>` : "";

  const body = `
    <style>
@media print {
  .doc-header { padding-bottom: 5px !important; margin-bottom: 6px !important; }
  .doc-header .logo-slot img { height: 54px !important; max-height: 54px !important; width: auto !important; max-width: 135px !important; }
  .doc-header .header-text { margin-top: 3px !important; gap: 0 !important; }
  .doc-title-bar { font-size: 12pt !important; margin: 2px 0 5px !important; padding: 2px 0 !important; }
  .doc-emit { margin-bottom: 4px !important; }
  .doc-content { font-size: 9pt !important; line-height: 1.1 !important; }
  .comprovante-agendamento { margin-top: 0 !important; }
  .receipt-appointment { padding: 8px 12px !important; margin-bottom: 8px !important; border-radius: 8px !important; }
  .receipt-date { font-size: 18px !important; line-height: 1.2 !important; margin-top: 2px !important; }
  .receipt-time { font-size: 23px !important; line-height: 1.1 !important; margin-top: 0 !important; }
  .receipt-patient { padding: 8px 10px !important; margin-bottom: 8px !important; border-radius: 8px !important; }
  .receipt-patient-name { font-size: 18px !important; line-height: 1.15 !important; margin-top: 1px !important; }
  .receipt-documents { gap: 8px !important; margin-top: 6px !important; }
  .receipt-doc-field { padding: 4px 7px !important; }
  .receipt-consultation { padding: 8px 10px !important; margin-bottom: 8px !important; border-radius: 8px !important; }
  .receipt-consult-type { font-size: 15px !important; margin-top: 1px !important; }
  .receipt-guidance { margin-top: 8px !important; padding: 7px 9px !important; font-size: 10.5px !important; line-height: 1.25 !important; break-inside: avoid !important; page-break-inside: avoid !important; }
  .receipt-guidance ul { margin: 4px 0 0 15px !important; line-height: 1.25 !important; }
  .receipt-guidance li { margin: 0 !important; padding: 0 !important; }
  .receipt-orientations-heading { margin-top: 5px !important; }
  .receipt-code { margin-top: 8px !important; padding-top: 6px !important; break-inside: avoid !important; page-break-inside: avoid !important; }
  .receipt-code-value { font-size: 16px !important; letter-spacing: 2px !important; }
  .receipt-code-issued { font-size: 9px !important; margin-top: 3px !important; }
}
</style>
    <div class="content-block comprovante-agendamento" style="max-width:640px;margin:0 auto;">
      <div class="receipt-appointment" style="border:2px solid #2A6F97;border-radius:10px;padding:14px 16px;margin-bottom:14px;text-align:center;">
        <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#2A6F97;font-weight:700;">Atendimento agendado</div>
        <div class="receipt-date" style="font-size:20px;font-weight:700;margin-top:4px;text-transform:capitalize;">${esc(dataExt)}</div>
        <div class="receipt-time" style="font-size:26px;font-weight:800;color:#2A6F97;margin-top:2px;">${esc(ag.hora)}${turnoDe(ag.hora) ? ` <span style="font-size:13px;font-weight:600;color:#475569;">(${turnoDe(ag.hora)})</span>` : ""}</div>
      </div>
      <div class="receipt-patient" style="border:1px solid #cbd5e1;border-radius:10px;padding:12px 14px;margin-bottom:12px;">
        <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#64748b;font-weight:700;">Paciente</div>
        <div class="receipt-patient-name" style="font-size:20px;font-weight:800;margin-top:2px;">${esc(ag.pacienteNome || "—")}</div>
        <div class="receipt-documents" style="display:flex;gap:10px;margin-top:10px;">
          <div class="receipt-doc-field" style="flex:1;background:#f1f5f9;border-radius:6px;padding:6px 10px;"><div style="font-size:10px;color:#64748b;font-weight:700;">CPF</div><div style="font-size:14px;font-weight:700;font-family:monospace;">${esc(ag.pacienteCpf || "Não informado")}</div></div>
          <div class="receipt-doc-field" style="flex:1;background:#f1f5f9;border-radius:6px;padding:6px 10px;"><div style="font-size:10px;color:#64748b;font-weight:700;">CARTÃO SUS (CNS)</div><div style="font-size:14px;font-weight:700;font-family:monospace;">${esc(ag.pacienteCns || "Não informado")}</div></div>
        </div>
      </div>
      <div class="receipt-consultation" style="border:1px solid #cbd5e1;border-radius:10px;padding:12px 14px;margin-bottom:12px;">
        <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#64748b;font-weight:700;">Consulta</div>
        <div class="receipt-consult-type" style="font-size:16px;font-weight:700;margin-top:2px;">${esc(ag.tipo || "Atendimento")}</div>
        <div style="font-size:14px;margin-top:4px;"><strong>Profissional:</strong> ${esc(ag.profissionalNome || "—")}</div>
        ${ag.status ? `<div style="font-size:13px;margin-top:2px;"><strong>Situação:</strong> ${esc(STATUS_LABEL[ag.status] || ag.status)}</div>` : ""}
      </div>
      ${f("Unidade", ag.unidadeNome)}
      ${f("Endereço", ag.unidadeEndereco)}
      ${f("Telefone da unidade", ag.unidadeTelefone)}
      <div class="receipt-guidance" style="margin-top:14px;padding:10px 12px;background:#f1f5f9;border-radius:8px;font-size:12px;line-height:1.5;">
        <strong>Documentos obrigatórios para o atendimento:</strong>
        <ul style="margin:6px 0 0 18px;padding:0;">
          <li>Documento oficial de identificação com foto (RG, CNH ou outro).</li>
          <li>CPF.</li>
          <li>Cartão SUS (CNS).</li>
          <li>Este comprovante de agendamento.</li>
          <li>Encaminhamento/guia de referência, quando houver.</li>
          <li>Exames, receitas e relatórios médicos anteriores, se houver.</li>
        </ul>
        <strong class="receipt-orientations-heading" style="display:block;margin-top:8px;">Orientações:</strong>
        <ul style="margin:6px 0 0 18px;padding:0;">
          <li>Chegue com 15 minutos de antecedência.</li>
          <li>Se não puder comparecer, avise a unidade com antecedência.</li>
        </ul>
      </div>
      <div class="receipt-code" style="margin-top:14px;text-align:center;border-top:1px dashed #94a3b8;padding-top:10px;">
        <div style="font-size:11px;color:#64748b;">Código de conferência</div>
        <div class="receipt-code-value" style="font-family:monospace;font-size:18px;font-weight:700;letter-spacing:3px;">${esc(codigo)}</div>
        <div class="receipt-code-issued" style="font-size:10px;color:#94a3b8;margin-top:6px;">Emitido em ${esc(emitido)}</div>
      </div>
    </div>`;
  return openPrintDocument("Comprovante de Agendamento", body, { Unidade: ag.unidadeNome || "" }, {
    margens: { superior: 12, inferior: 20, esquerda: 12, direita: 12 },
    tipografia: { fonte: "Arial", tamanhoBase: 9, tamanhoTitulo: 12, espacamento: 1.1, alinhamento: "left" },
  });
}

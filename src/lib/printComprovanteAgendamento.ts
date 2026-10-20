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
    <div class="content-block" style="max-width:640px;margin:0 auto;">
      <div style="border:2px solid #2A6F97;border-radius:10px;padding:14px 16px;margin-bottom:14px;text-align:center;">
        <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#2A6F97;font-weight:700;">Atendimento agendado</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px;text-transform:capitalize;">${esc(dataExt)}</div>
        <div style="font-size:26px;font-weight:800;color:#2A6F97;margin-top:2px;">${esc(ag.hora)}${turnoDe(ag.hora) ? ` <span style="font-size:13px;font-weight:600;color:#475569;">(${turnoDe(ag.hora)})</span>` : ""}</div>
      </div>
      ${f("Paciente", ag.pacienteNome)}
      ${f("CPF", ag.pacienteCpf)}
      ${f("Cartão SUS (CNS)", ag.pacienteCns)}
      ${f("Profissional", ag.profissionalNome)}
      ${f("Tipo de atendimento", ag.tipo)}
      ${f("Situação", ag.status ? STATUS_LABEL[ag.status] || ag.status : "")}
      ${f("Unidade", ag.unidadeNome)}
      ${f("Endereço", ag.unidadeEndereco)}
      ${f("Telefone da unidade", ag.unidadeTelefone)}
      <div style="margin-top:14px;padding:10px 12px;background:#f1f5f9;border-radius:8px;font-size:12px;line-height:1.5;">
        <strong>Orientações:</strong>
        <ul style="margin:6px 0 0 18px;padding:0;">
          <li>Chegue com 15 minutos de antecedência.</li>
          <li>Traga documento com foto, Cartão SUS e este comprovante.</li>
          <li>Traga exames e receitas anteriores, se houver.</li>
          <li>Se não puder comparecer, avise a unidade com antecedência.</li>
        </ul>
      </div>
      <div style="margin-top:14px;text-align:center;border-top:1px dashed #94a3b8;padding-top:10px;">
        <div style="font-size:11px;color:#64748b;">Código de conferência</div>
        <div style="font-family:monospace;font-size:18px;font-weight:700;letter-spacing:3px;">${esc(codigo)}</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:6px;">Emitido em ${esc(emitido)}</div>
      </div>
    </div>`;
  return openPrintDocument("Comprovante de Agendamento", body, { Unidade: ag.unidadeNome || "" });
}

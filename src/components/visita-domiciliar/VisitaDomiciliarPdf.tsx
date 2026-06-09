import React from "react";
import { buildDocumentShell, docCarimboFor } from "@/lib/printLayout";

interface VisitaDomiciliarPdfProps {
  data: any;
}

export const generateVisitaDomiciliarHtml = async (data: any) => {
  const { 
    paciente_nome, paciente_cpf, paciente_cns, paciente_data_nascimento, paciente_sexo,
    profissional_nome, profissional_conselho, profissional_tipo_conselho, profissional_uf_conselho,
    unidade_nome, data_atendimento,
    evolucao_visita, conduta_orientacoes, observacoes,
    tipo_visita, medidas
  } = data;

  const escapeHtml = (s: string) => s ? String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : "";
  const fmtDate = (d: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";
  
  const carimboHtml = await docCarimboFor(data.profissional_id, {
    nome: profissional_nome,
    especialidade: data.profissional_profissao || "",
    conselho: profissional_tipo_conselho,
    numero_registro: profissional_conselho,
    uf: profissional_uf_conselho
  });

  let medidasHtml = "";
  if (tipo_visita === "medidas_cadeira_rodas" && medidas) {
    const tableRows = [
      { id: "A", l: "Largura dos Ombros" },
      { id: "B", l: "Largura do Quadril" },
      { id: "C", l: "Largura das Costas" },
      { id: "D", l: "Do assento ao topo da cabeça" },
      { id: "E", l: "Do assento à Nuca" },
      { id: "F", l: "Do assento à borda inf. da escápula" },
      { id: "G", l: "Altura do assento ao ombro" },
      { id: "H", l: "Altura do assento axila esquerda" },
      { id: "I", l: "Altura do assento axila direita" },
      { id: "J", l: "Altura do assento ao cotovelo" },
      { id: "K", l: "Profundidade do assento" },
      { id: "L", l: "Do pé à base do joelho" },
      { id: "M", l: "Tamanho do pé" },
    ].map(item => `
      <tr>
        <td style="border: 0.5px solid #000; padding: 2px; text-align: center;"><b>${item.id}</b></td>
        <td style="border: 0.5px solid #000; padding: 2px;">${item.l}</td>
        <td style="border: 0.5px solid #000; padding: 2px; text-align: center;">${medidas[item.id] || "—"} cm</td>
      </tr>
    `).join("");

    medidasHtml = `
      <div style="margin-top: 15px; page-break-inside: avoid;">
        <h3 style="font-size: 11pt; border-bottom: 1px solid #000; margin-bottom: 5px;">MEDIDAS PARA CADEIRA DE RODAS</h3>
        <div style="display: flex; gap: 20px;">
          <table style="width: 60%; border-collapse: collapse; font-size: 9pt;">
            <thead>
              <tr style="background: #f0f0f0;">
                <th style="border: 0.5px solid #000; width: 30px;">ID</th>
                <th style="border: 0.5px solid #000;">Descrição</th>
                <th style="border: 0.5px solid #000; width: 80px;">Medida</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
          <div style="width: 35%; font-size: 8.5pt;">
            <p><b>Diagnóstico:</b> ${escapeHtml(medidas.diagnostico_condicao || "—")}</p>
            <p><b>Motivo:</b> ${escapeHtml(medidas.motivo_solicitacao || "—")}</p>
            <p><b>Largura Assento:</b> ${medidas.largura_assento || "—"} cm</p>
            <p><b>Prof. Assento:</b> ${medidas.profundidade_assento || "—"} cm</p>
            <p><b>Alt. Encosto:</b> ${medidas.altura_encosto || "—"} cm</p>
            <p><b>Justificativa:</b> ${escapeHtml(medidas.justificativa_tecnica || "—")}</p>
          </div>
        </div>
      </div>
    `;
  }

  const content = `
    <div id="visita-pdf" style="font-family: sans-serif; color: #000; line-height: 1.3;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="margin: 0; font-size: 14pt;">Secretaria Municipal de Saúde de Oriximiná</h2>
        <h3 style="margin: 5px 0; font-size: 12pt;">Centro Especializado em Reabilitação II — CER II</h3>
        <h4 style="margin: 5px 0; font-size: 11pt; text-decoration: underline;">RELATÓRIO DE VISITA DOMICILIAR</h4>
        <p style="margin: 5px 0; font-size: 10pt;">Data: ${fmtDate(data_atendimento)}</p>
      </div>

      <div style="border: 1px solid #000; padding: 8px; margin-bottom: 15px; font-size: 10pt; display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
        <div><b>Paciente:</b> ${escapeHtml(paciente_nome)}</div>
        <div><b>CPF:</b> ${escapeHtml(paciente_cpf || "—")}</div>
        <div><b>CNS:</b> ${escapeHtml(paciente_cns || "—")}</div>
        <div><b>Nasc.:</b> ${fmtDate(paciente_data_nascimento)}</div>
        <div><b>Profissional:</b> ${escapeHtml(profissional_nome)}</div>
        <div><b>Conselho:</b> ${escapeHtml(profissional_tipo_conselho)} ${escapeHtml(profissional_conselho)}/${escapeHtml(profissional_uf_conselho)}</div>
        <div style="grid-column: span 2;"><b>Unidade:</b> ${escapeHtml(unidade_nome)}</div>
      </div>

      <div style="margin-bottom: 15px;">
        <h3 style="font-size: 11pt; border-bottom: 1px solid #000; margin-bottom: 5px;">EVOLUÇÃO DA VISITA</h3>
        <p style="font-size: 10pt; white-space: pre-wrap; text-align: justify;">${escapeHtml(evolucao_visita || "Nenhuma evolução registrada.")}</p>
      </div>

      <div style="margin-bottom: 15px;">
        <h3 style="font-size: 11pt; border-bottom: 1px solid #000; margin-bottom: 5px;">CONDUTA / ORIENTAÇÕES</h3>
        <p style="font-size: 10pt; white-space: pre-wrap; text-align: justify;">${escapeHtml(conduta_orientacoes || "Nenhuma conduta registrada.")}</p>
      </div>

      ${observacoes ? `
      <div style="margin-bottom: 15px;">
        <h3 style="font-size: 11pt; border-bottom: 1px solid #000; margin-bottom: 5px;">OBSERVAÇÕES</h3>
        <p style="font-size: 10pt; white-space: pre-wrap; text-align: justify;">${escapeHtml(observacoes)}</p>
      </div>` : ""}

      ${medidasHtml}

      <div style="margin-top: 50px; text-align: center;">
        ${carimboHtml || `
          <div style="margin: 0 auto; width: 250px; border-top: 1px solid #000; padding-top: 5px;">
            <p style="margin: 0; font-size: 10pt; font-weight: bold;">${escapeHtml(profissional_nome).toUpperCase()}</p>
            <p style="margin: 0; font-size: 9pt;">Assinatura e Carimbo</p>
          </div>
        `}
      </div>
    </div>
  `;

  return buildDocumentShell(content, "Relatório de Visita Domiciliar", { orientation: "portrait" });
};

const VisitaDomiciliarPdf: React.FC<VisitaDomiciliarPdfProps> = ({ data }) => {
  return null; // Este componente é apenas para lógica de geração de HTML/PDF
};

export default VisitaDomiciliarPdf;

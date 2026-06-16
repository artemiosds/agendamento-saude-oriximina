/**
 * Impressão isolada — Visita Domiciliar.
 * Não toca em prontuarioPdf.ts. Usa o shell institucional padrão (openPrintDocument).
 */
import { openPrintDocument, docCarimboFor } from "./printLayout";

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const nl2br = (v: unknown): string => esc(v).replace(/\n/g, "<br/>");

const fmtDateBR = (iso?: string): string => {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

const TABELA_AM: Array<{ letra: string; label: string }> = [
  { letra: "A", label: "Largura dos Ombros" },
  { letra: "B", label: "Largura do Quadril" },
  { letra: "C", label: "Largura das Costas" },
  { letra: "D", label: "Do assento ao topo da cabeça" },
  { letra: "E", label: "Do assento à Nuca" },
  { letra: "F", label: "Do assento à borda inf. escápula" },
  { letra: "G", label: "Altura do assento ao ombro" },
  { letra: "H", label: "Altura assento axila esquerda" },
  { letra: "I", label: "Altura assento axila direita" },
  { letra: "J", label: "Altura do assento ao cotovelo" },
  { letra: "K", label: "Profundidade do assento" },
  { letra: "L", label: "Do pé à base do joelho" },
  { letra: "M", label: "Tamanho do pé" },
];

function section(title: string, html: string): string {
  return `
    <div class="vd-section">
      <h3 class="vd-section-title">${esc(title)}</h3>
      <div class="vd-section-body">${html}</div>
    </div>`;
}

function campo(label: string, value: unknown, opts: { block?: boolean } = {}): string {
  const v = value && String(value).trim() ? nl2br(value) : "<span class='vd-empty'>—</span>";
  return opts.block
    ? `<div class="vd-field-block"><div class="vd-field-label">${esc(label)}</div><div class="vd-field-value">${v}</div></div>`
    : `<div class="vd-field-inline"><span class="vd-field-label">${esc(label)}:</span> <span class="vd-field-value">${v}</span></div>`;
}

export interface ImprimirVisitaDomiciliarParams {
  paciente?: any;
  profissional?: any;
  unidade?: any;
  dataAtendimento?: string;
  data: any;
  impressoPor?: any;
}

export async function imprimirVisitaDomiciliar(
  params: ImprimirVisitaDomiciliarParams,
): Promise<void> {
  const { paciente, profissional, unidade, dataAtendimento, data, impressoPor } = params;
  const finalidade =
    data?.finalidade_atendimento === "medidas_cadeira_rodas"
      ? "Medidas para cadeira de rodas"
      : "Atendimento domiciliar geral";

  const medidas = data?.medidas_cadeira_rodas || {};
  const m = medidas.medidas || {};

  const carimbo = await docCarimboFor(profissional?.id || "", {
    nome: profissional?.nome,
    especialidade: profissional?.profissao,
    conselho: profissional?.conselho,
  });

  const css = `
    <style>
      .vd-section { margin: 10px 0; page-break-inside: avoid; }
      .vd-section-title {
        font-size: 10.5pt; font-weight: 700; color: #2A6F97;
        border-bottom: 1px solid #2A6F97; padding: 2px 0 3px;
        margin: 0 0 6px; text-transform: uppercase; letter-spacing: .5px;
      }
      .vd-section-body { font-size: 9.5pt; line-height: 1.45; }
      .vd-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; }
      .vd-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px 12px; }
      .vd-field-block { margin-bottom: 6px; }
      .vd-field-inline { margin: 2px 0; }
      .vd-field-label { font-weight: 600; color: #333; }
      .vd-field-value { color: #111; }
      .vd-empty { color: #999; }
      .vd-am-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
      .vd-am-table th, .vd-am-table td {
        border: 1px solid #bbb; padding: 3px 6px; text-align: left;
      }
      .vd-am-table th { background: #f0f4f7; color: #2A6F97; }
      .vd-am-letra {
        display: inline-block; width: 18px; height: 18px; line-height: 18px;
        background: #2A6F97; color: #fff; border-radius: 50%; text-align: center;
        font-weight: 700; font-size: 8.5pt; margin-right: 4px;
      }
      .vd-cm { text-align: right; width: 60px; }
      .vd-carimbo { margin-top: 28px; }
      .vd-final { padding: 4px 8px; background: #e6f2f7; border-left: 3px solid #2A6F97; font-weight: 600; }
      .vd-diagrama-placeholder {
        border: 1px dashed #888; padding: 10px; text-align: center;
        color: #666; font-size: 9pt; margin: 6px 0;
      }
    </style>`;

  let body = css;

  // Cabeçalho de atendimento
  body += section(
    "Atendimento",
    `<div class="vd-grid-2">
      ${campo("Paciente", paciente?.nome)}
      ${campo("CPF", paciente?.cpf)}
      ${campo("CNS", paciente?.cns)}
      ${campo("Data de Nasc.", paciente?.data_nasc ? fmtDateBR(paciente.data_nasc) : "")}
      ${campo("Unidade", unidade?.nome)}
      ${campo("Data do Atendimento", fmtDateBR(dataAtendimento))}
      ${campo("Profissional", profissional?.nome)}
      ${campo("Profissão / Conselho", [profissional?.profissao, profissional?.conselho].filter(Boolean).join(" · "))}
     </div>
     <div class="vd-final" style="margin-top:8px">Finalidade: ${esc(finalidade)}</div>`,
  );

  // Bloco principal
  body += section(
    "Evolução da Visita",
    campo("", data?.evolucao_visita, { block: true }),
  );
  body += section(
    "Conduta / Orientações",
    campo("", data?.conduta_orientacoes, { block: true }),
  );
  if (data?.observacoes) {
    body += section("Observações", campo("", data.observacoes, { block: true }));
  }

  // Medidas para cadeira de rodas
  if (data?.finalidade_atendimento === "medidas_cadeira_rodas") {
    body += section(
      "Prescrição e Medidas — Cadeira de Rodas",
      `<div class="vd-grid-2">
        ${campo("Data da avaliação", medidas.data_avaliacao ? fmtDateBR(medidas.data_avaliacao) : "")}
        ${campo("Equipamento solicitado", medidas.equipamento_solicitado)}
       </div>
       ${campo("Diagnóstico / Condição funcional", medidas.diagnostico_condicao_funcional, { block: true })}
       ${campo("Motivo da solicitação", medidas.motivo_solicitacao, { block: true })}
       <div class="vd-grid-4">
        ${campo("Controle cervical", medidas.controle_cervical)}
        ${campo("Controle de tronco", medidas.controle_tronco)}
        ${campo("Equilíbrio sentado", medidas.equilibrio_sentado)}
        ${campo("Risco de lesão por pressão", medidas.risco_lesao_pressao)}
       </div>
       <div class="vd-grid-2">
        ${campo("Mobilidade MMSS", medidas.mobilidade_membros_superiores)}
        ${campo("Mobilidade MMII", medidas.mobilidade_membros_inferiores)}
        ${campo("Deformidades / Contraturas", medidas.deformidades_contraturas)}
        ${campo("Tipo de cadeira indicada", medidas.tipo_cadeira_indicada)}
       </div>`,
    );

    body += section(
      "Diagrama de Medidas Anatômicas",
      `<div style="text-align:center;margin:6px 0;">
         <img src="${window.location.origin}/images/diagrama-cadeira-rodas.png"
              alt="Diagrama de medidas anatômicas para cadeira de rodas"
              style="max-width:100%;max-height:360px;height:auto;object-fit:contain;" />
       </div>`,
    );


    const rows = TABELA_AM.map(
      (it) => `
        <tr>
          <td><span class="vd-am-letra">${it.letra}</span>${esc(it.label)}</td>
          <td class="vd-cm">${m[it.letra] ? esc(m[it.letra]) + " cm" : "—"}</td>
        </tr>`,
    ).join("");

    body += section(
      "Tabela de Medidas (cm)",
      `<table class="vd-am-table">
        <thead><tr><th>Referência</th><th class="vd-cm">Medida</th></tr></thead>
        <tbody>${rows}</tbody>
       </table>`,
    );

    body += section(
      "Adaptações necessárias / Justificativa técnica",
      campo("", medidas.adaptacoes_justificativa, { block: true }),
    );
    body += section(
      "Orientações / Parecer do profissional",
      campo("", medidas.orientacoes_parecer, { block: true }),
    );
    if (medidas.observacoes_gerais) {
      body += section(
        "Observações gerais",
        campo("", medidas.observacoes_gerais, { block: true }),
      );
    }
  }

  body += `<div class="vd-carimbo">${carimbo}</div>`;

  await openPrintDocument(
    "Visita Domiciliar",
    body,
    {
      Paciente: paciente?.nome || "—",
      Profissional: profissional?.nome || "—",
      Data: fmtDateBR(dataAtendimento),
      ...(impressoPor?.nome ? { "Impresso por": impressoPor.nome } : {}),
    },
  );
}

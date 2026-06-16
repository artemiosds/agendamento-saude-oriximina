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

const hasValue = (v: unknown): boolean => v !== undefined && v !== null && String(v).trim() !== "";

const dataNascimentoPaciente = (paciente: any): string =>
  paciente?.data_nascimento || paciente?.dataNascimento || paciente?.data_nasc || "";

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
  const v = hasValue(value) ? nl2br(value) : "<span class='vd-empty'>—</span>";
  const labelHtml = label ? `<div class="vd-field-label">${esc(label)}</div>` : "";
  return opts.block
    ? `<div class="vd-field-block">${labelHtml}<div class="vd-field-value">${v}</div></div>`
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
  const { paciente, profissional, unidade, dataAtendimento, data: rawData, impressoPor } = params;
  const data = rawData && typeof rawData === "object" ? rawData : {};
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
      .vd-section { margin: 7px 0; page-break-inside: avoid; }
      .vd-section-title {
        font-size: 8.5pt; font-weight: 700; color: #0369a1;
        border-bottom: .5px solid #0369a1; padding: 0 0 2px;
        margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0;
      }
      .vd-section-body { font-size: 9pt; line-height: 1.25; }
      .vd-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; }
      .vd-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px 8px; }
      .vd-field-block { margin-bottom: 4px; }
      .vd-field-inline { margin: 1px 0; }
      .vd-field-label { font-weight: 600; color: #333; }
      .vd-field-value { color: #111; }
      .vd-empty { color: #999; }
      .vd-am-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 0; }
      .vd-am-table th, .vd-am-table td {
        border: 1px solid #cbd5e1; padding: 2px 5px; text-align: left;
      }
      .vd-am-table th { background: #f1f5f9; color: #0f172a; }
      .vd-am-letra {
        display: inline-block; width: 16px; height: 16px; line-height: 16px;
        background: #2A6F97; color: #fff; border-radius: 50%; text-align: center;
        font-weight: 700; font-size: 8pt; margin-right: 4px;
      }
      .vd-cm { text-align: right; width: 60px; }
      .vd-carimbo { margin-top: 22px; }
      .vd-final { padding: 4px 8px; background: #f0f9ff; border-left: 3px solid #2A6F97; font-weight: 600; }
      .vd-diagram { display:block; width:100%; max-width:680px; max-height:300px; height:auto; object-fit:contain; margin:0 auto; }
    </style>`;

  let body = css;

  // Cabeçalho de atendimento
  body += section(
    "Atendimento",
    `<div class="vd-grid-2">
      ${campo("Paciente", paciente?.nome)}
      ${campo("CPF", paciente?.cpf)}
      ${campo("CNS", paciente?.cns)}
      ${campo("Data de Nasc.", fmtDateBR(dataNascimentoPaciente(paciente)))}
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
  body += section("Observações", campo("", data?.observacoes, { block: true }));

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
      `<div style="text-align:center;margin:3px 0;">
         <img src="${window.location.origin}/images/diagrama-cadeira-rodas.png"
              alt="Diagrama de medidas anatômicas para cadeira de rodas"
               class="vd-diagram" />
       </div>`,
    );


    const rows = TABELA_AM.map(
      (it) => `
        <tr>
          <td><span class="vd-am-letra">${it.letra}</span>${esc(it.label)}</td>
          <td class="vd-cm">${hasValue(m[it.letra]) ? esc(m[it.letra]) + " cm" : "—"}</td>
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
    body += section(
      "Observações gerais",
      campo("", medidas.observacoes_gerais, { block: true }),
    );
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

/**
 * Geração de PDF/impressão de Prontuário e Histórico Clínico.
 *
 * REFATORADO: passou a usar o shell institucional global
 * (`buildDocumentShell` + `printViaIframe`) em vez de jsPDF.
 * Isto garante fidelidade absoluta entre preview, impressão e
 * "Salvar como PDF" do navegador, respeitando o que estiver
 * configurado em Configurações → Impressão e Documentos.
 *
 * UX: o botão "Baixar PDF" agora abre o diálogo de impressão
 * do navegador; o usuário escolhe destino "Salvar como PDF".
 */

import { buildDocumentShell, loadDocumentConfig, printViaIframe } from "./printLayout";

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safe(str: string | undefined | null): string {
  if (!str) return "";
  const trimmed = String(str).trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed?.medicamentos && Array.isArray(parsed.medicamentos)) {
        return parsed.medicamentos
          .map(
            (m: any, i: number) =>
              `${i + 1}. ${m.nome || ""} — ${m.dosagem || ""} ${m.via || ""} ${m.posologia || ""} ${m.duracao || ""}`
          )
          .join("\n");
      }
      if (parsed?.exames && Array.isArray(parsed.exames)) {
        return parsed.exames
          .map(
            (e: any) =>
              `• ${e.nome}${e.codigo_sus ? ` (${e.codigo_sus})` : ""}${e.indicacao ? ` — ${e.indicacao}` : ""}`
          )
          .join("\n");
      }
    } catch {
      /* not JSON */
    }
  }
  return trimmed;
}

function section(label: string, value: string): string {
  if (!value) return "";
  return `
    <div class="section">
      <div class="section-title">${escapeHtml(label)}</div>
      <div class="section-content">${escapeHtml(value).replace(/\n/g, "<br/>")}</div>
    </div>`;
}

export async function downloadProntuarioPdf(
  p: ProntuarioLike,
  _clinica?: string,
): Promise<void> {
  const config = await loadDocumentConfig();
  const title = `Prontuário Clínico — ${fmtDate(p.data_atendimento)}`;

  const body = `
    ${section("Queixa Principal", safe(p.queixa_principal))}
    ${section("S — Subjetivo", safe(p.soap_subjetivo))}
    ${section("O — Objetivo", safe(p.soap_objetivo))}
    ${section("A — Avaliação", safe(p.soap_avaliacao))}
    ${section("P — Plano", safe(p.soap_plano))}
    ${section("Anamnese", safe(p.anamnese))}
    ${section("Exame Físico", safe(p.exame_fisico))}
    ${section("Hipótese Diagnóstica", safe(p.hipotese))}
    ${section("Conduta", safe(p.conduta))}
    ${section("Procedimentos", safe(p.procedimentos_texto))}
    ${section("Prescrição", safe(p.prescricao))}
    ${section("Solicitação de Exames", safe(p.solicitacao_exames))}
    ${section("Evolução", safe(p.evolucao))}
    ${section("Observações", safe(p.observacoes))}

    <div class="signature">
      <div class="signature-line"></div>
      <div class="name">${escapeHtml((p.profissional_nome || "Profissional").toUpperCase())}</div>
      <div class="role">Responsável pelo Atendimento</div>
    </div>`;

  const html = buildDocumentShell(title, body, config, {
    Paciente: p.paciente_nome || "—",
    Profissional: p.profissional_nome || "—",
    Data: fmtDate(p.data_atendimento),
    Hora: p.hora_atendimento || "—",
    Setor: p.setor || "—",
  });

  printViaIframe(html);
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

export async function downloadFullHistoryPdf(
  pacienteNome: string,
  entries: TimelineEntry[],
  _clinica?: string,
): Promise<void> {
  const config = await loadDocumentConfig();

  const sorted = [...entries].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const first = sorted[0]?.date ? fmtDate(sorted[0].date) : "—";
  const last = sorted[sorted.length - 1]?.date ? fmtDate(sorted[sorted.length - 1].date) : "—";

  const rows = [...entries]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map(
      (e) => `
        <tr>
          <td>${fmtDate(e.date)}</td>
          <td>${escapeHtml([e.type || "—", e.sessionInfo].filter(Boolean).join(" "))}</td>
          <td>${escapeHtml(e.professional || "—")}</td>
          <td>${escapeHtml(e.specialty || "—")}</td>
          <td>${escapeHtml((e.summary || "").slice(0, 400))}</td>
        </tr>`
    )
    .join("");

  const body = `
    <div class="summary">
      <div class="stat"><strong>${entries.length}</strong><small>Eventos</small></div>
      <div class="stat"><strong>${first}</strong><small>Primeiro</small></div>
      <div class="stat"><strong>${last}</strong><small>Último</small></div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:14%">Data</th>
          <th style="width:16%">Tipo</th>
          <th style="width:22%">Profissional</th>
          <th style="width:18%">Especialidade</th>
          <th>Resumo</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  const html = buildDocumentShell(
    `Histórico Clínico Completo — ${pacienteNome}`,
    body,
    config,
    { Paciente: pacienteNome, "Total de eventos": String(entries.length) }
  );

  printViaIframe(html);
}

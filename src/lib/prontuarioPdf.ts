/**
 * Geração de PDF/impressão de Prontuário e Histórico Clínico.
 */

import { buildDocumentShell, loadDocumentConfig, printViaIframe, docCarimboFor } from "./printLayout";

interface ProntuarioLike {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  data_atendimento: string;
  hora_atendimento?: string;
  unidade_id?: string;
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
  tipo_registro?: string;
  soap_subjetivo?: string;
  soap_objetivo?: string;
  soap_avaliacao?: string;
  soap_plano?: string;
  resultado_exame?: string;
  indicacao_retorno?: string;
  episodio_id?: string | null;
  paciente_data_nasc?: string;
  paciente_cpf?: string;
  paciente_cns?: string;
  paciente_sexo?: string;
  paciente_telefone?: string;
  unidade_nome?: string;
  profissional_especialidade?: string;
  ciclo_info?: any;
  pts_info?: any;
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

function calcIdade(dataNasc: string | undefined): string {
  if (!dataNasc) return "";
  try {
    const today = new Date();
    const birthDate = new Date(dataNasc);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age > 0 ? `${age} anos` : "Menos de 1 ano";
  } catch {
    return "";
  }
}

function escapeHtml(s: string): string {
  if (!s) return "";
  return String(s)
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
): Promise<void> {
  const config = await loadDocumentConfig();
  const title = `PRONTUÁRIO DE ATENDIMENTO — ${p.tipo_registro?.toUpperCase().replace('_', ' ') || 'CLÍNICO'}`;

  let cicloHtml = "";
  if (p.ciclo_info) {
    const c = p.ciclo_info;
    cicloHtml = `
      <div class="section" style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 4px; padding: 8px; margin-bottom: 12px;">
        <div class="section-title" style="border-bottom-color: #0369a1; margin-bottom: 4px;">Ciclo de Tratamento Ativo</div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; font-size: 8.5pt;">
          <div><strong>Tipo:</strong> ${escapeHtml(c.treatment_type)}</div>
          <div><strong>Especialidade:</strong> ${escapeHtml(c.specialty || p.profissional_especialidade || "—")}</div>
          <div><strong>Frequência:</strong> ${escapeHtml(c.frequency)}</div>
          <div><strong>Início:</strong> ${fmtDate(c.start_date)}</div>
          <div><strong>Sessões:</strong> ${c.sessions_done}/${c.total_sessions}</div>
          <div><strong>Status:</strong> ${escapeHtml(c.status)}</div>
        </div>
      </div>
    `;
  }

  let ptsHtml = "";
  if (p.pts_info) {
    const pts = p.pts_info;
    ptsHtml = `
      <div class="section" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px; margin-bottom: 12px;">
        <div class="section-title">Plano Terapêutico Singular (PTS)</div>
        <div style="font-size: 8.5pt; display: grid; grid-template-columns: 1fr; gap: 4px;">
          <div><strong>Diagnóstico Funcional:</strong> ${escapeHtml(pts.diagnostico_funcional)}</div>
          <div><strong>Objetivos Terapêuticos:</strong> ${escapeHtml(pts.objetivos_terapeuticos)}</div>
          <div><strong>Metas Curto Prazo:</strong> ${escapeHtml(pts.metas_curto_prazo || "—")}</div>
          <div><strong>Especialidades:</strong> ${escapeHtml(pts.especialidades_envolvidas?.join(", ") || "—")}</div>
        </div>
      </div>
    `;
  }

  const idadeStr = calcIdade(p.paciente_data_nasc);
  const infoPacienteHtml = `
    <div class="info-grid">
      <div class="info-item" style="grid-column: span 3;">
        <span class="info-label">Paciente:</span>
        <span class="info-value" style="font-size: 11.5pt;">${escapeHtml(p.paciente_nome)}</span>
      </div>
      <div class="info-item">
        <span class="info-label">CPF:</span>
        <span class="info-value">${escapeHtml(p.paciente_cpf || "—")}</span>
      </div>
      <div class="info-item">
        <span class="info-label">CNS:</span>
        <span class="info-value">${escapeHtml(p.paciente_cns || "—")}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Data Nasc:</span>
        <span class="info-value">${fmtDate(p.paciente_data_nasc)} ${idadeStr ? `(${idadeStr})` : ""}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Sexo:</span>
        <span class="info-value">${escapeHtml(p.paciente_sexo || "—")}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Data Atend.:</span>
        <span class="info-value">${fmtDate(p.data_atendimento)} ${p.hora_atendimento || ""}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Unidade/Setor:</span>
        <span class="info-value">${escapeHtml(p.unidade_nome || "—")} / ${escapeHtml(p.setor || "—")}</span>
      </div>
    </div>
  `;

  const carimboHtml = await docCarimboFor(p.profissional_id, { 
    nome: p.profissional_nome, 
    especialidade: p.profissional_especialidade 
  });

  const body = `
    ${infoPacienteHtml}
    ${cicloHtml}
    ${ptsHtml}
    
    <div class="clinical-content">
      ${section("Queixa Principal", safe(p.queixa_principal))}
      
      <div style="display: grid; grid-template-columns: 1fr; gap: 0;">
        ${section("S — Subjetivo", safe(p.soap_subjetivo))}
        ${section("O — Objetivo", safe(p.soap_objetivo))}
        ${section("A — Avaliação", safe(p.soap_avaliacao))}
        ${section("P — Plano", safe(p.soap_plano))}
      </div>

      ${section("Anamnese / Histórico", safe(p.anamnese))}
      ${section("Exame Físico / Sinais Vitais", safe(p.exame_fisico))}
      ${section("Hipótese / Diagnóstico", safe(p.hipotese))}
      ${section("Conduta / Evolução", safe(p.conduta) || safe(p.evolucao))}
      ${section("Procedimentos Realizados", safe(p.procedimentos_texto))}
      ${section("Prescrição / Orientações", safe(p.prescricao))}
      ${section("Solicitação de Exames", safe(p.solicitacao_exames))}
      ${section("Resultado de Exames", safe(p.resultado_exame))}
      ${section("Observações Gerais", safe(p.observacoes))}
      ${p.indicacao_retorno && p.indicacao_retorno !== 'no_indication' ? section("Indicação de Retorno", p.indicacao_retorno) : ""}
    </div>

    ${carimboHtml}
  `;

  const html = buildDocumentShell(title, body, config);
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
  currentProfessionalId?: string,
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
          <td style="white-space:nowrap;">${fmtDate(e.date)}</td>
          <td>${escapeHtml([e.type || "—", e.sessionInfo].filter(Boolean).join(" "))}</td>
          <td>${escapeHtml(e.professional || "—")}</td>
          <td>${escapeHtml(e.specialty || "—")}</td>
          <td><div style="max-height: 100px; overflow: hidden; line-height:1.2;">${escapeHtml((e.summary || "").slice(0, 800))}</div></td>
        </tr>`
    )
    .join("");

  const carimboHtml = currentProfessionalId ? await docCarimboFor(currentProfessionalId) : "";

  const body = `
    <div class="summary" style="display: flex; gap: 8px; margin-bottom: 12px;">
      <div class="stat" style="flex: 1; padding: 6px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 4px; text-align: center;">
        <strong style="display: block; font-size: 14pt; color: #0369a1;">${entries.length}</strong>
        <small style="font-size: 7pt; color: #64748b; text-transform: uppercase;">Eventos</small>
      </div>
      <div class="stat" style="flex: 1; padding: 6px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 4px; text-align: center;">
        <strong style="display: block; font-size: 14pt; color: #0369a1;">${first}</strong>
        <small style="font-size: 7pt; color: #64748b; text-transform: uppercase;">Início</small>
      </div>
      <div class="stat" style="flex: 1; padding: 6px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 4px; text-align: center;">
        <strong style="display: block; font-size: 14pt; color: #0369a1;">${last}</strong>
        <small style="font-size: 7pt; color: #64748b; text-transform: uppercase;">Último</small>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:10%;">Data</th>
          <th style="width:15%;">Tipo</th>
          <th style="width:20%;">Profissional</th>
          <th style="width:15%;">Especialidade</th>
          <th>Resumo Clínico</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    
    <div style="margin-top: 20px;">
      ${carimboHtml}
    </div>`;

  const html = buildDocumentShell(
    `Histórico Clínico Completo — ${pacienteNome}`,
    body,
    config,
    { Paciente: pacienteNome, "Total de eventos": String(entries.length) }
  );

  printViaIframe(html);
}

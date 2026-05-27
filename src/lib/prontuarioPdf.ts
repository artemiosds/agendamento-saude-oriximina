/**
 * Geração de PDF/impressão de Prontuário e Histórico Clínico.
 * 
 * MELHORIA: Busca dados completos do banco para garantir fidelidade total.
 */

import { buildDocumentShell, loadDocumentConfig, printViaIframe, docCarimboFor } from "./printLayout";
import { supabase } from "@/integrations/supabase/client";

export interface ProntuarioLike {
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
  // Metadata extras legados
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
    return age >= 0 ? `${age} anos` : "";
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

async function fetchFullProntuarioData(prontuarioId: string) {
  const { data: prontuario, error: pErr } = await supabase
    .from('prontuarios')
    .select('*')
    .eq('id', prontuarioId)
    .single();
  
  if (pErr || !prontuario) return null;

  const { data: paciente } = await supabase
    .from('pacientes')
    .select('*')
    .eq('id', prontuario.paciente_id)
    .maybeSingle();

  const { data: profissional } = await supabase
    .from('funcionarios')
    .select('*')
    .eq('id', prontuario.profissional_id)
    .maybeSingle();

  const { data: unidade } = await supabase
    .from('unidades')
    .select('nome')
    .eq('id', prontuario.unidade_id)
    .maybeSingle();

  const { data: ciclo } = await supabase
    .from('treatment_cycles')
    .select('*')
    .eq('patient_id', prontuario.paciente_id)
    .eq('status', 'em_andamento')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let pts = null;
  if (ciclo?.pts_id) {
    const { data: ptsData } = await supabase
      .from('pts')
      .select('*')
      .eq('id', ciclo.pts_id)
      .maybeSingle();
    pts = ptsData;
  } else {
    const { data: ptsData } = await supabase
      .from('pts')
      .select('*')
      .eq('patient_id', prontuario.paciente_id)
      .eq('status', 'ativo')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    pts = ptsData;
  }

  // Busca campos personalizados (custom_data) se existirem
  let customFieldsHtml = "";
  if (prontuario.custom_data && typeof prontuario.custom_data === 'object') {
    const entries = Object.entries(prontuario.custom_data);
    if (entries.length > 0) {
      customFieldsHtml = entries
        .map(([key, val]) => {
          if (!val) return "";
          return `
            <div class="section">
              <div class="section-title">${escapeHtml(key.replace(/_/g, ' '))}</div>
              <div class="section-content">${escapeHtml(String(val))}</div>
            </div>`;
        })
        .join("");
    }
  }

  return {
    prontuario,
    paciente,
    profissional,
    unidade,
    ciclo,
    pts,
    customFieldsHtml
  };
}

export async function downloadProntuarioPdf(
  input: ProntuarioLike | string,
): Promise<void> {
  const prontuarioId = typeof input === 'string' ? input : input.id;
  const data = await fetchFullProntuarioData(prontuarioId);
  
  if (!data) {
    console.error("Erro ao carregar dados completos do prontuário");
    return;
  }

  const { prontuario, paciente, profissional, unidade, ciclo, pts, customFieldsHtml } = data;
  const config = await loadDocumentConfig();
  const title = `PRONTUÁRIO DE ATENDIMENTO — ${prontuario.tipo_registro?.toUpperCase().replace(/_/g, ' ') || 'CLÍNICO'}`;

  let cicloHtml = "";
  if (ciclo) {
    cicloHtml = `
      <div class="section" style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 4px; padding: 8px; margin-bottom: 12px;">
        <div class="section-title" style="border-bottom-color: #0369a1; margin-bottom: 4px;">Ciclo de Tratamento Ativo</div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; font-size: 8.5pt;">
          <div><strong>Tipo:</strong> ${escapeHtml(ciclo.treatment_type)}</div>
          <div><strong>Especialidade:</strong> ${escapeHtml(ciclo.specialty || (profissional as any)?.profissao || "—")}</div>
          <div><strong>Frequência:</strong> ${escapeHtml(ciclo.frequency)}</div>
          <div><strong>Início:</strong> ${fmtDate(ciclo.start_date)}</div>
          <div><strong>Sessões:</strong> ${ciclo.sessions_done}/${ciclo.total_sessions}</div>
          <div><strong>Status:</strong> ${escapeHtml(ciclo.status)}</div>
        </div>
      </div>
    `;
  }

  let ptsHtml = "";
  if (pts) {
    ptsHtml = `
      <div class="section" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px; margin-bottom: 12px;">
        <div class="section-title">Plano Terapêutico Singular (PTS)</div>
        <div style="font-size: 8.5pt; display: grid; grid-template-columns: 1fr; gap: 4px;">
          <div><strong>Diagnóstico Funcional:</strong> ${escapeHtml(pts.diagnostico_funcional)}</div>
          <div><strong>Objetivos Terapêuticos:</strong> ${escapeHtml(pts.objetivos_terapeuticos)}</div>
          <div><strong>Metas Curto Prazo:</strong> ${escapeHtml(pts.metas_curto_prazo || "—")}</div>
          <div><strong>Especialidades:</strong> ${escapeHtml((pts.especialidades_envolvidas as string[])?.join(", ") || "—")}</div>
        </div>
      </div>
    `;
  }

  const pData = (paciente as any) || {};
  const dataNasc = pData.data_nascimento || pData.dataNascimento;
  const idadeStr = calcIdade(dataNasc);
  
  const infoPacienteHtml = `
    <div class="info-grid">
      <div class="info-item" style="grid-column: span 3;">
        <span class="info-label">Paciente:</span>
        <span class="info-value" style="font-size: 11pt;">${escapeHtml(pData.nome || prontuario.paciente_nome)}</span>
      </div>
      <div class="info-item">
        <span class="info-label">CPF:</span>
        <span class="info-value">${escapeHtml(pData.cpf || "—")}</span>
      </div>
      <div class="info-item">
        <span class="info-label">CNS:</span>
        <span class="info-value">${escapeHtml(pData.cns || "—")}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Data Nasc:</span>
        <span class="info-value">${fmtDate(dataNasc)} ${idadeStr ? `(${idadeStr})` : ""}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Sexo:</span>
        <span class="info-value">${escapeHtml(pData.sexo || "—")}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Telefone:</span>
        <span class="info-value">${escapeHtml(pData.telefone || "—")}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Data Atend.:</span>
        <span class="info-value">${fmtDate(prontuario.data_atendimento)} ${prontuario.hora_atendimento || ""}</span>
      </div>
      <div class="info-item" style="grid-column: span 2;">
        <span class="info-label">Unidade/Setor:</span>
        <span class="info-value">${escapeHtml(unidade?.nome || "—")} / ${escapeHtml(prontuario.setor || "—")}</span>
      </div>
    </div>
  `;

  const carimboHtml = await docCarimboFor(prontuario.profissional_id, { 
    nome: prontuario.profissional_nome, 
    especialidade: (profissional as any)?.profissao || (profissional as any)?.cargo 
  });

  const body = `
    ${infoPacienteHtml}
    ${cicloHtml}
    ${ptsHtml}
    
    <div class="clinical-content">
      ${section("Queixa Principal", safe(prontuario.queixa_principal))}
      
      <div style="display: grid; grid-template-columns: 1fr; gap: 0;">
        ${section("S — Subjetivo", safe(prontuario.soap_subjetivo))}
        ${section("O — Objetivo", safe(prontuario.soap_objetivo))}
        ${section("A — Avaliação", safe(prontuario.soap_avaliacao))}
        ${section("P — Plano", safe(prontuario.soap_plano))}
      </div>

      ${customFieldsHtml}

      ${section("Anamnese / Histórico", safe(prontuario.anamnese))}
      ${section("Sinais e Sintomas", safe(prontuario.sinais_sintomas))}
      ${section("Exame Físico / Sinais Vitais", safe(prontuario.exame_fisico))}
      ${section("Hipótese / Diagnóstico", safe(prontuario.hipotese))}
      ${section("Conduta / Evolução", safe(prontuario.conduta) || safe(prontuario.evolucao))}
      ${section("Procedimentos Realizados", safe(prontuario.procedimentos_texto))}
      ${section("Prescrição / Orientações", safe(prontuario.prescricao))}
      ${section("Solicitação de Exames", safe(prontuario.solicitacao_exames))}
      ${section("Resultado de Exames", safe(prontuario.resultado_exame))}
      ${section("Observações Gerais", safe(prontuario.observacoes))}
      ${prontuario.indicacao_retorno && prontuario.indicacao_retorno !== 'no_indication' && prontuario.indicacao_retorno !== 'sem_retorno' ? section("Indicação de Retorno", prontuario.indicacao_retorno) : ""}
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

/**
 * Geração de PDF/impressão de Prontuário e Histórico Clínico.
 * 
 * MELHORIA: Busca dados completos do banco para garantir fidelidade total.
 * FOCO: Layout compacto, institucional, fonte 9.5-10pt, padrão clínico A4.
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
  cid?: string;
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

  // Busca procedimentos vinculados
  const { data: procs } = await supabase
    .from('prontuario_procedimentos')
    .select(`
      id,
      observacao,
      procedimento_id,
      quantidade,
      procedimentos (
        nome,
        codigo_sigtap
      )
    `)
    .eq('prontuario_id', prontuarioId);

  // Busca exames vinculados
  const { data: exames } = await supabase
    .from('prontuario_exames')
    .select('*')
    .eq('prontuario_id', prontuarioId);

  // Busca configurações do prontuário para saber o que exibir e qual label usar
  const { data: sysCfg } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
  const configTipos = (sysCfg?.configuracoes as any)?.config_prontuario_tipos;
  const configEspecialidades = (sysCfg?.configuracoes as any)?.config_especialidades_campos;

  return {
    prontuario,
    paciente,
    profissional,
    unidade,
    ciclo,
    pts,
    procs: procs || [],
    exames: exames || [],
    configTipos,
    configEspecialidades
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

  const { prontuario, paciente, profissional, unidade, ciclo, pts, customFieldsHtml, procs, exames } = data;
  const config = await loadDocumentConfig();
  const title = `PRONTUÁRIO DE ATENDIMENTO — ${prontuario.tipo_registro?.toUpperCase().replace(/_/g, ' ') || 'CLÍNICO'}`;

  let cicloHtml = "";
  if (ciclo) {
    cicloHtml = `
      <div class="section" style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 4px; padding: 6px; margin-bottom: 8px;">
        <div class="section-title" style="border-bottom-color: #0369a1; margin-bottom: 2px; font-size: 8pt;">Ciclo de Tratamento Ativo</div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px 8px; font-size: 8pt;">
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
      <div class="section" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px; margin-bottom: 8px;">
        <div class="section-title" style="font-size: 8pt;">Plano Terapêutico Singular (PTS)</div>
        <div style="font-size: 8pt; display: grid; grid-template-columns: 1fr; gap: 2px;">
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
    <div style="margin-bottom: 10px;">
      <div style="font-weight: 700; font-size: 8pt; color: #0369a1; margin-bottom: 4px; border-bottom: 1px solid #0369a1; text-transform: uppercase;">Dados do Paciente</div>
      
      <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 4px; margin-bottom: 6px;">
        <div class="info-item"><span class="info-label">Nome:</span><span class="info-value" style="font-size: 9.5pt;">${escapeHtml(pData.nome || prontuario.paciente_nome)}</span></div>
        <div class="info-item"><span class="info-label">CPF:</span><span class="info-value">${escapeHtml(pData.cpf || "—")}</span></div>
        <div class="info-item"><span class="info-label">CNS:</span><span class="info-value">${escapeHtml(pData.cns || "—")}</span></div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 6px;">
        <div class="info-item"><span class="info-label">Nascimento:</span><span class="info-value">${fmtDate(dataNasc)} (${idadeStr})</span></div>
        <div class="info-item"><span class="info-label">Sexo:</span><span class="info-value">${escapeHtml(pData.sexo || "—")}</span></div>
        <div class="info-item"><span class="info-label">Mãe:</span><span class="info-value">${escapeHtml(pData.nome_mae || "—")}</span></div>
        <div class="info-item"><span class="info-label">Telefone:</span><span class="info-value">${escapeHtml(pData.telefone || "—")}</span></div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr; gap: 4px; margin-bottom: 6px; background: #fdfdfd; padding: 4px; border: 0.5px solid #eee;">
        <div class="info-item">
          <span class="info-label">Endereço:</span>
          <span class="info-value">${escapeHtml([pData.tipo_logradouro, pData.logradouro, pData.numero, pData.complemento, pData.bairro, pData.cep, pData.municipio, pData.uf].filter(Boolean).join(", ") || "—")}</span>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-bottom: 6px;">
        <div class="info-item"><span class="info-label">UBS Origem:</span><span class="info-value">${escapeHtml(pData.ubs_origem || "—")}</span></div>
        <div class="info-item"><span class="info-label">Prof. Solicitante:</span><span class="info-value">${escapeHtml(pData.profissional_solicitante || "—")}</span></div>
        <div class="info-item"><span class="info-label">Encaminhamento:</span><span class="info-value">${escapeHtml(pData.tipo_encaminhamento || "—")}</span></div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;">
        <div class="info-item"><span class="info-label">Unidade/Setor:</span><span class="info-value">${escapeHtml(unidade?.nome || "—")} / ${escapeHtml(prontuario.setor || "—")}</span></div>
        <div class="info-item"><span class="info-label">Profissional Resp.:</span><span class="info-value">${escapeHtml(prontuario.profissional_nome)}</span></div>
        <div class="info-item"><span class="info-label">Data Atendimento:</span><span class="info-value">${fmtDate(prontuario.data_atendimento)} ${prontuario.hora_atendimento || ""}</span></div>
      </div>
    </div>
  `;

  const procsHtml = procs.length > 0 ? `
    <div class="section">
      <div class="section-title">Procedimentos Realizados</div>
      <table style="width: 100%; border-collapse: collapse; margin-top: 2px;">
        <thead>
          <tr style="background: #f1f5f9;">
            <th style="padding: 2px 4px; border: 0.5px solid #cbd5e1; text-align: left; font-size: 8pt;">Código</th>
            <th style="padding: 2px 4px; border: 0.5px solid #cbd5e1; text-align: left; font-size: 8pt;">Procedimento</th>
            <th style="padding: 2px 4px; border: 0.5px solid #cbd5e1; text-align: center; font-size: 8pt;">Qtd</th>
            <th style="padding: 2px 4px; border: 0.5px solid #cbd5e1; text-align: left; font-size: 8pt;">Obs</th>
          </tr>
        </thead>
        <tbody>
          ${procs.map((p: any) => `
            <tr>
              <td style="padding: 2px 4px; border: 0.5px solid #cbd5e1; font-size: 8.5pt;">${escapeHtml(p.procedimentos?.codigo_sigtap || "—")}</td>
              <td style="padding: 2px 4px; border: 0.5px solid #cbd5e1; font-size: 8.5pt;">${escapeHtml(p.procedimentos?.nome || "—")}</td>
              <td style="padding: 2px 4px; border: 0.5px solid #cbd5e1; text-align: center; font-size: 8.5pt;">${p.quantidade || 1}</td>
              <td style="padding: 2px 4px; border: 0.5px solid #cbd5e1; font-size: 8pt;">${escapeHtml(p.observacao || "")}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : "";

  const examesHtml = exames.length > 0 ? `
    <div class="section">
      <div class="section-title">Exames Registrados</div>
      <div style="font-size: 8.5pt;">
        ${exames.map((e: any) => `
          <div style="margin-bottom: 4px; border-left: 2px solid #e2e8f0; padding-left: 6px;">
            <strong>${escapeHtml(e.nome_exame)}</strong> (${escapeHtml(e.tipo_exame)}) - ${fmtDate(e.data_exame)}<br/>
            ${e.resultado_descrito ? `<em>Resultado:</em> ${escapeHtml(e.resultado_descrito)}` : ""}
          </div>
        `).join('')}
      </div>
    </div>
  ` : "";

  const carimboHtml = await docCarimboFor(prontuario.profissional_id, { 
    nome: prontuario.profissional_nome, 
    especialidade: (profissional as any)?.profissao || (profissional as any)?.cargo,
    conselho: (profissional as any)?.tipo_conselho,
    numero_registro: (profissional as any)?.numero_conselho,
    uf: (profissional as any)?.uf_conselho
  });

  const carimboFinal = carimboHtml || `
    <div class="signature">
      <div class="signature-line"></div>
      <div class="name">${escapeHtml(prontuario.profissional_nome).toUpperCase()}</div>
      <div class="role">${escapeHtml((profissional as any)?.profissao || (profissional as any)?.cargo || "")}</div>
      <div class="extra">Assinatura e carimbo do profissional</div>
    </div>
  `;

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
      ${(prontuario as any).cid || (paciente as any)?.cid ? section("CID Principal", (prontuario as any).cid || (paciente as any)?.cid) : ""}
      ${section("Conduta / Evolução", safe(prontuario.conduta) || safe(prontuario.evolucao))}
      
      ${procsHtml}
      ${section("Procedimentos (Complementar)", safe(prontuario.procedimentos_texto))}
      
      ${examesHtml}
      ${section("Solicitação de Exames", safe(prontuario.solicitacao_exames))}
      ${section("Resultado de Exames (Anexo)", safe(prontuario.resultado_exame))}

      ${section("Prescrição / Orientações", safe(prontuario.prescricao))}
      ${section("Observações Gerais", safe(prontuario.observacoes))}
      
      ${prontuario.indicacao_retorno && prontuario.indicacao_retorno !== 'no_indication' && prontuario.indicacao_retorno !== 'sem_retorno' ? section("Indicação de Retorno", prontuario.indicacao_retorno) : ""}
    </div>

    ${carimboFinal}
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
          <td><div style="max-height: 100px; overflow: hidden; line-height:1.1;">${escapeHtml((e.summary || "").slice(0, 1000))}</div></td>
        </tr>`
    )
    .join("");

  const carimboHtml = currentProfessionalId ? await docCarimboFor(currentProfessionalId) : "";

  const body = `
    <div class="summary" style="display: flex; gap: 8px; margin-bottom: 12px;">
      <div class="stat" style="flex: 1; padding: 6px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 4px; text-align: center;">
        <strong style="display: block; font-size: 12pt; color: #0369a1;">${entries.length}</strong>
        <small style="font-size: 7pt; color: #64748b; text-transform: uppercase;">Eventos</small>
      </div>
      <div class="stat" style="flex: 1; padding: 6px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 4px; text-align: center;">
        <strong style="display: block; font-size: 12pt; color: #0369a1;">${first}</strong>
        <small style="font-size: 7pt; color: #64748b; text-transform: uppercase;">Início</small>
      </div>
      <div class="stat" style="flex: 1; padding: 6px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 4px; text-align: center;">
        <strong style="display: block; font-size: 12pt; color: #0369a1;">${last}</strong>
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
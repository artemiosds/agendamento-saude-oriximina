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
      if (parsed && typeof parsed === "object" && "texto" in parsed) {
        return parsed.texto || "";
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

const normalizeContextText = (value?: string | null) =>
  (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

const getCustomDataObject = (source: any) =>
  source?.custom_data && typeof source.custom_data === "object" ? source.custom_data : {};

const isSpecialtyCompatible = (left?: string | null, right?: string | null) => {
  const a = normalizeContextText(left);
  const b = normalizeContextText(right);
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a);
};

const isDateInsideCycle = (cycle: any, date?: string | null) => {
  if (!date) return true;
  if (cycle?.start_date && date < cycle.start_date) return false;
  const end = cycle?.end_date_predicted || cycle?.end_date || cycle?.data_fim;
  return !(end && date > end);
};

const isPtsSpecialtyCompatible = (pts: any, specialty?: string | null) => {
  const target = normalizeContextText(specialty);
  const involved = Array.isArray(pts?.especialidades_envolvidas) ? pts.especialidades_envolvidas : [];
  if (!target || involved.length === 0) return true;
  return involved.some((item: string) => isSpecialtyCompatible(item, specialty));
};

async function fetchContextualTreatment(prontuario: any, profissional: any) {
  const cd = getCustomDataObject(prontuario);
  const specialty = cd.especialidade || cd.specialty || cd.profissao || prontuario.especialidade || profissional?.profissao || profissional?.cargo || "";
  const explicitCycleId = cd.treatment_cycle_id || cd.cycle_id || cd.treatmentCycleId || null;
  const explicitPtsId = cd.pts_id || cd.ptsId || null;
  const explicitPtsMetaId = prontuario.pts_meta_id || cd.pts_meta_id || null;
  let ciclo: any = null;

  if (explicitCycleId) {
    const { data } = await supabase
      .from('treatment_cycles')
      .select('*')
      .eq('id', explicitCycleId)
      .eq('patient_id', prontuario.paciente_id)
      .maybeSingle();
    ciclo = data;
  } else if (prontuario.paciente_id && prontuario.profissional_id) {
    const { data } = await supabase
      .from('treatment_cycles')
      .select('*')
      .eq('patient_id', prontuario.paciente_id)
      .eq('professional_id', prontuario.profissional_id)
      .in('status', ['em_andamento', 'ativo'])
      .order('created_at', { ascending: false });
    ciclo = ((data || []) as any[]).find((candidate) =>
      isSpecialtyCompatible(candidate.specialty || candidate.treatment_type, specialty) &&
      isDateInsideCycle(candidate, prontuario.data_atendimento)
    ) || null;
  }

  let ptsId = explicitPtsId || ciclo?.pts_id || null;
  if (!ptsId && explicitPtsMetaId) {
    const { data: meta } = await (supabase as any).from('pts_metas').select('pts_id').eq('id', explicitPtsMetaId).maybeSingle();
    ptsId = meta?.pts_id || null;
  }

  let pts: any = null;
  if (ptsId) {
    const { data } = await supabase.from('pts').select('*').eq('id', ptsId).eq('patient_id', prontuario.paciente_id).maybeSingle();
    pts = data;
  } else if (prontuario.paciente_id && prontuario.profissional_id) {
    const { data } = await supabase
      .from('pts')
      .select('*')
      .eq('patient_id', prontuario.paciente_id)
      .eq('professional_id', prontuario.profissional_id)
      .eq('status', 'ativo')
      .order('created_at', { ascending: false });
    pts = ((data || []) as any[]).find((candidate) => isPtsSpecialtyCompatible(candidate, specialty)) || null;
  }

  return { ciclo, pts };
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

  const { ciclo, pts } = await fetchContextualTreatment(prontuario, profissional);

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
    configEspecialidades,
    allConfigs: sysCfg?.configuracoes as any
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

  const { prontuario, paciente, profissional, unidade, ciclo, pts, procs, exames, configTipos, configEspecialidades, allConfigs } = data;
  const config = await loadDocumentConfig();
  const tipoRegistro = prontuario.tipo_registro || 'sessao';
  const title = `PRONTUÁRIO DE ATENDIMENTO — ${tipoRegistro.toUpperCase().replace(/_/g, ' ')}`;

  // 1. Determine which sections to show based on system_config
  const adminCampos = (configTipos?.campos || []) as any[];
  const activeFieldsForType = adminCampos
    .filter(c => {
      if (!c.habilitado || !c.tiposProntuario) return false;
      const normalized = tipoRegistro === 'avaliacao_inicial' ? 'avaliacao_inicial' : tipoRegistro;
      const legacy = tipoRegistro === 'avaliacao_inicial' ? 'primeira_consulta' : tipoRegistro;
      return c.tiposProntuario.includes(normalized) || c.tiposProntuario.includes(legacy);
    })
    .sort((a, b) => a.order - b.order);

  // 2. Build clinical sections HTML dynamically
  let clinicalContentHtml = "";

  const renderSection = (label: string, value: any) => {
    const sValue = safe(value);
    if (!sValue) return "";
    return `
      <div class="section" style="margin-bottom: 4px;">
        <div class="section-title" style="font-size: 8pt; border-bottom: 0.5px solid #0369a1; color: #0369a1; padding-bottom: 1px; margin-bottom: 1px;">${escapeHtml(label)}</div>
        <div class="section-content" style="font-size: 9.5pt; line-height: 1.1; white-space: pre-wrap; text-align: justify;">${escapeHtml(sValue).replace(/\n/g, "<br/>")}</div>
      </div>`;
  };

  // Special handling for SOAP
  const soapLabels = configTipos?.soapLabels || { subjetivo: 'Subjetivo', objetivo: 'Objetivo', avaliacao: 'Avaliação', plano: 'Plano' };
  clinicalContentHtml += renderSection(`S — ${soapLabels.subjetivo}`, prontuario.soap_subjetivo);
  clinicalContentHtml += renderSection(`O — ${soapLabels.objetivo}`, prontuario.soap_objetivo);
  clinicalContentHtml += renderSection(`A — ${soapLabels.avaliacao}`, prontuario.soap_avaliacao);
  clinicalContentHtml += renderSection(`P — ${soapLabels.plano}`, prontuario.soap_plano);

  // Dynamic fields from admin config
  activeFieldsForType.forEach(f => {
    if (f.habilitado === false) return;
    if (['evolucao.subjetivo', 'evolucao.objetivo', 'evolucao.avaliacao', 'evolucao.plano'].includes(f.key)) return;
    
    let val = prontuario[f.key];
    // If not in direct columns, check custom_data
    if (val === undefined && prontuario.custom_data) {
      val = (prontuario.custom_data as any)[f.key];
    }
    
    if (val) {
      clinicalContentHtml += renderSection(f.label, val);
    }
  });
  
  // 2b. Include model-specific fields (from ConstrutorProntuarioModal)
  const modelKey = `estrutura_prontuario_${tipoRegistro}`;
  const legacyModelKey = tipoRegistro === 'avaliacao_inicial' ? 'estrutura_prontuario_primeira_consulta' : '';
  const modelSchema = allConfigs?.[modelKey] || (legacyModelKey ? allConfigs?.[legacyModelKey] : null);
  const legacyFields = [
    { k: 'queixa_principal', l: 'Queixa Principal' },
    { k: 'anamnese', l: 'Anamnese / Histórico' },
    { k: 'sinais_sintomas', l: 'Sinais e Sintomas' },
    { k: 'exame_fisico', l: 'Exame Físico' },
    { k: 'hipotese', l: 'Hipótese' },
    { k: 'conduta', l: 'Conduta' },
    { k: 'evolucao', l: 'Evolução' },
    { k: 'observacoes', l: 'Observações Gerais' },
    { k: 'procedimentos_texto', l: 'Procedimentos' },
    { k: 'prescricao', l: 'Prescrição' },
    { k: 'solicitacao_exames', l: 'Solicitação de Exames' },
    { k: 'resultado_exame', l: 'Resultado de Exame' },
    { k: 'indicacao_retorno', l: 'Indicação de Retorno' }
  ];
  
  if (modelSchema?.fields) {
    modelSchema.fields.forEach((f: any) => {
      const fieldKey = f.key || `custom_${f.id}`;
      let val = prontuario[fieldKey];
      if (val === undefined && prontuario.custom_data) {
        val = (prontuario.custom_data as any)[fieldKey];
      }
      
      if (val) {
        clinicalContentHtml += renderSection(f.label, val);
      }
    });
  }

  // Especialidade fields handling
  if (prontuario.custom_data) {
    const cd = prontuario.custom_data as any;
    Object.entries(cd).forEach(([key, val]) => {
      if (key.startsWith('esp_') && val) {
        const fieldKey = key.replace('esp_', '');
        // Find label for this specialty field if possible
        let label = fieldKey.replace(/_/g, ' ');
        if (configEspecialidades) {
          for (const esp of configEspecialidades) {
            const f = esp.campos?.find((c: any) => c.key === fieldKey || c.id === fieldKey);
            if (f) { label = f.label; break; }
          }
        }
        clinicalContentHtml += renderSection(label, val);
      } else if (!key.startsWith('esp_') && val) {
        // Generic dynamic fields not prefixed with esp_
        let label = key.replace(/_/g, ' ');
        // Check if this key was already rendered as a static field
        if (!legacyFields.some(lf => lf.k === key) && !['soap_subjetivo', 'soap_objetivo', 'soap_avaliacao', 'soap_plano'].includes(key)) {
          clinicalContentHtml += renderSection(label, val);
        }
      }
    });

  }

  // Fallback for some hardcoded essential fields if they have value but weren't in config
  legacyFields.forEach(f => {
    if (!activeFieldsForType.some(af => af.key === f.k) && prontuario[f.k]) {
      clinicalContentHtml += renderSection(f.l, prontuario[f.k]);
    }
  });

  let cicloHtml = "";
  if (ciclo) {
    cicloHtml = `
      <div class="section" style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 4px; padding: 4px; margin-bottom: 6px;">
        <div class="section-title" style="border-bottom-color: #0369a1; margin-bottom: 2px; font-size: 7.5pt;">Ciclo de Tratamento Ativo</div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px 6px; font-size: 8pt;">
          <div><strong>Tipo:</strong> ${escapeHtml(ciclo.treatment_type)}</div>
          <div><strong>Especialidade:</strong> ${escapeHtml(ciclo.specialty || (profissional as any)?.profissao || "—")}</div>
          <div><strong>Sessões:</strong> ${ciclo.sessions_done}/${ciclo.total_sessions}</div>
          <div><strong>Início:</strong> ${fmtDate(ciclo.start_date)}</div>
          <div><strong>Status:</strong> ${escapeHtml(ciclo.status)}</div>
        </div>
      </div>
    `;
  }

  let ptsHtml = "";
  if (pts) {
    ptsHtml = `
      <div class="section" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px; margin-bottom: 6px;">
        <div class="section-title" style="font-size: 7.5pt;">Plano Terapêutico Singular (PTS)</div>
        <div style="font-size: 8pt; display: grid; grid-template-columns: 1fr; gap: 1px;">
          <div><strong>Diagnóstico Funcional:</strong> ${escapeHtml(pts.diagnostico_funcional)}</div>
          <div><strong>Objetivos Terapêuticos:</strong> ${escapeHtml(pts.objetivos_terapeuticos)}</div>
          <div><strong>Especialidades:</strong> ${escapeHtml((pts.especialidades_envolvidas as string[])?.join(", ") || "—")}</div>
        </div>
      </div>
    `;
  }

  const pData = (paciente as any) || {};
  const dataNasc = pData.data_nascimento || pData.dataNascimento;
  const idadeStr = calcIdade(dataNasc);
  
  const infoPacienteHtml = `
    <div style="margin-bottom: 8px; border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px; background: #fff;">
      <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 4px; margin-bottom: 4px;">
        <div class="info-item"><span class="info-label">Paciente:</span><span class="info-value" style="font-size: 10pt; font-weight: 700;">${escapeHtml(pData.nome || prontuario.paciente_nome)}</span></div>
        <div class="info-item"><span class="info-label">CPF:</span><span class="info-value">${escapeHtml(pData.cpf || "—")}</span></div>
        <div class="info-item"><span class="info-label">Nascimento:</span><span class="info-value">${fmtDate(dataNasc)} (${idadeStr})</span></div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 4px;">
        <div class="info-item"><span class="info-label">Sexo:</span><span class="info-value">${escapeHtml(pData.sexo || "—")}</span></div>
        <div class="info-item"><span class="info-label">CNS:</span><span class="info-value">${escapeHtml(pData.cns || "—")}</span></div>
        <div class="info-item"><span class="info-label">Mãe:</span><span class="info-value">${escapeHtml(pData.nome_mae || "—")}</span></div>
        <div class="info-item"><span class="info-label">Telefone:</span><span class="info-value">${escapeHtml(pData.telefone || "—")}</span></div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px;">
        <div class="info-item"><span class="info-label">Data Atendimento:</span><span class="info-value" style="font-weight: 600;">${fmtDate(prontuario.data_atendimento)} ${prontuario.hora_atendimento || ""}</span></div>
        <div class="info-item"><span class="info-label">Profissional Resp.:</span><span class="info-value">${escapeHtml(prontuario.profissional_nome)}</span></div>
        <div class="info-item"><span class="info-label">Unidade/Setor:</span><span class="info-value">${escapeHtml(unidade?.nome || "—")} / ${escapeHtml(prontuario.setor || "—")}</span></div>
      </div>
    </div>
  `;

  const procsHtml = procs.length > 0 ? `
    <div class="section" style="margin-top: 6px;">
      <div class="section-title">Procedimentos Realizados</div>
      <table style="width: 100%; border-collapse: collapse; margin-top: 2px;">
        <thead>
          <tr style="background: #f1f5f9;">
            <th style="padding: 2px 4px; border: 0.5px solid #cbd5e1; text-align: left; font-size: 7.5pt;">Código</th>
            <th style="padding: 2px 4px; border: 0.5px solid #cbd5e1; text-align: left; font-size: 7.5pt;">Procedimento</th>
            <th style="padding: 2px 4px; border: 0.5px solid #cbd5e1; text-align: center; font-size: 7.5pt;">Qtd</th>
          </tr>
        </thead>
        <tbody>
          ${procs.map((p: any) => `
            <tr>
              <td style="padding: 2px 4px; border: 0.5px solid #cbd5e1; font-size: 8pt;">${escapeHtml(p.procedimentos?.codigo_sigtap || "—")}</td>
              <td style="padding: 2px 4px; border: 0.5px solid #cbd5e1; font-size: 8pt;">${escapeHtml(p.procedimentos?.nome || "—")}</td>
              <td style="padding: 2px 4px; border: 0.5px solid #cbd5e1; text-align: center; font-size: 8pt;">${p.quantidade || 1}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
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
    <div class="signature" style="margin-top: 20px;">
      <div class="signature-line"></div>
      <div class="name">${escapeHtml(prontuario.profissional_nome).toUpperCase()}</div>
      <div class="role">${escapeHtml((profissional as any)?.profissao || (profissional as any)?.cargo || "")}</div>
    </div>
  `;

  const body = `
    ${infoPacienteHtml}
    ${cicloHtml}
    ${ptsHtml}
    
    <div class="clinical-content">
      ${clinicalContentHtml}
      ${procsHtml}
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
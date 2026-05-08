import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "@/lib/phoneUtils";
import { auditService } from "@/services/auditService";
import { queryKeys } from "@/hooks/queries/queryKeys";

/**
 * Inventário de Campos do Paciente (Engenharia de Dados)
 * 
 * 1. Colunas de Topo (Tabela `pacientes`):
 *    - id (text, PK)
 *    - nome (text, NOT NULL)
 *    - cpf (text, NOT NULL)
 *    - cns (text, NOT NULL)
 *    - telefone (text, NOT NULL)
 *    - data_nascimento (text, NOT NULL)
 *    - email (text, NOT NULL)
 *    - endereco (text, NOT NULL) - Texto livre (retrocompatibilidade)
 *    - nome_mae (text, NOT NULL)
 *    - municipio (text, NOT NULL)
 *    - naturalidade (text, NOT NULL)
 *    - naturalidade_uf (text, NOT NULL)
 *    - unidade_id (text, NOT NULL)
 *    - menor_idade (boolean, NOT NULL)
 *    - nome_responsavel (text, NOT NULL)
 *    - cpf_responsavel (text, NOT NULL)
 *    - is_gestante (boolean, NOT NULL)
 *    - is_pne (boolean, NOT NULL)
 *    - is_autista (boolean, NOT NULL)
 *    - cid (text, NOT NULL)
 *    - descricao_clinica (text, NOT NULL)
 *    - ubs_origem (text, NOT NULL)
 *    - profissional_solicitante (text, NOT NULL)
 *    - tipo_encaminhamento (text, NOT NULL)
 *    - diagnostico_resumido (text, NOT NULL)
 *    - justificativa (text, NOT NULL)
 *    - data_encaminhamento (text, NOT NULL)
 *    - documento_url (text, NOT NULL)
 *    - tipo_condicao (text, NOT NULL)
 *    - mobilidade (text, NOT NULL)
 *    - usa_dispositivo (boolean, NOT NULL)
 *    - tipo_dispositivo (text, NOT NULL)
 *    - comunicacao (text, NOT NULL)
 *    - comportamento (text, NOT NULL)
 *    - usa_equipamentos (boolean, NOT NULL)
 *    - equipamentos (text[], NOT NULL)
 *    - observacao_equipamentos (text, NOT NULL)
 *    - outro_servico_sus (boolean, NOT NULL)
 *    - transporte (text, NOT NULL)
 *    - turno_preferido (text, NOT NULL)
 *    - especialidade_destino (text, NOT NULL)
 *    - custom_data (jsonb, NOT NULL)
 * 
 * 2. Campos dentro de `custom_data` (Fonte de Verdade para Estruturados):
 *    - sexo
 *    - raca_cor
 *    - etnia
 *    - etnia_outra
 *    - nacionalidade
 *    - pais_nascimento
 *    - tipo_logradouro_dne (descrição)
 *    - tipo_logradouro_codigo (código)
 *    - logradouro
 *    - numero
 *    - complemento
 *    - bairro
 *    - uf
 *    - cep
 *    - telefone_secundario
 *    - revisado_em
 */

const PACIENTE_TEXT_NOT_NULL = new Set([
  "nome", "cpf", "cns", "telefone", "email", "endereco", "observacoes",
  "nome_mae", "municipio", "naturalidade", "naturalidade_uf", "unidade_id",
  "data_nascimento", "descricao_clinica", "cid", "especialidade_destino",
  "turno_preferido", "transporte", "observacao_equipamentos",
  "tipo_condicao", "mobilidade", "tipo_dispositivo", "comunicacao", "comportamento",
  "nome_responsavel", "cpf_responsavel", "ubs_origem", "profissional_solicitante",
  "tipo_encaminhamento", "diagnostico_resumido", "justificativa",
  "data_encaminhamento", "documento_url"
]);

const PACIENTE_BOOL_NOT_NULL = new Set([
  "is_gestante", "is_pne", "is_autista", "menor_idade",
  "outro_servico_sus", "usa_dispositivo", "usa_equipamentos",
]);

/**
 * Saneia um payload para a tabela `pacientes` garantindo integridade de colunas NOT NULL.
 */
export function sanitizePacientePayload<T extends Record<string, any>>(payload: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined) continue;
    if (v === null) {
      if (PACIENTE_TEXT_NOT_NULL.has(k)) { out[k] = ""; continue; }
      if (PACIENTE_BOOL_NOT_NULL.has(k)) { out[k] = false; continue; }
      if (k === "equipamentos") { out[k] = []; continue; }
      if (k === "custom_data") { out[k] = {}; continue; }
      continue;
    }
    out[k] = v;
  }
  return out as T;
}

/**
 * Normaliza os dados do paciente vindos do formulário (que pode conter camelCase ou snake_case)
 * para o padrão de persistência do sistema.
 */
export function normalizePatientPayload(form: any, existingPatient?: any) {
  // Helper para resolver valor priorizando o form, depois o banco, com fallback seguro
  const resolve = (f: string, f2?: string) => {
    const v = form[f] ?? form[f2 || ""] ?? existingPatient?.[f] ?? existingPatient?.[f2 || ""];
    if (v === undefined || v === null) return "";
    return typeof v === 'string' ? v.trim() : v;
  };

  const resolveBool = (f: string, f2?: string) => {
    const v = form[f] ?? form[f2 || ""] ?? existingPatient?.[f] ?? existingPatient?.[f2 || ""];
    return !!v;
  };

  // 1. Extração do Custom Data (Dados Estruturados e Sociais)
  const existingCd = existingPatient?.custom_data || {};
  const customData = {
    ...existingCd,
    // Dados Sociais
    sexo: form.sexo ?? existingCd.sexo ?? "",
    raca_cor: form.raca_cor ?? form.racaCor ?? existingCd.raca_cor ?? existingCd.racaCor ?? "",
    etnia: form.etnia ?? existingCd.etnia ?? "",
    etnia_outra: form.etnia_outra ?? form.etniaOutra ?? existingCd.etnia_outra ?? existingCd.etniaOutra ?? "",
    nacionalidade: form.nacionalidade ?? existingCd.nacionalidade ?? "brasileiro",
    pais_nascimento: form.pais_nascimento ?? form.paisNascimento ?? existingCd.pais_nascimento ?? existingCd.pais_nascimento ?? "",
    
    // Endereço Estruturado
    cep: form.cep ?? existingCd.cep ?? "",
    tipo_logradouro_dne: form.tipo_logradouro_dne ?? form.tipoLogradouroDne ?? existingCd.tipo_logradouro_dne ?? existingCd.tipoLogradouroDne ?? "",
    tipo_logradouro_codigo: form.tipo_logradouro_codigo ?? form.tipoLogradouroCodigo ?? existingCd.tipo_logradouro_codigo ?? existingCd.tipoLogradouroCodigo ?? "",
    logradouro: form.logradouro ?? existingCd.logradouro ?? "",
    numero: form.numero ?? existingCd.numero ?? "",
    complemento: form.complemento ?? existingCd.complemento ?? "",
    bairro: form.bairro ?? existingCd.bairro ?? "",
    uf: form.uf ?? existingCd.uf ?? "PA",
    
    // Contato Extra
    telefone_secundario: form.telefone_secundario ?? form.telefoneSecundario ?? existingCd.telefone_secundario ?? existingCd.telefoneSecundario ?? "",
    
    // Auditoria Interna
    data_ultima_validacao: new Date().toISOString(),
  };

  // 2. Montagem do Payload de Topo (Tabela `pacientes`)
  const payload: any = {
    nome: resolve("nome", "nome_completo"),
    nome_mae: resolve("nome_mae", "nomeMae"),
    data_nascimento: resolve("data_nascimento", "dataNascimento"),
    cpf: String(resolve("cpf")).replace(/\D/g, ""),
    cns: String(resolve("cns")).replace(/\D/g, "").slice(0, 15),
    telefone: normalizePhone(String(resolve("telefone"))) || String(resolve("telefone")),
    email: String(resolve("email")).toLowerCase(),
    municipio: resolve("municipio"),
    naturalidade: resolve("naturalidade"),
    naturalidade_uf: resolve("naturalidade_uf", "naturalidadeUf"),
    unidade_id: resolve("unidade_id", "unidadeId"),
    
    // Flags de Prioridade/Clínicas
    is_gestante: resolveBool("is_gestante", "isGestante"),
    is_pne: resolveBool("is_pne", "isPne"),
    is_autista: resolveBool("is_autista", "isAutista"),
    menor_idade: resolveBool("menor_idade", "menorIdade"),
    nome_responsavel: resolve("nome_responsavel", "nomeResponsavel"),
    cpf_responsavel: String(resolve("cpf_responsavel", "cpfResponsavel")).replace(/\D/g, ""),
    
    // Dados Clínicos e de Encaminhamento
    cid: resolve("cid"),
    descricao_clinica: resolve("descricao_clinica", "descricaoClinica"),
    ubs_origem: resolve("ubs_origem", "ubsOrigem"),
    profissional_solicitante: resolve("profissional_solicitante", "profissionalSolicitante"),
    tipo_encaminhamento: resolve("tipo_encaminhamento", "tipoEncaminhamento"),
    diagnostico_resumido: resolve("diagnostico_resumido", "diagnosticoResumido"),
    justificativa: resolve("justificativa"),
    data_encaminhamento: resolve("data_encaminhamento", "dataEncaminhamento"),
    documento_url: resolve("documento_url", "documentoUrl"),
    especialidade_destino: resolve("especialidade_destino", "especialidadeDestino"),
    
    // Condição e Mobilidade
    tipo_condicao: resolve("tipo_condicao", "tipoCondicao"),
    mobilidade: resolve("mobilidade"),
    usa_dispositivo: resolveBool("usa_dispositivo", "usaDispositivo"),
    tipo_dispositivo: resolve("tipo_dispositivo", "tipoDispositivo"),
    comunicacao: resolve("comunicacao"),
    comportamento: resolve("comportamento"),
    usa_equipamentos: resolveBool("usa_equipamentos", "usaEquipamentos"),
    equipamentos: Array.isArray(form.equipamentos) ? form.equipamentos : (existingPatient?.equipamentos || []),
    observacao_equipamentos: resolve("observacao_equipamentos", "observacaoEquipamentos"),
    outro_servico_sus: resolveBool("outro_servico_sus", "outroServicoSus"),
    transporte: resolve("transporte"),
    turno_preferido: resolve("turno_preferido", "turnoPreferido"),
    
    // Custom Data Acoplado
    custom_data: customData,
  };

  // 3. Sincronização do Campo `endereco` (Texto Livre) com o Estruturado
  const parts = [
    customData.tipo_logradouro_dne,
    customData.logradouro,
    customData.numero ? `nº ${customData.numero}` : "",
    customData.complemento,
    customData.bairro,
    payload.municipio,
    customData.uf,
    customData.cep ? `CEP ${customData.cep}` : ""
  ].filter(p => p && String(p).trim() !== "");
  
  payload.endereco = parts.join(", ");

  return sanitizePacientePayload(payload);
}

/**
 * Função centralizada para persistência de dados de pacientes (INSERT e UPDATE).
 */
export async function persistPaciente(
  pacienteId: string | null,
  dados: any,
  origem: string,
  user: any,
  queryClient?: any
) {
  let existing: any = null;
  
  if (pacienteId) {
    const { data } = await supabase.from("pacientes").select("*").eq("id", pacienteId).maybeSingle();
    existing = data;
  }

  const payload = normalizePatientPayload(dados, existing);

  let result;
  if (pacienteId && existing) {
    // UPDATE
    result = await supabase.from("pacientes").update(payload).eq("id", pacienteId).select().single();
  } else {
    // INSERT
    const id = pacienteId || `p${Date.now()}`;
    const insertPayload = {
      ...payload,
      id,
      criado_em: new Date().toISOString(),
    };
    // Garante metadados de criação no custom_data
    insertPayload.custom_data = {
      ...(insertPayload.custom_data || {}),
      criado_por: user?.id || "",
      criado_por_nome: user?.nome || "",
      unidade_origem_id: user?.unidadeId || "",
    };
    result = await supabase.from("pacientes").insert(insertPayload).select().single();
  }

  if (result.error) {
    console.error(`[Paciente] Erro ao salvar cadastro`, {
      origem,
      pacienteId,
      error: result.error,
      payloadResumo: { nome: payload.nome, cpf: payload.cpf ? '***' : '' }
    });
    throw result.error;
  }

  // Auditoria
  const changes: any = {};
  if (pacienteId && existing) {
    Object.keys(payload).forEach(k => {
      if (k !== "custom_data" && String(payload[k]) !== String(existing?.[k])) {
        changes[k] = { de: existing?.[k], para: payload[k] };
      }
    });
  }

  if (!pacienteId || Object.keys(changes).length > 0) {
    await auditService.log({
      acao: pacienteId ? "editar" : "cadastrar",
      entidade: "paciente",
      entidadeId: result.data.id,
      modulo: "pacientes",
      user,
      detalhes: { 
        origem,
        acao: pacienteId ? "edicao" : "criacao",
        changes: Object.keys(changes).length > 0 ? changes : undefined
      },
    }).catch(() => {});
  }

  if (queryClient) {
    await queryClient.invalidateQueries({ queryKey: queryKeys.pacientes.all });
    if (pacienteId) await queryClient.invalidateQueries({ queryKey: queryKeys.pacientes.detail(pacienteId) });
    await queryClient.invalidateQueries({ queryKey: ['pacientes', 'page'] });
    await queryClient.invalidateQueries({ queryKey: ['agenda'] });
    await queryClient.invalidateQueries({ queryKey: ['fila_espera'] });
  }

  return result.data;
}

// Mantém compatibilidade com funções antigas enquanto migra
export async function updatePacienteCadastro(id: string, dados: any, origem: string, user: any, queryClient?: any) {
  return persistPaciente(id, dados, origem, user, queryClient);
}

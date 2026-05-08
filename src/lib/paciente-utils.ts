import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "@/lib/phoneUtils";
import { auditService } from "@/services/auditService";
import { queryKeys } from "@/hooks/queries/queryKeys";

/**
 * Colunas NOT NULL (sem permitir null) na tabela `pacientes`.
 * Para essas, null/undefined deve ser convertido para "" (texto) ou false (boolean)
 * antes do INSERT/UPDATE para evitar erros do tipo
 * "null value in column ... violates not-null constraint".
 */
const PACIENTE_TEXT_NOT_NULL = new Set([
  "nome", "cpf", "cns", "telefone", "email", "endereco", "observacoes",
  "nome_mae", "municipio", "naturalidade", "naturalidade_uf", "unidade_id",
  "data_nascimento", "descricao_clinica", "cid", "especialidade_destino",
  "turno_preferido", "transporte", "observacao_equipamentos",
  "tipo_condicao", "mobilidade", "tipo_dispositivo", "comunicacao", "comportamento",
  "nome_responsavel", "cpf_responsavel", "ubs_origem", "profissional_solicitante",
  "tipo_encaminhamento", "diagnostico_resumido", "justificativa",
  "data_encaminhamento", "documento_url", "raca_cor", "naturalidade_uf", "municipio"
]);

const PACIENTE_BOOL_NOT_NULL = new Set([
  "is_gestante", "is_pne", "is_autista", "menor_idade",
  "outro_servico_sus", "usa_dispositivo", "usa_equipamentos",
]);

/**
 * Saneia um payload destinado à tabela `pacientes`:
 * - Remove chaves com valor `undefined` (preserva valor antigo no banco).
 * - Converte `null` em "" para colunas TEXT NOT NULL.
 * - Converte `null` em false para colunas BOOLEAN NOT NULL.
 * Resultado: nunca enviar null para colunas NOT NULL.
 */
export function sanitizePacientePayload<T extends Record<string, any>>(payload: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined) continue; // preserva valor existente
    if (v === null) {
      if (PACIENTE_TEXT_NOT_NULL.has(k)) { out[k] = ""; continue; }
      if (PACIENTE_BOOL_NOT_NULL.has(k)) { out[k] = false; continue; }
      // Para outras colunas, omita o null (deixa default ou valor antigo)
      continue;
    }
    out[k] = v;
  }
  return out as T;
}

/**
 * Normaliza os dados do paciente vindos do formulário para o formato do banco.
 */
export function normalizePatientPayload(form: any, existingPatient?: any) {
  // Garante strings básicas
  const getVal = (f: string, f2?: string) => {
    const v = form[f] ?? form[f2 || ""] ?? existingPatient?.[f] ?? existingPatient?.[f2 || ""] ?? "";
    return typeof v === 'string' ? v.trim() : v;
  };

  const telNormalizado = normalizePhone(getVal("telefone")) || getVal("telefone");
  const telSecNormalizado = normalizePhone(getVal("telefone_secundario", "telefoneSecundario")) || getVal("telefone_secundario", "telefoneSecundario");

  // Campos que residem no custom_data
  const existingCd = existingPatient?.custom_data || {};
  
  // Mapeia todas as variações possíveis de nomes de campos (camelCase e snake_case)
  const customData = {
    ...existingCd,
    sexo: form.sexo ?? existingCd.sexo ?? "",
    raca_cor: form.raca_cor ?? form.racaCor ?? existingCd.raca_cor ?? existingCd.racaCor ?? "",
    racaCor: form.raca_cor ?? form.racaCor ?? existingCd.racaCor ?? existingCd.raca_cor ?? "",
    etnia: form.etnia ?? existingCd.etnia ?? "",
    etniaOutra: form.etnia_outra ?? form.etniaOutra ?? existingCd.etniaOutra ?? existingCd.etnia_outra ?? "",
    nacionalidade: form.nacionalidade ?? existingCd.nacionalidade ?? "brasileiro",
    paisNascimento: form.pais_nascimento ?? form.paisNascimento ?? existingCd.paisNascimento ?? existingCd.pais_nascimento ?? "",
    
    // Endereço estruturado
    tipoLogradouroDne: form.tipo_logradouro_dne ?? form.tipoLogradouroDne ?? existingCd.tipoLogradouroDne ?? existingCd.tipo_logradouro_dne ?? existingCd.tipoLogradouro ?? "",
    tipoLogradouroCodigo: form.tipo_logradouro_codigo ?? form.tipoLogradouroCodigo ?? existingCd.tipoLogradouroCodigo ?? existingCd.tipo_logradouro_codigo ?? "",
    tipoLogradouro: form.tipo_logradouro_dne ?? form.tipoLogradouroDne ?? existingCd.tipoLogradouro ?? "",
    logradouro: form.logradouro ?? existingCd.logradouro ?? "",
    numero: form.numero ?? existingCd.numero ?? "",
    complemento: form.complemento ?? existingCd.complemento ?? "",
    bairro: form.bairro ?? existingCd.bairro ?? "",
    uf: form.uf ?? existingCd.uf ?? "PA",
    cep: form.cep ?? existingCd.cep ?? "",
    
    telefoneSecundario: telSecNormalizado,
    
    // Flags especiais
    is_gestante: form.isGestante !== undefined ? !!form.isGestante : (form.is_gestante !== undefined ? !!form.is_gestante : !!existingCd.is_gestante),
    is_pne: form.isPne !== undefined ? !!form.isPne : (form.is_pne !== undefined ? !!form.is_pne : !!existingCd.is_pne),
    is_autista: form.isAutista !== undefined ? !!form.isAutista : (form.is_autista !== undefined ? !!form.is_autista : !!existingCd.is_autista),

    data_ultima_validacao_cadastro: new Date().toISOString(),
  };

  // Payload principal da tabela 'pacientes'
  const payload: any = {
    nome: getVal("nome", "nome_completo"),
    nome_mae: getVal("nome_mae", "nomeMae"),
    data_nascimento: getVal("data_nascimento", "dataNascimento"),
    cpf: String(getVal("cpf")).replace(/\D/g, ""),
    cns: String(getVal("cns")).replace(/\D/g, "").slice(0, 15),
    telefone: telNormalizado || "",
    email: getVal("email"),
    municipio: getVal("municipio"),
    naturalidade: getVal("naturalidade"),
    naturalidade_uf: getVal("naturalidade_uf", "naturalidadeUf"),
    unidade_id: getVal("unidade_id", "unidadeId"),
    
    // Flags diretas na tabela
    is_gestante: !!customData.is_gestante,
    is_pne: !!customData.is_pne,
    is_autista: !!customData.is_autista,
    
    // Outros campos comuns que podem vir do form
    descricao_clinica: getVal("descricao_clinica", "descricaoClinica"),
    cid: getVal("cid"),
    especialidade_destino: getVal("especialidade_destino", "especialidadeDestino"),
    menor_idade: form.menor_idade ?? form.menorIdade ?? existingPatient?.menor_idade ?? !!existingPatient?.menor_idade,
    nome_responsavel: getVal("nome_responsavel", "nomeResponsavel"),
    cpf_responsavel: String(getVal("cpf_responsavel", "cpfResponsavel")).replace(/\D/g, ""),
    ubs_origem: getVal("ubs_origem", "ubsOrigem"),
    
    custom_data: customData,
  };

  // Retrocompatibilidade do campo 'endereco' (texto livre)
  const enderecoTexto = [
    customData.logradouro,
    customData.numero,
    customData.bairro,
    payload.municipio ? `${payload.municipio} - ${customData.uf || ""}` : ""
  ].filter(Boolean).join(", ");
  
  if (enderecoTexto) {
    payload.endereco = enderecoTexto;
  }

  return sanitizePacientePayload(payload);
}

/**
 * Função única para atualizar cadastro de paciente com dupla garantia.
 */
export async function updatePacienteCadastro(
  pacienteId: string, 
  dados: any, 
  origem: string, 
  user: any,
  queryClient?: any
) {
  if (!pacienteId) {
    throw new Error("Não foi possível salvar: paciente não identificado.");
  }

  // 1. Buscar dados atuais para merge seguro (não apagar campos vazios acidentalmente)
  const { data: existing, error: fetchError } = await supabase
    .from("pacientes")
    .select("*")
    .eq("id", pacienteId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!existing) throw new Error("Paciente não encontrado no banco de dados.");

  // 2. Normalizar payload com merge
  const updatePayload = normalizePatientPayload(dados, existing);

  // 3. Update no banco — payload já saneado por normalizePatientPayload/sanitizePacientePayload
  const { data: updated, error: updateError } = await supabase
    .from("pacientes")
    .update(updatePayload)
    .eq("id", pacienteId)
    .select()
    .single();

  if (updateError) {
    console.error("[updatePacienteCadastro] Erro Supabase:", {
      origem,
      pacienteId,
      code: (updateError as any)?.code,
      message: updateError.message,
      details: (updateError as any)?.details,
      hint: (updateError as any)?.hint,
      payloadKeys: Object.keys(updatePayload),
    });
    throw updateError;
  }

  // 4. Auditoria
  const camposAlterados: Record<string, { de: any; para: any }> = {};
  const coreFields = ["nome", "cpf", "cns", "telefone", "municipio", "unidade_id"];
  coreFields.forEach((k) => {
    const antes = (existing as any)[k] ?? "";
    const depois = (updatePayload as any)[k] ?? "";
    if (String(antes) !== String(depois)) {
      camposAlterados[k] = { de: antes, para: depois };
    }
  });

  if (Object.keys(camposAlterados).length > 0) {
    await auditService.log({
      acao: "atualizar",
      entidade: "paciente",
      entidadeId: pacienteId,
      modulo: origem,
      user: user ? { id: user.id, nome: user.nome, role: user.role, unidadeId: user.unidadeId } : null,
      detalhes: { 
        origem, 
        campos_alterados: camposAlterados 
      },
    }).catch(err => console.error("Erro ao registrar auditoria:", err));
  }

  // 5. Invalidação de Cache
  if (queryClient) {
    const keys = [
      queryKeys.pacientes.all,
      queryKeys.pacientes.detail(pacienteId),
      queryKeys.agendamentos.all,
      queryKeys.fila.all,
      queryKeys.atendimentos.all,
      queryKeys.prontuarios.byPaciente(pacienteId),
      ['pacientes', 'page'],
      ['pacientes', 'linked-unidade'],
      ['pacientes', 'diagnostics']
    ];
    
    await Promise.all(keys.map(key => queryClient.invalidateQueries({ queryKey: key })));
  }

  return updated;
}

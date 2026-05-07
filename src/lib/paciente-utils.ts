import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "@/lib/phoneUtils";
import { auditService } from "@/services/auditService";
import { queryKeys } from "@/hooks/queries/queryKeys";

/**
 * Normaliza os dados do paciente vindos do formulário para o formato do banco.
 */
export function normalizePatientPayload(form: any, existingPatient?: any) {
  const telNormalizado = form.telefone ? (normalizePhone(form.telefone) || form.telefone) : "";
  const telSecNormalizado = form.telefone_secundario || form.telefoneSecundario
    ? (normalizePhone(form.telefone_secundario || form.telefoneSecundario) || (form.telefone_secundario || form.telefoneSecundario))
    : "";

  // Campos que residem no custom_data
  const existingCd = existingPatient?.custom_data || {};
  const customData = {
    ...existingCd,
    sexo: form.sexo || existingCd.sexo || "",
    racaCor: form.raca_cor || form.racaCor || existingCd.racaCor || existingCd.raca_cor || "",
    raca_cor: form.raca_cor || form.racaCor || existingCd.raca_cor || existingCd.racaCor || "",
    etnia: form.etnia || existingCd.etnia || "",
    etniaOutra: form.etnia_outra || form.etniaOutra || existingCd.etniaOutra || existingCd.etnia_outra || "",
    nacionalidade: form.nacionalidade || existingCd.nacionalidade || "brasileiro",
    paisNascimento: form.pais_nascimento || form.paisNascimento || existingCd.paisNascimento || existingCd.pais_nascimento || "",
    
    // Endereço estruturado
    tipoLogradouroDne: form.tipo_logradouro_dne || form.tipoLogradouroDne || existingCd.tipoLogradouroDne || existingCd.tipo_logradouro_dne || "",
    tipoLogradouroCodigo: form.tipo_logradouro_codigo || form.tipoLogradouroCodigo || existingCd.tipoLogradouroCodigo || existingCd.tipo_logradouro_codigo || "",
    tipoLogradouro: form.tipo_logradouro_dne || form.tipoLogradouroDne || existingCd.tipoLogradouro || "",
    logradouro: form.logradouro || existingCd.logradouro || "",
    numero: form.numero || existingCd.numero || "",
    complemento: form.complemento || existingCd.complemento || "",
    bairro: form.bairro || existingCd.bairro || "",
    uf: form.uf || existingCd.uf || "PA",
    cep: form.cep || existingCd.cep || "",
    
    telefoneSecundario: telSecNormalizado,
    
    // Flags especiais
    is_gestante: form.isGestante !== undefined ? form.isGestante : (form.is_gestante !== undefined ? form.is_gestante : existingCd.is_gestante),
    is_pne: form.isPne !== undefined ? form.isPne : (form.is_pne !== undefined ? form.is_pne : existingCd.is_pne),
    is_autista: form.isAutista !== undefined ? form.isAutista : (form.is_autista !== undefined ? form.is_autista : existingCd.is_autista),

    data_ultima_validacao_cadastro: new Date().toISOString(),
  };

  // Payload principal da tabela 'pacientes'
  const payload: any = {
    nome: (form.nome || form.nome_completo || existingPatient?.nome || "").trim(),
    nome_mae: (form.nome_mae || form.nomeMae || existingPatient?.nome_mae || "").trim(),
    data_nascimento: form.data_nascimento || form.dataNascimento || existingPatient?.data_nascimento || "",
    cpf: (form.cpf || existingPatient?.cpf || "").replace(/\D/g, ""),
    cns: (form.cns || "").replace(/\D/g, "").slice(0, 15) || (existingPatient?.cns || "").replace(/\D/g, ""),
    telefone: telNormalizado || "",
    email: (form.email || existingPatient?.email || "").trim(),
    municipio: form.municipio || existingPatient?.municipio || "",
    naturalidade: form.naturalidade || existingPatient?.naturalidade || "",
    naturalidade_uf: form.naturalidade_uf || form.naturalidadeUf || existingPatient?.naturalidade_uf || "",
    unidade_id: form.unidade_id || form.unidadeId || existingPatient?.unidade_id || "",
    
    // Flags diretas na tabela (se existirem)
    is_gestante: !!customData.is_gestante,
    is_pne: !!customData.is_pne,
    is_autista: !!customData.is_autista,
    
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

  return payload;
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

  // 3. Update no banco
  const { data: updated, error: updateError } = await supabase
    .from("pacientes")
    .update(updatePayload)
    .eq("id", pacienteId)
    .select()
    .single();

  if (updateError) throw updateError;

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

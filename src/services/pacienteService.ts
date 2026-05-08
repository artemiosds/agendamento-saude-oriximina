import { supabase } from "@/integrations/supabase/client";
import { normalizePatientPayload, persistPaciente, sanitizePacientePayload } from "@/lib/paciente-utils";
import { queryKeys } from "@/hooks/queries/queryKeys";

/**
 * Service centralizado para operações com Pacientes.
 * 
 * Este service é a fonte única de verdade para manipulação de dados cadastrais
 * e deve ser utilizado por todas as telas do sistema.
 */
export const pacienteService = {
  /**
   * Busca um paciente pelo ID diretamente da tabela oficial.
   */
  async getPacienteById(id: string) {
    if (!id) return null;
    const { data, error } = await supabase
      .from("pacientes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    
    if (error) {
      console.error(`[pacienteService] Erro ao buscar paciente ${id}:`, error);
      throw error;
    }
    return data;
  },

  /**
   * Cria ou atualiza um cadastro de paciente usando a lógica centralizada de persistência.
   * Garante normalização, saneamento, auditoria e invalidação de cache.
   */
  async savePaciente(pacienteId: string | null, formData: any, origem: string, user: any, queryClient?: any) {
    return persistPaciente(pacienteId, formData, origem, user, queryClient);
  },

  /**
   * Atalho para criação de novo paciente.
   */
  async createPaciente(formData: any, origem: string, user: any, queryClient?: any) {
    return persistPaciente(null, formData, origem, user, queryClient);
  },

  /**
   * Atalho para atualização de paciente existente.
   */
  async updatePaciente(pacienteId: string, formData: any, origem: string, user: any, queryClient?: any) {
    return persistPaciente(pacienteId, formData, origem, user, queryClient);
  },

  /**
   * Mapeia o payload do banco de dados para o formato esperado pelos formulários (CamelCase).
   */
  mapDbToForm(p: any) {
    if (!p) return null;
    const cd = p.custom_data || {};
    return {
      id: p.id,
      nome: p.nome || "",
      nomeMae: p.nome_mae || "",
      dataNascimento: p.data_nascimento || "",
      cpf: p.cpf || "",
      cns: p.cns || "",
      telefone: p.telefone || "",
      email: p.email || "",
      endereco: p.endereco || "",
      municipio: p.municipio || "",
      naturalidade: p.naturalidade || "",
      naturalidadeUf: p.naturalidade_uf || "",
      unidadeId: p.unidade_id || "",
      
      // Re-idratação estruturada do custom_data
      sexo: cd.sexo || "",
      racaCor: cd.raca_cor || cd.racaCor || "",
      etnia: cd.etnia || "",
      etniaOutra: cd.etnia_outra || cd.etniaOutra || "",
      nacionalidade: cd.nacionalidade || "brasileiro",
      paisNascimento: cd.pais_nascimento || cd.paisNascimento || "",
      cep: cd.cep || "",
      tipoLogradouroDne: cd.tipo_logradouro_dne || cd.tipoLogradouroDne || "",
      tipoLogradouroCodigo: cd.tipo_logradouro_codigo || cd.tipoLogradouroCodigo || "",
      logradouro: cd.logradouro || "",
      numero: cd.numero || "",
      complemento: cd.complemento || "",
      bairro: cd.bairro || "",
      uf: cd.uf || "PA",
      telefoneSecundario: cd.telefone_secundario || cd.telefoneSecundario || "",
      
      // Flags booleanas
      isGestante: !!(p.is_gestante || cd.is_gestante),
      isPne: !!(p.is_pne || cd.is_pne),
      isAutista: !!(p.is_autista || cd.is_autista),
      menorIdade: !!p.menor_idade,
      
      // Dados de encaminhamento/UBS
      ubsOrigem: p.ubs_origem || "",
      profissionalSolicitante: p.profissional_solicitante || "",
      tipoEncaminhamento: p.tipo_encaminhamento || "",
      cid: p.cid || "",
      diagnosticoResumido: p.diagnostico_resumido || "",
      justificativa: p.justificativa || "",
      dataEncaminhamento: p.data_encaminhamento || "",
      documentoUrl: p.documento_url || "",
      especialidadeDestino: p.especialidade_destino || "",
      
      // Dados clínicos adicionais
      tipoCondicao: p.tipo_condicao || "",
      mobilidade: p.mobilidade || "",
      usaDispositivo: !!p.usa_dispositivo,
      tipoDispositivo: p.tipo_dispositivo || "",
      comunicacao: p.comunicacao || "",
      comportamento: p.comportamento || "",
      usaEquipamentos: !!p.usa_equipamentos,
      equipamentos: p.equipamentos || [],
      observacaoEquipamentos: p.observacao_equipamentos || "",
      outroServicoSus: !!p.outro_servico_sus,
      transporte: p.transporte || "",
      turnoPreferido: p.turno_preferido || "",
      observacoes: p.observacoes || "",
      
      customData: cd,
    };
  },

  /**
   * Invalida os caches relacionados a pacientes para garantir sincronia entre telas.
   */
  async invalidateCache(pacienteId: string | null, queryClient: any) {
    if (!queryClient) return;
    
    await queryClient.invalidateQueries({ queryKey: queryKeys.pacientes.all });
    if (pacienteId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.pacientes.detail(pacienteId) });
      await queryClient.invalidateQueries({ queryKey: ['paciente', pacienteId] });
      await queryClient.invalidateQueries({ queryKey: ['paciente_by_id', pacienteId] });
      await queryClient.invalidateQueries({ queryKey: ['conferir_dados_paciente', pacienteId] });
    }
    await queryClient.invalidateQueries({ queryKey: ['pacientes', 'page'] });
    await queryClient.invalidateQueries({ queryKey: ['agenda'] });
    await queryClient.invalidateQueries({ queryKey: ['fila_espera'] });
    await queryClient.invalidateQueries({ queryKey: ['central_atualizacao_cadastral'] });
    await queryClient.invalidateQueries({ queryKey: ['pendencias_cadastrais'] });
  }
};

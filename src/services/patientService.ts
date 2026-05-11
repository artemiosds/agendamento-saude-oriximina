import { supabase } from '@/integrations/supabase/client';
import { normalizePhone } from '@/lib/phoneUtils';

export const patientService = {
  async getAll(limit = 1000, unidadeId?: string) {
    const all: any[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      let query = supabase.from('pacientes').select('*').range(offset, offset + limit - 1);
      if (unidadeId) query = query.eq('unidade_id', unidadeId);
      const { data } = await query;
      if (data && data.length > 0) {
        all.push(...data);
        offset += data.length;
        hasMore = data.length === limit;
      } else {
        hasMore = false;
      }
    }
    return all;
  },

  async getById(id: string) {
    const { data } = await supabase.from('pacientes').select('*').eq('id', id).single();
    return data;
  },

  async search(query: string, unidadeId?: string) {
    // Busca básica por nome, cpf, cns, telefone (colunas reais existentes)
    let q = supabase.from('pacientes').select('*')
      .or(`nome.ilike.%${query}%,cpf.ilike.%${query}%,cns.ilike.%${query}%,telefone.ilike.%${query}%`)
      .limit(50);
    if (unidadeId) q = q.eq('unidade_id', unidadeId);
    const { data } = await q;
    return data || [];
  },

  mapPacienteDbToForm(paciente: any) {
    if (!paciente) return {};
    const cd = paciente.custom_data || {};
    return {
      nome: paciente.nome || "",
      nome_mae: paciente.nome_mae || "",
      data_nascimento: paciente.data_nascimento || "",
      cpf: paciente.cpf || "",
      cns: paciente.cns || "",
      telefone_principal: paciente.telefone || "",
      email: paciente.email || "",
      endereco: paciente.endereco || "",
      municipio: paciente.municipio || "",
      naturalidade: paciente.naturalidade || "",
      naturalidade_uf: paciente.naturalidade_uf || "",
      // Campos do custom_data
      sexo: cd.sexo || "",
      raca_cor: cd.raca_cor || cd.racaCor || "",
      etnia: cd.etnia || "",
      etnia_outra: cd.etnia_outra || cd.etniaOutra || "",
      nacionalidade: cd.nacionalidade || "brasileiro",
      pais_nascimento: cd.pais_nascimento || cd.paisNascimento || "",
      tipo_logradouro_dne: cd.tipo_logradouro_dne || cd.tipoLogradouroDne || cd.tipoLogradouro || "",
      tipo_logradouro_codigo: cd.tipo_logradouro_codigo || cd.tipoLogradouroCodigo || "",
      logradouro: cd.logradouro || "",
      numero: cd.numero || "",
      complemento: cd.complemento || "",
      bairro: cd.bairro || "",
      uf: cd.uf || "PA",
      cep: cd.cep || "",
      telefone_secundario: cd.telefone_secundario || cd.telefoneSecundario || "",
      observacoes: cd.observacoes || paciente.observacoes || "",
      unidade_id: paciente.unidade_id || "",
    };
  },

  sanitizePacientePayload(payload: any) {
    const sanitized: any = {};
    Object.keys(payload).forEach(key => {
      const value = payload[key];
      // Remover campos undefined
      if (value === undefined) return;
      
      // Garantir que campos de texto importantes não sejam null se o banco/sistema espera string
      if (['email', 'telefone', 'cpf', 'cns'].includes(key)) {
        sanitized[key] = (value === null || value === undefined) ? "" : String(value);
      } else {
        sanitized[key] = value;
      }
    });
    return sanitized;
  },

  mapPacienteFormToDb(formData: any, oldPaciente: any = {}) {
    const cd = oldPaciente.custom_data || {};
    
    // Normalizar telefones
    const telNormalizado = formData.telefone_principal || formData.telefone || "";
    const telSecNormalizado = formData.telefone_secundario || cd.telefone_secundario || cd.telefoneSecundario || "";

    // Mapear campos para custom_data, garantindo que NADA seja perdido
    const updatedCustomData = {
      ...cd,
      // Identificação
      sexo: formData.sexo ?? cd.sexo ?? "",
      raca_cor: formData.raca_cor ?? cd.raca_cor ?? cd.racaCor ?? "",
      racaCor: formData.raca_cor ?? cd.racaCor ?? cd.raca_cor ?? "",
      etnia: formData.etnia ?? cd.etnia ?? "",
      etnia_outra: formData.etnia_outra ?? cd.etniaOutra ?? cd.etnia_outra ?? "",
      etniaOutra: formData.etnia_outra ?? cd.etniaOutra ?? cd.etnia_outra ?? "",
      nacionalidade: formData.nacionalidade ?? cd.nacionalidade ?? "brasileiro",
      pais_nascimento: formData.pais_nascimento ?? cd.paisNascimento ?? cd.pais_nascimento ?? "",
      paisNascimento: formData.pais_nascimento ?? cd.paisNascimento ?? cd.pais_nascimento ?? "",
      
      // Endereço Estruturado
      tipo_logradouro_dne: formData.tipo_logradouro_dne ?? cd.tipoLogradouroDne ?? cd.tipo_logradouro_dne ?? cd.tipoLogradouro ?? "",
      tipoLogradouroDne: formData.tipo_logradouro_dne ?? cd.tipoLogradouroDne ?? cd.tipo_logradouro_dne ?? cd.tipoLogradouro ?? "",
      tipoLogradouroCodigo: formData.tipo_logradouro_codigo ?? cd.tipoLogradouroCodigo ?? "",
      tipoLogradouro: formData.tipo_logradouro_dne ?? cd.tipoLogradouro ?? cd.tipoLogradouroDne ?? cd.tipo_logradouro_dne ?? "",
      logradouro: formData.logradouro ?? cd.logradouro ?? "",
      numero: formData.numero ?? cd.numero ?? "",
      complemento: formData.complemento ?? cd.complemento ?? "",
      bairro: formData.bairro ?? cd.bairro ?? "",
      uf: formData.uf ?? cd.uf ?? "PA",
      cep: (formData.cep || cd.cep || "").replace(/\D/g, ""),
      
      // Contato
      telefone_secundario: telSecNormalizado,
      telefoneSecundario: telSecNormalizado,
      
      // Complementares/Clínicos
      situacaoRua: formData.situacaoRua ?? cd.situacaoRua ?? false,
      is_gestante: formData.isGestante ?? cd.is_gestante ?? false,
      is_pne: formData.isPne ?? cd.is_pne ?? false,
      is_autista: formData.isAutista ?? cd.is_autista ?? false,
      menor_idade: formData.menorIdade ?? cd.menor_idade ?? false,
      nome_responsavel: formData.nomeResponsavel ?? cd.nome_responsavel ?? "",
      cpf_responsavel: formData.cpfResponsavel ?? cd.cpf_responsavel ?? "",
      
      observacoes: formData.observacoes ?? cd.observacoes ?? "",
      data_ultima_validacao_cadastro: new Date().toISOString(),
      dados_conferidos_em: new Date().toISOString(),
    };

    // Payload final com apenas as colunas REAIS da tabela pacientes
    const payload = {
      nome: formData.nome || oldPaciente.nome,
      nome_mae: formData.nome_mae || formData.nomeMae || oldPaciente.nome_mae,
      data_nascimento: formData.data_nascimento || formData.dataNascimento || oldPaciente.data_nascimento || null,
      cpf: (formData.cpf || oldPaciente.cpf || "").replace(/\D/g, ""),
      cns: (formData.cns || oldPaciente.cns || "").replace(/\D/g, "").slice(0, 15),
      telefone: (telNormalizado || "").replace(/\D/g, ""),
      email: formData.email ?? oldPaciente.email ?? "",
      municipio: formData.municipio ?? oldPaciente.municipio ?? "",
      naturalidade: formData.naturalidade ?? oldPaciente.naturalidade ?? "",
      naturalidade_uf: formData.naturalidade_uf ?? formData.naturalidadeUf ?? oldPaciente.naturalidade_uf ?? "",
      unidade_id: formData.unidade_id || oldPaciente.unidade_id,
      endereco: formData.endereco || formData.logradouro || oldPaciente.endereco || "",
      observacoes: formData.observacoes || oldPaciente.observacoes || "",
      custom_data: updatedCustomData,
    };

    return this.sanitizePacientePayload(payload);
  },

  async updatePatientFields(pacienteId: string, fields: any, origem: string = "Indefinida") {
    const { data: current, error: fetchError } = await supabase
      .from('pacientes')
      .select('*')
      .eq('id', pacienteId)
      .single();
    
    if (fetchError) throw fetchError;

    const currentForm = this.mapPacienteDbToForm(current);
    const updatedForm = { ...currentForm, ...fields };
    const updatePayload = this.mapPacienteFormToDb(updatedForm, current);

    const { data, error } = await supabase
      .from('pacientes')
      .update(updatePayload)
      .eq('id', pacienteId)
      .select()
      .single();

    if (error) {
      console.error("[Paciente] Erro no updatePatientFields", {
        origem, pacienteId, errorMessage: error.message, errorCode: error.code
      });
      throw error;
    }
    return data;
  },

  async savePacienteCadastro(pacienteId: string, formData: any, origem: string = "Indefinida") {
    const { data: current } = await supabase
      .from('pacientes')
      .select('*')
      .eq('id', pacienteId)
      .single();
    
    const updatePayload = this.mapPacienteFormToDb(formData, current || {});
    
    const { data, error } = await supabase
      .from('pacientes')
      .update(updatePayload)
      .eq('id', pacienteId)
      .select()
      .single();

    if (error) {
      console.error("[Paciente] Erro no savePacienteCadastro", {
        origem, pacienteId, errorMessage: error.message
      });
      throw error;
    }
    return data;
  }
};

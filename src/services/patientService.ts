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
    let q = supabase.from('pacientes').select('*')
      .or(`nome.ilike.%${query}%,nome_completo.ilike.%${query}%,cpf.ilike.%${query}%,cns.ilike.%${query}%`)
      .limit(50);
    if (unidadeId) q = q.eq('unidade_id', unidadeId);
    const { data } = await q;
    return data || [];
  },

  mapPacienteDbToForm(paciente: any) {
    if (!paciente) return {};
    const cd = paciente.custom_data || {};
    return {
      nome: paciente.nome_completo || paciente.nome || "",
      nome_mae: paciente.nome_mae || "",
      data_nascimento: paciente.data_nascimento || "",
      cpf: paciente.cpf || "",
      cns: paciente.cns || "",
      telefone_principal: paciente.telefone || "",
      email: paciente.email || "",
      cep: paciente.cep || "",
      logradouro: paciente.logradouro || "",
      numero: paciente.numero || "",
      complemento: paciente.complemento || cd.complemento || "",
      bairro: paciente.bairro || "",
      municipio: paciente.municipio || "",
      uf: paciente.uf || "",
      naturalidade: paciente.naturalidade || "",
      naturalidade_uf: paciente.naturalidade_uf || "",
      sexo: cd.sexo || "",
      raca_cor: cd.racaCor || cd.raca_cor || "",
      etnia: cd.etnia || "",
      etnia_outra: cd.etniaOutra || cd.etnia_outra || "",
      nacionalidade: cd.nacionalidade || "brasileiro",
      pais_nascimento: cd.paisNascimento || cd.pais_nascimento || "",
      tipo_logradouro_dne: cd.tipoLogradouroDne || cd.tipo_logradouro_dne || cd.tipoLogradouro || "",
      tipo_logradouro_codigo: cd.tipoLogradouroCodigo || cd.tipo_logradouro_codigo || "",
      telefone_secundario: cd.telefoneSecundario || cd.telefone_secundario || "",
      observacoes: cd.observacoes || "",
      unidade_id: paciente.unidade_id || "",
    };
  },

  sanitizePacientePayload(payload: any) {
    const sanitized: any = {};
    Object.keys(payload).forEach(key => {
      const value = payload[key];
      if (value === undefined) return;
      
      // Emails, telefones, CPF, CNS vazios viram string vazia ""
      if (['email', 'telefone', 'cpf', 'cns', 'telefone_secundario', 'telefone_principal'].includes(key)) {
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
    const telNormalizado = formData.telefone_principal ? (normalizePhone(formData.telefone_principal) || formData.telefone_principal) : "";
    const telSecNormalizado = formData.telefone_secundario ? (normalizePhone(formData.telefone_secundario) || formData.telefone_secundario) : "";

    const updatedCustomData = {
      ...cd,
      sexo: formData.sexo ?? cd.sexo ?? "",
      raca_cor: formData.raca_cor ?? cd.raca_cor ?? "",
      racaCor: formData.raca_cor ?? cd.racaCor ?? "",
      etnia: formData.etnia ?? cd.etnia ?? "",
      etnia_outra: formData.etnia_outra ?? cd.etnia_outra ?? "",
      etniaOutra: formData.etnia_outra ?? cd.etniaOutra ?? "",
      nacionalidade: formData.nacionalidade ?? cd.nacionalidade ?? "brasileiro",
      pais_nascimento: formData.pais_nascimento ?? cd.pais_nascimento ?? "",
      paisNascimento: formData.pais_nascimento ?? cd.paisNascimento ?? "",
      tipo_logradouro_dne: formData.tipo_logradouro_dne ?? cd.tipo_logradouro_dne ?? "",
      tipo_logradouro_codigo: formData.tipo_logradouro_codigo ?? cd.tipo_logradouro_codigo ?? "",
      tipoLogradouroDne: formData.tipo_logradouro_dne ?? cd.tipoLogradouroDne ?? "",
      tipoLogradouroCodigo: formData.tipo_logradouro_codigo ?? cd.tipoLogradouroCodigo ?? "",
      tipoLogradouro: formData.tipo_logradouro_dne ?? cd.tipoLogradouro ?? "",
      logradouro: formData.logradouro ?? cd.logradouro ?? "",
      numero: formData.numero ?? cd.numero ?? "",
      complemento: formData.complemento ?? cd.complemento ?? "",
      bairro: formData.bairro ?? cd.bairro ?? "",
      uf: formData.uf ?? cd.uf ?? "",
      cep: formData.cep ?? cd.cep ?? "",
      telefone_secundario: telSecNormalizado ?? cd.telefone_secundario ?? "",
      telefoneSecundario: telSecNormalizado ?? cd.telefoneSecundario ?? "",
      observacoes: formData.observacoes ?? cd.observacoes ?? "",
      data_ultima_validacao_cadastro: new Date().toISOString(),
      dados_conferidos_em: new Date().toISOString(),
    };

    const payload = {
      nome: formData.nome,
      nome_completo: formData.nome,
      nome_mae: formData.nome_mae,
      data_nascimento: formData.data_nascimento || null,
      sexo: formData.sexo,
      cpf: formData.cpf || "",
      cns: (formData.cns || "").replace(/\D/g, "").slice(0, 15) || "",
      telefone: telNormalizado || "",
      email: formData.email || "",
      cep: formData.cep || "",
      logradouro: formData.logradouro || "",
      numero: formData.numero || "",
      bairro: formData.bairro || "",
      municipio: formData.municipio || "",
      uf: formData.uf || "",
      naturalidade: formData.naturalidade || "",
      naturalidade_uf: formData.naturalidade_uf || "",
      raca_cor: formData.raca_cor,
      nacionalidade: formData.nacionalidade,
      unidade_id: formData.unidade_id,
      custom_data: updatedCustomData,
    };

    return this.sanitizePacientePayload(payload);
  },

  async updatePatientFields(pacienteId: string, fields: any, origem: string = "Indefinida") {
    console.log(`[Paciente] Iniciando updatePatientFields - Origem: ${origem}`, { pacienteId, fields });
    
    // Buscar paciente atual para não perder custom_data
    const { data: current, error: fetchError } = await supabase
      .from('pacientes')
      .select('*')
      .eq('id', pacienteId)
      .single();
    
    if (fetchError) throw fetchError;

    // Criar payload de atualização parcial
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
      console.error("[Paciente] Erro no autosave", {
        origem,
        pacienteId,
        fields,
        errorMessage: error?.message,
        errorDetails: error?.details,
        errorHint: error?.hint,
        errorCode: error?.code
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

    if (error) throw error;
    return data;
  }
};

import type { PacienteFormData } from '@/components/CadastroPacienteForm';
import { buildPacienteCadastroFields, validatePacienteCadastro } from '@/lib/pacienteCadastro';
import { checkPatientDuplicity } from '@/lib/paciente-duplicity';
import { supabase } from '@/integrations/supabase/client';
import { normalizePhone } from '@/lib/phoneUtils';
import { auditService } from './auditService';
import { normalizeSexo } from '@/lib/utils/sexo-normalization';

// O formulário usa os mesmos valores do cadastro; preserve "Ignorado" quando
// já existir no paciente, sem convertê-lo em campo vazio durante a conferência.
const normalizeSexoCadastro = (value: unknown) => {
  const sexo = normalizeSexo(value);
  return sexo || (['i', 'ignorado'].includes(String(value ?? '').trim().toLowerCase()) ? 'I' : '');
};


export const patientService = {
  /** Creates only the patient and returns the persisted row; no list refetch. */
  async createPaciente(form: PacienteFormData, actor: {id:string; nome?:string; usuario?:string; role?:string; unidadeId?:string}, unidadeId: string, requestId: string) {
    const errors=validatePacienteCadastro(form);
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), {fieldErrors:errors});
    if (!actor.id || !unidadeId || (actor.usuario !== 'admin.sms' && actor.unidadeId !== unidadeId)) throw new Error('Selecione uma unidade válida para cadastrar o paciente.');
    // Stable request ID also permits recovery after an uncertain network response.
    const {data:existing,error:lookupError}=await supabase.from('pacientes').select('*').eq('id',requestId).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) {
      if (existing.unidade_id!==unidadeId || (existing.custom_data as any)?.cadastro_request_id!==requestId || (existing.custom_data as any)?.criado_por!==actor.id) throw new Error('Identificador de cadastro já utilizado.');
      return existing;
    }
    const duplicate=await checkPatientDuplicity({nome:form.nome,dataNascimento:form.dataNascimento,cpf:form.cpf,cns:form.cns},{strict:true});
    if (duplicate.isDuplicate) throw new Error(duplicate.message || 'Paciente já cadastrado.');
    const fields=buildPacienteCadastroFields(form,actor);
    const stamp=new Date().toISOString();
    const payload={id:requestId,...fields,unidade_id:unidadeId,criado_em:stamp,custom_data:{...fields.custom_data,
      criado_por:actor.id,criado_por_nome:actor.nome || '',criado_por_usuario:actor.usuario || '',
      unidade_origem_id:unidadeId,cadastro_request_id:requestId,criado_at:stamp,motivo_alteracao:'Cadastro via Novo Agendamento'}};
    const {data,error}=await supabase.from('pacientes').insert(payload).select('*').single();
    if (error?.code === '23505') throw new Error('Paciente já cadastrado com este CPF ou identificador. Volte à busca e confira o cadastro existente.');
    if (error) throw error;
    if (!data?.id) throw new Error('O banco não confirmou o cadastro.');
    void auditService.auditCreate({acao:'criar_paciente',modulo:'pacientes',entidade:'paciente',entidadeId:data.id,
      pacienteId:data.id,pacienteNome:data.nome,unidadeId,origem:'agenda',user:actor as any,
      detalhes:{motivo_alteracao:'Cadastro via Novo Agendamento'},after:data});
    return data;
  },

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
    const cd = {
      ...(paciente.custom_data || {}),
      is_tfd: paciente.is_tfd === true || paciente.custom_data?.is_tfd === true,
      possui_ordem_judicial: paciente.possui_ordem_judicial === true || paciente.custom_data?.possui_ordem_judicial === true,
      motivo_excecao_bloqueio: paciente.motivo_excecao_bloqueio ?? paciente.custom_data?.motivo_excecao_bloqueio ?? '',
      observacao_tfd_ordem_judicial: paciente.observacao_tfd_ordem_judicial ?? paciente.custom_data?.observacao_tfd_ordem_judicial ?? '',
    };
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
      tipo_condicao: paciente.tipo_condicao ?? cd.tipo_condicao ?? "",
      mobilidade: paciente.mobilidade ?? cd.mobilidade ?? "",
      usa_dispositivo: paciente.usa_dispositivo ?? cd.usa_dispositivo ?? false,
      tipo_dispositivo: paciente.tipo_dispositivo ?? cd.tipo_dispositivo ?? "",
      is_gestante: paciente.is_gestante ?? cd.is_gestante ?? false,
      is_pne: paciente.is_pne ?? cd.is_pne ?? false,
      is_autista: paciente.is_autista ?? cd.is_autista ?? false,
      // Campos do custom_data
      sexo: normalizeSexoCadastro(paciente.sexo || cd.sexo),
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
      // Novos campos persistentes para BPA
      sigtap_codigo: cd.sigtap_codigo || cd.sigtap_principal || "",
      procedimento_nome: cd.procedimento_nome || cd.procedimento_principal || "",
      cid: paciente.cid || cd.cid || "",
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
    const inputCustomData = formData.customData || formData.custom_data || {};
    const cd = oldPaciente.custom_data || {};
    
    const getValue = (key: string, fallback: any = undefined) => {
      if (formData[key] !== undefined && formData[key] !== null) return formData[key];
      if (inputCustomData[key] !== undefined && inputCustomData[key] !== null) return inputCustomData[key];
      return fallback;
    };

    const telNormalizado = getValue('telefone_principal') || getValue('telefone') || "";
    const telSecNormalizado = getValue('telefone_secundario') || getValue('telefoneSecundario') || "";
    // Explicit false/empty values win; omitted fields retain the saved native value.
    const priorityValue = (key: string, alias: string, fallback: any) =>
      formData[alias] ?? formData[key] ?? inputCustomData[alias] ?? inputCustomData[key]
      ?? oldPaciente[key] ?? cd[key] ?? fallback;
    const priorities = {
      tipo_condicao: priorityValue('tipo_condicao', 'tipoCondicao', ''),
      is_gestante: priorityValue('is_gestante', 'isGestante', false),
      is_pne: priorityValue('is_pne', 'isPne', false),
      is_autista: priorityValue('is_autista', 'isAutista', false),
    };

    const updatedCustomData = {
      ...cd,
      ...inputCustomData,
      sexo: normalizeSexoCadastro(getValue('sexo', oldPaciente.sexo || cd.sexo)),
      raca_cor: getValue('raca_cor', getValue('racaCor', cd.raca_cor)),
      racaCor: getValue('raca_cor', getValue('racaCor', cd.raca_cor)),
      etnia: getValue('etnia', cd.etnia),
      etnia_outra: getValue('etnia_outra', getValue('etniaOutra', cd.etnia_outra)),
      etniaOutra: getValue('etnia_outra', getValue('etniaOutra', cd.etnia_outra)),
      nacionalidade: getValue('nacionalidade', cd.nacionalidade || "brasileiro"),
      pais_nascimento: getValue('pais_nascimento', getValue('paisNascimento', cd.pais_nascimento)),
      tipo_logradouro_dne: getValue('tipo_logradouro_dne', getValue('tipoLogradouroDne', getValue('tipoLogradouro', cd.tipo_logradouro_dne))),
      tipoLogradouroDne: getValue('tipo_logradouro_dne', getValue('tipoLogradouroDne', getValue('tipoLogradouro', cd.tipo_logradouro_dne))),
      tipoLogradouroCodigo: getValue('tipo_logradouro_codigo', getValue('tipoLogradouroCodigo', cd.tipoLogradouroCodigo)),
      logradouro: getValue('logradouro', cd.logradouro),
      numero: getValue('numero', cd.numero),
      complemento: getValue('complemento', cd.complemento),
      bairro: getValue('bairro', cd.bairro),
      uf: getValue('uf', cd.uf || "PA"),
      cep: String(getValue('cep', cd.cep || "")).replace(/\D/g, ""),
      telefone_secundario: telSecNormalizado,
      situacaoRua: getValue('situacaoRua', cd.situacaoRua),
      mobilidade: getValue('mobilidade', cd.mobilidade ?? oldPaciente.mobilidade ?? ""),
      usa_dispositivo: getValue('usa_dispositivo', cd.usa_dispositivo ?? oldPaciente.usa_dispositivo ?? false),
      tipo_dispositivo: getValue('tipo_dispositivo', cd.tipo_dispositivo ?? oldPaciente.tipo_dispositivo ?? ""),
      ...priorities,
      menor_idade: getValue('menorIdade', getValue('menor_idade', cd.menor_idade)),
      nome_responsavel: getValue('nomeResponsavel', getValue('nome_responsavel', cd.nome_responsavel)),
      cpf_responsavel: getValue('cpfResponsavel', getValue('cpf_responsavel', cd.cpf_responsavel)),
      observacoes: getValue('observacoes', cd.observacoes),
      sigtap_codigo: getValue('sigtap_codigo', cd.sigtap_codigo),
      procedimento_nome: getValue('procedimento_nome', cd.procedimento_nome),
      data_ultima_validacao_cadastro: new Date().toISOString(),
      dados_conferidos_em: new Date().toISOString(),
    };

    const payload = {
      ...priorities,
      nome: getValue('nome', oldPaciente.nome),
      nome_mae: getValue('nome_mae', getValue('nomeMae', oldPaciente.nome_mae)),
      data_nascimento: getValue('data_nascimento', getValue('dataNascimento', oldPaciente.data_nascimento)) || null,
      cpf: String(getValue('cpf', oldPaciente.cpf || "")).replace(/\D/g, ""),
      cns: String(getValue('cns', oldPaciente.cns || "")).replace(/\D/g, "").slice(0, 15),
      telefone: String(telNormalizado).replace(/\D/g, ""),
      email: getValue('email', oldPaciente.email),
      municipio: getValue('municipio', oldPaciente.municipio),
      naturalidade: getValue('naturalidade', oldPaciente.naturalidade),
      naturalidade_uf: getValue('naturalidade_uf', getValue('naturalidadeUf', oldPaciente.naturalidade_uf)),
      unidade_id: getValue('unidade_id', oldPaciente.unidade_id),
      endereco: getValue('endereco', getValue('logradouro', oldPaciente.endereco)),
      observacoes: getValue('observacoes', oldPaciente.observacoes),
      mobilidade: getValue('mobilidade', oldPaciente.mobilidade ?? cd.mobilidade ?? ""),
      usa_dispositivo: getValue('usa_dispositivo', oldPaciente.usa_dispositivo ?? cd.usa_dispositivo ?? false),
      tipo_dispositivo: getValue('tipo_dispositivo', oldPaciente.tipo_dispositivo ?? cd.tipo_dispositivo ?? ""),
      cid: getValue('cid', oldPaciente.cid),
      sexo: normalizeSexoCadastro(getValue('sexo', oldPaciente.sexo)),
      // Exceção administrativa de bloqueio (TFD / Ordem Judicial)
      is_tfd: (inputCustomData.is_tfd === true) || (oldPaciente.is_tfd === true && inputCustomData.is_tfd === undefined),
      possui_ordem_judicial: (inputCustomData.possui_ordem_judicial === true) || (oldPaciente.possui_ordem_judicial === true && inputCustomData.possui_ordem_judicial === undefined),
      motivo_excecao_bloqueio: (inputCustomData.is_tfd === true || inputCustomData.possui_ordem_judicial === true)
        ? (inputCustomData.motivo_excecao_bloqueio || oldPaciente.motivo_excecao_bloqueio || null)
        : null,
      observacao_tfd_ordem_judicial: inputCustomData.observacao_tfd_ordem_judicial ?? oldPaciente.observacao_tfd_ordem_judicial ?? null,
      data_marcacao_excecao: (inputCustomData.is_tfd === true || inputCustomData.possui_ordem_judicial === true)
        ? (oldPaciente.data_marcacao_excecao || new Date().toISOString())
        : null,
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

    if (!error && data) {
      // Registrar auditoria
      auditService.auditUpdate({
        acao: 'editar_paciente',
        modulo: 'pacientes',
        entidade: 'paciente',
        entidadeId: pacienteId,
        entidadeNome: data.nome,
        pacienteId: pacienteId,
        pacienteNome: data.nome,
        before: current,
        after: data,
        origem,
        unidadeId: data.unidade_id
      });
    }



    if (error) {
      console.error("[Paciente] Erro no updatePatientFields", {
        origem, pacienteId, errorMessage: error.message, errorCode: error.code
      });
      throw error;
    }
    return data;
  },

  async savePacienteCadastro(pacienteId: string, formData: any, origem: string = "Indefinida") {
    const { data: current, error: fetchError } = await supabase
      .from('pacientes')
      .select('*')
      .eq('id', pacienteId)
      .single();
    
    if (fetchError) throw fetchError;
    if (!current) throw new Error('Paciente não encontrado. Atualize a página e tente novamente.');
    const updatePayload = this.mapPacienteFormToDb(formData, current);
    
    const { data, error } = await supabase
      .from('pacientes')
      .update(updatePayload)
      .eq('id', pacienteId)
      .select()
      .single();

    if (!error && data) {
      auditService.auditUpdate({
        acao: 'salvar_cadastro_paciente',
        modulo: 'pacientes',
        entidade: 'paciente',
        entidadeId: pacienteId,
        entidadeNome: data.nome,
        pacienteId: pacienteId,
        pacienteNome: data.nome,
        before: current,
        after: data,
        origem,
        unidadeId: data.unidade_id
      });
    }


    if (error) {
      console.error("[Paciente] Erro no savePacienteCadastro", {
        origem, pacienteId, errorMessage: error.message
      });
      throw error;
    }

    // Salvar procedimentos vinculados, se fornecidos no formData
    if (formData.patientProcedures) {
      const procs = (formData.patientProcedures as any[]).filter(p => p.sigtap_codigo || p.procedimento_nome || p.cid);
      
      // Deletar os antigos e inserir os novos (estratégia simples de sincronização)
      await supabase.from('patient_procedures').delete().eq('patient_id', pacienteId);
      
      if (procs.length > 0) {
        const insertPayload = procs.map(p => ({
          patient_id: pacienteId,
          sigtap_codigo: p.sigtap_codigo || "",
          procedimento_nome: p.procedimento_nome || "",
          cid: p.cid || ""
        }));
        const { error: insError } = await supabase.from('patient_procedures').insert(insertPayload);
        if (insError) console.error("[Paciente] Erro ao salvar procedimentos vinculados", insError);
      }
    }

    // Recalcula status de faltas (respeita exceção TFD / Ordem Judicial)
    try {
      await (supabase as any).rpc('atualizar_status_falta', { p_paciente_id: pacienteId });
    } catch (err: any) {
      console.error('[Faltosos] Erro na regra de faltas/exceção', {
        pacienteId, acao: 'atualizar_status_falta_save',
        errorMessage: err?.message, errorCode: err?.code,
      });
    }

    return data;
  }
};


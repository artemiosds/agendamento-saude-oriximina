import type { PacienteFormData } from '@/components/CadastroPacienteForm';
import { normalizePhone } from '@/lib/phoneUtils';
import { normalizeSexo } from '@/lib/utils/sexo-normalization';

/** Same required fields and serialization as the official patient page. */
export function validatePacienteCadastro(form: PacienteFormData): Record<string,string> {
 const cd=form.customData || {}; const newErrors: Record<string,string>={};
    if (!form.nome?.trim()) newErrors.nome = "Nome completo é obrigatório";
    if (!form.nomeMae?.trim()) newErrors.nomeMae = "Nome da mãe é obrigatório";
    if (!form.dataNascimento) newErrors.dataNascimento = "Data de nascimento é obrigatória";
    if (!form.cns?.trim()) newErrors.cns = "CNS é obrigatório";
    if (!form.naturalidade?.trim()) newErrors.naturalidade = "Naturalidade é obrigatória";
    if (!form.telefone?.trim()) newErrors.telefone = "Telefone é obrigatório";
    if (!form.sexo) newErrors.sexo = "Sexo é obrigatório";
    if (!cd.cep?.trim()) newErrors.cep = "CEP é obrigatório";
    if (!cd.tipoLogradouro?.trim()) newErrors.tipoLogradouro = "Tipo de Logradouro (DNE) é obrigatório";
    if (!cd.logradouro?.trim()) newErrors.logradouro = "Logradouro é obrigatório";
    // Número: opcional — se vazio, preenche automaticamente com "S/N" no salvamento
    if (!cd.bairro?.trim()) newErrors.bairro = "Bairro é obrigatório";
    if (!form.municipio?.trim()) newErrors.municipio = "Município é obrigatório";
    if (!cd.uf?.trim()) newErrors.uf = "UF é obrigatória";
    if (!cd.nacionalidade?.trim()) newErrors.nacionalidade = "Nacionalidade é obrigatória";
    if (!(cd.racaCor || cd.raca_cor)?.trim()) newErrors.racaCor = "Raça/Cor (IBGE) é obrigatória";


    const rawPhone = form.telefone?.trim();
    if (rawPhone) {
      const normalized = normalizePhone(rawPhone);
      if (!normalized) {
        newErrors.telefone = "Informe o telefone com DDD ex: (93) 99999-0000";
      }
    }


 const cpf=(form.cpf || '').replace(/\D/g,''); const cns=(form.cns || '').replace(/\D/g,'');
 if (cpf && cpf.length!==11) newErrors.cpf='CPF deve conter 11 dígitos';
 if (cns && cns.length!==15) newErrors.cns='CNS deve conter 15 dígitos';
 if ((cd.racaCor || cd.raca_cor)==='indigena' && !String(cd.etnia || cd.etniaOutra || '').trim()) newErrors.etnia='Informe a etnia do paciente indígena';
 return newErrors;
}
export function buildPacienteCadastroFields(form: PacienteFormData, user: {id:string; nome?:string; usuario?:string}) {
 const normalizedPhone=normalizePhone(form.telefone?.trim() || '') || '';
 return {
      nome: form.nome,
      cpf: (form.cpf || "").replace(/\D/g, ""),
      cns: (form.cns || "").replace(/\D/g, "").slice(0, 15),
      nome_mae: form.nomeMae,
      telefone: normalizedPhone,
      data_nascimento: form.dataNascimento,
      email: form.email,
      endereco: form.endereco,
      descricao_clinica: form.descricaoClinica || form.diagnosticoResumido,
      cid: form.cid,
      especialidade_destino: form.especialidadeDestino,
      municipio: form.municipio,
      naturalidade: form.naturalidade || "",
      naturalidade_uf: form.naturalidadeUf || "",
      menor_idade: form.menorIdade,
      nome_responsavel: form.nomeResponsavel,
      cpf_responsavel: form.cpfResponsavel,
      ubs_origem: form.ubsOrigem,
      profissional_solicitante: form.profissionalSolicitante,
      tipo_encaminhamento: form.tipoEncaminhamento,
      diagnostico_resumido: form.diagnosticoResumido,
      justificativa: form.justificativa,
      data_encaminhamento: form.dataEncaminhamento,
      documento_url: form.documentoUrl,
      tipo_condicao: form.tipoCondicao,
      mobilidade: form.mobilidade,
      usa_dispositivo: form.usaDispositivo,
      tipo_dispositivo: form.tipoDispositivo,
      comunicacao: form.comunicacao,
      comportamento: form.comportamento,
      usa_equipamentos: form.usaEquipamentos,
      equipamentos: form.equipamentos,
      observacao_equipamentos: form.observacaoEquipamentos,
      outro_servico_sus: form.outroServicoSus,
      transporte: form.transporte,
      turno_preferido: form.turnoPreferido,
      is_gestante: form.isGestante,
      is_pne: form.isPne,
      is_autista: form.isAutista,
      sexo: normalizeSexo(form.sexo),
      custom_data: {
        ...(form.customData || {}),
        numero: (form.customData?.numero?.toString().trim() || "S/N"),
        sexo: normalizeSexo(form.sexo),
        atualizado_em: new Date().toISOString(),
        atualizado_por: user?.id || "",
        atualizado_por_nome: user?.nome || "",
        atualizado_por_usuario: user?.usuario || "",
        motivo_alteracao: "Atualização cadastral pela página Pacientes",
      },
    };
}

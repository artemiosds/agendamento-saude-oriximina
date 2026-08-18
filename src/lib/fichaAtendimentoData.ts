import { supabase } from "@/integrations/supabase/client";

/**
 * Builder compartilhado dos dados da "Ficha de Atendimento Clínico".
 * Extraído de src/pages/painel/Pacientes.tsx para ser reutilizado também na Agenda.
 * Campos clínicos (dados do atendimento, sinais vitais, evoluções) permanecem em
 * branco de propósito: a ficha é impressa para preenchimento manual.
 */
export interface FichaDados {
  paciente: {
    nome: string;
    cpf: string;
    cns: string;
    data_nascimento: string;
    nome_mae: string;
    telefone: string;
    telefone_secundario?: string;
    email?: string;
    endereco?: string;
    responsavel?: string;
    sexo?: string;
    naturalidade?: string;
    nacionalidade?: string;
    raca_cor?: string;
    situacao_rua?: boolean;
    menor_idade?: boolean;
    parentesco_responsavel?: string;
    observacoes_cadastrais?: string;
    informacoes_adicionais?: string;
    origem_cadastro?: string;
    unidade_vinculada?: string;
    tipo_logradouro?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
  };
  dadosClinicos: {
    numero_prontuario: string;
    cid: string;
    tipo_atendimento: string;
    unidade_origem: string;
    unidade_atendimento: string;
    data_atendimento: string;
    especialidade?: string;
    encaminhamento?: string;
  };
  sinaisVitais: {
    pressao_arterial: string;
    frequencia_cardiaca: string;
    temperatura: string;
    saturacao: string;
    peso: string;
    altura: string;
    glicemia?: string;
    frequencia_respiratoria?: string;
  };
  profissional: {
    nome: string;
    cargo: string;
    registro: string;
  };
  evoluciones: Array<{
    data: string;
    observacao: string;
    profissional: string;
  }>;
}

interface BuildFichaParams {
  pacienteId: string;
  unidades: Array<{ id: string; nome?: string }>;
  user: { nome?: string; role?: string; numeroConselho?: string } | null | undefined;
}

export async function buildFichaAtendimentoData({
  pacienteId,
  unidades,
  user,
}: BuildFichaParams): Promise<FichaDados> {
  // A) PACIENTE
  const pacientePromise = supabase
    .from("pacientes")
    .select("*")
    .eq("id", pacienteId)
    .single()
    .then(({ data, error }) => {
      if (error || !data) throw new Error("Paciente não encontrado");

      const cd = ((data as any).custom_data || {}) as Record<string, any>;

      return {
        paciente: {
          nome: data.nome || "",
          cpf: data.cpf || "",
          cns: data.cns || "",
          data_nascimento: data.data_nascimento || "",
          nome_mae: data.nome_mae || "",
          telefone: data.telefone || "",
          telefone_secundario: cd.telefone_secundario || "",
          email: data.email || "",
          endereco: data.endereco || "",
          responsavel: (data as any).nome_responsavel || "",
          sexo: cd.sexo || "",
          naturalidade: (data as any).naturalidade || "",
          nacionalidade: cd.nacionalidade || "",
          raca_cor: cd.raca_cor || "",
          situacao_rua: !!cd.situacao_rua,
          menor_idade: !!(data as any).menor_idade,
          parentesco_responsavel: cd.parentesco_responsavel || "",
          observacoes_cadastrais: (data as any).observacoes || "",
          informacoes_adicionais: cd.informacoes_adicionais || "",
          origem_cadastro: cd.origem_cadastro || "",
          unidade_vinculada: unidades.find((u) => u.id === (data as any).unidade_id)?.nome || "",
          // Address mapping
          tipo_logradouro: cd.tipoLogradouro || cd.tipo_logradouro || "",
          logradouro: cd.logradouro || "",
          numero: cd.numero || "",
          complemento: cd.complemento || "",
          bairro: cd.bairro || "",
          municipio: (data as any).municipio || cd.municipio || "",
          uf: cd.uf || "",
          cep: cd.cep || "",
        },
        cid: (data as any).cid || "",
      };
    });

  // B) DADOS CLÍNICOS — Sempre limpos para a ficha de impressão
  const dadosClinicosPromise = Promise.resolve({
    numero_prontuario: pacienteId,
    tipo_atendimento: "",
    unidade_origem: "",
    unidade_atendimento: "",
    data_atendimento: "",
  });

  // C) SINAIS VITAIS — Sempre limpos para a ficha de impressão
  const sinaisVitaisPromise = Promise.resolve({
    pressao_arterial: "",
    frequencia_cardiaca: "",
    temperatura: "",
    saturacao: "",
    peso: "",
    altura: "",
    frequencia_respiratoria: "",
    glicemia: "",
  });

  // D) PROFISSIONAL LOGADO
  const profissionalPromise = Promise.resolve({
    nome: user?.nome || "",
    cargo: user?.role || "",
    registro: user?.numeroConselho || "",
  });

  // E) EVOLUÇÕES CLÍNICAS — Sempre limpas para a ficha de impressão
  const evolucionesPromise = Promise.resolve([] as FichaDados["evoluciones"]);

  const [pacienteResult, dadosClinicos, sinaisVitais, profissional, evoluciones] = await Promise.all([
    pacientePromise,
    dadosClinicosPromise,
    sinaisVitaisPromise,
    profissionalPromise,
    evolucionesPromise,
  ]);

  return {
    paciente: pacienteResult.paciente,
    dadosClinicos: { ...dadosClinicos, cid: pacienteResult.cid },
    sinaisVitais,
    profissional,
    evoluciones,
  };
}

export type UserRole = "master" | "coordenador" | "recepcao" | "profissional" | "gestao" | "tecnico" | "enfermagem";

export interface User {
  id: string;
  authUserId?: string;
  nome: string;
  usuario: string;
  email: string;
  senha?: string;
  cpf?: string;
  setor: string;
  unidadeId: string;
  salaId?: string;
  cargo: string;
  role: UserRole;
  ativo: boolean;
  criadoEm: string;
  criadoPor: string;
  tempoAtendimento?: number;
  profissao?: string;
  tipoConselho?: string;
  numeroConselho?: string;
  ufConselho?: string;
  podeAgendarRetorno?: boolean;
  coren?: string;
}

export interface TriagemRecord {
  id: string;
  agendamentoId: string;
  tecnicoId: string;
  peso?: number;
  altura?: number;
  imc?: number;
  pressaoArterial?: string;
  temperatura?: number;
  frequenciaCardiaca?: number;
  saturacaoOxigenio?: number;
  glicemia?: number;
  alergias: string[];
  medicamentos: string[];
  queixa?: string;
  iniciadoEm?: string;
  confirmadoEm?: string;
  criadoEm?: string;
}

export interface TriagemSettings {
  id: string;
  unidadeId?: string;
  profissionalId?: string;
  enabled: boolean;
}

export interface Prontuario {
  id: string;
  pacienteId: string;
  pacienteNome: string;
  profissionalId: string;
  profissionalNome: string;
  unidadeId: string;
  salaId?: string;
  setor?: string;
  agendamentoId?: string;
  dataAtendimento: string;
  horaAtendimento?: string;
  queixaPrincipal: string;
  anamnese: string;
  sinaisSintomas: string;
  exameFisico: string;
  hipotese: string;
  conduta: string;
  prescricao: string;
  solicitacaoExames: string;
  evolucao: string;
  observacoes: string;
  indicacaoRetorno: string;
  motivoAlteracao: string;
  episodioId?: string;
  procedimentosTexto: string;
  outroProcedimento: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Unidade {
  id: string;
  nome: string;
  endereco: string;
  telefone: string;
  whatsapp: string;
  ativo: boolean;
}

export interface Sala {
  id: string;
  nome: string;
  unidadeId: string;
  ativo: boolean;
}

export interface Setor {
  id: string;
  nome: string;
}

export interface Paciente {
  id: string;
  nome: string;
  cpf: string;
  cns: string;
  nomeMae: string;
  telefone: string;
  dataNascimento: string;
  email: string;
  endereco: string;
  observacoes: string;
  descricaoClinica: string;
  cid: string;
  criadoEm: string;
  isGestante?: boolean;
  isPne?: boolean;
  isAutista?: boolean;
}

export interface Agendamento {
  id: string;
  pacienteId: string;
  pacienteNome: string;
  unidadeId: string;
  salaId: string;
  setorId: string;
  profissionalId: string;
  profissionalNome: string;
  data: string;
  hora: string;
  status:
    | "pendente"
    | "confirmado"
    | "confirmado_chegada"
    | "cancelado"
    | "concluido"
    | "falta"
    | "atraso"
    | "remarcado"
    | "em_atendimento"
    | "aguardando_triagem"
    | "aguardando_atendimento"
    | "aguardando_enfermagem"
    | "apto_atendimento";
  tipo: string;
  observacoes: string;
  origem: "online" | "recepcao" | "profissional" | "externo";
  agendadoPorExterno?: string;
  googleEventId?: string;
  syncStatus?: "ok" | "pendente" | "erro";
  criadoEm: string;
  criadoPor: string;
  horaChegada?: string;
  // Campos para agendamento online com anexo
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  aprovadoPor?: string;
  aprovadoEm?: string;
  rejeitadoMotivo?: string;
}

export interface FilaEspera {
  id: string;
  pacienteId: string;
  pacienteNome: string;
  unidadeId: string;
  setor: string;
  profissionalId?: string;
  prioridade: "normal" | "alta" | "urgente";
  status:
    | "aguardando"
    | "encaixado"
    | "chamado"
    | "em_atendimento"
    | "atendido"
    | "falta"
    | "cancelado"
    | "chegada_confirmada"
    | "aguardando_triagem"
    | "aguardando_enfermagem"
    | "aguardando_atendimento"
    | "apto_atendimento";
  posicao: number;
  horaChegada: string;
  horaChamada?: string;
  observacoes?: string;
  descricaoClinica?: string;
  cid?: string;
  criadoPor?: string;
  criadoEm?: string;
  dataSolicitacaoOriginal?: string;
  origemCadastro?: "normal" | "demanda_reprimida";
  especialidadeDestino?: string;
}

export interface Atendimento {
  id: string;
  agendamentoId: string;
  pacienteId: string;
  pacienteNome: string;
  profissionalId: string;
  profissionalNome: string;
  unidadeId: string;
  salaId: string;
  setor: string;
  procedimento: string;
  observacoes: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  duracaoMinutos?: number;
  status: "em_atendimento" | "finalizado";
}

export interface Disponibilidade {
  id: string;
  profissionalId: string;
  unidadeId: string;
  salaId?: string;
  dataInicio: string;
  dataFim: string;
  horaInicio: string;
  horaFim: string;
  vagasPorHora: number;
  vagasPorDia: number;
  diasSemana: number[];
  duracaoConsulta?: number;
}

export interface Configuracoes {
  whatsapp: {
    ativo: boolean;
    provedor: string;
    token: string;
    numero: string;
    notificacoes: {
      confirmacao: boolean;
      lembrete24h: boolean;
      lembrete2h: boolean;
      remarcacao: boolean;
      cancelamento: boolean;
    };
  };
  googleCalendar: {
    conectado: boolean;
    criarEvento: boolean;
    atualizarRemarcar: boolean;
    removerCancelar: boolean;
    enviarEmail: boolean;
  };
  filaEspera: {
    modoEncaixe: "automatico" | "assistido";
  };
  templates: {
    confirmacao: string;
    lembrete: string;
  };
  webhook: {
    ativo: boolean;
    url: string;
    status: "ativo" | "inativo" | "erro";
  };
  gmail?: {
    ativo: boolean;
    email: string;
    senhaApp: string;
    smtpHost: string;
    smtpPort: number;
  };
  canalNotificacao?: "webhook" | "gmail" | "ambos";
  portalPaciente?: {
    permitirPortal: boolean;
    enviarSenhaAutomaticamente: boolean;
    enviarLinkAcesso: boolean;
    pacientesBloqueados: string[];
  };
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  acao: string;
  entidade: string;
  entidadeId: string;
  detalhes: string;
  data: string;
}

export interface Procedimento {
  id: string;
  nome: string;
  descricao: string;
  profissao: string;
  especialidade: string;
  profissionalId?: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface EpisodioClinico {
  id: string;
  pacienteId: string;
  profissionalId: string;
  profissionalNome: string;
  unidadeId: string;
  titulo: string;
  descricao: string;
  tipo: string;
  status: string;
  dataInicio: string;
  dataFim?: string;
  criadoEm: string;
  atualizadoEm: string;
}
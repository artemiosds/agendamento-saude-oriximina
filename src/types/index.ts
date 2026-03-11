export type UserRole = 'master' | 'coordenador' | 'recepcao' | 'profissional' | 'gestao';

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
  telefone: string;
  dataNascimento: string;
  email: string;
  endereco: string;
  observacoes: string;
  criadoEm: string;
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
  status: 'pendente' | 'confirmado' | 'confirmado_chegada' | 'cancelado' | 'concluido' | 'falta' | 'atraso' | 'remarcado' | 'em_atendimento';
  tipo: string;
  observacoes: string;
  origem: 'online' | 'recepcao';
  googleEventId?: string;
  syncStatus?: 'ok' | 'pendente' | 'erro';
  criadoEm: string;
  criadoPor: string;
}

export interface FilaEspera {
  id: string;
  pacienteId: string;
  pacienteNome: string;
  unidadeId: string;
  setor: string;
  profissionalId?: string;
  prioridade: 'normal' | 'alta' | 'urgente';
  status: 'aguardando' | 'encaixado' | 'chamado' | 'em_atendimento' | 'atendido' | 'falta' | 'cancelado';
  posicao: number;
  horaChegada: string;
  horaChamada?: string;
  observacoes?: string;
  criadoPor?: string;
  criadoEm?: string;
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
  status: 'em_atendimento' | 'finalizado';
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
    modoEncaixe: 'automatico' | 'assistido';
  };
  templates: {
    confirmacao: string;
    lembrete: string;
  };
  webhook: {
    ativo: boolean;
    url: string;
    status: 'ativo' | 'inativo' | 'erro';
  };
  gmail?: {
    ativo: boolean;
    email: string;
    senhaApp: string;
    smtpHost: string;
    smtpPort: number;
  };
  canalNotificacao?: 'webhook' | 'gmail' | 'ambos';
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

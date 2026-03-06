import { User, Unidade, Sala, Setor, Paciente, Agendamento, FilaEspera, Atendimento } from '@/types';

// Password: sms@2025 (pre-hashed with bcryptjs)
export const mockUsers: User[] = [
  {
    id: 'u1',
    nome: 'Administrador SMS',
    usuario: 'admin.sms',
    email: 'admin@sms.oriximina.pa.gov.br',
    senha: '$2a$10$xVqYLGFhOJSUdFMGkLZ8OeQZ5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z',
    setor: 'Administração',
    unidadeId: 'un1',
    cargo: 'Administrador',
    role: 'master',
    ativo: true,
    criadoEm: '2025-01-01',
    criadoPor: 'sistema',
  },
  {
    id: 'u2',
    nome: 'Maria Silva',
    usuario: 'maria.coord',
    email: 'maria@sms.oriximina.pa.gov.br',
    senha: '',
    setor: 'Clínica Geral',
    unidadeId: 'un1',
    cargo: 'Coordenadora',
    role: 'coordenador',
    ativo: true,
    criadoEm: '2025-01-05',
    criadoPor: 'u1',
  },
  {
    id: 'u3',
    nome: 'Ana Santos',
    usuario: 'ana.recepcao',
    email: '',
    senha: '',
    setor: 'Recepção',
    unidadeId: 'un1',
    cargo: 'Recepcionista',
    role: 'recepcao',
    ativo: true,
    criadoEm: '2025-01-05',
    criadoPor: 'u1',
  },
  {
    id: 'u4',
    nome: 'Dr. Carlos Oliveira',
    usuario: 'carlos.med',
    email: 'carlos@sms.oriximina.pa.gov.br',
    senha: '',
    setor: 'Clínica Geral',
    unidadeId: 'un1',
    cargo: 'Médico',
    role: 'profissional',
    ativo: true,
    criadoEm: '2025-01-10',
    criadoPor: 'u1',
  },
  {
    id: 'u5',
    nome: 'Dra. Fernanda Lima',
    usuario: 'fernanda.med',
    email: 'fernanda@sms.oriximina.pa.gov.br',
    senha: '',
    setor: 'Pediatria',
    unidadeId: 'un1',
    cargo: 'Médica',
    role: 'profissional',
    ativo: true,
    criadoEm: '2025-01-10',
    criadoPor: 'u1',
  },
];

export const mockUnidades: Unidade[] = [
  {
    id: 'un1',
    nome: 'UBS Central de Oriximiná',
    endereco: 'Rua Principal, 100 - Centro, Oriximiná - PA',
    telefone: '(93) 3544-0000',
    whatsapp: '(93) 99999-0000',
    ativo: true,
  },
];

export const mockSalas: Sala[] = [
  { id: 's1', nome: 'Consultório 01', unidadeId: 'un1', ativo: true },
  { id: 's2', nome: 'Consultório 02', unidadeId: 'un1', ativo: true },
  { id: 's3', nome: 'Sala de Procedimentos', unidadeId: 'un1', ativo: true },
];

export const mockSetores: Setor[] = [
  { id: 'st1', nome: 'Clínica Geral' },
  { id: 'st2', nome: 'Pediatria' },
  { id: 'st3', nome: 'Odontologia' },
  { id: 'st4', nome: 'Enfermagem' },
];

const today = new Date().toISOString().split('T')[0];

export const mockPacientes: Paciente[] = Array.from({ length: 20 }, (_, i) => ({
  id: `p${i + 1}`,
  nome: [
    'João Pereira', 'Maria Conceição', 'José Souza', 'Ana Paula Costa',
    'Pedro Alves', 'Francisca Nascimento', 'Antônio Ribeiro', 'Raimunda Ferreira',
    'Francisco Santos', 'Luzia Moreira', 'Manoel Barros', 'Tereza Cardoso',
    'Sebastião Lima', 'Joana Araújo', 'Carlos Rocha', 'Benedita Pinto',
    'Raimundo Gomes', 'Iracema Monteiro', 'Valdir Fonseca', 'Nazaré Barbosa'
  ][i],
  cpf: `000.000.000-${String(i + 10).padStart(2, '0')}`,
  telefone: `(93) 9${String(8000 + i * 111).padStart(4, '0')}-${String(1000 + i * 50).padStart(4, '0')}`,
  dataNascimento: `${1960 + i}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
  email: i % 3 === 0 ? `paciente${i + 1}@email.com` : '',
  endereco: `Rua ${i + 1}, Bairro Centro, Oriximiná - PA`,
  observacoes: '',
  criadoEm: '2025-01-15',
}));

export const mockAgendamentos: Agendamento[] = [
  {
    id: 'ag1', pacienteId: 'p1', pacienteNome: 'João Pereira',
    unidadeId: 'un1', salaId: 's1', setorId: 'st1',
    profissionalId: 'u4', profissionalNome: 'Dr. Carlos Oliveira',
    data: today, hora: '08:00', status: 'confirmado', tipo: 'Consulta',
    observacoes: '', origem: 'recepcao', criadoEm: today, criadoPor: 'u3',
  },
  {
    id: 'ag2', pacienteId: 'p2', pacienteNome: 'Maria Conceição',
    unidadeId: 'un1', salaId: 's1', setorId: 'st1',
    profissionalId: 'u4', profissionalNome: 'Dr. Carlos Oliveira',
    data: today, hora: '08:30', status: 'pendente', tipo: 'Retorno',
    observacoes: '', origem: 'online', criadoEm: today, criadoPor: 'sistema',
  },
  {
    id: 'ag3', pacienteId: 'p3', pacienteNome: 'José Souza',
    unidadeId: 'un1', salaId: 's2', setorId: 'st2',
    profissionalId: 'u5', profissionalNome: 'Dra. Fernanda Lima',
    data: today, hora: '09:00', status: 'confirmado', tipo: 'Consulta',
    observacoes: 'Criança 5 anos', origem: 'recepcao', criadoEm: today, criadoPor: 'u3',
  },
  {
    id: 'ag4', pacienteId: 'p4', pacienteNome: 'Ana Paula Costa',
    unidadeId: 'un1', salaId: 's1', setorId: 'st1',
    profissionalId: 'u4', profissionalNome: 'Dr. Carlos Oliveira',
    data: today, hora: '09:30', status: 'pendente', tipo: 'Consulta',
    observacoes: '', origem: 'online', criadoEm: today, criadoPor: 'sistema',
  },
  {
    id: 'ag5', pacienteId: 'p5', pacienteNome: 'Pedro Alves',
    unidadeId: 'un1', salaId: 's2', setorId: 'st2',
    profissionalId: 'u5', profissionalNome: 'Dra. Fernanda Lima',
    data: today, hora: '10:00', status: 'confirmado', tipo: 'Consulta',
    observacoes: '', origem: 'recepcao', criadoEm: today, criadoPor: 'u3',
  },
];

export const mockFila: FilaEspera[] = [
  {
    id: 'f1', pacienteId: 'p1', pacienteNome: 'João Pereira',
    unidadeId: 'un1', setor: 'Clínica Geral', prioridade: 'normal',
    status: 'em_atendimento', posicao: 1, horaChegada: '07:45', horaChamada: '08:02',
    profissionalId: 'u4', observacoes: '', criadoPor: 'u3',
  },
  {
    id: 'f2', pacienteId: 'p2', pacienteNome: 'Maria Conceição',
    unidadeId: 'un1', setor: 'Clínica Geral', prioridade: 'normal',
    status: 'aguardando', posicao: 2, horaChegada: '07:50',
    profissionalId: 'u4', observacoes: '', criadoPor: 'u3',
  },
  {
    id: 'f3', pacienteId: 'p3', pacienteNome: 'José Souza',
    unidadeId: 'un1', setor: 'Pediatria', prioridade: 'alta',
    status: 'aguardando', posicao: 1, horaChegada: '08:30',
    profissionalId: 'u5', observacoes: 'Criança com febre', criadoPor: 'u3',
  },
];

export const mockAtendimentos: Atendimento[] = [
  {
    id: 'at1', agendamentoId: 'ag1', pacienteId: 'p6', pacienteNome: 'Francisca Nascimento',
    profissionalId: 'u4', profissionalNome: 'Dr. Carlos Oliveira',
    unidadeId: 'un1', salaId: 's1', setor: 'Clínica Geral',
    procedimento: 'Consulta de rotina', observacoes: 'Paciente estável',
    data: today, hora: '07:30',
  },
];

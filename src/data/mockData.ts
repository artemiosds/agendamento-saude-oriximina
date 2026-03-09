import { User, Unidade, Sala, Setor, Paciente, Agendamento, FilaEspera, Atendimento, Disponibilidade } from "@/types";

// Legacy mock users - kept for reference only, system now uses DB funcionarios
export const mockUsers: User[] = [];

export const mockUnidades: Unidade[] = [];
export const mockSalas: Sala[] = [];

export const mockSetores: Setor[] = [
  { id: "st1", nome: "Clínica Geral" },
  { id: "st2", nome: "Pediatria" },
  { id: "st3", nome: "Odontologia" },
  { id: "st4", nome: "Enfermagem" },
  { id: "st5", nome: "Fisioterapia" },
  { id: "st6", nome: "Psicologia" },
  { id: "st7", nome: "Nutrição" },
];

// All data now comes from DB - these are empty defaults
export const mockPacientes: Paciente[] = [];
export const mockAgendamentos: Agendamento[] = [];
export const mockFila: FilaEspera[] = [];
export const mockAtendimentos: Atendimento[] = [];
export const mockDisponibilidades: Disponibilidade[] = [];

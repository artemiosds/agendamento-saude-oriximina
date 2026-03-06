import React, { createContext, useContext, useState, useCallback } from 'react';
import { 
  Agendamento, Paciente, FilaEspera, Atendimento, Unidade, Sala, Setor, User, Disponibilidade 
} from '@/types';
import { 
  mockAgendamentos, mockPacientes, mockFila, mockAtendimentos, 
  mockUnidades, mockSalas, mockSetores, mockUsers 
} from '@/data/mockData';

interface DataContextType {
  agendamentos: Agendamento[];
  pacientes: Paciente[];
  fila: FilaEspera[];
  atendimentos: Atendimento[];
  unidades: Unidade[];
  salas: Sala[];
  setores: Setor[];
  funcionarios: User[];
  disponibilidades: Disponibilidade[];
  addAgendamento: (ag: Agendamento) => void;
  updateAgendamento: (id: string, data: Partial<Agendamento>) => void;
  addPaciente: (p: Paciente) => void;
  updatePaciente: (id: string, data: Partial<Paciente>) => void;
  addToFila: (f: FilaEspera) => void;
  updateFila: (id: string, data: Partial<FilaEspera>) => void;
  removeFromFila: (id: string) => void;
  addAtendimento: (a: Atendimento) => void;
  addUnidade: (u: Unidade) => void;
  updateUnidade: (id: string, data: Partial<Unidade>) => void;
  addSala: (s: Sala) => void;
  addFuncionario: (u: User) => void;
  updateFuncionario: (id: string, data: Partial<User>) => void;
  addDisponibilidade: (d: Disponibilidade) => void;
  updateDisponibilidade: (id: string, data: Partial<Disponibilidade>) => void;
}

const DataContext = createContext<DataContextType | null>(null);

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
};

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>(mockAgendamentos);
  const [pacientes, setPacientes] = useState<Paciente[]>(mockPacientes);
  const [fila, setFila] = useState<FilaEspera[]>(mockFila);
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>(mockAtendimentos);
  const [unidades, setUnidades] = useState<Unidade[]>(mockUnidades);
  const [salas, setSalas] = useState<Sala[]>(mockSalas);
  const [setores] = useState<Setor[]>(mockSetores);
  const [funcionarios, setFuncionarios] = useState<User[]>(mockUsers);
  const [disponibilidades, setDisponibilidades] = useState<Disponibilidade[]>([]);

  const addAgendamento = useCallback((ag: Agendamento) => setAgendamentos(prev => [...prev, ag]), []);
  const updateAgendamento = useCallback((id: string, data: Partial<Agendamento>) => 
    setAgendamentos(prev => prev.map(a => a.id === id ? { ...a, ...data } : a)), []);
  const addPaciente = useCallback((p: Paciente) => setPacientes(prev => [...prev, p]), []);
  const updatePaciente = useCallback((id: string, data: Partial<Paciente>) => 
    setPacientes(prev => prev.map(p => p.id === id ? { ...p, ...data } : p)), []);
  const addToFila = useCallback((f: FilaEspera) => setFila(prev => [...prev, f]), []);
  const updateFila = useCallback((id: string, data: Partial<FilaEspera>) => 
    setFila(prev => prev.map(f => f.id === id ? { ...f, ...data } : f)), []);
  const removeFromFila = useCallback((id: string) => setFila(prev => prev.filter(f => f.id !== id)), []);
  const addAtendimento = useCallback((a: Atendimento) => setAtendimentos(prev => [...prev, a]), []);
  const addUnidade = useCallback((u: Unidade) => setUnidades(prev => [...prev, u]), []);
  const updateUnidade = useCallback((id: string, data: Partial<Unidade>) => 
    setUnidades(prev => prev.map(u => u.id === id ? { ...u, ...data } : u)), []);
  const addSala = useCallback((s: Sala) => setSalas(prev => [...prev, s]), []);
  const addFuncionario = useCallback((u: User) => setFuncionarios(prev => [...prev, u]), []);
  const updateFuncionario = useCallback((id: string, data: Partial<User>) => 
    setFuncionarios(prev => prev.map(u => u.id === id ? { ...u, ...data } : u)), []);
  const addDisponibilidade = useCallback((d: Disponibilidade) => setDisponibilidades(prev => [...prev, d]), []);
  const updateDisponibilidade = useCallback((id: string, data: Partial<Disponibilidade>) => 
    setDisponibilidades(prev => prev.map(d => d.id === id ? { ...d, ...data } : d)), []);

  return (
    <DataContext.Provider value={{
      agendamentos, pacientes, fila, atendimentos, unidades, salas, setores, funcionarios, disponibilidades,
      addAgendamento, updateAgendamento, addPaciente, updatePaciente,
      addToFila, updateFila, removeFromFila, addAtendimento,
      addUnidade, updateUnidade, addSala, addFuncionario, updateFuncionario,
      addDisponibilidade, updateDisponibilidade,
    }}>
      {children}
    </DataContext.Provider>
  );
};

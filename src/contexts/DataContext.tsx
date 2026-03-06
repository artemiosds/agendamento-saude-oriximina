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
  deleteUnidade: (id: string) => void;
  addSala: (s: Sala) => void;
  updateSala: (id: string, data: Partial<Sala>) => void;
  deleteSala: (id: string) => void;
  addFuncionario: (u: User) => void;
  updateFuncionario: (id: string, data: Partial<User>) => void;
  deleteFuncionario: (id: string) => void;
  addDisponibilidade: (d: Disponibilidade) => void;
  updateDisponibilidade: (id: string, data: Partial<Disponibilidade>) => void;
  deleteDisponibilidade: (id: string) => void;
  getAvailableSlots: (profissionalId: string, unidadeId: string, date: string) => string[];
  getAvailableDates: (profissionalId: string, unidadeId: string) => string[];
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
  const deleteUnidade = useCallback((id: string) => setUnidades(prev => prev.filter(u => u.id !== id)), []);
  const addSala = useCallback((s: Sala) => setSalas(prev => [...prev, s]), []);
  const updateSala = useCallback((id: string, data: Partial<Sala>) => 
    setSalas(prev => prev.map(s => s.id === id ? { ...s, ...data } : s)), []);
  const deleteSala = useCallback((id: string) => setSalas(prev => prev.filter(s => s.id !== id)), []);
  const addFuncionario = useCallback((u: User) => setFuncionarios(prev => [...prev, u]), []);
  const updateFuncionario = useCallback((id: string, data: Partial<User>) => 
    setFuncionarios(prev => prev.map(u => u.id === id ? { ...u, ...data } : u)), []);
  const deleteFuncionario = useCallback((id: string) => setFuncionarios(prev => prev.filter(u => u.id !== id)), []);
  const addDisponibilidade = useCallback((d: Disponibilidade) => setDisponibilidades(prev => [...prev, d]), []);
  const updateDisponibilidade = useCallback((id: string, data: Partial<Disponibilidade>) => 
    setDisponibilidades(prev => prev.map(d => d.id === id ? { ...d, ...data } : d)), []);
  const deleteDisponibilidade = useCallback((id: string) => setDisponibilidades(prev => prev.filter(d => d.id !== id)), []);

  // Get available dates for a professional at a unit
  const getAvailableDates = useCallback((profissionalId: string, unidadeId: string): string[] => {
    const disps = disponibilidades.filter(d => d.profissionalId === profissionalId && d.unidadeId === unidadeId);
    if (disps.length === 0) return [];

    const dates: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const disp of disps) {
      const start = new Date(disp.dataInicio + 'T00:00:00');
      const end = new Date(disp.dataFim + 'T00:00:00');
      const current = new Date(Math.max(start.getTime(), today.getTime()));

      while (current <= end) {
        const dayOfWeek = current.getDay();
        if (disp.diasSemana.includes(dayOfWeek)) {
          const dateStr = current.toISOString().split('T')[0];
          // Check if day still has capacity
          const dayAppointments = agendamentos.filter(
            a => a.data === dateStr && a.profissionalId === profissionalId && 
                 a.unidadeId === unidadeId && a.status !== 'cancelado'
          );
          if (dayAppointments.length < disp.vagasPorDia) {
            if (!dates.includes(dateStr)) dates.push(dateStr);
          }
        }
        current.setDate(current.getDate() + 1);
      }
    }

    return dates.sort();
  }, [disponibilidades, agendamentos]);

  // Get available time slots for a specific date
  const getAvailableSlots = useCallback((profissionalId: string, unidadeId: string, date: string): string[] => {
    const dateObj = new Date(date + 'T00:00:00');
    const dayOfWeek = dateObj.getDay();
    
    const disp = disponibilidades.find(d => 
      d.profissionalId === profissionalId && 
      d.unidadeId === unidadeId &&
      d.diasSemana.includes(dayOfWeek) &&
      date >= d.dataInicio && date <= d.dataFim
    );

    if (!disp) return [];

    const slots: string[] = [];
    const startHour = parseInt(disp.horaInicio.split(':')[0]);
    const startMin = parseInt(disp.horaInicio.split(':')[1] || '0');
    const endHour = parseInt(disp.horaFim.split(':')[0]);
    const endMin = parseInt(disp.horaFim.split(':')[1] || '0');

    const dayAppointments = agendamentos.filter(
      a => a.data === date && a.profissionalId === profissionalId && 
           a.unidadeId === unidadeId && a.status !== 'cancelado'
    );

    // Check daily limit
    if (dayAppointments.length >= disp.vagasPorDia) return [];

    // Generate slots every 30 minutes
    let h = startHour;
    let m = startMin;
    while (h < endHour || (h === endHour && m < endMin)) {
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      
      // Count appointments at this hour
      const hourStr = `${String(h).padStart(2, '0')}:`;
      const hourAppointments = dayAppointments.filter(a => a.hora.startsWith(hourStr));
      
      // Check if this specific slot is taken
      const slotTaken = dayAppointments.some(a => a.hora === timeStr);
      
      if (!slotTaken && hourAppointments.length < disp.vagasPorHora) {
        slots.push(timeStr);
      }
      
      m += 30;
      if (m >= 60) { m = 0; h++; }
    }

    return slots;
  }, [disponibilidades, agendamentos]);

  return (
    <DataContext.Provider value={{
      agendamentos, pacientes, fila, atendimentos, unidades, salas, setores, funcionarios, disponibilidades,
      addAgendamento, updateAgendamento, addPaciente, updatePaciente,
      addToFila, updateFila, removeFromFila, addAtendimento,
      addUnidade, updateUnidade, deleteUnidade, 
      addSala, updateSala, deleteSala,
      addFuncionario, updateFuncionario, deleteFuncionario,
      addDisponibilidade, updateDisponibilidade, deleteDisponibilidade,
      getAvailableSlots, getAvailableDates,
    }}>
      {children}
    </DataContext.Provider>
  );
};

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { 
  Agendamento, Paciente, FilaEspera, Atendimento, Unidade, Sala, Setor, User, Disponibilidade, Configuracoes 
} from '@/types';
import { mockSetores } from '@/data/mockData';
import { supabase } from '@/integrations/supabase/client';

const defaultConfiguracoes: Configuracoes = {
  whatsapp: {
    ativo: false, provedor: 'zapi', token: '', numero: '',
    notificacoes: { confirmacao: true, lembrete24h: true, lembrete2h: false, remarcacao: true, cancelamento: true },
  },
  googleCalendar: { conectado: false, criarEvento: true, atualizarRemarcar: true, removerCancelar: true, enviarEmail: true },
  filaEspera: { modoEncaixe: 'assistido' },
  templates: {
    confirmacao: 'Olá {nome}! Sua consulta foi agendada para {data} às {hora} na {unidade}. Profissional: {profissional}.',
    lembrete: 'Lembrete: Sua consulta é amanhã, {data} às {hora} na {unidade} com {profissional}.',
  },
  webhook: {
    ativo: true,
    url: 'https://hook.us2.make.com/hxkbabk6af5xbc79rxf9klp9m7wzf3l2',
    status: 'ativo' as const,
  },
};

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
  configuracoes: Configuracoes;
  addAgendamento: (ag: Agendamento) => Promise<void>;
  updateAgendamento: (id: string, data: Partial<Agendamento>) => Promise<void>;
  cancelAgendamento: (id: string) => FilaEspera[];
  addPaciente: (p: Paciente) => Promise<void>;
  updatePaciente: (id: string, data: Partial<Paciente>) => Promise<void>;
  addToFila: (f: FilaEspera) => Promise<void>;
  updateFila: (id: string, data: Partial<FilaEspera>) => Promise<void>;
  removeFromFila: (id: string) => Promise<void>;
  addAtendimento: (a: Atendimento) => void;
  updateAtendimento: (id: string, data: Partial<Atendimento>) => void;
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
  updateConfiguracoes: (data: Partial<Configuracoes>) => void;
  checkFilaForSlot: (profissionalId: string, unidadeId: string, data: string, hora: string) => FilaEspera[];
  encaixarDaFila: (filaId: string, agendamento: Omit<Agendamento, 'id' | 'criadoEm'>) => void;
  refreshFuncionarios: () => Promise<void>;
  refreshDisponibilidades: () => Promise<void>;
  refreshAgendamentos: () => Promise<void>;
  refreshPacientes: () => Promise<void>;
  refreshFila: () => Promise<void>;
}

const DataContext = createContext<DataContextType | null>(null);

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
};

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [fila, setFila] = useState<FilaEspera[]>([]);
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [setores] = useState<Setor[]>(mockSetores);
  const [funcionarios, setFuncionarios] = useState<User[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<Disponibilidade[]>([]);
  const [configuracoes, setConfiguracoes] = useState<Configuracoes>(defaultConfiguracoes);

  // Load unidades from DB
  const loadUnidades = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('unidades' as any).select('*');
      if (data && !error) {
        const mapped: Unidade[] = (data as any[]).map((u: any) => ({
          id: u.id, nome: u.nome, endereco: u.endereco || '', telefone: u.telefone || '',
          whatsapp: u.whatsapp || '', ativo: u.ativo ?? true,
        }));
        setUnidades(mapped);
      }
    } catch (err) { console.error('Error loading unidades:', err); }
  }, []);

  // Load salas from DB
  const loadSalas = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('salas' as any).select('*');
      if (data && !error) {
        const mapped: Sala[] = (data as any[]).map((s: any) => ({
          id: s.id, nome: s.nome, unidadeId: s.unidade_id || '', ativo: s.ativo ?? true,
        }));
        setSalas(mapped);
      }
    } catch (err) { console.error('Error loading salas:', err); }
  }, []);

  // Load funcionarios from DB
  const loadFuncionarios = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('funcionarios').select('*').eq('ativo', true);
      if (data && !error) {
        const mapped: User[] = data.map((f: any) => ({
          id: f.id, authUserId: f.auth_user_id || '', nome: f.nome, usuario: f.usuario,
          email: f.email, setor: f.setor || '', unidadeId: f.unidade_id || '',
          salaId: f.sala_id || '', cargo: f.cargo || '', role: f.role as User['role'],
          ativo: f.ativo ?? true, criadoEm: f.criado_em || '', criadoPor: f.criado_por || '',
          tempoAtendimento: f.tempo_atendimento || 30, profissao: f.profissao || '',
          tipoConselho: f.tipo_conselho || '', numeroConselho: f.numero_conselho || '',
          ufConselho: f.uf_conselho || '',
        }));
        setFuncionarios(mapped);
      }
    } catch (err) { console.error('Error loading funcionarios:', err); }
  }, []);

  // Load disponibilidades from DB
  const loadDisponibilidades = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('disponibilidades' as any).select('*');
      if (data && !error) {
        const mapped: Disponibilidade[] = (data as any[]).map((d: any) => ({
          id: d.id, profissionalId: d.profissional_id, unidadeId: d.unidade_id,
          salaId: d.sala_id || '', dataInicio: d.data_inicio, dataFim: d.data_fim,
          horaInicio: d.hora_inicio, horaFim: d.hora_fim, vagasPorHora: d.vagas_por_hora,
          vagasPorDia: d.vagas_por_dia, diasSemana: d.dias_semana || [],
        }));
        setDisponibilidades(mapped);
      }
    } catch (err) { console.error('Error loading disponibilidades:', err); }
  }, []);

  // Load pacientes from DB
  const loadPacientes = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('pacientes' as any).select('*');
      if (data && !error) {
        const mapped: Paciente[] = (data as any[]).map((p: any) => ({
          id: p.id, nome: p.nome, cpf: p.cpf || '', telefone: p.telefone || '',
          dataNascimento: p.data_nascimento || '', email: p.email || '',
          endereco: p.endereco || '', observacoes: p.observacoes || '',
          criadoEm: p.criado_em || '',
        }));
        setPacientes(mapped);
      }
    } catch (err) { console.error('Error loading pacientes:', err); }
  }, []);

  // Load agendamentos from DB
  const loadAgendamentos = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('agendamentos' as any).select('*').order('data', { ascending: false });
      if (data && !error) {
        const mapped: Agendamento[] = (data as any[]).map((a: any) => ({
          id: a.id, pacienteId: a.paciente_id, pacienteNome: a.paciente_nome,
          unidadeId: a.unidade_id, salaId: a.sala_id || '', setorId: a.setor_id || '',
          profissionalId: a.profissional_id, profissionalNome: a.profissional_nome,
          data: a.data, hora: a.hora, status: a.status, tipo: a.tipo,
          observacoes: a.observacoes || '', origem: a.origem || 'recepcao',
          googleEventId: a.google_event_id || '', syncStatus: a.sync_status || '',
          criadoEm: a.criado_em || '', criadoPor: a.criado_por || '',
        }));
        setAgendamentos(mapped);
      }
    } catch (err) { console.error('Error loading agendamentos:', err); }
  }, []);

  // Load fila from DB
  const loadFila = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('fila_espera' as any).select('*').order('criado_em', { ascending: true });
      if (data && !error) {
        const mapped: FilaEspera[] = (data as any[]).map((f: any) => ({
          id: f.id, pacienteId: f.paciente_id, pacienteNome: f.paciente_nome,
          unidadeId: f.unidade_id, profissionalId: f.profissional_id || '',
          setor: f.setor || '', prioridade: f.prioridade as FilaEspera['prioridade'],
          status: f.status as FilaEspera['status'], posicao: f.posicao,
          horaChegada: f.hora_chegada, horaChamada: f.hora_chamada || '',
          observacoes: f.observacoes || '', criadoPor: f.criado_por || '',
        }));
        setFila(mapped);
      }
    } catch (err) { console.error('Error loading fila:', err); }
  }, []);

  useEffect(() => {
    loadUnidades();
    loadSalas();
    loadFuncionarios();
    loadDisponibilidades();
    loadPacientes();
    loadAgendamentos();
    loadFila();
  }, [loadUnidades, loadSalas, loadFuncionarios, loadDisponibilidades, loadPacientes, loadAgendamentos, loadFila]);

  const refreshFuncionarios = loadFuncionarios;
  const refreshDisponibilidades = loadDisponibilidades;
  const refreshAgendamentos = loadAgendamentos;
  const refreshPacientes = loadPacientes;
  const refreshFila = loadFila;

  // --- PACIENTES: persist to DB ---
  const addPaciente = useCallback(async (p: Paciente) => {
    const { error } = await supabase.from('pacientes' as any).insert({
      id: p.id, nome: p.nome, cpf: p.cpf, telefone: p.telefone,
      data_nascimento: p.dataNascimento, email: p.email, endereco: p.endereco,
      observacoes: p.observacoes,
    } as any);
    if (!error) setPacientes(prev => [...prev, p]);
    else console.error('Error adding paciente:', error);
  }, []);

  const updatePaciente = useCallback(async (id: string, data: Partial<Paciente>) => {
    const dbData: any = {};
    if (data.nome !== undefined) dbData.nome = data.nome;
    if (data.cpf !== undefined) dbData.cpf = data.cpf;
    if (data.telefone !== undefined) dbData.telefone = data.telefone;
    if (data.dataNascimento !== undefined) dbData.data_nascimento = data.dataNascimento;
    if (data.email !== undefined) dbData.email = data.email;
    if (data.endereco !== undefined) dbData.endereco = data.endereco;
    if (data.observacoes !== undefined) dbData.observacoes = data.observacoes;
    const { error } = await supabase.from('pacientes' as any).update(dbData).eq('id', id);
    if (!error) setPacientes(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
    else console.error('Error updating paciente:', error);
  }, []);

  // --- AGENDAMENTOS: persist to DB ---
  const addAgendamento = useCallback(async (ag: Agendamento) => {
    const { error } = await supabase.from('agendamentos' as any).insert({
      id: ag.id, paciente_id: ag.pacienteId, paciente_nome: ag.pacienteNome,
      unidade_id: ag.unidadeId, sala_id: ag.salaId, setor_id: ag.setorId,
      profissional_id: ag.profissionalId, profissional_nome: ag.profissionalNome,
      data: ag.data, hora: ag.hora, status: ag.status, tipo: ag.tipo,
      observacoes: ag.observacoes, origem: ag.origem,
      google_event_id: ag.googleEventId || '', sync_status: ag.syncStatus || 'pendente',
      criado_por: ag.criadoPor || '',
    } as any);
    if (!error) setAgendamentos(prev => [...prev, ag]);
    else console.error('Error adding agendamento:', error);
  }, []);

  const updateAgendamento = useCallback(async (id: string, data: Partial<Agendamento>) => {
    const dbData: any = {};
    if (data.status !== undefined) dbData.status = data.status;
    if (data.hora !== undefined) dbData.hora = data.hora;
    if (data.data !== undefined) dbData.data = data.data;
    if (data.observacoes !== undefined) dbData.observacoes = data.observacoes;
    if (data.googleEventId !== undefined) dbData.google_event_id = data.googleEventId;
    if (data.syncStatus !== undefined) dbData.sync_status = data.syncStatus;
    if (data.salaId !== undefined) dbData.sala_id = data.salaId;
    const { error } = await supabase.from('agendamentos' as any).update(dbData).eq('id', id);
    if (!error) setAgendamentos(prev => prev.map(a => a.id === id ? { ...a, ...data } : a));
    else console.error('Error updating agendamento:', error);
  }, []);

  // --- FILA DE ESPERA: persist to DB ---
  const addToFila = useCallback(async (f: FilaEspera) => {
    const { error } = await supabase.from('fila_espera' as any).insert({
      id: f.id, paciente_id: f.pacienteId, paciente_nome: f.pacienteNome,
      unidade_id: f.unidadeId, profissional_id: f.profissionalId || '',
      setor: f.setor, prioridade: f.prioridade, status: f.status,
      posicao: f.posicao, hora_chegada: f.horaChegada,
      observacoes: f.observacoes || '', criado_por: f.criadoPor || 'sistema',
    } as any);
    if (!error) setFila(prev => [...prev, f]);
    else console.error('Error adding to fila:', error);
  }, []);

  const updateFila = useCallback(async (id: string, data: Partial<FilaEspera>) => {
    const dbData: any = {};
    if (data.status !== undefined) dbData.status = data.status;
    if (data.prioridade !== undefined) dbData.prioridade = data.prioridade;
    if (data.profissionalId !== undefined) dbData.profissional_id = data.profissionalId;
    if (data.unidadeId !== undefined) dbData.unidade_id = data.unidadeId;
    if (data.observacoes !== undefined) dbData.observacoes = data.observacoes;
    if (data.horaChamada !== undefined) dbData.hora_chamada = data.horaChamada;
    if (data.pacienteNome !== undefined) dbData.paciente_nome = data.pacienteNome;
    if (data.pacienteId !== undefined) dbData.paciente_id = data.pacienteId;
    if (data.setor !== undefined) dbData.setor = data.setor;
    const { error } = await supabase.from('fila_espera' as any).update(dbData).eq('id', id);
    if (!error) setFila(prev => prev.map(f => f.id === id ? { ...f, ...data } : f));
    else console.error('Error updating fila:', error);
  }, []);

  const removeFromFila = useCallback(async (id: string) => {
    const { error } = await supabase.from('fila_espera' as any).delete().eq('id', id);
    if (!error) setFila(prev => prev.filter(f => f.id !== id));
    else console.error('Error removing from fila:', error);
  }, []);

  const addAtendimento = useCallback((a: Atendimento) => setAtendimentos(prev => [...prev, a]), []);
  const updateAtendimento = useCallback((id: string, data: Partial<Atendimento>) =>
    setAtendimentos(prev => prev.map(a => a.id === id ? { ...a, ...data } : a)), []);

  // --- UNIDADES: persist to DB ---
  const addUnidade = useCallback(async (u: Unidade) => {
    const { error } = await supabase.from('unidades' as any).insert({
      id: u.id, nome: u.nome, endereco: u.endereco, telefone: u.telefone, whatsapp: u.whatsapp, ativo: u.ativo,
    } as any);
    if (!error) setUnidades(prev => [...prev, u]);
    else console.error('Error adding unidade:', error);
  }, []);

  const updateUnidade = useCallback(async (id: string, data: Partial<Unidade>) => {
    const dbData: any = {};
    if (data.nome !== undefined) dbData.nome = data.nome;
    if (data.endereco !== undefined) dbData.endereco = data.endereco;
    if (data.telefone !== undefined) dbData.telefone = data.telefone;
    if (data.whatsapp !== undefined) dbData.whatsapp = data.whatsapp;
    if (data.ativo !== undefined) dbData.ativo = data.ativo;
    const { error } = await supabase.from('unidades' as any).update(dbData).eq('id', id);
    if (!error) setUnidades(prev => prev.map(u => u.id === id ? { ...u, ...data } : u));
    else console.error('Error updating unidade:', error);
  }, []);

  const deleteUnidade = useCallback(async (id: string) => {
    const { error } = await supabase.from('unidades' as any).delete().eq('id', id);
    if (!error) setUnidades(prev => prev.filter(u => u.id !== id));
    else console.error('Error deleting unidade:', error);
  }, []);

  // --- SALAS: persist to DB ---
  const addSala = useCallback(async (s: Sala) => {
    const { error } = await supabase.from('salas' as any).insert({
      id: s.id, nome: s.nome, unidade_id: s.unidadeId, ativo: s.ativo,
    } as any);
    if (!error) setSalas(prev => [...prev, s]);
    else console.error('Error adding sala:', error);
  }, []);

  const updateSala = useCallback(async (id: string, data: Partial<Sala>) => {
    const dbData: any = {};
    if (data.nome !== undefined) dbData.nome = data.nome;
    if (data.unidadeId !== undefined) dbData.unidade_id = data.unidadeId;
    if (data.ativo !== undefined) dbData.ativo = data.ativo;
    const { error } = await supabase.from('salas' as any).update(dbData).eq('id', id);
    if (!error) setSalas(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
    else console.error('Error updating sala:', error);
  }, []);

  const deleteSala = useCallback(async (id: string) => {
    const { error } = await supabase.from('salas' as any).delete().eq('id', id);
    if (!error) setSalas(prev => prev.filter(s => s.id !== id));
    else console.error('Error deleting sala:', error);
  }, []);

  // --- FUNCIONARIOS ---
  const addFuncionario = useCallback((u: User) => setFuncionarios(prev => [...prev, u]), []);
  const updateFuncionario = useCallback((id: string, data: Partial<User>) => 
    setFuncionarios(prev => prev.map(u => u.id === id ? { ...u, ...data } : u)), []);
  const deleteFuncionario = useCallback((id: string) => setFuncionarios(prev => prev.filter(u => u.id !== id)), []);

  // --- DISPONIBILIDADES: persist to DB ---
  const addDisponibilidade = useCallback(async (d: Disponibilidade) => {
    const { error } = await supabase.from('disponibilidades' as any).insert({
      id: d.id, profissional_id: d.profissionalId, unidade_id: d.unidadeId,
      sala_id: d.salaId || '', data_inicio: d.dataInicio, data_fim: d.dataFim,
      hora_inicio: d.horaInicio, hora_fim: d.horaFim, vagas_por_hora: d.vagasPorHora,
      vagas_por_dia: d.vagasPorDia, dias_semana: d.diasSemana,
    } as any);
    if (!error) setDisponibilidades(prev => [...prev, d]);
    else console.error('Error adding disponibilidade:', error);
  }, []);

  const updateDisponibilidade = useCallback(async (id: string, data: Partial<Disponibilidade>) => {
    const dbData: any = {};
    if (data.profissionalId !== undefined) dbData.profissional_id = data.profissionalId;
    if (data.unidadeId !== undefined) dbData.unidade_id = data.unidadeId;
    if (data.salaId !== undefined) dbData.sala_id = data.salaId;
    if (data.dataInicio !== undefined) dbData.data_inicio = data.dataInicio;
    if (data.dataFim !== undefined) dbData.data_fim = data.dataFim;
    if (data.horaInicio !== undefined) dbData.hora_inicio = data.horaInicio;
    if (data.horaFim !== undefined) dbData.hora_fim = data.horaFim;
    if (data.vagasPorHora !== undefined) dbData.vagas_por_hora = data.vagasPorHora;
    if (data.vagasPorDia !== undefined) dbData.vagas_por_dia = data.vagasPorDia;
    if (data.diasSemana !== undefined) dbData.dias_semana = data.diasSemana;
    const { error } = await supabase.from('disponibilidades' as any).update(dbData).eq('id', id);
    if (!error) setDisponibilidades(prev => prev.map(d => d.id === id ? { ...d, ...data } : d));
    else console.error('Error updating disponibilidade:', error);
  }, []);

  const deleteDisponibilidade = useCallback(async (id: string) => {
    const { error } = await supabase.from('disponibilidades' as any).delete().eq('id', id);
    if (!error) setDisponibilidades(prev => prev.filter(d => d.id !== id));
    else console.error('Error deleting disponibilidade:', error);
  }, []);

  const updateConfiguracoes = useCallback((data: Partial<Configuracoes>) => 
    setConfiguracoes(prev => ({ ...prev, ...data })), []);

  const checkFilaForSlot = useCallback((profissionalId: string, unidadeId: string, _data: string, _hora: string): FilaEspera[] => {
    const prioOrder = { urgente: 0, alta: 1, normal: 2 };
    return fila
      .filter(f => 
        f.status === 'aguardando' &&
        f.unidadeId === unidadeId &&
        (!f.profissionalId || f.profissionalId === profissionalId)
      )
      .sort((a, b) => {
        if (prioOrder[a.prioridade] !== prioOrder[b.prioridade]) return prioOrder[a.prioridade] - prioOrder[b.prioridade];
        return a.horaChegada.localeCompare(b.horaChegada);
      });
  }, [fila]);

  const cancelAgendamento = useCallback((id: string): FilaEspera[] => {
    const ag = agendamentos.find(a => a.id === id);
    if (!ag) return [];
    // Update in DB
    supabase.from('agendamentos' as any).update({ status: 'cancelado' }).eq('id', id).then();
    setAgendamentos(prev => prev.map(a => a.id === id ? { ...a, status: 'cancelado' as const } : a));
    return checkFilaForSlot(ag.profissionalId, ag.unidadeId, ag.data, ag.hora);
  }, [agendamentos, checkFilaForSlot]);

  const encaixarDaFila = useCallback(async (filaId: string, agData: Omit<Agendamento, 'id' | 'criadoEm'>) => {
    const newAg: Agendamento = { ...agData, id: `ag${Date.now()}`, criadoEm: new Date().toISOString() };
    await addAgendamento(newAg);
    await updateFila(filaId, { status: 'encaixado' as const });
  }, []);

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

    if (dayAppointments.length >= disp.vagasPorDia) return [];

    // Use professional's tempoAtendimento for slot interval
    const prof = funcionarios.find(f => f.id === profissionalId);
    const intervalMinutes = prof?.tempoAtendimento || 30;

    let h = startHour;
    let m = startMin;
    while (h < endHour || (h === endHour && m < endMin)) {
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const slotTaken = dayAppointments.some(a => a.hora === timeStr);
      
      // Count appointments in this hour window
      const hourStr = `${String(h).padStart(2, '0')}:`;
      const hourAppointments = dayAppointments.filter(a => a.hora.startsWith(hourStr));
      
      if (!slotTaken && hourAppointments.length < disp.vagasPorHora) {
        slots.push(timeStr);
      }
      
      m += intervalMinutes;
      while (m >= 60) { m -= 60; h++; }
    }

    return slots;
  }, [disponibilidades, agendamentos, funcionarios]);

  return (
    <DataContext.Provider value={{
      agendamentos, pacientes, fila, atendimentos, unidades, salas, setores, funcionarios, disponibilidades, configuracoes,
      addAgendamento, updateAgendamento, cancelAgendamento, addPaciente, updatePaciente,
      addToFila, updateFila, removeFromFila, addAtendimento, updateAtendimento,
      addUnidade, updateUnidade, deleteUnidade, 
      addSala, updateSala, deleteSala,
      addFuncionario, updateFuncionario, deleteFuncionario,
      addDisponibilidade, updateDisponibilidade, deleteDisponibilidade,
      getAvailableSlots, getAvailableDates, updateConfiguracoes,
      checkFilaForSlot, encaixarDaFila,
      refreshFuncionarios, refreshDisponibilidades, refreshAgendamentos, refreshPacientes, refreshFila,
    }}>
      {children}
    </DataContext.Provider>
  );
};

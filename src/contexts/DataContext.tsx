import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Agendamento,
  Paciente,
  FilaEspera,
  Atendimento,
  Unidade,
  Sala,
  Setor,
  User,
  Disponibilidade,
  Configuracoes,
} from "@/types";

const inlineSetores = [
  { id: "st1", nome: "Clínica Geral" },
  { id: "st2", nome: "Pediatria" },
  { id: "st3", nome: "Odontologia" },
  { id: "st4", nome: "Enfermagem" },
  { id: "st5", nome: "Fisioterapia" },
  { id: "st6", nome: "Psicologia" },
  { id: "st7", nome: "Nutrição" },
];

import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { getPublicIp, getDeviceInfo } from "@/lib/clientInfo";

interface BloqueioAgenda {
  id: string;
  titulo: string;
  tipo: "feriado" | "ferias" | "reuniao" | "indisponibilidade";
  dataInicio: string;
  dataFim: string;
  diaInteiro: boolean;
  horaInicio: string;
  horaFim: string;
  unidadeId: string;
  profissionalId: string;
  criadoPor: string;
}

const defaultConfiguracoes: Configuracoes = {
  whatsapp: {
    ativo: false,
    provedor: "zapi",
    token: "",
    numero: "",
    notificacoes: { confirmacao: true, lembrete24h: true, lembrete2h: true, remarcacao: true, cancelamento: true },
  },
  googleCalendar: { conectado: false, criarEvento: true, atualizarRemarcar: true, removerCancelar: true, enviarEmail: true },
  filaEspera: { modoEncaixe: "assistido" },
  templates: {
    confirmacao: "Olá {nome}! Sua consulta foi agendada para {data} às {hora} na {unidade}. Profissional: {profissional}.",
    lembrete: "Lembrete: Sua consulta é em {data} às {hora} na {unidade} com {profissional}.",
  },
  webhook: { ativo: true, url: "https://hook.us2.make.com/a12e4puc3o58b3z78k9qu3wxevr5qkwa", status: "ativo" },
  gmail: { ativo: false, email: "", senhaApp: "", smtpHost: "smtp.gmail.com", smtpPort: 587 },
  canalNotificacao: "webhook",
  portalPaciente: { permitirPortal: true, enviarSenhaAutomaticamente: true, enviarLinkAcesso: true, pacientesBloqueados: [] },
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
  bloqueios: BloqueioAgenda[];
  configuracoes: Configuracoes;
  addAgendamento: (ag: Agendamento) => Promise<void>;
  updateAgendamento: (id: string, data: Partial<Agendamento>) => Promise<void>;
  cancelAgendamento: (id: string) => Promise<FilaEspera[]>;
  addPaciente: (p: Paciente) => Promise<void>;
  updatePaciente: (id: string, data: Partial<Paciente>) => Promise<void>;
  addToFila: (f: FilaEspera) => Promise<void>;
  updateFila: (id: string, data: Partial<FilaEspera>) => Promise<void>;
  removeFromFila: (id: string) => Promise<void>;
  addAtendimento: (a: Atendimento) => Promise<void>;
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
  addBloqueio: (b: Omit<BloqueioAgenda, "id">) => Promise<void>;
  updateBloqueio: (id: string, data: Partial<BloqueioAgenda>) => Promise<void>;
  deleteBloqueio: (id: string) => Promise<void>;
  getAvailableSlots: (profissionalId: string, unidadeId: string, date: string, isPublic?: boolean) => string[];
  getAvailableDates: (profissionalId: string, unidadeId: string, isPublic?: boolean) => string[];
  getNextAvailableSlots: (profissionalId: string, unidadeId: string, fromDate: string, limit?: number, isPublic?: boolean) => string[];
  getBlockingInfo: (profissionalId: string, unidadeId: string, date: string) => { blocked: boolean; type?: string; label?: string };
  getDayInfoMap: (profissionalId: string, unidadeId: string, isPublic?: boolean) => Record<string, any>;
  updateConfiguracoes: (data: Partial<Configuracoes>) => void;
  checkFilaForSlot: (profissionalId: string, unidadeId: string, data: string, hora: string) => FilaEspera[];
  encaixarDaFila: (filaId: string, agendamento: Omit<Agendamento, "id" | "criadoEm">) => void;
  refreshFuncionarios: () => Promise<void>;
  refreshDisponibilidades: () => Promise<void>;
  refreshAgendamentos: () => Promise<void>;
  refreshPacientes: () => Promise<void>;
  refreshFila: () => Promise<void>;
  refreshBloqueios: () => Promise<void>;
  logAction: (input: { acao: string; entidade: string; entidadeId?: string; detalhes?: Record<string, unknown>; user?: User | null; unidadeId?: string; modulo?: string; status?: string; erro?: string }) => Promise<void>;
}

const DataContext = createContext<DataContextType | null>(null);

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
};

const safeConfigMerge = (incoming: Partial<Configuracoes> | null | undefined): Configuracoes => {
  if (!incoming) return defaultConfiguracoes;
  return {
    ...defaultConfiguracoes,
    ...incoming,
    whatsapp: { ...defaultConfiguracoes.whatsapp, ...incoming.whatsapp, notificacoes: { ...defaultConfiguracoes.whatsapp.notificacoes, ...incoming.whatsapp?.notificacoes } },
    googleCalendar: { ...defaultConfiguracoes.googleCalendar, ...incoming.googleCalendar },
    filaEspera: { ...defaultConfiguracoes.filaEspera, ...incoming.filaEspera },
    templates: { ...defaultConfiguracoes.templates, ...incoming.templates },
    webhook: { ...defaultConfiguracoes.webhook, ...incoming.webhook },
    gmail: { ...defaultConfiguracoes.gmail!, ...incoming.gmail },
    canalNotificacao: incoming.canalNotificacao || defaultConfiguracoes.canalNotificacao,
    portalPaciente: { permitirPortal: true, enviarSenhaAutomaticamente: true, enviarLinkAcesso: true, pacientesBloqueados: [], ...incoming.portalPaciente },
  };
};

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [fila, setFila] = useState<FilaEspera[]>([]);
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [setores] = useState<Setor[]>(inlineSetores);
  const [funcionarios, setFuncionarios] = useState<User[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<Disponibilidade[]>([]);
  const [bloqueios, setBloqueios] = useState<BloqueioAgenda[]>([]);
  const [configuracoes, setConfiguracoes] = useState<Configuracoes>(defaultConfiguracoes);

  const logAction = useCallback(async (input: { acao: string; entidade: string; entidadeId?: string; detalhes?: Record<string, unknown>; user?: User | null; unidadeId?: string; modulo?: string; status?: string; erro?: string }) => {
    try {
      const actor: User | null;
      const ip = await getPublicIp();
      const dispositivo = getDeviceInfo();
      await supabase.from('action_logs' as any).insert({
        user_id: actor?.id || "", user_nome: actor?.nome || "sistema", role: actor?.role || "sistema",
        unidade_id: input.unidadeId || actor?.unidadeId || "", acao: input.acao, entidade: input.entidade,
        entidade_id: input.entidadeId || "", detalhes: { ...(input.detalhes || {}), usuario_cpf: actor?.cpf || "", dispositivo }, // Fixed typo: detalles -> detalhes
        modulo: input.modulo || input.entidade || "", status: input.status || "sucesso", erro: input.erro || "", ip,
      } as any);
    } catch (err) { console.error("Error writing action log:", err); }
  }, []);

  const emitDbUpdate = useCallback(() => { try { window.dispatchEvent(new Event("db_update")); } catch {} }, []);

  const isSlotBlocked = useCallback((profissionalId: string, unidadeId: string, date: string, time?: string) => {
    const dateRef = new Date(`${date}T00:00:00`).getTime();
    return bloqueios.some((b) => {
      const ini = new Date(`${b.dataInicio}T00:00:00`).getTime();
      const fim = new Date(`${b.dataFim}T00:00:00`).getTime();
      if (dateRef < ini || dateRef > fim) return false;
      const isGlobal = (!b.unidadeId || b.unidadeId === "") && (!b.profissionalId || b.profissionalId === "");
      const isUnitLevel = b.unidadeId === unidadeId && (!b.profissionalId || b.profissionalId === "");
      const isProfLevel = b.profissionalId === profissionalId;
      if (!isGlobal && !isUnitLevel && !isProfLevel) return false;
      if (b.diaInteiro || !time) return true;
      return time >= (b.horaInicio || "00:00") && time < (b.horaFim || "23:59");
    });
  }, [bloqueios]);

  const getBlockingInfo = useCallback((profissionalId: string, unidadeId: string, date: string) => {
    const dateRef = new Date(`${date}T00:00:00`).getTime();
    const b = bloqueios.find((b) => {
      const ini = new Date(`${b.dataInicio}T00:00:00`).getTime();
      const fim = new Date(`${b.dataFim}T00:00:00`).getTime();
      if (dateRef < ini || dateRef > fim) return false;
      const isGlobal = (!b.unidadeId || b.unidadeId === "") && (!b.profissionalId || b.profissionalId === "");
      const isUnitLevel = b.unidadeId === unidadeId && (!b.profissionalId || b.profissionalId === "");
      const isProfLevel = b.profissionalId === profissionalId;
      return isGlobal || isUnitLevel || isProfLevel;
    });
    return b ? { blocked: true, type: b.tipo, label: b.titulo } : { blocked: false };
  }, [bloqueios]);

  const getAvailableSlots = useCallback((profissionalId: string, unidadeId: string, date: string, isPublic?: boolean) => {
    const slots: string[] = [];
    const disp = disponibilidades.filter((d) => d.profissionalId === profissionalId && d.unidadeId === unidadeId);
    if (disp.length === 0) return slots;
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    const validDisp = disp.filter((d) => d.diasSemana.includes(dayOfWeek));
    if (validDisp.length === 0) return slots;
    const d = validDisp[0];
    const [startH, startM] = d.horaInicio.split(":").map(Number);
    const [endH, endM] = d.horaFim.split(":").map(Number);
    let current = startH * 60 + startM;
    const end = endH * 60 + endM;
    const duration = d.duracaoConsulta || 30;
    while (current + duration <= end) {
      const h = Math.floor(current / 60).toString().padStart(2, "0");
      const m = (current % 60).toString().padStart(2, "0");
      const time = `${h}:${m}`;
      if (!isSlotBlocked(profissionalId, unidadeId, date, time)) {
        const booked = agendamentos.some((a) => a.data === date && a.hora === time && a.profissionalId === profissionalId && a.status !== "cancelado" && a.status !== "falta");
        if (!booked) slots.push(time);
      }
      current += duration;
    }
    return slots;
  }, [disponibilidades, agendamentos, isSlotBlocked]);

  const getAvailableDates = useCallback((profissionalId: string, unidadeId: string, isPublic?: boolean) => {
    const dates: string[] = [];
    const disp = disponibilidades.filter((d) => d.profissionalId === profissionalId && d.unidadeId === unidadeId);
    if (disp.length === 0) return dates;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      const dayOfWeek = d.getDay();
      const validDisp = disp.filter((d) => d.diasSemana.includes(dayOfWeek));
      if (validDisp.length > 0) {
        const slots = getAvailableSlots(profissionalId, unidadeId, dateStr, isPublic);
        if (slots.length > 0) dates.push(dateStr);
      }
    }
    return dates;
  }, [disponibilidades, getAvailableSlots]);

  const getNextAvailableSlots = useCallback((profissionalId: string, unidadeId: string, fromDate: string, limit = 5, isPublic?: boolean) => {
    const slots: string[] = [];
    const today = new Date(fromDate);
    for (let i = 0; i < 30 && slots.length < limit; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      const daySlots = getAvailableSlots(profissionalId, unidadeId, dateStr, isPublic);
      if (daySlots.length > 0) {
        daySlots.forEach((s) => slots.push(`${dateStr} ${s}`));
        if (slots.length >= limit) break;
      }
    }
    return slots.slice(0, limit);
  }, [getAvailableSlots]);

  const getBlockingInfo = useCallback((profissionalId: string, unidadeId: string, date: string) => {
    const dateRef = new Date(`${date}T00:00:00`).getTime();
    const b = bloqueios.find((b) => {
      const ini = new Date(`${b.dataInicio}T00:00:00`).getTime();
      const fim = new Date(`${b.dataFim}T00:00:00`).getTime();
      if (dateRef < ini || dateRef > fim) return false;
      const isGlobal = (!b.unidadeId || b.unidadeId === "") && (!b.profissionalId || b.profissionalId === "");
      const isUnitLevel = b.unidadeId === unidadeId && (!b.profissionalId || b.profissionalId === "");
      const isProfLevel = b.profissionalId === profissionalId;
      return isGlobal || isUnitLevel || isProfLevel;
    });
    return b ? { blocked: true, type: b.tipo, label: b.titulo } : { blocked: false };
  }, [bloqueios]);

  const getDayInfoMap = useCallback((profissionalId: string, unidadeId: string, isPublic?: boolean) => {
    const map: Record<string, any> = {};
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      const slots = getAvailableSlots(profissionalId, unidadeId, dateStr, isPublic);
      const blockInfo = getBlockingInfo(profissionalId, unidadeId, dateStr);
      map[dateStr] = { available: slots.length > 0, blocked: blockInfo.blocked, type: blockInfo.type, label: blockInfo.label };
    }
    return map;
  }, [getAvailableSlots, getBlockingInfo]);

  const updateConfiguracoes = useCallback((data: Partial<Configuracoes>) => {
    setConfiguracoes((prev) => ({ ...prev, ...data }));
  }, []);

  const checkFilaForSlot = useCallback((profissionalId: string, unidadeId: string, data: string, hora: string) => {
    return fila.filter((f) => f.unidadeId === unidadeId && f.status === "aguardando" && f.profissionalId === profissionalId);
  }, [fila]);

  const encaixarDaFila = useCallback((filaId: string, agendamento: Omit<Agendamento, "id" | "criadoEm">) => {
    const newAg: Agendamento = { ...agendamento, id: `ag${Date.now()}`, criadoEm: new Date().toISOString() };
    addAgendamento(newAg);
    updateFila(filaId, { status: "encaixado" });
  }, [addAgendamento, updateFila]);

  const loadFuncionarios = useCallback(async () => {
    const { data } = await supabase.from("funcionarios").select("*").order("criado_em", { ascending: false });
    if (data) setFuncionarios(data);
  }, []);

  const loadDisponibilidades = useCallback(async () => {
    const { data } = await supabase.from("disponibilidades").select("*");
    if (data) setDisponibilidades(data);
  }, []);

  const loadAgendamentos = useCallback(async () => {
    const { data } = await supabase.from("agendamentos").select("*").order("data", { ascending: false });
    if (data) setAgendamentos(data);
  }, []);

  const loadPacientes = useCallback(async () => {
    const { data } = await supabase.from("pacientes").select("*");
    if (data) setPacientes(data);
  }, []);

  const loadFila = useCallback(async () => {
    const { data } = await supabase.from("fila_espera").select("*").order("criado_em", { ascending: false });
    if (data) setFila(data);
  }, []);

  const loadBloqueios = useCallback(async () => {
    const { data } = await supabase.from("bloqueios").select("*");
    if (data) setBloqueios(data);
  }, []);

  useRealtimeSync({
    table: "agendamentos",
    onEvent: () => {
      loadAgendamentos();
    },
  });

  useRealtimeSync({
    table: "pacientes",
    onEvent: () => {
      loadPacientes();
    },
  });

  useRealtimeSync({
    table: "fila_espera",
    onEvent: () => {
      loadFila();
    },
  });

  useRealtimeSync({
    table: "funcionarios",
    onEvent: () => {
      loadFuncionarios();
    },
  });

  useRealtimeSync({
    table: "disponibilidades",
    onEvent: () => {
      loadDisponibilidades();
    },
  });

  useRealtimeSync({
    table: "bloqueios",
    onEvent: () => {
      loadBloqueios();
    },
  });

  return (
    <DataContext.Provider value={{
      agendamentos, pacientes, fila, atendimentos, unidades, salas, setores, funcionarios, disponibilidades, bloqueios, configuracoes,
      addAgendamento, updateAgendamento, cancelAgendamento: () => Promise.resolve([]), addPaciente, updatePaciente, addToFila, updateFila, removeFromFila: () => Promise.resolve(),
      addAtendimento: () => Promise.resolve(), updateAtendimento: () => {}, addUnidade: () => {}, updateUnidade: () => {}, deleteUnidade: () => {}, addSala: () => {}, updateSala: () => {}, deleteSala: () => {},
      addFuncionario: () => {}, updateFuncionario: () => {}, deleteFuncionario: () => {}, addDisponibilidade: () => {}, updateDisponibilidade: () => {}, deleteDisponibilidade: () => {},
      addBloqueio: () => Promise.resolve(), updateBloqueio: () => {}, deleteBloqueio: () => {}, getAvailableSlots, getAvailableDates, getNextAvailableSlots: () => [], getBlockingInfo, getDayInfoMap,
      updateConfiguracoes, checkFilaForSlot, encaixarDaFila, refreshFuncionarios, refreshDisponibilidades, refreshAgendamentos, refreshPacientes, refreshFila, refreshBloqueios, logAction: () => Promise.resolve(),
    }}>
      {children}
    </DataContext.Provider>
  );
};
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
  if (!ctx) throw new Error("useData must be used within DataProvider");
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
      await supabase.from("action_logs" as any).insert({
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

  const refreshFuncionarios = loadFuncionarios;
  const refreshDisponibilidades = loadDisponibilidades;
  const refreshAgendamentos = loadAgendamentos;
  const refreshPacientes = loadPacientes;
  const refreshFila = loadFila;
  const refreshBloqueios = loadBloqueios;

  return (
    <DataContext.Provider value={{
      agendamentos, pacientes, fila, atendimentos, unidades, salas, setores, funcionarios, disponibilidades, bloqueios, configuracoes,
      addAgendamento, updateAgendamento, cancelAgendamento, addPaciente, updatePaciente, addToFila, updateFila, removeFromFila,
      addAtendimento, updateAtendimento, addUnidade, updateUnidade, deleteUnidade, addSala, updateSala, deleteSala,
      addFuncionario, updateFuncionario, deleteFuncionario, addDisponibilidade, updateDisponibilidade, deleteDisponibilidade,
      addBloqueio, updateBloqueio, deleteBloqueio, getAvailableSlots, getAvailableDates, getNextAvailableSlots, getBlockingInfo, getDayInfoMap,
      updateConfiguracoes, checkFilaForSlot, encaixarDaFila, refreshFuncionarios, refreshDisponibilidades, refreshAgendamentos, refreshPacientes, refreshFila, refreshBloqueios, logAction,
    }}>
      {children}
    </DataContext.Provider>
  );
};

</dyad-file>

<dyad-write path="src/pages/painel/Agenda.tsx" description="Fixing Agenda.tsx as per the plan.">
import React, { useState, useMemo, useEffect } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { Agendamento, User } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, CheckCircle, XCircle, AlertTriangle, FileText, User as UserIcon, MapPin, Building2, ArrowRight, RefreshCw, Filter, Search, ChevronLeft, ChevronRight, Plus, Eye, Download, Upload, Paperclip } from "lucide-react";
import { format, addDays, subDays, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { CalendarioAgenda } from '@/components/CalendarioDisponibilidade';

const statusColors: Record<string, string> = {
  pendente: "bg-yellow-100 text-yellow-800 border-yellow-200",
  confirmado: "bg-blue-100 text-blue-800 border-blue-200",
  confirmado_chegada: "bg-indigo-100 text-indigo-800 border-indigo-200",
  cancelado: "bg-red-100 text-red-800 border-red-200",
  concluido: "bg-green-100 text-green-800 border-green-200",
  falta: "bg-gray-100 text-gray-800 border-gray-200",
  atraso: "bg-orange-100 text-orange-800 border-orange-200",
  remarcado: "bg-purple-100 text-purple-800 border-purple-200",
  em_atendimento: "bg-cyan-100 text-cyan-800 border-cyan-200",
  aguardando_triagem: "bg-teal-100 text-teal-800 border-teal-200",
  aguardando_enfermagem: "bg-rose-100 text-rose-800 border-rose-200",
  apto_atendimento: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export const Agenda = () => {
  const { agendamentos, updateAgendamento, unidades, funcionarios, getAvailableSlots, getAvailableDates, bloqueios, disponibilidades } = useData();
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [filterProf, setFilterProf] = useState<string>("all");
  const [filterUnit, setFilterUnit] = useState<string>("all");
  const [aprovarDialog, setAprovarDialog] = useState(false);
  const [rejeitarDialog, setRejeitarDialog] = useState(false);
  const [aprovarTarget, setAprovarTarget] = useState<Agendamento | null>(null);
  const [rejeicaoTarget, setRejeicaoTarget] = useState<Agendamento | null>(null);
  const [rejeicaoMotivo, setRejeicaoMotivo] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("calendar");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredAgendamentos = useMemo(() => {
    return agendamentos.filter((ag) => {
      const matchesDate = isSameDay(parseISO(ag.data), selectedDate);
      const matchesProf = filterProf === "all" || ag.profissionalId === filterProf;
      const matchesUnit = filterUnit === "all" || ag.unidadeId === filterUnit;
      const matchesSearch = searchTerm === "" || 
        ag.pacienteNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ag.profissionalNome.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesDate && matchesProf && matchesUnit && matchesSearch;
    }).sort((a, b) => a.hora.localeCompare(b.hora));
  }, [agendamentos, selectedDate, filterProf, filterUnit, searchTerm]);

  const handleAprovar = async () => {
    if (!aprovarTarget) return;
    try {
      await updateAgendamento(aprovarTarget.id, { 
        status: "confirmado",
        aprovadoPor: user?.id || "",
        aprovadoEm: new Date().toISOString(),
      });
      toast.success("Agendamento aprovado com sucesso");
      setAprovarDialog(false);
      setAprovarTarget(null);
    } catch (err) {
      toast.error("Erro ao aprovar agendamento");
    }
  };

  const handleRejeitar = async () => {
    if (!rejeicaoTarget) return;
    try {
      await updateAgendamento(rejeicaoTarget.id, { 
        status: "cancelado",
        rejeitadoMotivo: rejeicaoMotivo,
      });
      toast.success("Agendamento rejeitado/cancelado");
      setRejeitarDialog(false);
      setRejeicaoTarget(null);
      setRejeicaoMotivo("");
    } catch (err) {
      toast.error("Erro ao rejeitar agendamento");
    }
  };

  const handleStatusChange = async (ag: Agendamento, newStatus: Agendamento["status"]) => {
    try {
      await updateAgendamento(ag.id, { status: newStatus });
      toast.success(`Status atualizado para ${newStatus.replace("_", " ")}`);
    } catch (err) {
      toast.error("Erro ao atualizar status");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-sm text-gray-500">Gerencie consultas e disponibilidade</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === "list" ? "calendar" : "list")}>
            {viewMode === "list" ? <Calendar className="w-4 h-4 mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
            {viewMode === "list" ? "Calendário" : "Lista"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setSelectedDate(subDays(selectedDate, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="font-medium min-w-[140px] text-center">
                {format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </span>
              <Button variant="outline" size="icon" onClick={() => setSelectedDate(addDays(selectedDate, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(new Date())}>Hoje</Button>
            </div>
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:flex-none">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar paciente ou profissional..."
                  className="pl-8 pr-3 py-2 border rounded-md text-sm w-full md:w-64"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={filterUnit} onValueChange={setFilterUnit}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Unidade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterProf} onValueChange={setFilterProf}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Profissional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {funcionarios.filter(f => f.role === "profissional").map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === "calendar" ? (
            <CalendarioAgenda
              selectedDate={selectedDate.toISOString()}
              onDateChange={(date) => setSelectedDate(new Date(date))}
              agendamentos={agendamentos}
              bloqueios={bloqueios}
              disponibilidades={disponibilidades}
              filterProf={filterProf}
              filterUnit={filterUnit}
              profissionais={funcionarios}
              getAvailableSlots={getAvailableSlots}
              getAvailableDates={getAvailableDates}
              unidades={unidades}
            />
          ) : (
            <div className="space-y-3">
              {filteredAgendamentos.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Nenhum agendamento encontrado para esta data.</div>
              ) : (
                filteredAgendamentos.map((ag) => (
                  <div key={ag.id} className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors gap-3">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="bg-blue-100 p-2 rounded-lg">
                        <Clock className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{ag.hora} - {ag.pacienteNome}</div>
                        <div className="text-sm text-gray-500 flex items-center gap-2">
                          <UserIcon className="w-3 h-3" /> {ag.profissionalNome}
                          <span className="mx-1">•</span>
                          <MapPin className="w-3 h-3" /> {unidades.find(u => u.id === ag.unidadeId)?.nome || "Unidade"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={statusColors[ag.status] || "bg-gray-100 text-gray-800"}>
                        {ag.status.replace(/_/g, " ")}
                      </Badge>
                      {ag.origem === "online" && (
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Online</Badge>
                      )}
                      {ag.attachmentUrl && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1">
                          <Paperclip className="w-3 h-3" /> Anexo
                        </Badge>
                      )}
                      <div className="flex gap-1 ml-2">
                        {ag.status === "pendente" && (
                          <>
                            <Button size="sm" variant="outline" className="text-green-600 hover:text-green-700" onClick={() => { setAprovarTarget(ag); setAprovarDialog(true); }}>
                              <CheckCircle className="w-4 h-4 mr-1" /> Aprovar
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => { setRejeicaoTarget(ag); setRejeitarDialog(true); }}>
                              <XCircle className="w-4 h-4 mr-1" /> Rejeitar
                            </Button>
                          </>
                        )}
                        <Select value={ag.status} onValueChange={(val) => handleStatusChange(ag, val as Agendamento["status"])}>
                          <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.keys(statusColors).map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={aprovarDialog} onOpenChange={setAprovarDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar Agendamento</DialogTitle>
            <DialogDescription>
              Confirma a aprovação do agendamento de {aprovarTarget?.pacienteNome} para {aprovarTarget?.data} às {aprovarTarget?.hora}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAprovarDialog(false)}>Cancelar</Button>
            <Button onClick={handleAprovar} className="bg-green-600 hover:bg-green-700">Confirmar Aprovação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejeitarDialog} onOpenChange={setRejeitarDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Agendamento</DialogTitle>
            <DialogDescription>
              Informe o motivo para rejeição/cancelamento do agendamento de {rejeicaoTarget?.pacienteNome}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Label>Motivo</Label>
            <Textarea 
              value={rejeicaoMotivo} 
              onChange={(e) => setRejeicaoMotivo(e.target.value)} 
              placeholder="Ex: Horário indisponível, documentação pendente..."
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejeitarDialog(false); setRejeicaoMotivo(""); }}>Cancelar</Button>
            <Button onClick={handleRejeitar} variant="destructive" disabled={!rejeicaoMotivo.trim()}>Confirmar Rejeição</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Agenda;
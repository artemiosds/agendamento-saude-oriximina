import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
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
  Procedimento,
  EpisodioClinico,
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
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { getPublicIp, getDeviceInfo } from "@/lib/clientInfo";
import { getFilaSnapshot } from "@/contexts/_filaBridge";
import {
  getAgendamentosSnapshot,
  subscribeAgendamentosSnapshot,
} from "@/contexts/_agendamentosBridge";
import { auditService } from "@/services/auditService";

import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { addDaysToDateStr, isoDayOfWeek, localDateStr, nowMinutesInBrazil, todayLocalStr } from "@/lib/utils";

import type { TurnoInfoResult } from "@/contexts/OperacionalContext";
export type { TurnoInfoResult };

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
    notificacoes: {
      confirmacao: true,
      lembrete24h: true,
      lembrete2h: true,
      remarcacao: true,
      cancelamento: true,
    },
  },
  googleCalendar: {
    conectado: false,
    criarEvento: true,
    atualizarRemarcar: true,
    removerCancelar: true,
    enviarEmail: true,
  },
  filaEspera: { modoEncaixe: "assistido" },
  templates: {
    confirmacao:
      "Olá {nome}! Sua consulta foi agendada para {data} às {hora} na {unidade}. Profissional: {profissional}.",
    lembrete: "Lembrete: Sua consulta é em {data} às {hora} na {unidade} com {profissional}.",
  },
  webhook: {
    ativo: true,
    url: "https://hook.us2.make.com/a12e4puc3o58b3z78k9qu3wxevr5qkwa",
    status: "ativo" as const,
  },
  gmail: {
    ativo: false,
    email: "",
    senhaApp: "",
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
  },
  canalNotificacao: "webhook",
  portalPaciente: {
    permitirPortal: true,
    enviarSenhaAutomaticamente: true,
    enviarLinkAcesso: true,
    pacientesBloqueados: [],
  },
};

interface DataContextType {
  agendamentos: Agendamento[];
  
  // fila state migrado para FilaSliceProvider (Fase 5, Passo 3.1).
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
  deleteAgendamento: (id: string) => Promise<void>;
  // addToFila/updateFila/removeFromFila migrados para FilaSliceProvider (Fase 5, Passo 3.1).
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
  getTurnoInfo: (profissionalId: string, unidadeId: string, date: string) => TurnoInfoResult[];
  getAvailableDates: (profissionalId: string, unidadeId: string, isPublic?: boolean) => string[];
  getNextAvailableSlots: (
    profissionalId: string,
    unidadeId: string,
    fromDate: string,
    limit?: number,
    isPublic?: boolean,
  ) => string[];
  getBlockingInfo: (
    profissionalId: string,
    unidadeId: string,
    date: string,
  ) => { blocked: boolean; type?: string; label?: string };
  getDayInfoMap: (profissionalId: string, unidadeId: string, isPublic?: boolean) => Record<string, any>;
  updateConfiguracoes: (data: Partial<Configuracoes>) => void;
  // checkFilaForSlot/encaixarDaFila migrados para FilaSliceProvider (Fase 5, Passo 3.1).
  refreshFuncionarios: () => Promise<void>;
  refreshDisponibilidades: () => Promise<void>;
  refreshAgendamentos: () => Promise<void>;
  /** Fase 5 (transitório): handler de upsert incremental do canal `agendamentos`,
   *  exposto para uso pelo AgendamentosSliceProvider. Será interiorizado no slice
   *  no Passo 3, junto com o state. */
  applyAgendamentoRealtimeEvent: (payload: RealtimeSyncPayload) => void;
  ensureAgendamentosForDate: (date: string) => Promise<void>;
  ensureAgendamentosForRange: (startDate: string, endDate: string) => Promise<void>;
  
  // refreshFila migrado para FilaSliceProvider (Fase 5, Passo 3.1).
  refreshBloqueios: () => Promise<void>;
  refreshConfiguracoes: () => Promise<void>;
  /** Fase 5 (transitório): helper compartilhado com PacientesSliceProvider. */
  resolveScopedUnidadeId: () => Promise<string>;
  logAction: (input: {
    acao: string;
    entidade: string;
    entidadeId?: string;
    entidadeNome?: string;
    detalhes?: Record<string, unknown>;
    user?: User | null;
    unidadeId?: string;
    unidadeNome?: string;
    modulo?: string;
    status?: string;
    erro?: string;
    before?: any;
    after?: any;
    pacienteId?: string;
    pacienteNome?: string;
    profissionalId?: string;
    profissionalNome?: string;
    agendamentoId?: string;
    prontuarioId?: string;
    documentoId?: string;
    origem?: string;
    rota?: string;
  }) => void;

}

const DataContext = createContext<DataContextType | null>(null);

const priorityRank: Record<string, number> = {
  urgente: 0,
  gestante: 1,
  idoso: 2,
  alta: 3,
  pcd: 4,
  crianca: 5,
  normal: 6,
};

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
    whatsapp: {
      ...defaultConfiguracoes.whatsapp,
      ...incoming.whatsapp,
      notificacoes: {
        ...defaultConfiguracoes.whatsapp.notificacoes,
        ...incoming.whatsapp?.notificacoes,
      },
    },
    googleCalendar: { ...defaultConfiguracoes.googleCalendar, ...incoming.googleCalendar },
    filaEspera: { ...defaultConfiguracoes.filaEspera, ...incoming.filaEspera },
    templates: { ...defaultConfiguracoes.templates, ...incoming.templates },
    webhook: { ...defaultConfiguracoes.webhook, ...incoming.webhook },
    gmail: { ...defaultConfiguracoes.gmail!, ...incoming.gmail },
    canalNotificacao: incoming.canalNotificacao || defaultConfiguracoes.canalNotificacao,
    portalPaciente: {
      permitirPortal: true,
      enviarSenhaAutomaticamente: true,
      enviarLinkAcesso: true,
      pacientesBloqueados: [],
      ...incoming.portalPaciente,
    },
  };
};

// Lista única de status que NÃO ocupam vaga na agenda.
// Qualquer outro status (pendente, confirmado, confirmado_chegada, aguardando_*,
// em_atendimento, atendido, concluido, remarcado, encaixe, etc.) é considerado ATIVO
// e ocupa vaga real do profissional/unidade/data/turno.
const STATUS_NAO_OCUPA_VAGA = new Set([
  "cancelado",
  "falta",
  "excluido",
  "removido",
  "inativo",
]);
const statusOcupaVaga = (status: string) => !STATUS_NAO_OCUPA_VAGA.has(status);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const { user: authUser } = useAuth();
  // Unit isolation: only admin.sms sees all; everyone else is filtered
  const isGlobalAdmin = authUser?.usuario === 'admin.sms';
  const userUnidadeId = authUser?.unidadeId || '';
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  // pacientes state migrado para PacientesSliceProvider (Fase 5, Passo 3.1).
  // fila state migrado para FilaSliceProvider (Fase 5, Passo 3.1).
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [setores] = useState<Setor[]>(inlineSetores);
  const [funcionarios, setFuncionarios] = useState<User[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<Disponibilidade[]>([]);
  const [bloqueios, setBloqueios] = useState<BloqueioAgenda[]>([]);
  const [configuracoes, setConfiguracoes] = useState<Configuracoes>(defaultConfiguracoes);

  const agendamentosRef = useRef(agendamentos);
  agendamentosRef.current = agendamentos;
  const disponibilidadesRef = useRef(disponibilidades);
  disponibilidadesRef.current = disponibilidades;
  const bloqueiosRef = useRef(bloqueios);
  bloqueiosRef.current = bloqueios;
  // filaRef removido — snapshot vive em `_filaBridge.ts` alimentado pelo FilaSliceProvider.
  const funcionariosRef = useRef(funcionarios);
  funcionariosRef.current = funcionarios;
  const configuracoesRef = useRef(configuracoes);
  configuracoesRef.current = configuracoes;

  const invalidateCache = useCallback(
    (...keys: (readonly string[])[]) => {
      keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
    [queryClient],
  );

  const resolveScopedUnidadeId = useCallback(async () => {
    if (isGlobalAdmin) return "";
    if (userUnidadeId) return userUnidadeId;

    const funcionarioEmMemoria = funcionariosRef.current.find(
      (f) => f.authUserId === authUser?.authUserId || f.id === authUser?.id || f.usuario === authUser?.usuario,
    );
    if (funcionarioEmMemoria?.unidadeId) return funcionarioEmMemoria.unidadeId;

    if (!authUser?.authUserId) return "";

    const { data, error } = await supabase
      .from("funcionarios" as any)
      .select("unidade_id")
      .eq("auth_user_id", authUser.authUserId)
      .eq("ativo", true)
      .maybeSingle();

    if (error) {
      console.error("Error resolving scoped unidade_id for pacientes:", error);
      return "";
    }

    return ((data as { unidade_id?: string } | null)?.unidade_id || "").trim();
  }, [authUser?.authUserId, authUser?.id, authUser?.usuario, isGlobalAdmin, userUnidadeId]);

  const logAction = useCallback(
    (input: {
      acao: string;
      entidade: string;
      entidadeId?: string;
      entidadeNome?: string;
      detalhes?: Record<string, unknown>;
      user?: User | null;
      unidadeId?: string;
      unidadeNome?: string;
      modulo?: string;
      status?: string;
      erro?: string;
      before?: any;
      after?: any;
      pacienteId?: string;
      pacienteNome?: string;
      profissionalId?: string;
      profissionalNome?: string;
      agendamentoId?: string;
      prontuarioId?: string;
      documentoId?: string;
      origem?: string;
      rota?: string;
    }) => {

      // Use the new audit service for better consistency
      auditService.log({
        acao: input.acao,
        modulo: input.modulo || input.entidade || "sistema",
        entidade: input.entidade,
        entidadeId: input.entidadeId,
        user: input.user ? {
          id: input.user.id,
          nome: input.user.nome,
          role: input.user.role,
          unidadeId: input.user.unidadeId,
          cpf: input.user.cpf
        } : null,
        unidadeId: input.unidadeId || input.user?.unidadeId,
        status: (input.status as any) || 'sucesso',
        errorMessage: input.erro,
        before: input.before,
        after: input.after,
        detalhes: input.detalhes as Record<string, any>
      });
    },
    [],
  );


  const isSlotBlocked = useCallback(
    (profissionalId: string, unidadeId: string, date: string, time?: string) => {
      return bloqueiosRef.current.some((b) => {
        if (date < b.dataInicio || date > b.dataFim) return false;
        const isGlobal = (!b.unidadeId || b.unidadeId === "") && (!b.profissionalId || b.profissionalId === "");
        const isUnitLevel = b.unidadeId === unidadeId && (!b.profissionalId || b.profissionalId === "");
        const isProfLevel = b.profissionalId === profissionalId;
        if (!isGlobal && !isUnitLevel && !isProfLevel) return false;
        if (b.diaInteiro || !time) return true;
        const start = b.horaInicio || "00:00";
        const end = b.horaFim || "23:59";
        return time >= start && time < end;
      });
    },
    [],
  );

  const getBlockingInfo = useCallback(
    (profissionalId: string, unidadeId: string, date: string) => {
      const b = bloqueiosRef.current.find((bloqueio) => {
        if (date < bloqueio.dataInicio || date > bloqueio.dataFim) return false;
        const isGlobal = (!bloqueio.unidadeId || bloqueio.unidadeId === "") && (!bloqueio.profissionalId || bloqueio.profissionalId === "");
        const isUnitLevel = bloqueio.unidadeId === unidadeId && (!bloqueio.profissionalId || bloqueio.profissionalId === "");
        const isProfLevel = bloqueio.profissionalId === profissionalId;
        return isGlobal || isUnitLevel || isProfLevel;
      });
      return b ? { blocked: true, type: b.tipo, label: b.titulo } : { blocked: false };
    },
    [],
  );

  const loadConfiguracoes = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("system_config").select("configuracoes").eq("id", "default").maybeSingle();
      if (data && !error) setConfiguracoes(safeConfigMerge(data.configuracoes as Record<string, unknown>));
    } catch (err) {
      console.error("Error loading configs:", err);
    }
  }, []);

  const loadUnidades = useCallback(async () => {
    try {
      let query = supabase.from("unidades" as any).select("id,nome,nome_exibicao,endereco,telefone,whatsapp,ativo");
      // Unit isolation: non-global users only see their own unit
      if (!isGlobalAdmin && userUnidadeId) query = query.eq('id', userUnidadeId);
      const { data, error } = await query;
      if (data && !error)
        setUnidades(
          data.map((u: any) => ({
            id: u.id,
            nome: u.nome,
            nomeExibicao: u.nome_exibicao || "",
            endereco: u.endereco || "",
            telefone: u.telefone || "",
            whatsapp: u.whatsapp || "",
            ativo: u.ativo,
          })),
        );
    } catch (err) {
      console.error("Error loading unidades:", err);
    }
  }, [isGlobalAdmin, userUnidadeId]);

  const loadSalas = useCallback(async () => {
    try {
      let query = supabase.from("salas" as any).select("id,nome,unidade_id,ativo");
      if (!isGlobalAdmin && userUnidadeId) query = query.eq('unidade_id', userUnidadeId);
      const { data, error } = await query;
      if (data && !error)
        setSalas(data.map((s: any) => ({ id: s.id, nome: s.nome, unidadeId: s.unidade_id, ativo: s.ativo })));
    } catch (err) {
      console.error("Error loading salas:", err);
    }
  }, [isGlobalAdmin, userUnidadeId]);

  const loadFuncionarios = useCallback(async () => {
    try {
      // ALL staff see ALL funcionarios — needed for agenda cross-unit references
      const query = supabase
        .from("funcionarios" as any)
        .select(
          "id,auth_user_id,nome,usuario,email,cpf,profissao,tipo_conselho,numero_conselho,uf_conselho,role,unidade_id,sala_id,setor,cargo,criado_em,criado_por,tempo_atendimento,pode_agendar_retorno,coren,ativo,custom_data",
        );
      const { data, error } = await query;
      if (data && !error) {
        setFuncionarios(
          data.map((f: any) => ({
            id: f.id,
            authUserId: f.auth_user_id || "",
            nome: f.nome,
            usuario: f.usuario,
            email: f.email || "",
            cpf: f.cpf || "",
            profissao: f.profissao || "",
            tipoConselho: f.tipo_conselho || "",
            numeroConselho: f.numero_conselho || "",
            ufConselho: f.uf_conselho || "",
            role: f.role,
            unidadeId: f.unidade_id || "",
            salaId: f.sala_id || "",
            setor: f.setor || "",
            cargo: f.cargo || "",
            criadoEm: f.criado_em || "",
            criadoPor: f.criado_por || "",
            tempoAtendimento: f.tempo_atendimento || 30,
            podeAgendarRetorno: f.pode_agendar_retorno || false,
            coren: f.coren || "",
            ativo: f.ativo ?? true,
            customData: f.custom_data || {},
          })),
        );
      }
    } catch (err) {
      console.error("Error loading funcionarios:", err);
    }
  }, []);

  const loadDisponibilidades = useCallback(async () => {
    try {
      let query = supabase
        .from("disponibilidades" as any)
        .select(
          "id,profissional_id,unidade_id,sala_id,data_inicio,data_fim,hora_inicio,hora_fim,vagas_por_hora,vagas_por_dia,dias_semana,duracao_consulta",
        );
      if (!isGlobalAdmin && userUnidadeId) query = query.eq('unidade_id', userUnidadeId);
      const { data, error } = await query;
      if (data && !error) {
        setDisponibilidades(
          data.map((d: any) => ({
            id: d.id,
            profissionalId: d.profissional_id,
            unidadeId: d.unidade_id,
            salaId: d.sala_id || "",
            dataInicio: d.data_inicio,
            dataFim: d.data_fim,
            horaInicio: d.hora_inicio,
            horaFim: d.hora_fim,
            vagasPorHora: d.vagas_por_hora,
            vagasPorDia: d.vagas_por_dia,
            diasSemana: d.dias_semana || [],
            duracaoConsulta: d.duracao_consulta || 30,
          })),
        );
      }
    } catch (err) {
      console.error("Error loading disponibilidades:", err);
    }
  }, [isGlobalAdmin, userUnidadeId]);

  // loadPacientes/mapPacienteRow migrados para PacientesSliceProvider (Fase 5, Passo 3.1).


  // Dates hydrated outside the fast default window must survive realtime/poll refreshes.
  const loadedExtraDatesRef = useRef<Set<string>>(new Set());
  const agendamentoColumns =
    "id,paciente_id,paciente_nome,unidade_id,sala_id,setor_id,profissional_id,profissional_nome,data,hora,status,tipo,observacoes,origem,google_event_id,sync_status,criado_em,criado_por";

  const mapAgendamentoRow = (a: any): Agendamento => ({
    id: a.id,
    pacienteId: a.paciente_id,
    pacienteNome: a.paciente_nome,
    unidadeId: a.unidade_id,
    salaId: a.sala_id || "",
    setorId: a.setor_id || "",
    profissionalId: a.profissional_id,
    profissionalNome: a.profissional_nome,
    data: a.data,
    hora: a.hora,
    status: a.status,
    tipo: a.tipo,
    observacoes: a.observacoes || "",
    origem: (a.origem || "recepcao") as any,
    agendadoPorExterno: (a as any).agendado_por_externo || "",
    googleEventId: a.google_event_id || "",
    syncStatus: a.sync_status || "",
    criadoEm: a.criado_em || "",
    criadoPor: a.criado_por || "",
    horaChegada: a.hora_chegada || "",
  });

  const dateKeysBetween = (startDate: string, endDate: string) => {
    const start = startDate <= endDate ? startDate : endDate;
    const end = startDate <= endDate ? endDate : startDate;
    const [sy, sm, sd] = start.split("-").map(Number);
    const [ey, em, ed] = end.split("-").map(Number);
    const cursor = new Date(Date.UTC(sy, sm - 1, sd));
    const last = new Date(Date.UTC(ey, em - 1, ed));
    const keys: string[] = [];
    while (cursor <= last) {
      keys.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return keys;
  };

  const loadAgendamentos = useCallback(async () => {
    try {
      // PERF: reduced window from 30 to 14 days back to keep startup fast.
      // Older appointments remain accessible through the Histórico/Auditoria pages,
      // but unfinished past appointments must stay in Agenda so atendimento can start.
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 14);
      const cutoff = localDateStr(cutoffDate);

      const terminalPastStatuses = [
        "cancelado",
        "cancelada",
        "falta",
        "faltou",
        "concluido",
        "finalizado",
        "atendido",
        "atendimento_encerrado",
        "prontuario_finalizado",
        "excluido",
        "removido",
        "inativo",
      ];

      const fetchAgendamentosPage = async (scope: "recent" | "openPast") => {
        const rows: any[] = [];
        let from = 0;
        const PAGE = 1000;
        while (true) {
          let query = supabase
            .from("agendamentos" as any)
            .select(agendamentoColumns)
            .order("data", { ascending: false })
            .range(from, from + PAGE - 1);

          query = scope === "recent"
            ? query.gte("data", cutoff)
            : query.lt("data", cutoff).not("status", "in", `(${terminalPastStatuses.join(",")})`);

          if (!isGlobalAdmin && userUnidadeId) query = query.eq('unidade_id', userUnidadeId);
          const { data, error } = await query;
          if (error || !data || data.length === 0) break;
          rows.push(...data);
          if (data.length < PAGE) break;
          from += PAGE;
        }
        return rows;
      };

      const recentRows = await fetchAgendamentosPage("recent");
      const openPastRows = await fetchAgendamentosPage("openPast");
      const allData = Array.from(new Map([...recentRows, ...openPastRows].map((row) => [row.id, row])).values());
      const mapped = allData.map(mapAgendamentoRow);
      setAgendamentos((prev) => {
        const scopeKey = userUnidadeId || "all";
        const map = new Map<string, Agendamento>();
        for (const item of prev) {
          if (loadedExtraDatesRef.current.has(`${item.data}|${scopeKey}`)) map.set(item.id, item);
        }
        for (const item of mapped) map.set(item.id, item);
        return Array.from(map.values());
      });
    } catch (err) {
      console.error("Error loading agendamentos:", err);
    }
  }, [isGlobalAdmin, userUnidadeId]);

  // On-demand loaders: fetch ALL agendamentos (any status) for past days/ranges
  // and merge into memory, preserving them across realtime polling refreshes.
  const ensureAgendamentosForRange = useCallback(async (startDate: string, endDate: string) => {
    try {
      if (!startDate || !endDate) return;
      const scopeKey = userUnidadeId || "all";
      const requestedDates = dateKeysBetween(startDate, endDate);
      const missingDates = requestedDates.filter((date) => !loadedExtraDatesRef.current.has(`${date}|${scopeKey}`));
      if (missingDates.length === 0) return;
      missingDates.forEach((date) => loadedExtraDatesRef.current.add(`${date}|${scopeKey}`));

      const queryStart = missingDates[0];
      const queryEnd = missingDates[missingDates.length - 1];
      const PAGE = 1000;
      let allData: any[] = [];
      let from = 0;
      while (true) {
        let query = supabase
          .from("agendamentos" as any)
          .select(agendamentoColumns)
          .gte("data", queryStart)
          .lte("data", queryEnd)
          .order("data", { ascending: true })
          .order("hora", { ascending: true })
          .range(from, from + PAGE - 1);
        if (!isGlobalAdmin && userUnidadeId) query = query.eq('unidade_id', userUnidadeId);
        const { data, error } = await query;
        if (error) {
          missingDates.forEach((date) => loadedExtraDatesRef.current.delete(`${date}|${scopeKey}`));
          console.error("ensureAgendamentosForRange query error:", error);
          return;
        }
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (allData.length === 0) return;

      const mapped = allData.map(mapAgendamentoRow);

      setAgendamentos((prev) => {
        const map = new Map(prev.map((p) => [p.id, p] as const));
        for (const m of mapped) map.set(m.id, m);
        return Array.from(map.values());
      });
    } catch (err) {
      console.error("ensureAgendamentosForRange error:", err);
    }
  }, [isGlobalAdmin, userUnidadeId]);

  const ensureAgendamentosForDate = useCallback(async (date: string) => {
    await ensureAgendamentosForRange(date, date);
  }, [ensureAgendamentosForRange]);

  // loadFila migrado para FilaSliceProvider (Fase 5, Passo 3.1).

  const loadBloqueios = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("bloqueios" as any)
        .select(
          "id,titulo,tipo,data_inicio,data_fim,dia_inteiro,hora_inicio,hora_fim,unidade_id,profissional_id,criado_por",
        );
      if (data && !error) {
        setBloqueios(
          data.map((b: any) => ({
            id: b.id,
            titulo: b.titulo,
            tipo: b.tipo,
            dataInicio: b.data_inicio,
            dataFim: b.data_fim,
            diaInteiro: b.dia_inteiro ?? true,
            horaInicio: b.hora_inicio || "",
            horaFim: b.hora_fim || "",
            unidadeId: b.unidade_id || "",
            profissionalId: b.profissional_id || "",
            criadoPor: b.criado_por || "",
          })),
        );
      }
    } catch (err) {
      console.error("Error loading bloqueios:", err);
    }
  }, []);

  const loadAll = useCallback(async () => {
    // PERF: critical data first (needed for navigation/permissions/unit isolation)
    await Promise.all([
      loadConfiguracoes(),
      loadUnidades(),
      loadSalas(),
      loadFuncionarios(),
    ]);
    // PERF: secondary data is fire-and-forget — UI becomes interactive immediately
    // while patient/agenda lists hydrate in background. Each loader handles its own
    // errors and updates state independently, so partial failures don't block the app.
    void Promise.all([
      loadDisponibilidades(),
      loadAgendamentos(),
      // loadFila migrado para FilaSliceProvider (Fase 5, Passo 3.1).
      loadBloqueios(),
    ]).catch((err) => console.error("Background data load failed:", err));
  }, [
    loadConfiguracoes,
    loadUnidades,
    loadSalas,
    loadFuncionarios,
    loadDisponibilidades,
    loadAgendamentos,
    // loadFila migrado para FilaSliceProvider (Fase 5, Passo 3.1).
    loadBloqueios,
  ]);

  useEffect(() => {
    // Guard: don't load until auth user is resolved to avoid loading unfiltered data
    if (!authUser) return;
    loadAll();
  }, [loadAll, authUser]);

  const upsertById = <T extends { id: string }>(prev: T[], nextItem: T) => {
    const index = prev.findIndex((item) => item.id === nextItem.id);
    if (index === -1) return [nextItem, ...prev];
    const cloned = [...prev];
    cloned[index] = nextItem;
    return cloned;
  };
  const removeById = <T extends { id: string }>(prev: T[], id: string) => prev.filter((item) => item.id !== id);

  // Handler de upsert incremental do canal `agendamentos`, exposto via useData
  // para uso do AgendamentosSliceProvider. O canal em si vive no slice.
  const applyAgendamentoRealtimeEvent = useCallback(
    (payload: RealtimeSyncPayload) => {
      if (payload.eventType === "DELETE") {
        const id = String((payload.old as any)?.id || "");
        if (id) setAgendamentos((prev) => removeById(prev, id));
        return;
      }
      const row = payload.new as any;
      if (!row?.id) return;
      // Unit isolation: skip events from other units
      if (!isGlobalAdmin && userUnidadeId && row.unidade_id && row.unidade_id !== userUnidadeId) return;
      setAgendamentos((prev) =>
        upsertById(prev, {
          id: row.id,
          pacienteId: row.paciente_id,
          pacienteNome: row.paciente_nome,
          unidadeId: row.unidade_id,
          salaId: row.sala_id || "",
          setorId: row.setor_id || "",
          profissionalId: row.profissional_id,
          profissionalNome: row.profissional_nome,
          data: row.data,
          hora: row.hora,
          status: row.status,
          tipo: row.tipo,
          observacoes: row.observacoes || "",
          origem: (row.origem || "recepcao") as any,
          agendadoPorExterno: (row as any).agendado_por_externo || "",
          googleEventId: row.google_event_id || "",
          syncStatus: row.sync_status || "",
          criadoEm: row.criado_em || "",
          criadoPor: row.criado_por || "",
          horaChegada: row.hora_chegada || "",
        }),
      );
    },
    [isGlobalAdmin, userUnidadeId],
  );


  // Canal Realtime de `fila_espera` migrado para FilaSliceProvider (Fase 5, Passo 2).

  // Canal Realtime de `pacientes` migrado para PacientesSliceProvider (Fase 5, Passo 2).



  // Canais Realtime de `disponibilidades`, `bloqueios`, `funcionarios` e
  // `system_config` migrados para OperacionalSliceProvider (Fase 5, Passo 2).

  const getTurnoInfo = useCallback(
    (profissionalId: string, unidadeId: string, date: string): TurnoInfoResult[] => {
      const dayOfWeek = isoDayOfWeek(date);
      const disps = disponibilidadesRef.current;
      const turnoDisps = disps.filter(
        (d) =>
          d.profissionalId === profissionalId &&
          d.unidadeId === unidadeId &&
          d.diasSemana.includes(dayOfWeek) &&
          date >= d.dataInicio &&
          date <= d.dataFim &&
          d.vagasPorHora === 0,
      );
      if (turnoDisps.length === 0) return [];

      const key = `${profissionalId}|${unidadeId}|${date}`;
      const dayAppointments = appointmentsByDateProfUnitRef.current.get(key) || [];

      const sortedTurnos = [...turnoDisps].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
      
      return sortedTurnos.map((td, index) => {
        // Atribui agendamentos ao turno. 
        // Se o agendamento estiver fora de qualquer turno definido, ele é atribuído ao turno mais próximo
        // para garantir que o total de "Agendados" bata com a lista da agenda.
        const turnoAppCount = dayAppointments.filter((a) => {
          const aHora = a.hora;
          // Se está dentro do intervalo do turno (inclusive o fim se for o último turno do dia)
          const isLast = index === sortedTurnos.length - 1;
          const isInRange = isLast 
            ? (aHora >= td.horaInicio) // Último turno pega tudo o que resta do dia
            : (aHora >= td.horaInicio && aHora < sortedTurnos[index + 1].horaInicio); // Pega até o início do próximo
          
          // Se for o primeiro turno, pega também qualquer coisa que esteja antes dele
          const isFirst = index === 0;
          if (isFirst && aHora < td.horaInicio) return true;

          return isInRange;
        }).length;

        const turnoQuotas = (window as any).__quotasExternasCached || [];
        const quotasTurno = turnoQuotas.filter((q: any) => 
          q.profissional_interno_id === profissionalId && 
          q.unidade_id === unidadeId &&
          q.ativo === true &&
          (q.turno?.toLowerCase() === (td.horaInicio < '12:00' ? 'manha' : td.horaInicio < '18:00' ? 'tarde' : 'noite'))
        );

        const vagasReservadasExterno = quotasTurno.reduce((acc: number, curr: any) => acc + (curr.vagas_total || 0), 0);
        const vagasOcupadasExterno = dayAppointments.filter((a) => {
          if (a.origem !== 'externo') return false;
          const aHora = a.hora;
          const isLast = index === sortedTurnos.length - 1;
          const isInRange = isLast 
            ? (aHora >= td.horaInicio)
            : (aHora >= td.horaInicio && aHora < sortedTurnos[index + 1].horaInicio);
          const isFirst = index === 0;
          if (isFirst && aHora < td.horaInicio) return true;
          return isInRange;
        }).length;
        
        const vagasOcupadasInterno = turnoAppCount - vagasOcupadasExterno;
        const vagasTotal = td.vagasPorDia || 0;
        const vagasLivresInternas = Math.max(0, vagasTotal - vagasReservadasExterno - vagasOcupadasInterno);
        const vagasLivresTotal = Math.max(0, vagasTotal - turnoAppCount);
        const periodo = td.horaInicio < '12:00' ? 'Manhã' : td.horaInicio < '18:00' ? 'Tarde' : 'Noite';

        const turnosGlobais: Array<{ id: string; nome: string }> = (window as any).__turnosGlobaisCached || [];
        const matchedGlobal = td.salaId ? turnosGlobais.find((t) => t.id === td.salaId) : undefined;
        const rawCustomName = td.salaId && !matchedGlobal ? String(td.salaId).trim() : '';
        const descricao = rawCustomName && rawCustomName.toLowerCase() !== periodo.toLowerCase()
          ? rawCustomName
          : (matchedGlobal && matchedGlobal.nome && matchedGlobal.nome.toLowerCase() !== periodo.toLowerCase()
              ? matchedGlobal.nome
              : undefined);

        return {
          turnoId: td.salaId || td.id,
          nome: periodo,
          descricao,
          periodo,
          horaInicio: td.horaInicio,
          horaFim: td.horaFim,
          vagasTotal,
          vagasOcupadas: turnoAppCount,
          vagasReservadasExterno,
          vagasOcupadasExterno,
          vagasOcupadasInterno,
          vagasLivresInternas,
          vagasLivresTotal,
          lotado: turnoAppCount >= vagasTotal,
          excedido: turnoAppCount > vagasTotal,
        };
      });
    },
    [],
  );

  const addAgendamento = useCallback(
    async (ag: Agendamento) => {
      const userRole = authUser?.role || "";
      const rolesToBlock = ["recepcao", "gestao", "coordenador"];
      
      if (rolesToBlock.includes(userRole)) {
        const turnos = getTurnoInfo(ag.profissionalId, ag.unidadeId, ag.data);
        const meuTurno = turnos.find(t => ag.hora >= t.horaInicio && ag.hora < t.horaFim);
        
        if (meuTurno) {
          if (meuTurno.vagasLivresInternas <= 0) {
            toast.error(`Limite de vagas excedido para este turno (${meuTurno.nome}).`);
            throw new Error("Limite de vagas excedido.");
          }
        }
      }

      const STATUS_INICIAIS_PERMITIDOS = ["confirmado", "pendente", "agendado"];
      const statusInicial = STATUS_INICIAIS_PERMITIDOS.includes(ag.status as string)
        ? ag.status
        : "confirmado";
      
      const { error } = await supabase.from("agendamentos" as any).insert({
        id: ag.id,
        paciente_id: ag.pacienteId,
        paciente_nome: ag.pacienteNome,
        unidade_id: ag.unidadeId,
        sala_id: ag.salaId,
        setor_id: ag.setorId,
        profissional_id: ag.profissionalId,
        profissional_nome: ag.profissionalNome,
        data: ag.data,
        hora: ag.hora,
        status: statusInicial,
        tipo: ag.tipo,
        observacoes: ag.observacoes,
        origem: ag.origem,
        google_event_id: ag.googleEventId || "",
        sync_status: ag.syncStatus || "pendente",
        criado_por: ag.criadoPor || "",
        prioridade_perfil: "normal",
      } as any);

      if (!error) {
        setAgendamentos((prev) => [...prev, { ...ag, status: statusInicial as any }]);
        await logAction({
          acao: "criar",
          entidade: "agendamento",
          entidadeId: ag.id,
          unidadeId: ag.unidadeId,
          detalhes: { data: ag.data, hora: ag.hora, profissionalId: ag.profissionalId },
        });
        invalidateCache(queryKeys.agendamentos.all, queryKeys.fila.all);
      } else {
        console.error("Error adding agendamento:", error);
        throw error;
      }
    },
    [logAction, invalidateCache, authUser?.role, getTurnoInfo],
  );

  const updateAgendamento = useCallback(
    async (id: string, data: Partial<Agendamento>) => {
      const dbData: any = {};
      if (data.status !== undefined) dbData.status = data.status;
      if (data.hora !== undefined) dbData.hora = data.hora;
      if (data.data !== undefined) dbData.data = data.data;
      if (data.tipo !== undefined) dbData.tipo = data.tipo;
      if (data.observacoes !== undefined) dbData.observacoes = data.observacoes;
      if (data.googleEventId !== undefined) dbData.google_event_id = data.googleEventId;
      if (data.syncStatus !== undefined) dbData.sync_status = data.syncStatus;
      if (data.salaId !== undefined) dbData.sala_id = data.salaId;
      if (data.horaChegada !== undefined) dbData.hora_chegada = data.horaChegada;
      if (data.profissionalId !== undefined) dbData.profissional_id = data.profissionalId;
      if (data.profissionalNome !== undefined) dbData.profissional_nome = data.profissionalNome;
      if (data.status === "remarcado" || data.data !== undefined || data.hora !== undefined) {
        dbData.lembrete_24h_enviado_em = null;
        dbData.lembrete_proximo_enviado_em = null;
      }

      // Validação de vaga se estiver remarcando (mudando data/hora) ou trocando profissional
      const needsQuotaCheck = (data.data !== undefined || data.hora !== undefined || data.profissionalId !== undefined);
      if (needsQuotaCheck) {
        const agOriginal = agendamentosRef.current.find(a => a.id === id);
        if (agOriginal) {
          const newData = data.data || agOriginal.data;
          const newHora = data.hora || agOriginal.hora;
          const newProfId = data.profissionalId || agOriginal.profissionalId;
          const newUnidId = agOriginal.unidadeId;

          const userRole = authUser?.role || "";
          const rolesToBlock = ["recepcao", "gestao", "coordenador"];
          
          if (rolesToBlock.includes(userRole)) {
            const turnos = getTurnoInfo(newProfId, newUnidId, newData);
            const meuTurno = turnos.find(t => newHora >= t.horaInicio && newHora < t.horaFim);
            
            if (meuTurno) {
              const isSameTurno = agOriginal.data === newData && 
                                agOriginal.profissionalId === newProfId &&
                                agOriginal.hora >= meuTurno.horaInicio && 
                                agOriginal.hora < meuTurno.horaFim;

              // Se mudou de turno ou prof, precisa de vaga livre.
              // Se manteve o mesmo turno, a vaga dele já está ocupada, então não bloqueamos.
              if (!isSameTurno && meuTurno.vagasLivresInternas <= 0) {
                toast.error(`Limite de vagas excedido para este turno (${meuTurno.nome}).`);
                throw new Error("Limite de vagas excedido.");
              }
            }
          }
        }
      }

      const { error } = await supabase
        .from("agendamentos" as any)
        .update(dbData)
        .eq("id", id);
      if (!error) {
        setAgendamentos((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)));
        await logAction({
          acao: "editar",
          entidade: "agendamento",
          entidadeId: id,
          detalhes: data as Record<string, unknown>,
        });
        invalidateCache(queryKeys.agendamentos.all);
      } else {
        console.error("Error updating agendamento:", error);
        toast.error("Erro ao atualizar agendamento");
        throw error;
      }
    },
    [logAction, invalidateCache, authUser?.role, getTurnoInfo],
  );

  const cancelAgendamento = useCallback(
    async (id: string): Promise<FilaEspera[]> => {
      const ag = agendamentosRef.current.find((a) => a.id === id);
      if (!ag) return [];
      const { error } = await supabase
        .from("agendamentos" as any)
        .update({ status: "cancelado" })
        .eq("id", id);
      if (error) {
        console.error("Error cancelling agendamento:", error);
        throw new Error("Erro ao cancelar agendamento.");
      }
      setAgendamentos((prev) => prev.map((a) => (a.id === id ? { ...a, status: "cancelado" as const } : a)));
      invalidateCache(queryKeys.agendamentos.all, queryKeys.fila.all);
      // Fase 5: filtragem da fila reproduzida inline (checkFilaForSlot migrou
      // para FilaSliceProvider). Lemos o snapshot module-level exposto pelo bridge.
      const filaSnapshot = getFilaSnapshot();
      return filaSnapshot
        .filter(
          (f) =>
            f.status === "aguardando" &&
            f.unidadeId === ag.unidadeId &&
            (!f.profissionalId || f.profissionalId === ag.profissionalId),
        )
        .sort((a, b) => {
          const aRank = priorityRank[a.prioridade] ?? 99;
          const bRank = priorityRank[b.prioridade] ?? 99;
          if (aRank !== bRank) return aRank - bRank;
          return a.horaChegada.localeCompare(b.horaChegada);
        });
    },
    [invalidateCache],
  );

  /**
   * DELETE real do agendamento — usado por "Desmarcar" (libera o slot).
   * Diferente de cancelAgendamento (que mantém histórico com status "cancelado").
   */
  const deleteAgendamento = useCallback(
    async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("agendamentos" as any)
        .delete()
        .eq("id", id);
      if (error) {
        console.error("Error deleting agendamento:", error);
        throw new Error("Erro ao excluir agendamento.");
      }
      setAgendamentos((prev) => prev.filter((a) => a.id !== id));
      invalidateCache(queryKeys.agendamentos.all, queryKeys.fila.all);
    },
    [invalidateCache],
  );

  // addPaciente/updatePaciente migrados para PacientesSliceProvider (Fase 5, Passo 3.1).


  // addToFila/updateFila/removeFromFila migrados para FilaSliceProvider (Fase 5, Passo 3.1).

  const addAtendimento = useCallback(
    async (a: Atendimento) => {
      try {
        const { error } = await supabase.from("atendimentos" as any).insert({
          id: a.id,
          agendamento_id: a.agendamentoId,
          paciente_id: a.pacienteId,
          paciente_nome: a.pacienteNome,
          profissional_id: a.profissionalId,
          profissional_nome: a.profissionalNome,
          unidade_id: a.unidadeId,
          sala_id: a.salaId || "",
          setor: a.setor || "",
          procedimento: a.procedimento,
          observacoes: a.observacoes || "",
          data: a.data,
          hora_inicio: a.horaInicio,
          hora_fim: a.horaFim || "",
          status: a.status,
        } as any);
        if (error) console.error("Error persisting atendimento:", error);
      } catch (err) {
        console.error("Error adding atendimento:", err);
      }
      setAtendimentos((prev) => [...prev, a]);
      invalidateCache(queryKeys.atendimentos.all);
    },
    [invalidateCache],
  );

  const updateAtendimento = useCallback(
    (id: string, data: Partial<Atendimento>) => {
      setAtendimentos((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)));
      invalidateCache(queryKeys.atendimentos.all);
    },
    [invalidateCache],
  );

  const addUnidade = useCallback(
    async (u: Unidade) => {
      const { error } = await supabase.from("unidades" as any).insert({
        id: u.id,
        nome: u.nome,
        nome_exibicao: u.nomeExibicao || '',
        endereco: u.endereco,
        telefone: u.telefone,
        whatsapp: u.whatsapp,
        ativo: u.ativo,
      } as any);
      if (!error) {
        invalidateCache(queryKeys.unidades.all);
        setUnidades((prev) => [...prev, u]);
      } else console.error("Error adding unidade:", error);
    },
    [invalidateCache],
  );

  const updateUnidade = useCallback(
    async (id: string, data: Partial<Unidade>) => {
      const dbData: any = {};
      if (data.nome !== undefined) dbData.nome = data.nome;
      if (data.nomeExibicao !== undefined) dbData.nome_exibicao = data.nomeExibicao;
      if (data.endereco !== undefined) dbData.endereco = data.endereco;
      if (data.telefone !== undefined) dbData.telefone = data.telefone;
      if (data.whatsapp !== undefined) dbData.whatsapp = data.whatsapp;
      if (data.ativo !== undefined) dbData.ativo = data.ativo;
      const { error } = await supabase
        .from("unidades" as any)
        .update(dbData)
        .eq("id", id);
      if (!error) {
        invalidateCache(queryKeys.unidades.all);
        setUnidades((prev) => prev.map((u) => (u.id === id ? { ...u, ...data } : u)));
      } else console.error("Error updating unidade:", error);
    },
    [invalidateCache],
  );

  const deleteUnidade = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("unidades" as any)
        .delete()
        .eq("id", id);
      if (!error) {
        invalidateCache(queryKeys.unidades.all);
        setUnidades((prev) => prev.filter((u) => u.id !== id));
      } else console.error("Error deleting unidade:", error);
    },
    [invalidateCache],
  );

  const addSala = useCallback(
    async (s: Sala) => {
      const { error } = await supabase
        .from("salas" as any)
        .insert({ id: s.id, nome: s.nome, unidade_id: s.unidadeId, ativo: s.ativo } as any);
      if (!error) {
        invalidateCache(queryKeys.salas.all);
        setSalas((prev) => [...prev, s]);
      } else console.error("Error adding sala:", error);
    },
    [invalidateCache],
  );

  const updateSala = useCallback(
    async (id: string, data: Partial<Sala>) => {
      const dbData: any = {};
      if (data.nome !== undefined) dbData.nome = data.nome;
      if (data.unidadeId !== undefined) dbData.unidade_id = data.unidadeId;
      if (data.ativo !== undefined) dbData.ativo = data.ativo;
      const { error } = await supabase
        .from("salas" as any)
        .update(dbData)
        .eq("id", id);
      if (!error) {
        invalidateCache(queryKeys.salas.all);
        setSalas((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
      } else console.error("Error updating sala:", error);
    },
    [invalidateCache],
  );

  const deleteSala = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("salas" as any)
        .delete()
        .eq("id", id);
      if (!error) {
        invalidateCache(queryKeys.salas.all);
        setSalas((prev) => prev.filter((s) => s.id !== id));
      } else console.error("Error deleting sala:", error);
    },
    [invalidateCache],
  );

  const addFuncionario = useCallback(
    async (u: User) => {
      const { error } = await supabase.from("funcionarios" as any).insert({
        id: u.id,
        auth_user_id: u.authUserId,
        nome: u.nome,
        usuario: u.usuario,
        email: u.email,
        cpf: u.cpf,
        profissao: u.profissao,
        tipo_conselho: u.tipoConselho || "",
        numero_conselho: u.numeroConselho || "",
        uf_conselho: u.ufConselho || "",
        role: u.role,
        unidade_id: u.unidadeId,
        sala_id: u.salaId || "",
        setor: u.setor || "",
        cargo: u.cargo || "",
        criado_por: u.criadoPor || "",
        tempo_atendimento: u.tempoAtendimento,
        pode_agendar_retorno: u.podeAgendarRetorno || false,
        coren: u.coren || "",
        ativo: u.ativo,
      } as any);
      if (!error) {
        invalidateCache(queryKeys.funcionarios.all);
        setFuncionarios((prev) => [...prev, u]);
      } else console.error("Error adding funcionario:", error);
    },
    [invalidateCache],
  );

  const updateFuncionario = useCallback(
    async (id: string, data: Partial<User>) => {
      const dbData: any = {};
      if (data.nome !== undefined) dbData.nome = data.nome;
      if (data.usuario !== undefined) dbData.usuario = data.usuario;
      if (data.email !== undefined) dbData.email = data.email;
      if (data.cpf !== undefined) dbData.cpf = data.cpf;
      if (data.profissao !== undefined) dbData.profissao = data.profissao;
      if (data.tipoConselho !== undefined) dbData.tipo_conselho = data.tipoConselho;
      if (data.numeroConselho !== undefined) dbData.numero_conselho = data.numeroConselho;
      if (data.ufConselho !== undefined) dbData.uf_conselho = data.ufConselho;
      if (data.role !== undefined) dbData.role = data.role;
      if (data.unidadeId !== undefined) dbData.unidade_id = data.unidadeId;
      if (data.salaId !== undefined) dbData.sala_id = data.salaId;
      if (data.setor !== undefined) dbData.setor = data.setor;
      if (data.cargo !== undefined) dbData.cargo = data.cargo;
      if (data.tempoAtendimento !== undefined) dbData.tempo_atendimento = data.tempoAtendimento;
      if (data.ativo !== undefined) dbData.ativo = data.ativo;
      if (data.podeAgendarRetorno !== undefined) dbData.pode_agendar_retorno = data.podeAgendarRetorno;
      if (data.coren !== undefined) dbData.coren = data.coren;
      const { error } = await supabase
        .from("funcionarios" as any)
        .update(dbData)
        .eq("id", id);
      if (!error) {
        invalidateCache(queryKeys.funcionarios.all);
        setFuncionarios((prev) => prev.map((f) => (f.id === id ? { ...f, ...data } : f)));
      } else console.error("Error updating funcionario:", error);
    },
    [invalidateCache],
  );

  const deleteFuncionario = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("funcionarios" as any)
        .delete()
        .eq("id", id);
      if (!error) {
        invalidateCache(queryKeys.funcionarios.all);
        setFuncionarios((prev) => prev.filter((f) => f.id !== id));
      } else console.error("Error deleting funcionario:", error);
    },
    [invalidateCache],
  );

  const addDisponibilidade = useCallback(
    async (d: Disponibilidade) => {
      const { error } = await supabase.from("disponibilidades" as any).insert({
        id: d.id,
        profissional_id: d.profissionalId,
        unidade_id: d.unidadeId,
        sala_id: d.salaId,
        data_inicio: d.dataInicio,
        data_fim: d.dataFim,
        hora_inicio: d.horaInicio,
        hora_fim: d.horaFim,
        vagas_por_hora: d.vagasPorHora,
        vagas_por_dia: d.vagasPorDia,
        dias_semana: d.diasSemana,
        duracao_consulta: d.duracaoConsulta,
      } as any);
      if (!error) {
        invalidateCache(queryKeys.disponibilidades.all);
        setDisponibilidades((prev) => [...prev, d]);
      } else console.error("Error adding disponibilidade:", error);
    },
    [invalidateCache],
  );

  const updateDisponibilidade = useCallback(
    async (id: string, data: Partial<Disponibilidade>) => {
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
      if (data.duracaoConsulta !== undefined) dbData.duracao_consulta = data.duracaoConsulta;
      const { error } = await supabase
        .from("disponibilidades" as any)
        .update(dbData)
        .eq("id", id);
      if (!error) {
        invalidateCache(queryKeys.disponibilidades.all);
        setDisponibilidades((prev) => prev.map((disp) => (disp.id === id ? { ...disp, ...data } : disp)));
      } else console.error("Error updating disponibilidade:", error);
    },
    [invalidateCache],
  );

  const deleteDisponibilidade = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("disponibilidades" as any)
        .delete()
        .eq("id", id);
      if (!error) {
        invalidateCache(queryKeys.disponibilidades.all);
        setDisponibilidades((prev) => prev.filter((d) => d.id !== id));
      } else console.error("Error deleting disponibilidade:", error);
    },
    [invalidateCache],
  );

  const addBloqueio = useCallback(
    async (b: Omit<BloqueioAgenda, "id">) => {
      const { data: inserted, error } = await supabase.from("bloqueios" as any).insert({
        titulo: b.titulo,
        tipo: b.tipo,
        data_inicio: b.dataInicio,
        data_fim: b.dataFim,
        dia_inteiro: b.diaInteiro,
        hora_inicio: b.horaInicio || '',
        hora_fim: b.horaFim || '',
        unidade_id: b.unidadeId || '',
        profissional_id: b.profissionalId || '',
        criado_por: b.criadoPor,
      } as any).select().single();
      if (!error && inserted) {
        const id = (inserted as any).id;
        invalidateCache(queryKeys.bloqueios.all);
        setBloqueios((prev) => [{ ...b, id }, ...prev]);
      } else {
        console.error("Error adding bloqueio:", error);
        throw error;
      }
    },
    [invalidateCache],
  );

  const updateBloqueio = useCallback(
    async (id: string, data: Partial<BloqueioAgenda>) => {
      const dbData: any = {};
      if (data.titulo !== undefined) dbData.titulo = data.titulo;
      if (data.tipo !== undefined) dbData.tipo = data.tipo;
      if (data.dataInicio !== undefined) dbData.data_inicio = data.dataInicio;
      if (data.dataFim !== undefined) dbData.data_fim = data.dataFim;
      if (data.diaInteiro !== undefined) dbData.dia_inteiro = data.diaInteiro;
      if (data.horaInicio !== undefined) dbData.hora_inicio = data.horaInicio;
      if (data.horaFim !== undefined) dbData.hora_fim = data.horaFim;
      if (data.unidadeId !== undefined) dbData.unidade_id = data.unidadeId;
      if (data.profissionalId !== undefined) dbData.profissional_id = data.profissionalId;
      const { error } = await supabase
        .from("bloqueios" as any)
        .update(dbData)
        .eq("id", id);
      if (!error) {
        invalidateCache(queryKeys.bloqueios.all);
        setBloqueios((prev) => prev.map((b) => (b.id === id ? { ...b, ...data } : b)));
      } else console.error("Error updating bloqueio:", error);
    },
    [invalidateCache],
  );

  const deleteBloqueio = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("bloqueios" as any)
        .delete()
        .eq("id", id);
      if (!error) {
        invalidateCache(queryKeys.bloqueios.all);
        setBloqueios((prev) => prev.filter((b) => b.id !== id));
      } else console.error("Error deleting bloqueio:", error);
    },
    [invalidateCache],
  );

  const updateConfiguracoes = useCallback(
    async (data: Partial<Configuracoes>) => {
      const newConfigs = safeConfigMerge({ ...configuracoesRef.current, ...data });
      const { error } = await supabase
        .from("system_config" as any)
        .update({ configuracoes: newConfigs as any })
        .eq("id", "default");
      if (!error) {
        setConfiguracoes(newConfigs);
        invalidateCache(queryKeys.configuracoes.all);
      } else {
        await supabase.from("system_config" as any).insert({
          id: "default",
          configuracoes: newConfigs as any,
        } as any);
        setConfiguracoes(newConfigs);
      }
    },
    [invalidateCache],
  );

  // checkFilaForSlot/encaixarDaFila migrados para FilaSliceProvider (Fase 5, Passo 3.1).

  const appointmentCountsByKey = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of agendamentos) {
      if (statusOcupaVaga(a.status)) {
        const key = `${a.profissionalId}|${a.unidadeId}|${a.data}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return counts;
  }, [agendamentos]);

  const appointmentsByDateProfUnit = useMemo(() => {
    const map = new Map<string, typeof agendamentos>();
    for (const a of agendamentos) {
      if (statusOcupaVaga(a.status)) {
        const key = `${a.profissionalId}|${a.unidadeId}|${a.data}`;
        const arr = map.get(key);
        if (arr) arr.push(a);
        else map.set(key, [a]);
      }
    }
    return map;
  }, [agendamentos]);

  const appointmentCountsByKeyRef = useRef(appointmentCountsByKey);
  appointmentCountsByKeyRef.current = appointmentCountsByKey;
  const appointmentsByDateProfUnitRef = useRef(appointmentsByDateProfUnit);
  appointmentsByDateProfUnitRef.current = appointmentsByDateProfUnit;

  const getAvailableSlots = useCallback(
    (profissionalId: string, unidadeId: string, date: string, isPublic = false): string[] => {
      const todayStr = todayLocalStr();
      if (date < todayStr) return [];

      const dayOfWeek = isoDayOfWeek(date);
      const disps = disponibilidadesRef.current;
      // Find ALL matching disponibilidades for this prof/unit/date
      const allDisps = disps.filter(
        (d) =>
          d.profissionalId === profissionalId &&
          d.unidadeId === unidadeId &&
          d.diasSemana.includes(dayOfWeek) &&
          date >= d.dataInicio &&
          date <= d.dataFim,
      );
      if (allDisps.length === 0) return [];

      const key = `${profissionalId}|${unidadeId}|${date}`;
      const dayAppointments = appointmentsByDateProfUnitRef.current.get(key) || [];

      const turnoDisps = allDisps.filter((d) => d.vagasPorHora === 0);
      const horaDisps = allDisps.filter((d) => d.vagasPorHora > 0);

      const slots: string[] = [];
      const ehHoje = date === todayStr;
      const limiteMinutos = ehHoje ? nowMinutesInBrazil() + 30 : -1;

      // --- TURNO MODE: generate one slot per turno that still has capacity ---
      for (const td of turnoDisps) {
        const turnoStart = td.horaInicio;
        const turnoEnd = td.horaFim;
        // Count appointments whose hora falls within this turno range
        const turnoAppCount = dayAppointments.filter(
          (a) => a.hora >= turnoStart && a.hora < turnoEnd,
        ).length;
        if (turnoAppCount >= td.vagasPorDia) continue;

        // Parse start time for today check
        const sh = parseInt(turnoStart.split(":")[0]);
        const sm = parseInt(turnoStart.split(":")[1] || "0");
        if (ehHoje && sh * 60 + sm <= limiteMinutos) continue;

        const blocked = isSlotBlocked(profissionalId, unidadeId, date, turnoStart);
        if (!blocked && !slots.includes(turnoStart)) {
          slots.push(turnoStart);
        }
      }

      // --- HORA MODE: existing per-hour/per-slot logic ---
      if (horaDisps.length > 0) {
        const disp = horaDisps[0];
        if (dayAppointments.length < disp.vagasPorDia) {
          const hourCounts = new Map<string, number>();
          const slotCounts = new Map<string, number>();
          for (const a of dayAppointments) {
            const hKey = a.hora.substring(0, 3);
            hourCounts.set(hKey, (hourCounts.get(hKey) || 0) + 1);
            slotCounts.set(a.hora, (slotCounts.get(a.hora) || 0) + 1);
          }

          const funcs = funcionariosRef.current;
          const prof = funcs.find((f) => f.id === profissionalId);
          const intervalMinutes = Math.max(15, prof?.tempoAtendimento || 30);

          const startHour = parseInt(disp.horaInicio.split(":")[0]);
          const startMin = parseInt(disp.horaInicio.split(":")[1] || "0");
          const endHour = parseInt(disp.horaFim.split(":")[0]);
          const endMin = parseInt(disp.horaFim.split(":")[1] || "0");

          let h = startHour;
          let m = startMin;
          while (h < endHour || (h === endHour && m < endMin)) {
            const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
            if (ehHoje && h * 60 + m <= limiteMinutos) {
              m += intervalMinutes;
              while (m >= 60) { m -= 60; h++; }
              continue;
            }

            const hourStr = `${String(h).padStart(2, "0")}:`;
            const hourCount = hourCounts.get(hourStr) || 0;
            const slotCount = slotCounts.get(timeStr) || 0;
            const blocked = isSlotBlocked(profissionalId, unidadeId, date, timeStr);
            if (!blocked && hourCount < disp.vagasPorHora) {
              if (isPublic) {
                if (slotCount === 0) slots.push(timeStr);
              } else if (slotCount < disp.vagasPorHora) {
                slots.push(timeStr);
              }
            }

            m += intervalMinutes;
            while (m >= 60) { m -= 60; h++; }
          }
        }
      }

      return slots.sort();
    },
    [isSlotBlocked],
  );


  const getAvailableDatesInternal = useCallback(
    (profissionalId: string, unidadeId: string): string[] => {
      const disps = disponibilidadesRef.current;
      const filteredDisps = disps.filter((d) => d.profissionalId === profissionalId && d.unidadeId === unidadeId);
      if (filteredDisps.length === 0) return [];

      const dates: string[] = [];
      const todayStr = todayLocalStr();

      // Pre-compute total vagasPorDia per date (aggregating turno records)
      const processedDates = new Set<string>();

      for (const disp of filteredDisps) {
        let currentDate = disp.dataInicio > todayStr ? disp.dataInicio : todayStr;
        while (currentDate <= disp.dataFim) {
          const dayOfWeek = isoDayOfWeek(currentDate);
          if (disp.diasSemana.includes(dayOfWeek) && !processedDates.has(currentDate)) {
            const key = `${profissionalId}|${unidadeId}|${currentDate}`;
            const dayCount = appointmentCountsByKeyRef.current.get(key) || 0;
            // Sum vagasPorDia across ALL matching disps for this date
            const dateDisps = filteredDisps.filter(
              (d) => d.diasSemana.includes(dayOfWeek) && currentDate >= d.dataInicio && currentDate <= d.dataFim,
            );
            const totalVagas = dateDisps.reduce((sum, d) => sum + d.vagasPorDia, 0);
            if (dayCount < totalVagas && !isSlotBlocked(profissionalId, unidadeId, currentDate)) {
              dates.push(currentDate);
            }
            processedDates.add(currentDate);
          }
          currentDate = addDaysToDateStr(currentDate, 1);
        }
      }

      return dates.sort();
    },
    [isSlotBlocked],
  );

  const getAvailableDates = useCallback(
    (profissionalId: string, unidadeId: string, isPublic = false): string[] => {
      return getAvailableDatesInternal(profissionalId, unidadeId).filter(
        (d) => getAvailableSlots(profissionalId, unidadeId, d, isPublic).length > 0,
      );
    },
    [getAvailableDatesInternal, getAvailableSlots],
  );

  const getDayInfoMap = useCallback(
    (profissionalId: string, unidadeId: string, isPublic = false): Record<string, any> => {
      const map: Record<string, any> = {};
      const disps = disponibilidadesRef.current;
      const filteredDisps = disps.filter((d) => d.profissionalId === profissionalId && d.unidadeId === unidadeId);
      if (filteredDisps.length === 0) return map;

      let currentDate = todayLocalStr();
      for (let i = 0; i < 90; i++) {
        const dayOfWeek = isoDayOfWeek(currentDate);
        const hasDisp = filteredDisps.some(
          (d) => d.diasSemana.includes(dayOfWeek) && currentDate >= d.dataInicio && currentDate <= d.dataFim,
        );
        if (hasDisp) {
          const blockInfo = getBlockingInfo(profissionalId, unidadeId, currentDate);
          if (blockInfo.blocked) {
            const isHoliday = blockInfo.type === "feriado";
            map[currentDate] = {
              dateStr: currentDate,
              status: isHoliday ? "holiday" : "blocked",
              label: blockInfo.label || (isHoliday ? "Feriado" : "Bloqueado"),
            };
          } else {
            const slots = getAvailableSlots(profissionalId, unidadeId, currentDate, isPublic);
            if (slots.length === 0) {
              const key = `${profissionalId}|${unidadeId}|${currentDate}`;
              const dayCount = appointmentCountsByKeyRef.current.get(key) || 0;
              if (dayCount > 0) {
                map[currentDate] = { dateStr: currentDate, status: "full", label: "Lotado — sem vagas restantes" };
              }
            }
          }
        }
        currentDate = addDaysToDateStr(currentDate, 1);
      }
      return map;
    },
    [getAvailableSlots, getBlockingInfo],
  );

  const getNextAvailableSlots = useCallback(
    (profissionalId: string, unidadeId: string, fromDate: string, limit = 5, isPublic = false): string[] => {
      const suggestions: string[] = [];
      const dates = getAvailableDates(profissionalId, unidadeId, isPublic).filter((d) => d >= fromDate);
      for (const d of dates) {
        const slots = getAvailableSlots(profissionalId, unidadeId, d, isPublic);
        for (const s of slots) {
          suggestions.push(`${d} ${s}`);
          if (suggestions.length >= limit) return suggestions;
        }
      }
      return suggestions;
    },
    [getAvailableDates, getAvailableSlots],
  );

  const refreshFuncionarios = useCallback(async () => {
    await loadFuncionarios();
  }, [loadFuncionarios]);
  const refreshDisponibilidades = useCallback(async () => {
    await loadDisponibilidades();
  }, [loadDisponibilidades]);
  const refreshAgendamentos = useCallback(async () => {
    await loadAgendamentos();
  }, [loadAgendamentos]);
  // refreshFila migrado para FilaSliceProvider (Fase 5, Passo 3.1).
  const refreshBloqueios = useCallback(async () => {
    await loadBloqueios();
  }, [loadBloqueios]);

  const refreshConfiguracoes = useCallback(async () => {
    await loadConfiguracoes();
  }, [loadConfiguracoes]);

  const stableFunctions = useRef({
    addAgendamento,
    updateAgendamento,
    cancelAgendamento,
    deleteAgendamento,
    // addToFila/updateFila/removeFromFila migrados para FilaSliceProvider.
    addAtendimento,
    updateAtendimento,
    addUnidade,
    updateUnidade,
    deleteUnidade,
    addSala,
    updateSala,
    deleteSala,
    addFuncionario,
    updateFuncionario,
    deleteFuncionario,
    addDisponibilidade,
    updateDisponibilidade,
    deleteDisponibilidade,
    addBloqueio,
    updateBloqueio,
    deleteBloqueio,
    getAvailableSlots,
    getTurnoInfo,
    getAvailableDates,
    getNextAvailableSlots,
    getBlockingInfo,
    getDayInfoMap,
    updateConfiguracoes,
    // checkFilaForSlot/encaixarDaFila migrados para FilaSliceProvider.
    refreshFuncionarios,
    refreshDisponibilidades,
    refreshAgendamentos,
    applyAgendamentoRealtimeEvent,
    ensureAgendamentosForDate,
    ensureAgendamentosForRange,

    // refreshFila migrado para FilaSliceProvider.
    refreshBloqueios,
    refreshConfiguracoes,
    resolveScopedUnidadeId,
    logAction,
  });
  stableFunctions.current = {
    addAgendamento,
    updateAgendamento,
    cancelAgendamento,
    deleteAgendamento,
    // addToFila/updateFila/removeFromFila migrados para FilaSliceProvider.
    addAtendimento,
    updateAtendimento,
    addUnidade,
    updateUnidade,
    deleteUnidade,
    addSala,
    updateSala,
    deleteSala,
    addFuncionario,
    updateFuncionario,
    deleteFuncionario,
    addDisponibilidade,
    updateDisponibilidade,
    deleteDisponibilidade,
    addBloqueio,
    updateBloqueio,
    deleteBloqueio,
    getAvailableSlots,
    getTurnoInfo,
    getAvailableDates,
    getNextAvailableSlots,
    getBlockingInfo,
    getDayInfoMap,
    updateConfiguracoes,
    // checkFilaForSlot/encaixarDaFila migrados para FilaSliceProvider.
    refreshFuncionarios,
    refreshDisponibilidades,
    refreshAgendamentos,
    applyAgendamentoRealtimeEvent,
    ensureAgendamentosForDate,
    ensureAgendamentosForRange,
    // refreshFila migrado para FilaSliceProvider.
    refreshBloqueios,
    refreshConfiguracoes,
    resolveScopedUnidadeId,
    logAction,
  };

  const contextValue = useMemo(
    (): DataContextType => ({
      agendamentos,
      // fila migrado para FilaSliceProvider.
      atendimentos,
      unidades,
      salas,
      setores,
      funcionarios,
      disponibilidades,
      bloqueios,
      configuracoes,
      ...stableFunctions.current,
    }),
    [
      agendamentos,
      // fila migrado para FilaSliceProvider.
      atendimentos,
      unidades,
      salas,
      setores,
      funcionarios,
      disponibilidades,
      bloqueios,
      configuracoes,
    ],
  );

  return <DataContext.Provider value={contextValue}>{children}</DataContext.Provider>;
};

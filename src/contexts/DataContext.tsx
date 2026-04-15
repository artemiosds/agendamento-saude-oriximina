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
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { addDaysToDateStr, isoDayOfWeek, localDateStr, nowMinutesInBrazil, todayLocalStr } from "@/lib/utils";

export interface TurnoInfoResult {
  turnoId: string;
  nome: string;
  horaInicio: string;
  horaFim: string;
  vagasTotal: number;
  vagasOcupadas: number;
  vagasLivres: number;
  lotado: boolean;
}

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
  checkFilaForSlot: (profissionalId: string, unidadeId: string, data: string, hora: string) => FilaEspera[];
  encaixarDaFila: (filaId: string, agendamento: Omit<Agendamento, "id" | "criadoEm">) => void;
  refreshFuncionarios: () => Promise<void>;
  refreshDisponibilidades: () => Promise<void>;
  refreshAgendamentos: () => Promise<void>;
  refreshPacientes: () => Promise<void>;
  refreshFila: () => Promise<void>;
  refreshBloqueios: () => Promise<void>;
  logAction: (input: {
    acao: string;
    entidade: string;
    entidadeId?: string;
    detalhes?: Record<string, unknown>;
    user?: User | null;
    unidadeId?: string;
    modulo?: string;
    status?: string;
    erro?: string;
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

const statusOcupaVaga = (status: string) => !["cancelado", "falta"].includes(status);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
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

  const agendamentosRef = useRef(agendamentos);
  agendamentosRef.current = agendamentos;
  const disponibilidadesRef = useRef(disponibilidades);
  disponibilidadesRef.current = disponibilidades;
  const bloqueiosRef = useRef(bloqueios);
  bloqueiosRef.current = bloqueios;
  const filaRef = useRef(fila);
  filaRef.current = fila;
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

  const logAction = useCallback(
    (input: {
      acao: string;
      entidade: string;
      entidadeId?: string;
      detalhes?: Record<string, unknown>;
      user?: User | null;
      unidadeId?: string;
      modulo?: string;
      status?: string;
      erro?: string;
    }) => {
      const actor = input.user;
      const dispositivo = getDeviceInfo();
      const detalhes = {
        ...(input.detalhes || {}),
        usuario_cpf: actor?.cpf || "",
        dispositivo,
      };
      // Fire-and-forget: don't block the UI waiting for IP + insert
      getPublicIp().then((ip) => {
        supabase.from("action_logs").insert({
          user_id: actor?.id || "",
          user_nome: actor?.nome || "sistema",
          role: actor?.role || "sistema",
          unidade_id: input.unidadeId || actor?.unidadeId || "",
          acao: input.acao,
          entidade: input.entidade,
          entidade_id: input.entidadeId || "",
          detalhes,
          modulo: input.modulo || input.entidade || "",
          status: input.status || "sucesso",
          erro: input.erro || "",
          ip,
        }).then(null, (err: any) => console.error("Error writing action log:", err));
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
      const { data, error } = await supabase.from("unidades" as any).select("id,nome,endereco,telefone,whatsapp,ativo");
      if (data && !error)
        setUnidades(
          data.map((u: any) => ({
            id: u.id,
            nome: u.nome,
            endereco: u.endereco || "",
            telefone: u.telefone || "",
            whatsapp: u.whatsapp || "",
            ativo: u.ativo,
          })),
        );
    } catch (err) {
      console.error("Error loading unidades:", err);
    }
  }, []);

  const loadSalas = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("salas" as any).select("id,nome,unidade_id,ativo");
      if (data && !error)
        setSalas(data.map((s: any) => ({ id: s.id, nome: s.nome, unidadeId: s.unidade_id, ativo: s.ativo })));
    } catch (err) {
      console.error("Error loading salas:", err);
    }
  }, []);

  const loadFuncionarios = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("funcionarios" as any)
        .select(
          "id,auth_user_id,nome,usuario,email,cpf,profissao,tipo_conselho,numero_conselho,uf_conselho,role,unidade_id,sala_id,setor,cargo,criado_em,criado_por,tempo_atendimento,pode_agendar_retorno,coren,ativo",
        );
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
          })),
        );
      }
    } catch (err) {
      console.error("Error loading funcionarios:", err);
    }
  }, []);

  const loadDisponibilidades = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("disponibilidades" as any)
        .select(
          "id,profissional_id,unidade_id,sala_id,data_inicio,data_fim,hora_inicio,hora_fim,vagas_por_hora,vagas_por_dia,dias_semana,duracao_consulta",
        );
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
  }, []);

  const loadPacientes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("pacientes" as any)
        .select(
          "id,nome,cpf,cns,nome_mae,telefone,data_nascimento,email,endereco,observacoes,descricao_clinica,cid,criado_em,is_gestante,is_pne,is_autista",
        );
      if (data && !error) {
        setPacientes(
          data.map((p: any) => ({
            id: p.id,
            nome: p.nome,
            cpf: p.cpf || "",
            cns: p.cns || "",
            nomeMae: p.nome_mae || "",
            telefone: p.telefone || "",
            dataNascimento: p.data_nascimento || "",
            email: p.email || "",
            endereco: p.endereco || "",
            observacoes: p.observacoes || "",
            descricaoClinica: p.descricao_clinica || "",
            cid: p.cid || "",
            criadoEm: p.criado_em || "",
            isGestante: !!p.is_gestante,
            isPne: !!p.is_pne,
            isAutista: !!p.is_autista,
          })),
        );
      }
    } catch (err) {
      console.error("Error loading pacientes:", err);
    }
  }, []);

  const loadAgendamentos = useCallback(async () => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);
      const cutoff = localDateStr(cutoffDate);

      let allData: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("agendamentos" as any)
          .select(
            "id,paciente_id,paciente_nome,unidade_id,sala_id,setor_id,profissional_id,profissional_nome,data,hora,status,tipo,observacoes,origem,google_event_id,sync_status,criado_em,criado_por",
          )
          .gte("data", cutoff)
          .order("data", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      setAgendamentos(
        allData.map((a: any) => ({
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
        })),
      );
    } catch (err) {
      console.error("Error loading agendamentos:", err);
    }
  }, []);

  const loadFila = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("fila_espera" as any)
        .select(
          "id,paciente_id,paciente_nome,unidade_id,profissional_id,setor,prioridade,prioridade_perfil,status,posicao,hora_chegada,hora_chamada,observacoes,descricao_clinica,cid,criado_por,criado_em,data_solicitacao_original,origem_cadastro,especialidade_destino",
        )
        .order("criado_em", { ascending: true });
      if (data && !error) {
        setFila(
          (data as any[]).map((f: any) => ({
            id: f.id,
            pacienteId: f.paciente_id,
            pacienteNome: f.paciente_nome,
            unidadeId: f.unidade_id,
            profissionalId: f.profissional_id || "",
            setor: f.setor || "",
            prioridade: (f.prioridade_perfil && f.prioridade_perfil !== "normal"
              ? f.prioridade_perfil
              : f.prioridade) as FilaEspera["prioridade"],
            status: f.status as FilaEspera["status"],
            posicao: f.posicao,
            horaChegada: f.hora_chegada,
            horaChamada: f.hora_chamada || "",
            observacoes: f.observacoes || "",
            descricaoClinica: f.descricao_clinica || "",
            cid: f.cid || "",
            criadoPor: f.criado_por || "",
            criadoEm: f.criado_em || "",
            dataSolicitacaoOriginal: f.data_solicitacao_original || "",
            origemCadastro: f.origem_cadastro || "normal",
            especialidadeDestino: f.especialidade_destino || "",
          })),
        );
      }
    } catch (err) {
      console.error("Error loading fila:", err);
    }
  }, []);

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
    // Critical data first (needed for navigation/permissions)
    await Promise.all([
      loadConfiguracoes(),
      loadUnidades(),
      loadSalas(),
      loadFuncionarios(),
    ]);
    // Secondary data (can load after UI is interactive)
    await Promise.all([
      loadDisponibilidades(),
      loadPacientes(),
      loadAgendamentos(),
      loadFila(),
      loadBloqueios(),
    ]);
  }, [
    loadConfiguracoes,
    loadUnidades,
    loadSalas,
    loadFuncionarios,
    loadDisponibilidades,
    loadPacientes,
    loadAgendamentos,
    loadFila,
    loadBloqueios,
  ]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const upsertById = <T extends { id: string }>(prev: T[], nextItem: T) => {
    const index = prev.findIndex((item) => item.id === nextItem.id);
    if (index === -1) return [nextItem, ...prev];
    const cloned = [...prev];
    cloned[index] = nextItem;
    return cloned;
  };
  const removeById = <T extends { id: string }>(prev: T[], id: string) => prev.filter((item) => item.id !== id);

  useRealtimeSync({
    table: "agendamentos",
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") {
        const id = String((payload.old as any)?.id || "");
        if (id) setAgendamentos((prev) => removeById(prev, id));
        return;
      }
      const row = payload.new as any;
      if (!row?.id) return;
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
    poll: loadAgendamentos,
  });

  useRealtimeSync({
    table: "fila_espera",
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") {
        const id = String((payload.old as any)?.id || "");
        if (id) setFila((prev) => removeById(prev, id));
        return;
      }
      const row = payload.new as any;
      if (!row?.id) return;
      setFila((prev) =>
        upsertById(prev, {
          id: row.id,
          pacienteId: row.paciente_id,
          pacienteNome: row.paciente_nome,
          unidadeId: row.unidade_id,
          profissionalId: row.profissional_id || "",
          setor: row.setor || "",
          prioridade: (row.prioridade_perfil && row.prioridade_perfil !== "normal"
            ? row.prioridade_perfil
            : row.prioridade) as FilaEspera["prioridade"],
          status: row.status as FilaEspera["status"],
          posicao: row.posicao,
          horaChegada: row.hora_chegada,
          horaChamada: row.hora_chamada || "",
          observacoes: row.observacoes || "",
          descricaoClinica: row.descricao_clinica || "",
          cid: row.cid || "",
          criadoPor: row.criado_por || "",
          criadoEm: row.criado_em || "",
          dataSolicitacaoOriginal: row.data_solicitacao_original || "",
          origemCadastro: row.origem_cadastro || "normal",
          especialidadeDestino: row.especialidade_destino || "",
        }),
      );
    },
    poll: loadFila,
  });

  useRealtimeSync({
    table: "pacientes",
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") {
        const id = String((payload.old as any)?.id || "");
        if (id) setPacientes((prev) => removeById(prev, id));
        return;
      }
      const row = payload.new as any;
      if (!row?.id) return;
      setPacientes((prev) =>
        upsertById(prev, {
          id: row.id,
          nome: row.nome,
          cpf: row.cpf || "",
          cns: row.cns || "",
          nomeMae: row.nome_mae || "",
          telefone: row.telefone || "",
          dataNascimento: row.data_nascimento || "",
          email: row.email || "",
          endereco: row.endereco || "",
          observacoes: row.observacoes || "",
          descricaoClinica: row.descricao_clinica || "",
          cid: row.cid || "",
          criadoEm: row.criado_em || "",
          isGestante: !!row.is_gestante,
          isPne: !!row.is_pne,
          isAutista: !!row.is_autista,
        }),
      );
    },
    poll: loadPacientes,
  });

  useRealtimeSync({
    table: "disponibilidades",
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") {
        const id = String((payload.old as any)?.id || "");
        if (id) setDisponibilidades((prev) => removeById(prev, id));
        return;
      }
      const row = payload.new as any;
      if (!row?.id) return;
      setDisponibilidades((prev) =>
        upsertById(prev, {
          id: row.id,
          profissionalId: row.profissional_id,
          unidadeId: row.unidade_id,
          salaId: row.sala_id || "",
          dataInicio: row.data_inicio,
          dataFim: row.data_fim,
          horaInicio: row.hora_inicio,
          horaFim: row.hora_fim,
          vagasPorHora: row.vagas_por_hora,
          vagasPorDia: row.vagas_por_dia,
          diasSemana: row.dias_semana || [],
          duracaoConsulta: row.duracao_consulta || 30,
        }),
      );
    },
    poll: loadDisponibilidades,
  });

  useRealtimeSync({
    table: "bloqueios",
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") {
        const id = String((payload.old as any)?.id || "");
        if (id) setBloqueios((prev) => removeById(prev, id));
        return;
      }
      const row = payload.new as any;
      if (!row?.id) return;
      setBloqueios((prev) =>
        upsertById(prev, {
          id: row.id,
          titulo: row.titulo,
          tipo: row.tipo,
          dataInicio: row.data_inicio,
          dataFim: row.data_fim,
          diaInteiro: row.dia_inteiro ?? true,
          horaInicio: row.hora_inicio || "",
          horaFim: row.hora_fim || "",
          unidadeId: row.unidade_id || "",
          profissionalId: row.profissional_id || "",
          criadoPor: row.criado_por || "",
        }),
      );
    },
    poll: loadBloqueios,
  });

  useRealtimeSync({
    table: "funcionarios",
    debounceMs: 1000,
    pollIntervalMs: 120000,
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") {
        const id = String((payload.old as any)?.id || "");
        if (id) setFuncionarios((prev) => removeById(prev, id));
        return;
      }
      const row = payload.new as any;
      if (!row?.id) return;
      setFuncionarios((prev) =>
        upsertById(prev, {
          id: row.id,
          authUserId: row.auth_user_id || "",
          nome: row.nome,
          usuario: row.usuario,
          email: row.email || "",
          cpf: row.cpf || "",
          profissao: row.profissao || "",
          tipoConselho: row.tipo_conselho || "",
          numeroConselho: row.numero_conselho || "",
          ufConselho: row.uf_conselho || "",
          role: row.role,
          unidadeId: row.unidade_id || "",
          salaId: row.sala_id || "",
          setor: row.setor || "",
          cargo: row.cargo || "",
          criadoEm: row.criado_em || "",
          criadoPor: row.criado_por || "",
          tempoAtendimento: row.tempo_atendimento || 30,
          podeAgendarRetorno: row.pode_agendar_retorno || false,
          coren: row.coren || "",
          ativo: row.ativo ?? true,
        }),
      );
    },
    poll: loadFuncionarios,
  });

  // Realtime sync for system_config — reflects Master changes to all users instantly
  useRealtimeSync({
    table: "system_config",
    debounceMs: 500,
    onEvent: (payload) => {
      const row = payload.new as any;
      if (row?.configuracoes) {
        setConfiguracoes(safeConfigMerge(row.configuracoes as Record<string, unknown>));
      }
    },
    poll: loadConfiguracoes,
    pollIntervalMs: 60000,
  });

  const addAgendamento = useCallback(
    async (ag: Agendamento) => {
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
        status: ag.status,
        tipo: ag.tipo,
        observacoes: ag.observacoes,
        origem: ag.origem,
        google_event_id: ag.googleEventId || "",
        sync_status: ag.syncStatus || "pendente",
        criado_por: ag.criadoPor || "",
        prioridade_perfil: "normal",
      } as any);
      if (!error) {
        setAgendamentos((prev) => [...prev, ag]);
        await logAction({
          acao: "criar",
          entidade: "agendamento",
          entidadeId: ag.id,
          unidadeId: ag.unidadeId,
          detalhes: { data: ag.data, hora: ag.hora, profissionalId: ag.profissionalId },
        });
        invalidateCache(queryKeys.agendamentos.all, queryKeys.fila.all);
      } else console.error("Error adding agendamento:", error);
    },
    [logAction, invalidateCache],
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
      }
    },
    [logAction, invalidateCache],
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
      return checkFilaForSlot(ag.profissionalId, ag.unidadeId, ag.data, ag.hora);
    },
    [invalidateCache],
  );

  const addPaciente = useCallback(
    async (p: Paciente) => {
      const { error } = await supabase.from("pacientes" as any).insert({
        id: p.id,
        nome: p.nome,
        cpf: p.cpf,
        cns: p.cns,
        nome_mae: p.nomeMae,
        telefone: p.telefone,
        data_nascimento: p.dataNascimento,
        email: p.email,
        endereco: p.endereco,
        observacoes: p.observacoes,
        descricao_clinica: p.descricaoClinica,
        cid: p.cid,
        criado_em: p.criadoEm || new Date().toISOString(),
      } as any);
      if (!error) {
        setPacientes((prev) => [p, ...prev]);
        invalidateCache(queryKeys.pacientes.all);
      } else console.error("Error adding paciente:", error);
    },
    [invalidateCache],
  );

  const updatePaciente = useCallback(
    async (id: string, data: Partial<Paciente>) => {
      const dbData: any = {};
      if (data.nome !== undefined) dbData.nome = data.nome;
      if (data.cpf !== undefined) dbData.cpf = data.cpf;
      if (data.cns !== undefined) dbData.cns = data.cns;
      if (data.nomeMae !== undefined) dbData.nome_mae = data.nomeMae;
      if (data.telefone !== undefined) dbData.telefone = data.telefone;
      if (data.dataNascimento !== undefined) dbData.data_nascimento = data.dataNascimento;
      if (data.email !== undefined) dbData.email = data.email;
      if (data.endereco !== undefined) dbData.endereco = data.endereco;
      if (data.observacoes !== undefined) dbData.observacoes = data.observacoes;
      if (data.descricaoClinica !== undefined) dbData.descricao_clinica = data.descricaoClinica;
      if (data.cid !== undefined) dbData.cid = data.cid;
      const { error } = await supabase
        .from("pacientes" as any)
        .update(dbData)
        .eq("id", id);
      if (!error) {
        setPacientes((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
        invalidateCache(queryKeys.pacientes.all);
        // Also invalidate agendamentos/fila so components using resolvePaciente re-render
        invalidateCache(queryKeys.agendamentos.all);
        invalidateCache(queryKeys.fila.all);
      } else console.error("Error updating paciente:", error);
    },
    [invalidateCache],
  );

  const addToFila = useCallback(
    async (f: FilaEspera) => {
      const { error } = await supabase.from("fila_espera" as any).insert({
        id: f.id,
        paciente_id: f.pacienteId,
        paciente_nome: f.pacienteNome,
        unidade_id: f.unidadeId,
        profissional_id: f.profissionalId || "",
        setor: f.setor,
        prioridade: ["normal", "alta", "urgente"].includes(f.prioridade) ? f.prioridade : "normal",
        prioridade_perfil: f.prioridade,
        status: f.status,
        posicao: f.posicao,
        hora_chegada: f.horaChegada,
        observacoes: f.observacoes || "",
        descricao_clinica: f.descricaoClinica || "",
        cid: f.cid || "",
        criado_por: f.criadoPor || "sistema",
        data_solicitacao_original: f.dataSolicitacaoOriginal || "",
        origem_cadastro: f.origemCadastro || "normal",
        especialidade_destino: f.especialidadeDestino || "",
      } as any);
      if (!error) {
        setFila((prev) => [...prev, f]);
        await logAction({
          acao: "criar",
          entidade: "fila_espera",
          entidadeId: f.id,
          unidadeId: f.unidadeId,
          detalhes: { prioridade: f.prioridade, origemCadastro: f.origemCadastro },
        });
        invalidateCache(queryKeys.fila.all);
      } else console.error("Error adding to fila:", error);
    },
    [logAction, invalidateCache],
  );

  const updateFila = useCallback(
    async (id: string, data: Partial<FilaEspera>) => {
      const dbData: any = {};
      if (data.status !== undefined) dbData.status = data.status;
      if (data.prioridade !== undefined) {
        dbData.prioridade = ["normal", "alta", "urgente"].includes(data.prioridade) ? data.prioridade : "normal";
        dbData.prioridade_perfil = data.prioridade;
      }
      if (data.profissionalId !== undefined) dbData.profissional_id = data.profissionalId;
      if (data.unidadeId !== undefined) dbData.unidade_id = data.unidadeId;
      if (data.observacoes !== undefined) dbData.observacoes = data.observacoes;
      if (data.descricaoClinica !== undefined) dbData.descricao_clinica = data.descricaoClinica;
      if (data.cid !== undefined) dbData.cid = data.cid;
      if (data.horaChegada !== undefined) dbData.hora_chegada = data.horaChegada;
      if (data.horaChamada !== undefined) dbData.hora_chamada = data.horaChamada;
      if (data.pacienteNome !== undefined) dbData.paciente_nome = data.pacienteNome;
      if (data.pacienteId !== undefined) dbData.paciente_id = data.pacienteId;
      if (data.setor !== undefined) dbData.setor = data.setor;
      const { error } = await supabase
        .from("fila_espera" as any)
        .update(dbData)
        .eq("id", id);
      if (!error) {
        setFila((prev) => prev.map((f) => (f.id === id ? { ...f, ...data } : f)));
        await logAction({
          acao: "editar",
          entidade: "fila_espera",
          entidadeId: id,
          detalhes: data as Record<string, unknown>,
        });
        invalidateCache(queryKeys.fila.all);
      } else console.error("Error updating fila:", error);
    },
    [logAction, invalidateCache],
  );

  const removeFromFila = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("fila_espera" as any)
        .delete()
        .eq("id", id);
      if (!error) {
        setFila((prev) => prev.filter((f) => f.id !== id));
        await logAction({ acao: "excluir", entidade: "fila_espera", entidadeId: id });
        invalidateCache(queryKeys.fila.all);
      } else console.error("Error removing from fila:", error);
    },
    [logAction, invalidateCache],
  );

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

  const checkFilaForSlot = useCallback(
    (profissionalId: string, unidadeId: string, _data: string, _hora: string): FilaEspera[] => {
      return filaRef.current
        .filter(
          (f) =>
            f.status === "aguardando" &&
            f.unidadeId === unidadeId &&
            (!f.profissionalId || f.profissionalId === profissionalId),
        )
        .sort((a, b) => {
          const aRank = priorityRank[a.prioridade] ?? 99;
          const bRank = priorityRank[b.prioridade] ?? 99;
          if (aRank !== bRank) return aRank - bRank;
          return a.horaChegada.localeCompare(b.horaChegada);
        });
    },
    [],
  );

  const encaixarDaFila = useCallback(
    async (filaId: string, agData: Omit<Agendamento, "id" | "criadoEm">) => {
      const newAg: Agendamento = { ...agData, id: `ag${Date.now()}`, criadoEm: new Date().toISOString() };
      await addAgendamento(newAg);
      await updateFila(filaId, { status: "encaixado" as const });
    },
    [addAgendamento, updateFila],
  );

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

      return turnoDisps.map((td) => {
        const count = dayAppointments.filter(
          (a) => a.hora >= td.horaInicio && a.hora < td.horaFim,
        ).length;
        const nome = td.horaInicio < '12:00' ? 'Manhã' : td.horaInicio < '18:00' ? 'Tarde' : 'Noite';
        return {
          turnoId: td.salaId || td.id, // salaId stores turno ID in turno mode
          nome,
          horaInicio: td.horaInicio,
          horaFim: td.horaFim,
          vagasTotal: td.vagasPorDia,
          vagasOcupadas: count,
          vagasLivres: Math.max(0, td.vagasPorDia - count),
          lotado: count >= td.vagasPorDia,
        };
      }).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
    },
    [],
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
  const refreshPacientes = useCallback(async () => {
    await loadPacientes();
  }, [loadPacientes]);
  const refreshFila = useCallback(async () => {
    await loadFila();
  }, [loadFila]);
  const refreshBloqueios = useCallback(async () => {
    await loadBloqueios();
  }, [loadBloqueios]);

  const stableFunctions = useRef({
    addAgendamento,
    updateAgendamento,
    cancelAgendamento,
    addPaciente,
    updatePaciente,
    addToFila,
    updateFila,
    removeFromFila,
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
    checkFilaForSlot,
    encaixarDaFila,
    refreshFuncionarios,
    refreshDisponibilidades,
    refreshAgendamentos,
    refreshPacientes,
    refreshFila,
    refreshBloqueios,
    logAction,
  });
  stableFunctions.current = {
    addAgendamento,
    updateAgendamento,
    cancelAgendamento,
    addPaciente,
    updatePaciente,
    addToFila,
    updateFila,
    removeFromFila,
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
    checkFilaForSlot,
    encaixarDaFila,
    refreshFuncionarios,
    refreshDisponibilidades,
    refreshAgendamentos,
    refreshPacientes,
    refreshFila,
    refreshBloqueios,
    logAction,
  };

  const contextValue = useMemo(
    (): DataContextType => ({
      agendamentos,
      pacientes,
      fila,
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
      pacientes,
      fila,
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

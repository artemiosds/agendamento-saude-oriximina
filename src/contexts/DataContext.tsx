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
  getDayInfoMap: (
    profissionalId: string,
    unidadeId: string,
    isPublic?: boolean,
  ) => Record<string, import("@/components/CalendarioDisponibilidade").DayInfo>;
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
  }) => Promise<void>;
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

  const logAction = useCallback(
    async (input: {
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
      try {
        const actor = input.user;
        const ip = await getPublicIp();
        const dispositivo = getDeviceInfo();
        const detalhes = {
          ...(input.detalhes || {}),
          usuario_cpf: actor?.cpf || "",
          dispositivo,
        };
        await supabase.from("action_logs" as any).insert({
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
        } as any);
      } catch (err) {
        console.error("Error writing action log:", err);
      }
    },
    [],
  );

  const isSlotBlocked = useCallback(
    (profissionalId: string, unidadeId: string, date: string, time?: string) => {
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
        const start = b.horaInicio || "00:00";
        const end = b.horaFim || "23:59";
        return time >= start && time < end;
      });
    },
    [bloqueios],
  );

  const getBlockingInfo = useCallback(
    (profissionalId: string, unidadeId: string, date: string): { blocked: boolean; type?: string; label?: string } => {
      const dateRef = new Date(`${date}T00:00:00`).getTime();
      for (const b of bloqueios) {
        const ini = new Date(`${b.dataInicio}T00:00:00`).getTime();
        const fim = new Date(`${b.dataFim}T00:00:00`).getTime();
        if (dateRef < ini || dateRef > fim) continue;

        const isGlobal = (!b.unidadeId || b.unidadeId === "") && (!b.profissionalId || b.profissionalId === "");
        const isUnitLevel = b.unidadeId === unidadeId && (!b.profissionalId || b.profissionalId === "");
        const isProfLevel = b.profissionalId === profissionalId;

        if (!isGlobal && !isUnitLevel && !isProfLevel) continue;
        if (!b.diaInteiro) continue;

        return { blocked: true, type: b.tipo, label: `${b.titulo || b.tipo}` };
      }
      return { blocked: false };
    },
    [bloqueios],
  );

  const loadConfiguracoes = useCallback(async () => {
    try {
      const { data, error } = (await supabase
        .from("system_config" as any)
        .select("configuracoes")
        .eq("id", "default")
        .maybeSingle()) as any;
      if (!error && data?.configuracoes) {
        setConfiguracoes(safeConfigMerge(data.configuracoes));
      }
    } catch (err) {
      console.error("Error loading config:", err);
    }
  }, []);

  const loadBloqueios = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("bloqueios" as any)
        .select("*")
        .order("data_inicio", { ascending: true });
      if (data && !error) {
        setBloqueios(
          (data as any[]).map((b) => ({
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

  const loadUnidades = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("unidades" as any).select("*");
      if (data && !error) {
        const mapped: Unidade[] = (data as any[]).map((u: any) => ({
          id: u.id,
          nome: u.nome,
          endereco: u.endereco || "",
          telefone: u.telefone || "",
          whatsapp: u.whatsapp || "",
          ativo: u.ativo ?? true,
        }));
        setUnidades(mapped);
      }
    } catch (err) {
      console.error("Error loading unidades:", err);
    }
  }, []);

  const loadSalas = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("salas" as any).select("*");
      if (data && !error) {
        const mapped: Sala[] = (data as any[]).map((s: any) => ({
          id: s.id,
          nome: s.nome,
          unidadeId: s.unidade_id || "",
          ativo: s.ativo ?? true,
        }));
        setSalas(mapped);
      }
    } catch (err) {
      console.error("Error loading salas:", err);
    }
  }, []);

  const loadFuncionarios = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("funcionarios").select("*").eq("ativo", true);
      if (data && !error) {
        const mapped: User[] = data.map((f: any) => ({
          id: f.id,
          authUserId: f.auth_user_id || "",
          nome: f.nome,
          usuario: f.usuario,
          email: f.email,
          setor: f.setor || "",
          unidadeId: f.unidade_id || "",
          salaId: f.sala_id || "",
          cargo: f.cargo || "",
          role: f.role as User["role"],
          ativo: f.ativo ?? true,
          criadoEm: f.criado_em || "",
          criadoPor: f.criado_por || "",
          tempoAtendimento: f.tempo_atendimento || 30,
          profissao: f.profissao || "",
          tipoConselho: f.tipo_conselho || "",
          numeroConselho: f.numero_conselho || "",
          ufConselho: f.uf_conselho || "",
          podeAgendarRetorno: f.pode_agendar_retorno ?? false,
          coren: f.coren || "",
        }));
        setFuncionarios(mapped);
      }
    } catch (err) {
      console.error("Error loading funcionarios:", err);
    }
  }, []);

  const loadDisponibilidades = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("disponibilidades" as any).select("*");
      if (data && !error) {
        const mapped: Disponibilidade[] = (data as any[]).map((d: any) => ({
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
        }));
        setDisponibilidades(mapped);
      }
    } catch (err) {
      console.error("Error loading disponibilidades:", err);
    }
  }, []);

  const loadPacientes = useCallback(async () => {
    try {
      let allData: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("pacientes" as any)
          .select("*")
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      const data = allData;
      if (data.length > 0) {
        const mapped: Paciente[] = (data as any[]).map((p: any) => ({
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
        }));
        setPacientes(mapped);
      }
    } catch (err) {
      console.error("Error loading pacientes:", err);
    }
  }, []);

  const loadAgendamentos = useCallback(async () => {
    try {
      let allData: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("agendamentos" as any)
          .select("*")
          .order("data", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      const data = allData;
      if (data.length > 0) {
        const mapped: Agendamento[] = (data as any[]).map((a: any) => ({
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
          origem: a.origem || "recepcao",
          googleEventId: a.google_event_id || "",
          syncStatus: a.sync_status || "",
          criadoEm: a.criado_em || "",
          criadoPor: a.criado_por || "",
        }));
        setAgendamentos(mapped);
      }
    } catch (err) {
      console.error("Error loading agendamentos:", err);
    }
  }, []);

  const loadFila = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("fila_espera" as any)
        .select("*")
        .order("criado_em", { ascending: true });
      if (data && !error) {
        const mapped: FilaEspera[] = (data as any[]).map((f: any) => ({
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
        }));
        setFila(mapped);
      }
    } catch (err) {
      console.error("Error loading fila:", err);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([
      loadConfiguracoes(),
      loadUnidades(),
      loadSalas(),
      loadFuncionarios(),
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

  const dbUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const handler = () => {
      if (dbUpdateTimerRef.current) clearTimeout(dbUpdateTimerRef.current);
      dbUpdateTimerRef.current = setTimeout(() => {
        loadAll();
      }, 500);
    };
    window.addEventListener("db_update", handler);
    return () => {
      window.removeEventListener("db_update", handler);
      if (dbUpdateTimerRef.current) clearTimeout(dbUpdateTimerRef.current);
    };
  }, [loadAll]);

  const emitDbUpdate = useCallback(() => {
    try {
      window.dispatchEvent(new Event("db_update"));
    } catch {
      /* SSR safety */
    }
  }, []);

  const logActionAndSync = useCallback(
    async (input: Parameters<typeof logAction>[0]) => {
      await logActionAndSync(input);
      emitDbUpdate();
    },
    [logAction, emitDbUpdate],
  );

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
        if (!id) return;
        setAgendamentos((prev) => removeById(prev, id));
        return;
      }
      const row = payload.new as any;
      if (!row?.id) return;
      const mapped: Agendamento = {
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
        origem: row.origem || "recepcao",
        googleEventId: row.google_event_id || "",
        syncStatus: row.sync_status || "",
        criadoEm: row.criado_em || "",
        criadoPor: row.criado_por || "",
      };
      setAgendamentos((prev) => upsertById(prev, mapped));
    },
    poll: loadAgendamentos,
  });

  useRealtimeSync({
    table: "fila_espera",
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") {
        const id = String((payload.old as any)?.id || "");
        if (!id) return;
        setFila((prev) => removeById(prev, id));
        return;
      }
      const row = payload.new as any;
      if (!row?.id) return;
      const mapped: FilaEspera = {
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
      };
      setFila((prev) => upsertById(prev, mapped));
    },
    poll: loadFila,
  });

  useRealtimeSync({
    table: "pacientes",
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") {
        const id = String((payload.old as any)?.id || "");
        if (!id) return;
        setPacientes((prev) => removeById(prev, id));
        return;
      }
      const row = payload.new as any;
      if (!row?.id) return;
      const mapped: Paciente = {
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
      };
      setPacientes((prev) => upsertById(prev, mapped));
    },
    poll: loadPacientes,
  });

  useRealtimeSync({
    table: "disponibilidades",
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") {
        const id = String((payload.old as any)?.id || "");
        if (!id) return;
        setDisponibilidades((prev) => removeById(prev, id));
        return;
      }
      const row = payload.new as any;
      if (!row?.id) return;
      const mapped: Disponibilidade = {
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
      };
      setDisponibilidades((prev) => upsertById(prev, mapped));
    },
    poll: loadDisponibilidades,
  });

  useRealtimeSync({
    table: "bloqueios",
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") {
        const id = String((payload.old as any)?.id || "");
        if (!id) return;
        setBloqueios((prev) => removeById(prev, id));
        return;
      }
      const row = payload.new as any;
      if (!row?.id) return;
      const mapped: BloqueioAgenda = {
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
      };
      setBloqueios((prev) => upsertById(prev, mapped));
    },
    poll: loadBloqueios,
  });

  useRealtimeSync({
    table: "funcionarios",
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") {
        const id = String((payload.old as any)?.id || "");
        if (!id) return;
        setFuncionarios((prev) => removeById(prev, id));
        return;
      }
      const row = payload.new as any;
      if (!row?.id) return;
      const mapped: User = {
        id: row.id,
        authUserId: row.auth_user_id || "",
        nome: row.nome,
        usuario: row.usuario,
        email: row.email,
        setor: row.setor || "",
        unidadeId: row.unidade_id || "",
        salaId: row.sala_id || "",
        cargo: row.cargo || "",
        role: row.role as User["role"],
        ativo: row.ativo ?? true,
        criadoEm: row.criado_em || "",
        criadoPor: row.criado_por || "",
        tempoAtendimento: row.tempo_atendimento || 30,
        profissao: row.profissao || "",
        tipoConselho: row.tipo_conselho || "",
        numeroConselho: row.numero_conselho || "",
        ufConselho: row.uf_conselho || "",
        podeAgendarRetorno: row.pode_agendar_retorno ?? false,
        coren: row.coren || "",
      };
      setFuncionarios((prev) => upsertById(prev, mapped));
    },
    poll: loadFuncionarios,
  });

  useRealtimeSync({
    table: "unidades",
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") {
        const id = String((payload.old as any)?.id || "");
        if (!id) return;
        setUnidades((prev) => removeById(prev, id));
        return;
      }
      const row = payload.new as any;
      if (!row?.id) return;
      const mapped: Unidade = {
        id: row.id,
        nome: row.nome,
        endereco: row.endereco || "",
        telefone: row.telefone || "",
        whatsapp: row.whatsapp || "",
        ativo: row.ativo ?? true,
      };
      setUnidades((prev) => upsertById(prev, mapped));
    },
    poll: loadUnidades,
  });

  useRealtimeSync({
    table: "salas",
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") {
        const id = String((payload.old as any)?.id || "");
        if (!id) return;
        setSalas((prev) => removeById(prev, id));
        return;
      }
      const row = payload.new as any;
      if (!row?.id) return;
      const mapped: Sala = {
        id: row.id,
        nome: row.nome,
        unidadeId: row.unidade_id,
        ativo: row.ativo ?? true,
      };
      setSalas((prev) => upsertById(prev, mapped));
    },
    poll: loadSalas,
  });

  useRealtimeSync({
    table: "atendimentos",
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") {
        const id = String((payload.old as any)?.id || "");
        if (!id) return;
        setAtendimentos((prev) => removeById(prev, id));
        return;
      }
      const row = payload.new as any;
      if (!row?.id) return;
      const mapped: Atendimento = {
        id: row.id,
        agendamentoId: row.agendamento_id || "",
        pacienteId: row.paciente_id,
        pacienteNome: row.paciente_nome,
        profissionalId: row.profissional_id,
        profissionalNome: row.profissional_nome,
        unidadeId: row.unidade_id || "",
        salaId: row.sala_id || "",
        setor: row.setor || "",
        procedimento: row.procedimento || "",
        observacoes: row.observacoes || "",
        data: row.data,
        horaInicio: row.hora_inicio || "",
        horaFim: row.hora_fim || "",
        duracaoMinutos: row.duracao_minutos || null,
        status: row.status || "em_atendimento",
      } as Atendimento;
      setAtendimentos((prev) => upsertById(prev, mapped));
    },
  });

  const refreshFuncionarios = loadFuncionarios;
  const refreshDisponibilidades = loadDisponibilidades;
  const refreshAgendamentos = loadAgendamentos;
  const refreshPacientes = loadPacientes;
  const refreshFila = loadFila;
  const refreshBloqueios = loadBloqueios;

  // ✅ CORREÇÃO: addPaciente agora aceita Paciente completo (com id)
  const addPaciente = useCallback(
    async (p: Paciente) => {
      const { error } = await supabase.from("pacientes" as any).insert({
        id: p.id,
        nome: p.nome,
        cpf: p.cpf,
        cns: p.cns || "",
        nome_mae: p.nomeMae || "",
        telefone: p.telefone,
        data_nascimento: p.dataNascimento,
        email: p.email,
        endereco: p.endereco,
        observacoes: p.observacoes,
        descricao_clinica: p.descricaoClinica || "",
        cid: p.cid || "",
      } as any);
      if (!error) {
        setPacientes((prev) => [...prev, p]);
        await logActionAndSync({ acao: "criar", entidade: "paciente", entidadeId: p.id, detalhes: { nome: p.nome } });
      } else console.error("Error adding paciente:", error);
    },
    [logAction],
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
        await logActionAndSync({
          acao: "editar",
          entidade: "paciente",
          entidadeId: id,
          detalhes: data as Record<string, unknown>,
        });
      } else console.error("Error updating paciente:", error);
    },
    [logAction],
  );

  const addAgendamento = useCallback(
    async (ag: Agendamento) => {
      try {
        const { data: slotCheck } = (await supabase.rpc("check_slot_availability", {
          p_profissional_id: ag.profissionalId,
          p_unidade_id: ag.unidadeId,
          p_data: ag.data,
          p_hora: ag.hora,
        } as any)) as any;
        if (slotCheck && slotCheck.available === false) {
          const reasons: Record<string, string> = {
            no_availability: "Não há disponibilidade configurada para este horário.",
            day_full: "As vagas do dia estão esgotadas.",
            hour_full: "As vagas deste horário estão esgotadas.",
          };
          const msg = reasons[slotCheck.reason] || "Horário indisponível.";
          console.error("Slot unavailable:", slotCheck.reason);
          throw new Error(msg);
        }
      } catch (err: any) {
        if (err?.message && !err.message.includes("check_slot_availability")) {
          throw err;
        }
        console.warn("Slot check skipped:", err);
      }

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
        await logActionAndSync({
          acao: "criar",
          entidade: "agendamento",
          entidadeId: ag.id,
          unidadeId: ag.unidadeId,
          detalhes: { data: ag.data, hora: ag.hora, profissionalId: ag.profissionalId },
        });
      } else console.error("Error adding agendamento:", error);
    },
    [logAction],
  );

  const updateAgendamento = useCallback(
    async (id: string, data: Partial<Agendamento>) => {
      const dbData: any = {};
      if (data.status !== undefined) dbData.status = data.status;
      if (data.hora !== undefined) dbData.hora = data.hora;
      if (data.data !== undefined) dbData.data = data.data;
      if (data.observacoes !== undefined) dbData.observacoes = data.observacoes;
      if (data.googleEventId !== undefined) dbData.google_event_id = data.googleEventId;
      if (data.syncStatus !== undefined) dbData.sync_status = data.syncStatus;
      if (data.salaId !== undefined) dbData.sala_id = data.salaId;

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

        // ✅ CORREÇÃO: enviar para triagem quando status for "confirmado_chegada"
        if (data.status === "confirmado_chegada") {
          const agend = agendamentos.find((a) => a.id === id);
          if (agend) {
            const filaId = `fila_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const { error: filaError } = await supabase.from("fila_espera" as any).insert({
              id: filaId,
              paciente_id: agend.pacienteId,
              paciente_nome: agend.pacienteNome,
              unidade_id: agend.unidadeId,
              profissional_id: agend.profissionalId,
              agendamento_id: id,
              status: "aguardando_triagem",
              prioridade: "normal",
              prioridade_perfil: "normal",
              hora_chegada: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
              setor: "",
              criado_por: "sistema",
            });

            if (!filaError) {
              toast.success("✅ Paciente enviado para a Triagem!");
              await refreshFila?.();
            } else {
              console.error("Erro ao inserir na fila_espera:", filaError);
            }
          }
        }

        await logActionAndSync({
          acao: "editar",
          entidade: "agendamento",
          entidadeId: id,
          detalhes: data as Record<string, unknown>,
        });
      } else {
        console.error("Error updating agendamento:", error);
        toast.error("Erro ao atualizar agendamento");
      }
    },
    [logAction, agendamentos, refreshFila],
  );

  const cancelAgendamento = useCallback(
    async (id: string): Promise<FilaEspera[]> => {
      const ag = agendamentos.find((a) => a.id === id);
      if (!ag) return [];

      const { error } = await supabase
        .from("agendamentos" as any)
        .update({ status: "cancelado" })
        .eq("id", id);
      if (error) {
        console.error("Error cancelling agendamento:", error);
        throw new Error("Erro ao cancelar agendamento. Tente novamente.");
      }

      setAgendamentos((prev) => prev.map((a) => (a.id === id ? { ...a, status: "cancelado" as const } : a)));
      return checkFilaForSlot(ag.profissionalId, ag.unidadeId, ag.data, ag.hora);
    },
    [agendamentos],
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
        await logActionAndSync({
          acao: "criar",
          entidade: "fila_espera",
          entidadeId: f.id,
          unidadeId: f.unidadeId,
          detalhes: { prioridade: f.prioridade, origemCadastro: f.origemCadastro },
        });
      } else console.error("Error adding to fila:", error);
    },
    [logAction],
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
        await logActionAndSync({
          acao: "editar",
          entidade: "fila_espera",
          entidadeId: id,
          detalhes: data as Record<string, unknown>,
        });
      } else console.error("Error updating fila:", error);
    },
    [logAction],
  );

  const removeFromFila = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("fila_espera" as any)
        .delete()
        .eq("id", id);
      if (!error) {
        setFila((prev) => prev.filter((f) => f.id !== id));
        await logActionAndSync({ acao: "excluir", entidade: "fila_espera", entidadeId: id });
      } else console.error("Error removing from fila:", error);
    },
    [logAction],
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
        if (error) {
          console.error("Error persisting atendimento:", error);
        }
      } catch (err) {
        console.error("Error adding atendimento:", err);
      }
      setAtendimentos((prev) => [...prev, a]);
      emitDbUpdate();
    },
    [emitDbUpdate],
  );

  const updateAtendimento = useCallback(
    (id: string, data: Partial<Atendimento>) => {
      setAtendimentos((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)));
      emitDbUpdate();
    },
    [emitDbUpdate],
  );

  const addUnidade = useCallback(async (u: Unidade) => {
    const { error } = await supabase.from("unidades" as any).insert({
      id: u.id,
      nome: u.nome,
      endereco: u.endereco,
      telefone: u.telefone,
      whatsapp: u.whatsapp,
      ativo: u.ativo,
    } as any);
    if (!error) {
      emitDbUpdate();
      setUnidades((prev) => [...prev, u]);
    } else console.error("Error adding unidade:", error);
  }, []);

  const updateUnidade = useCallback(async (id: string, data: Partial<Unidade>) => {
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
      emitDbUpdate();
      setUnidades((prev) => prev.map((u) => (u.id === id ? { ...u, ...data } : u)));
    } else console.error("Error updating unidade:", error);
  }, []);

  const deleteUnidade = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("unidades" as any)
      .delete()
      .eq("id", id);
    if (!error) {
      emitDbUpdate();
      setUnidades((prev) => prev.filter((u) => u.id !== id));
    } else console.error("Error deleting unidade:", error);
  }, []);

  const addSala = useCallback(async (s: Sala) => {
    const { error } = await supabase
      .from("salas" as any)
      .insert({ id: s.id, nome: s.nome, unidade_id: s.unidadeId, ativo: s.ativo } as any);
    if (!error) {
      emitDbUpdate();
      setSalas((prev) => [...prev, s]);
    } else console.error("Error adding sala:", error);
  }, []);

  const updateSala = useCallback(async (id: string, data: Partial<Sala>) => {
    const dbData: any = {};
    if (data.nome !== undefined) dbData.nome = data.nome;
    if (data.unidadeId !== undefined) dbData.unidade_id = data.unidadeId;
    if (data.ativo !== undefined) dbData.ativo = data.ativo;
    const { error } = await supabase
      .from("salas" as any)
      .update(dbData)
      .eq("id", id);
    if (!error) {
      emitDbUpdate();
      setSalas((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
    } else console.error("Error updating sala:", error);
  }, []);

  const deleteSala = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("salas" as any)
      .delete()
      .eq("id", id);
    if (!error) {
      emitDbUpdate();
      setSalas((prev) => prev.filter((s) => s.id !== id));
    } else console.error("Error deleting sala:", error);
  }, []);

  const addFuncionario = useCallback(
    (u: User) => {
      setFuncionarios((prev) => [...prev, u]);
      emitDbUpdate();
    },
    [emitDbUpdate],
  );
  const updateFuncionario = useCallback(
    (id: string, data: Partial<User>) => {
      setFuncionarios((prev) => prev.map((u) => (u.id === id ? { ...u, ...data } : u)));
      emitDbUpdate();
    },
    [emitDbUpdate],
  );
  const deleteFuncionario = useCallback(
    (id: string) => {
      setFuncionarios((prev) => prev.filter((u) => u.id !== id));
      emitDbUpdate();
    },
    [emitDbUpdate],
  );

  const addDisponibilidade = useCallback(async (d: Disponibilidade) => {
    const { error } = await supabase.from("disponibilidades" as any).insert({
      id: d.id,
      profissional_id: d.profissionalId,
      unidade_id: d.unidadeId,
      sala_id: d.salaId || "",
      data_inicio: d.dataInicio,
      data_fim: d.dataFim,
      hora_inicio: d.horaInicio,
      hora_fim: d.horaFim,
      vagas_por_hora: d.vagasPorHora,
      vagas_por_dia: d.vagasPorDia,
      dias_semana: d.diasSemana,
      duracao_consulta: d.duracaoConsulta || 30,
    } as any);
    if (!error) {
      emitDbUpdate();
      setDisponibilidades((prev) => [...prev, d]);
    } else console.error("Error adding disponibilidade:", error);
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
    if (data.duracaoConsulta !== undefined) dbData.duracao_consulta = data.duracaoConsulta;
    const { error } = await supabase
      .from("disponibilidades" as any)
      .update(dbData)
      .eq("id", id);
    if (!error) {
      emitDbUpdate();
      setDisponibilidades((prev) => prev.map((d) => (d.id === id ? { ...d, ...data } : d)));
    } else console.error("Error updating disponibilidade:", error);
  }, []);

  const deleteDisponibilidade = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("disponibilidades" as any)
      .delete()
      .eq("id", id);
    if (!error) {
      emitDbUpdate();
      setDisponibilidades((prev) => prev.filter((d) => d.id !== id));
    } else console.error("Error deleting disponibilidade:", error);
  }, []);

  const addBloqueio = useCallback(
    async (b: Omit<BloqueioAgenda, "id">) => {
      const { data, error } = await supabase
        .from("bloqueios" as any)
        .insert({
          titulo: b.titulo,
          tipo: b.tipo,
          data_inicio: b.dataInicio,
          data_fim: b.dataFim,
          dia_inteiro: b.diaInteiro,
          hora_inicio: b.horaInicio,
          hora_fim: b.horaFim,
          unidade_id: b.unidadeId,
          profissional_id: b.profissionalId,
          criado_por: b.criadoPor || "sistema",
        } as any)
        .select("*")
        .single();
      if (!error && data) {
        const d = data as any;
        const mapped: BloqueioAgenda = {
          id: d.id,
          titulo: d.titulo,
          tipo: d.tipo,
          dataInicio: d.data_inicio,
          dataFim: d.data_fim,
          diaInteiro: d.dia_inteiro ?? true,
          horaInicio: d.hora_inicio || "",
          horaFim: d.hora_fim || "",
          unidadeId: d.unidade_id || "",
          profissionalId: d.profissional_id || "",
          criadoPor: d.criado_por || "",
        };
        setBloqueios((prev) => [...prev, mapped]);
        await logActionAndSync({
          acao: "criar",
          entidade: "bloqueio",
          entidadeId: mapped.id,
          unidadeId: mapped.unidadeId,
          detalhes: { tipo: mapped.tipo, titulo: mapped.titulo },
        });
      }
    },
    [logAction],
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
        setBloqueios((prev) => prev.map((b) => (b.id === id ? { ...b, ...data } : b)));
        await logActionAndSync({
          acao: "editar",
          entidade: "bloqueio",
          entidadeId: id,
          detalhes: data as Record<string, unknown>,
        });
      }
    },
    [logAction],
  );

  const deleteBloqueio = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("bloqueios" as any)
        .delete()
        .eq("id", id);
      if (!error) {
        setBloqueios((prev) => prev.filter((b) => b.id !== id));
        await logActionAndSync({ acao: "excluir", entidade: "bloqueio", entidadeId: id });
      }
    },
    [logAction],
  );

  const updateConfiguracoes = useCallback(
    (data: Partial<Configuracoes>) => {
      const merged = safeConfigMerge({ ...configuracoes, ...data });
      setConfiguracoes(merged);
      supabase
        .from("system_config" as any)
        .upsert({ id: "default", configuracoes: merged } as any, { onConflict: "id" })
        .then(({ error }) => {
          if (error) console.error("Error persisting config:", error);
        });
    },
    [configuracoes],
  );

  const checkFilaForSlot = useCallback(
    (profissionalId: string, unidadeId: string, _data: string, _hora: string): FilaEspera[] => {
      return fila
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
    [fila],
  );

  const encaixarDaFila = useCallback(
    async (filaId: string, agData: Omit<Agendamento, "id" | "criadoEm">) => {
      const newAg: Agendamento = { ...agData, id: `ag${Date.now()}`, criadoEm: new Date().toISOString() };
      await addAgendamento(newAg);
      await updateFila(filaId, { status: "encaixado" as const });
    },
    [addAgendamento, updateFila],
  );

  const statusOcupaVaga = useCallback((status: string) => {
    const libera = ["cancelado", "falta"];
    return !libera.includes(status);
  }, []);

  const appointmentCountsByKey = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of agendamentos) {
      if (statusOcupaVaga(a.status)) {
        const key = `${a.profissionalId}|${a.unidadeId}|${a.data}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return counts;
  }, [agendamentos, statusOcupaVaga]);

  const getAvailableDatesInternal = useCallback(
    (profissionalId: string, unidadeId: string): string[] => {
      const disps = disponibilidades.filter((d) => d.profissionalId === profissionalId && d.unidadeId === unidadeId);
      if (disps.length === 0) return [];

      const dates: string[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const disp of disps) {
        const start = new Date(`${disp.dataInicio}T00:00:00`);
        const end = new Date(`${disp.dataFim}T00:00:00`);
        const current = new Date(Math.max(start.getTime(), today.getTime()));

        while (current <= end) {
          const dayOfWeek = current.getDay();
          if (disp.diasSemana.includes(dayOfWeek)) {
            const dateStr = current.toISOString().split("T")[0];
            const key = `${profissionalId}|${unidadeId}|${dateStr}`;
            const dayCount = appointmentCountsByKey.get(key) || 0;
            if (dayCount < disp.vagasPorDia && !isSlotBlocked(profissionalId, unidadeId, dateStr)) {
              if (!dates.includes(dateStr)) dates.push(dateStr);
            }
          }
          current.setDate(current.getDate() + 1);
        }
      }

      return dates.sort();
    },
    [disponibilidades, appointmentCountsByKey, isSlotBlocked, statusOcupaVaga],
  );

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
  }, [agendamentos, statusOcupaVaga]);

  const getAvailableSlots = useCallback(
    (profissionalId: string, unidadeId: string, date: string, isPublic = false): string[] => {
      const dateObj = new Date(`${date}T00:00:00`);
      const dayOfWeek = dateObj.getDay();

      const disp = disponibilidades.find(
        (d) =>
          d.profissionalId === profissionalId &&
          d.unidadeId === unidadeId &&
          d.diasSemana.includes(dayOfWeek) &&
          date >= d.dataInicio &&
          date <= d.dataFim,
      );
      if (!disp) return [];

      const slots: string[] = [];
      const startHour = parseInt(disp.horaInicio.split(":")[0]);
      const startMin = parseInt(disp.horaInicio.split(":")[1] || "0");
      const endHour = parseInt(disp.horaFim.split(":")[0]);
      const endMin = parseInt(disp.horaFim.split(":")[1] || "0");

      const key = `${profissionalId}|${unidadeId}|${date}`;
      const dayAppointments = appointmentsByDateProfUnit.get(key) || [];
      if (dayAppointments.length >= disp.vagasPorDia) return [];

      const hourCounts = new Map<string, number>();
      const slotCounts = new Map<string, number>();
      for (const a of dayAppointments) {
        const hKey = a.hora.substring(0, 3);
        hourCounts.set(hKey, (hourCounts.get(hKey) || 0) + 1);
        slotCounts.set(a.hora, (slotCounts.get(a.hora) || 0) + 1);
      }

      const prof = funcionarios.find((f) => f.id === profissionalId);
      const intervalMinutes = Math.max(15, prof?.tempoAtendimento || 30);

      const agora = new Date();
      const ehHoje = date === agora.toISOString().split("T")[0];
      const limiteMinutos = ehHoje ? agora.getHours() * 60 + agora.getMinutes() + 30 : -1;

      let h = startHour;
      let m = startMin;

      while (h < endHour || (h === endHour && m < endMin)) {
        const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

        if (ehHoje && h * 60 + m <= limiteMinutos) {
          m += intervalMinutes;
          while (m >= 60) {
            m -= 60;
            h++;
          }
          continue;
        }

        const hourStr = `${String(h).padStart(2, "0")}:`;
        const hourCount = hourCounts.get(hourStr) || 0;
        const slotCount = slotCounts.get(timeStr) || 0;
        const blocked = isSlotBlocked(profissionalId, unidadeId, date, timeStr);

        if (!blocked && hourCount < disp.vagasPorHora) {
          if (isPublic) {
            if (slotCount === 0) slots.push(timeStr);
          } else {
            if (slotCount < disp.vagasPorHora) slots.push(timeStr);
          }
        }

        m += intervalMinutes;
        while (m >= 60) {
          m -= 60;
          h++;
        }
      }

      return slots;
    },
    [disponibilidades, appointmentsByDateProfUnit, funcionarios, isSlotBlocked, statusOcupaVaga],
  );

  const getAvailableDates = useCallback(
    (profissionalId: string, unidadeId: string, isPublic = false): string[] => {
      const dates = getAvailableDatesInternal(profissionalId, unidadeId);
      return dates.filter((d) => getAvailableSlots(profissionalId, unidadeId, d, isPublic).length > 0);
    },
    [getAvailableDatesInternal, getAvailableSlots],
  );

  const getDayInfoMap = useCallback(
    (
      profissionalId: string,
      unidadeId: string,
      isPublic = false,
    ): Record<string, import("@/components/CalendarioDisponibilidade").DayInfo> => {
      const map: Record<string, import("@/components/CalendarioDisponibilidade").DayInfo> = {};
      const disps = disponibilidades.filter((d) => d.profissionalId === profissionalId && d.unidadeId === unidadeId);
      if (disps.length === 0) return map;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < 90; i++) {
        const current = new Date(today);
        current.setDate(current.getDate() + i);
        const dateStr = current.toISOString().split("T")[0];
        const dayOfWeek = current.getDay();

        const hasDisp = disps.some(
          (d) => d.diasSemana.includes(dayOfWeek) && dateStr >= d.dataInicio && dateStr <= d.dataFim,
        );
        if (!hasDisp) continue;

        const blockInfo = getBlockingInfo(profissionalId, unidadeId, dateStr);
        if (blockInfo.blocked) {
          const isHoliday = blockInfo.type === "feriado";
          map[dateStr] = {
            dateStr,
            status: isHoliday ? "holiday" : "blocked",
            label: blockInfo.label || (isHoliday ? "Feriado" : "Bloqueado"),
          };
          continue;
        }

        const slots = getAvailableSlots(profissionalId, unidadeId, dateStr, isPublic);
        if (slots.length === 0) {
          const disp = disps.find(
            (d) => d.diasSemana.includes(dayOfWeek) && dateStr >= d.dataInicio && dateStr <= d.dataFim,
          );
          if (disp) {
            const key = `${profissionalId}|${unidadeId}|${dateStr}`;
            const dayCount = appointmentCountsByKey.get(key) || 0;
            if (dayCount > 0) {
              map[dateStr] = { dateStr, status: "full", label: "Lotado — sem vagas restantes" };
            }
          }
        }
      }

      return map;
    },
    [disponibilidades, appointmentCountsByKey, getAvailableSlots, getBlockingInfo, statusOcupaVaga],
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

  const contextValue = useMemo<DataContextType>(
    () => ({
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
    ],
  );

  return <DataContext.Provider value={contextValue}>{children}</DataContext.Provider>;
};

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
      const actor = input.user;
      const ip = await getPublicIp();
      const dispositivo = getDeviceInfo();
      await supabase.from("action_logs" as any).insert({
        user_id: actor?.id || "", user_nome: actor?.nome || "sistema", role: actor?.role || "sistema",
        unidade_id: input.unidadeId || actor?.unidadeId || "", acao: input.acao, entidade: input.entidade,
        entidade_id: input.entidadeId || "", detalhes: { ...(input.detalhes || {}), usuario_cpf: actor?.cpf || "", dispositivo },
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

  const loadConfiguracoes = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("system_config").select("*").single();
      if (data && !error) setConfiguracoes(safeConfigMerge((data as any).configuracoes));
    } catch (err) { console.error("Error loading configs:", err); }
  }, []);

  const loadUnidades = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("unidades" as any).select("*");
      if (data && !error) setUnidades(data.map((u: any) => ({ id: u.id, nome: u.nome, endereco: u.endereco || "", telefone: u.telefone || "", whatsapp: u.whatsapp || "", ativo: u.ativo })));
    } catch (err) { console.error("Error loading unidades:", err); }
  }, []);

  const loadSalas = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("salas" as any).select("*");
      if (data && !error) setSalas(data.map((s: any) => ({ id: s.id, nome: s.nome, unidadeId: s.unidade_id, ativo: s.ativo })));
    } catch (err) { console.error("Error loading salas:", err); }
  }, []);

  const loadFuncionarios = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("funcionarios" as any).select("*");
      if (data && !error) setFuncionarios(data.map((f: any) => ({
        id: f.id, authUserId: f.auth_user_id || "", nome: f.nome, usuario: f.usuario, email: f.email || "", cpf: f.cpf || "",
        profissao: f.profissao || "", tipoConselho: f.tipo_conselho || "", numeroConselho: f.numero_conselho || "", ufConselho: f.uf_conselho || "",
        role: f.role, unidadeId: f.unidade_id || "", salaId: f.sala_id || "", setor: f.setor || "", cargo: f.cargo || "",
        criadoEm: f.criado_em || "", criadoPor: f.criado_por || "", tempoAtendimento: f.tempo_atendimento || 30,
        podeAgendarRetorno: f.pode_agendar_retorno || false, coren: f.coren || "", ativo: f.ativo ?? true,
      })));
    } catch (err) { console.error("Error loading funcionarios:", err); }
  }, []);

  const loadDisponibilidades = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("disponibilidades" as any).select("*");
      if (data && !error) setDisponibilidades(data.map((d: any) => ({
        id: d.id, profissionalId: d.profissional_id, unidadeId: d.unidade_id, salaId: d.sala_id || "",
        dataInicio: d.data_inicio, dataFim: d.data_fim, horaInicio: d.hora_inicio, horaFim: d.hora_fim,
        vagasPorHora: d.vagas_por_hora, vagasPorDia: d.vagas_por_dia, diasSemana: d.dias_semana || [], duracaoConsulta: d.duracao_consulta || 30,
      })));
    } catch (err) { console.error("Error loading disponibilidades:", err); }
  }, []);

  const loadPacientes = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("pacientes" as any).select("*");
      if (data && !error) setPacientes(data.map((p: any) => ({
        id: p.id, nome: p.nome, cpf: p.cpf || "", cns: p.cns || "", nomeMae: p.nome_mae || "", telefone: p.telefone || "",
        dataNascimento: p.data_nascimento || "", email: p.email || "", endereco: p.endereco || "", observacoes: p.observacoes || "",
        descricaoClinica: p.descricao_clinica || "", cid: p.cid || "", criadoEm: p.criado_em || "",
      })));
    } catch (err) { console.error("Error loading pacientes:", err); }
  }, []);

  const loadAgendamentos = useCallback(async () => {
    try {
      let allData: any[] = []; let from = 0; const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase.from("agendamentos" as any).select("*").order("data", { ascending: false }).range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (allData.length > 0) setAgendamentos(allData.map((a: any) => ({
        id: a.id, pacienteId: a.paciente_id, pacienteNome: a.paciente_nome, unidadeId: a.unidade_id, salaId: a.sala_id || "",
        setorId: a.setor_id || "", profissionalId: a.profissional_id, profissionalNome: a.profissional_nome, data: a.data, hora: a.hora,
        status: a.status, tipo: a.tipo, observacoes: a.observacoes || "", origem: a.origem || "recepcao",
        googleEventId: a.google_event_id || "", syncStatus: a.sync_status || "", criadoEm: a.criado_em || "", criadoPor: a.criado_por || "",
        horaChegada: a.hora_chegada || "", attachmentUrl: a.attachment_url || "", attachmentName: a.attachment_name || "",
        attachmentType: a.attachment_type || "", aprovadoPor: a.aprovado_por || "", aprovadoEm: a.aprovado_em || "", rejeitadoMotivo: a.rejeitado_motivo || "",
      })));
    } catch (err) { console.error("Error loading agendamentos:", err); }
  }, []);

  const loadFila = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("fila_espera" as any).select("*").order("criado_em", { ascending: true });
      if (data && !error) setFila(data.map((f: any) => ({
        id: f.id, pacienteId: f.paciente_id, pacienteNome: f.paciente_nome, unidadeId: f.unidade_id, profissionalId: f.profissional_id || "",
        setor: f.setor || "", prioridade: (f.prioridade_perfil && f.prioridade_perfil !== "normal" ? f.prioridade_perfil : f.prioridade) as FilaEspera["prioridade"],
        status: f.status as FilaEspera["status"], posicao: f.posicao, horaChegada: f.hora_chegada, horaChamada: f.hora_chamada || "",
        observacoes: f.observacoes || "", descricaoClinica: f.descricao_clinica || "", cid: f.cid || "", criadoPor: f.criado_por || "",
        criadoEm: f.criado_em || "", dataSolicitacaoOriginal: f.data_solicitacao_original || "", origemCadastro: f.origem_cadastro || "normal", especialidadeDestino: f.especialidade_destino || "",
      })));
    } catch (err) { console.error("Error loading fila:", err); }
  }, []);

  const loadBloqueios = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("bloqueios" as any).select("*");
      if (data && !error) setBloqueios(data.map((b: any) => ({
        id: b.id, titulo: b.titulo, tipo: b.tipo, dataInicio: b.data_inicio, dataFim: b.data_fim, diaInteiro: b.dia_inteiro ?? true,
        horaInicio: b.hora_inicio || "", horaFim: b.hora_fim || "", unidadeId: b.unidade_id || "", profissionalId: b.profissional_id || "", criadoPor: b.criado_por || "",
      })));
    } catch (err) { console.error("Error loading bloqueios:", err); }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadConfiguracoes(), loadUnidades(), loadSalas(), loadFuncionarios(), loadDisponibilidades(), loadPacientes(), loadAgendamentos(), loadFila(), loadBloqueios()]);
  }, [loadConfiguracoes, loadUnidades, loadSalas, loadFuncionarios, loadDisponibilidades, loadPacientes, loadAgendamentos, loadFila, loadBloqueios]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const dbUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const handler = () => {
      if (dbUpdateTimerRef.current) clearTimeout(dbUpdateTimerRef.current);
      dbUpdateTimerRef.current = setTimeout(() => loadAll(), 500);
    };
    window.addEventListener("db_update", handler);
    return () => { window.removeEventListener("db_update", handler); if (dbUpdateTimerRef.current) clearTimeout(dbUpdateTimerRef.current); };
  }, [loadAll]);

  const upsertById = <T extends { id: string }>(prev: T[], nextItem: T) => {
    const index = prev.findIndex((item) => item.id === nextItem.id);
    if (index === -1) return [nextItem, ...prev];
    const cloned = [...prev]; cloned[index] = nextItem; return cloned;
  };
  const removeById = <T extends { id: string }>(prev: T[], id: string) => prev.filter((item) => item.id !== id);

  useRealtimeSync({
    table: "agendamentos",
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") { const id = String((payload.old as any)?.id || ""); if (id) setAgendamentos((prev) => removeById(prev, id)); return; }
      const row = payload.new as any; if (!row?.id) return;
      setAgendamentos((prev) => upsertById(prev, {
        id: row.id, pacienteId: row.paciente_id, pacienteNome: row.paciente_nome, unidadeId: row.unidade_id, salaId: row.sala_id || "",
        setorId: row.setor_id || "", profissionalId: row.profissional_id, profissionalNome: row.profissional_nome, data: row.data, hora: row.hora,
        status: row.status, tipo: row.tipo, observacoes: row.observacoes || "", origem: row.origem || "recepcao",
        googleEventId: row.google_event_id || "", syncStatus: row.sync_status || "", criadoEm: row.criado_em || "", criadoPor: row.criado_por || "",
        horaChegada: row.hora_chegada || "", attachmentUrl: row.attachment_url || "", attachmentName: row.attachment_name || "",
        attachmentType: row.attachment_type || "", aprovadoPor: row.aprovado_por || "", aprovadoEm: row.aprovado_em || "", rejeitadoMotivo: row.rejeitado_motivo || "",
      }));
    },
    poll: loadAgendamentos,
  });

  useRealtimeSync({
    table: "fila_espera",
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") { const id = String((payload.old as any)?.id || ""); if (id) setFila((prev) => removeById(prev, id)); return; }
      const row = payload.new as any; if (!row?.id) return;
      setFila((prev) => upsertById(prev, {
        id: row.id, pacienteId: row.paciente_id, pacienteNome: row.paciente_nome, unidadeId: row.unidade_id, profissionalId: row.profissional_id || "",
        setor: row.setor || "", prioridade: (row.prioridade_perfil && row.prioridade_perfil !== "normal" ? row.prioridade_perfil : row.prioridade) as FilaEspera["prioridade"],
        status: row.status as FilaEspera["status"], posicao: row.posicao, horaChegada: row.hora_chegada, horaChamada: row.hora_chamada || "",
        observacoes: row.observacoes || "", descricaoClinica: row.descricao_clinica || "", cid: row.cid || "", criadoPor: row.criado_por || "",
        criadoEm: row.criado_em || "", dataSolicitacaoOriginal: row.data_solicitacao_original || "", origemCadastro: row.origem_cadastro || "normal", especialidadeDestino: row.especialidade_destino || "",
      }));
    },
    poll: loadFila,
  });

  useRealtimeSync({
    table: "pacientes",
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") { const id = String((payload.old as any)?.id || ""); if (id) setPacientes((prev) => removeById(prev, id)); return; }
      const row = payload.new as any; if (!row?.id) return;
      setPacientes((prev) => upsertById(prev, {
        id: row.id, nome: row.nome, cpf: row.cpf || "", cns: row.cns || "", nomeMae: row.nome_mae || "", telefone: row.telefone || "",
        dataNascimento: row.data_nascimento || "", email: row.email || "", endereco: row.endereco || "", observacoes: row.observacoes || "",
        descricaoClinica: row.descricao_clinica || "", cid: row.cid || "", criadoEm: row.criado_em || "",
      }));
    },
    poll: loadPacientes,
  });

  useRealtimeSync({
    table: "disponibilidades",
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") { const id = String((payload.old as any)?.id || ""); if (id) setDisponibilidades((prev) => removeById(prev, id)); return; }
      const row = payload.new as any; if (!row?.id) return;
      setDisponibilidades((prev) => upsertById(prev, {
        id: row.id, profissionalId: row.profissional_id, unidadeId: row.unidade_id, salaId: row.sala_id || "",
        dataInicio: row.data_inicio, dataFim: row.data_fim, horaInicio: row.hora_inicio, horaFim: row.hora_fim,
        vagasPorHora: row.vagas_por_hora, vagasPorDia: row.vagas_por_dia, diasSemana: row.dias_semana || [], duracaoConsulta: row.duracao_consulta || 30,
      }));
    },
    poll: loadDisponibilidades,
  });

  useRealtimeSync({
    table: "bloqueios",
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") { const id = String((payload.old as any)?.id || ""); if (id) setBloqueios((prev) => removeById(prev, id)); return; }
      const row = payload.new as any; if (!row?.id) return;
      setBloqueios((prev) => upsertById(prev, {
        id: row.id, titulo: row.titulo, tipo: row.tipo, dataInicio: row.data_inicio, dataFim: row.data_fim, diaInteiro: row.dia_inteiro ?? true,
        horaInicio: row.hora_inicio || "", horaFim: row.hora_fim || "", unidadeId: row.unidade_id || "", profissionalId: row.profissional_id || "", criadoPor: row.criado_por || "",
      }));
    },
    poll: loadBloqueios,
  });

  const addAgendamento = useCallback(async (ag: Agendamento) => {
    const { error } = await supabase.from("agendamentos" as any).insert({
      id: ag.id, paciente_id: ag.pacienteId, paciente_nome: ag.pacienteNome, unidade_id: ag.unidadeId, sala_id: ag.salaId,
      setor_id: ag.setorId, profissional_id: ag.profissionalId, profissional_nome: ag.profissionalNome, data: ag.data, hora: ag.hora,
      status: ag.status, tipo: ag.tipo, observacoes: ag.observacoes, origem: ag.origem, google_event_id: ag.googleEventId,
      sync_status: ag.syncStatus, criado_em: ag.criadoEm, criado_por: ag.criadoPor, hora_chegada: ag.horaChegada,
      attachment_url: ag.attachmentUrl, attachment_name: ag.attachmentName, attachment_type: ag.attachmentType,
      aprovado_por: ag.aprovadoPor, aprovado_em: ag.aprovadoEm, rejeitado_motivo: ag.rejeitadoMotivo,
    } as any);
    if (!error) { setAgendamentos((prev) => [ag, ...prev]); emitDbUpdate(); }
  }, [emitDbUpdate]);

  const updateAgendamento = useCallback(async (id: string, data: Partial<Agendamento>) => {
    const dbData: any = {};
    if (data.status !== undefined) dbData.status = data.status;
    if (data.hora !== undefined) dbData.hora = data.hora;
    if (data.data !== undefined) dbData.data = data.data;
    if (data.observacoes !== undefined) dbData.observacoes = data.observacoes;
    if (data.googleEventId !== undefined) dbData.google_event_id = data.googleEventId;
    if (data.syncStatus !== undefined) dbData.sync_status = data.syncStatus;
    if (data.salaId !== undefined) dbData.sala_id = data.salaId;
    if (data.horaChegada !== undefined) dbData.hora_chegada = data.horaChegada;
    if (data.aprovadoPor !== undefined) dbData.aprovado_por = data.aprovadoPor;
    if (data.aprovadoEm !== undefined) dbData.aprovado_em = data.aprovadoEm;
    if (data.rejeitadoMotivo !== undefined) dbData.rejeitado_motivo = data.rejeitadoMotivo;
    if (data.attachmentUrl !== undefined) dbData.attachment_url = data.attachmentUrl;
    if (data.attachmentName !== undefined) dbData.attachment_name = data.attachmentName;
    if (data.attachmentType !== undefined) dbData.attachment_type = data.attachmentType;
    if (data.status === "remarcado" || data.data !== undefined || data.hora !== undefined) {
      dbData.lembrete_24h_enviado_em = null; dbData.lembrete_proximo_enviado_em = null;
    }
    const { error } = await supabase.from("agendamentos" as any).update(dbData).eq("id", id);
    if (!error) {
      setAgendamentos((prev) => prev.map((a) => a.id === id ? { ...a, ...data } : a));
      emitDbUpdate();
    }
  }, [emitDbUpdate]);

  const cancelAgendamento = useCallback(async (id: string) => {
    const ag = agendamentos.find((a) => a.id === id);
    if (!ag) return [];
    await updateAgendamento(id, { status: "cancelado" });
    const filaItems = fila.filter((f) => f.pacienteId === ag.pacienteId && f.status === "aguardando");
    return filaItems;
  }, [agendamentos, fila, updateAgendamento]);

  const addPaciente = useCallback(async (p: Paciente) => {
    const { error } = await supabase.from("pacientes" as any).insert({
      id: p.id, nome: p.nome, cpf: p.cpf, cns: p.cns, nome_mae: p.nomeMae, telefone: p.telefone,
      data_nascimento: p.dataNascimento, email: p.email, endereco: p.endereco, observacoes: p.observacoes,
      descricao_clinica: p.descricaoClinica, cid: p.cid, criado_em: p.criadoEm,
    } as any);
    if (!error) { setPacientes((prev) => [p, ...prev]); emitDbUpdate(); }
  }, [emitDbUpdate]);

  const updatePaciente = useCallback(async (id: string, data: Partial<Paciente>) => {
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
    const { error } = await supabase.from("pacientes" as any).update(dbData).eq("id", id);
    if (!error) { setPacientes((prev) => prev.map((p) => p.id === id ? { ...p, ...data } : p)); emitDbUpdate(); }
  }, [emitDbUpdate]);

  const addToFila = useCallback(async (f: FilaEspera) => {
    const { error } = await supabase.from("fila_espera" as any).insert({
      id: f.id, paciente_id: f.pacienteId, paciente_nome: f.pacienteNome, unidade_id: f.unidadeId,
      profissional_id: f.profissionalId, setor: f.setor, prioridade: f.prioridade, status: f.status,
      posicao: f.posicao, hora_chegada: f.horaChegada, hora_chamada: f.horaChamada, observacoes: f.observacoes,
      descricao_clinica: f.descricaoClinica, cid: f.cid, criado_por: f.criadoPor, criado_em: f.criadoEm,
      data_solicitacao_original: f.dataSolicitacaoOriginal, origem_cadastro: f.origemCadastro, especialidade_destino: f.especialidadeDestino,
    } as any);
    if (!error) { setFila((prev) => [...prev, f]); emitDbUpdate(); }
  }, [emitDbUpdate]);

  const updateFila = useCallback(async (id: string, data: Partial<FilaEspera>) => {
    const dbData: any = {};
    if (data.status !== undefined) dbData.status = data.status;
    if (data.posicao !== undefined) dbData.posicao = data.posicao;
    if (data.horaChamada !== undefined) dbData.hora_chamada = data.horaChamada;
    if (data.observacoes !== undefined) dbData.observacoes = data.observacoes;
    if (data.profissionalId !== undefined) dbData.profissional_id = data.profissionalId;
    const { error } = await supabase.from("fila_espera" as any).update(dbData).eq("id", id);
    if (!error) { setFila((prev) => prev.map((f) => f.id === id ? { ...f, ...data } : f)); emitDbUpdate(); }
  }, [emitDbUpdate]);

  const removeFromFila = useCallback(async (id: string) => {
    const { error } = await supabase.from("fila_espera" as any).delete().eq("id", id);
    if (!error) { setFila((prev) => prev.filter((f) => f.id !== id)); emitDbUpdate(); }
  }, [emitDbUpdate]);

  const addAtendimento = useCallback(async (a: Atendimento) => {
    const { error } = await supabase.from("atendimentos" as any).insert({
      id: a.id, agendamento_id: a.agendamentoId, paciente_id: a.pacienteId, paciente_nome: a.pacienteNome,
      profissional_id: a.profissionalId, profissional_nome: a.profissionalNome, unidade_id: a.unidadeId,
      sala_id: a.salaId, setor: a.setor, procedimento: a.procedimento, observacoes: a.observacoes,
      data: a.data, hora_inicio: a.horaInicio, hora_fim: a.horaFim, duracao_minutos: a.duracaoMinutos, status: a.status,
    } as any);
    if (!error) { setAtendimentos((prev) => [a, ...prev]); emitDbUpdate(); }
  }, [emitDbUpdate]);

  const updateAtendimento = useCallback((id: string, data: Partial<Atendimento>) => {
    setAtendimentos((prev) => prev.map((a) => a.id === id ? { ...a, ...data } : a));
  }, []);

  const addUnidade = useCallback((u: Unidade) => { setUnidades((prev) => [u, ...prev]); }, []);
  const updateUnidade = useCallback((id: string, data: Partial<Unidade>) => { setUnidades((prev) => prev.map((u) => u.id === id ? { ...u, ...data } : u)); }, []);
  const deleteUnidade = useCallback((id: string) => { setUnidades((prev) => prev.filter((u) => u.id !== id)); }, []);
  const addSala = useCallback((s: Sala) => { setSalas((prev) => [s, ...prev]); }, []);
  const updateSala = useCallback((id: string, data: Partial<Sala>) => { setSalas((prev) => prev.map((s) => s.id === id ? { ...s, ...data } : s)); }, []);
  const deleteSala = useCallback((id: string) => { setSalas((prev) => prev.filter((s) => s.id !== id)); }, []);
  const addFuncionario = useCallback((u: User) => { setFuncionarios((prev) => [u, ...prev]); }, []);
  const updateFuncionario = useCallback((id: string, data: Partial<User>) => { setFuncionarios((prev) => prev.map((f) => f.id === id ? { ...f, ...data } : f)); }, []);
  const deleteFuncionario = useCallback((id: string) => { setFuncionarios((prev) => prev.filter((f) => f.id !== id)); }, []);
  const addDisponibilidade = useCallback((d: Disponibilidade) => { setDisponibilidades((prev) => [d, ...prev]); }, []);
  const updateDisponibilidade = useCallback((id: string, data: Partial<Disponibilidade>) => { setDisponibilidades((prev) => prev.map((d) => d.id === id ? { ...d, ...data } : d)); }, []);
  const deleteDisponibilidade = useCallback((id: string) => { setDisponibilidades((prev) => prev.filter((d) => d.id !== id)); }, []);

  const addBloqueio = useCallback(async (b: Omit<BloqueioAgenda, "id">) => {
    const id = `blq${Date.now()}`;
    const { error } = await supabase.from("bloqueios" as any).insert({
      id, titulo: b.titulo, tipo: b.tipo, data_inicio: b.dataInicio, data_fim: b.dataFim, dia_inteiro: b.diaInteiro,
      hora_inicio: b.horaInicio, hora_fim: b.horaFim, unidade_id: b.unidadeId, profissional_id: b.profissionalId, criado_por: b.criadoPor,
    } as any);
    if (!error) { setBloqueios((prev) => [{ ...b, id }, ...prev]); emitDbUpdate(); }
  }, [emitDbUpdate]);

  const updateBloqueio = useCallback(async (id: string, data: Partial<BloqueioAgenda>) => {
    const dbData: any = {};
    if (data.titulo !== undefined) dbData.titulo = data.titulo;
    if (data.tipo !== undefined) dbData.tipo = data.tipo;
    if (data.dataInicio !== undefined) dbData.data_inicio = data.dataInicio;
    if (data.dataFim !== undefined) dbData.data_fim = data.dataFim;
    if (data.diaInteiro !== undefined) dbData.dia_inteiro = data.diaInteiro;
    if (data.horaInicio !== undefined) dbData.hora_inicio = data.horaInicio;
    if (data.horaFim !== undefined) dbData.hora_fim = data.horaFim;
    const { error } = await supabase.from("bloqueios" as any).update(dbData).eq("id", id);
    if (!error) { setBloqueios((prev) => prev.map((b) => b.id === id ? { ...b, ...data } : b)); emitDbUpdate(); }
  }, [emitDbUpdate]);

  const deleteBloqueio = useCallback(async (id: string) => {
    const { error } = await supabase.from("bloqueios" as any).delete().eq("id", id);
    if (!error) { setBloqueios((prev) => prev.filter((b) => b.id !== id)); emitDbUpdate(); }
  }, [emitDbUpdate]);

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

  const value = useMemo(() => ({
    agendamentos, pacientes, fila, atendimentos, unidades, salas, setores, funcionarios, disponibilidades, bloqueios, configuracoes,
    addAgendamento, updateAgendamento, cancelAgendamento, addPaciente, updatePaciente, addToFila, updateFila, removeFromFila,
    addAtendimento, updateAtendimento, addUnidade, updateUnidade, deleteUnidade, addSala, updateSala, deleteSala,
    addFuncionario, updateFuncionario, deleteFuncionario, addDisponibilidade, updateDisponibilidade, deleteDisponibilidade,
    addBloqueio, updateBloqueio, deleteBloqueio, getAvailableSlots, getAvailableDates, getNextAvailableSlots, getBlockingInfo, getDayInfoMap,
    updateConfiguracoes, checkFilaForSlot, encaixarDaFila, refreshFuncionarios, refreshDisponibilidades, refreshAgendamentos, refreshPacientes, refreshFila, refreshBloqueios, logAction,
  }), [agendamentos, pacientes, fila, atendimentos, unidades, salas, setores, funcionarios, disponibilidades, bloqueios, configuracoes,
    addAgendamento, updateAgendamento, cancelAgendamento, addPaciente, updatePaciente, addToFila, updateFila, removeFromFila,
    addAtendimento, updateAtendimento, addUnidade, updateUnidade, deleteUnidade, addSala, updateSala, deleteSala,
    addFuncionario, updateFuncionario, deleteFuncionario, addDisponibilidade, updateDisponibilidade, deleteDisponibilidade,
    addBloqueio, updateBloqueio, deleteBloqueio, getAvailableSlots, getAvailableDates, getNextAvailableSlots, getBlockingInfo, getDayInfoMap,
    updateConfiguracoes, checkFilaForSlot, encaixarDaFila, refreshFuncionarios, refreshDisponibilidades, refreshAgendamentos, refreshPacientes, refreshFila, refreshBloqueios, logAction]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
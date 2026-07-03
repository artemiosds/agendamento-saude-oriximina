import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOperacional } from "@/contexts/OperacionalContext";
import {
  useRealtimeSync,
  type RealtimeSyncPayload,
} from "@/hooks/useRealtimeSync";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { localDateStr } from "@/lib/utils";
import { getFilaSnapshot } from "@/contexts/_filaBridge";
import { setAgendamentosSnapshot } from "@/contexts/_agendamentosBridge";
import type { Agendamento, Atendimento, FilaEspera } from "@/types";

/**
 * AgendamentosContext — Fase 5 (Passo 3.1): dono próprio de `agendamentos`,
 * `atendimentos`, loaders (`loadAgendamentos`, `ensureAgendamentosForRange`,
 * `ensureAgendamentosForDate`), CRUDs (`addAgendamento`, `updateAgendamento`,
 * `cancelAgendamento`, `deleteAgendamento`, `addAtendimento`,
 * `updateAtendimento`) e canal Realtime `public.agendamentos` com
 * upsert incremental interiorizado (`applyAgendamentoRealtimeEvent`).
 *
 * Ainda depende de `useData()` para `getTurnoInfo` (validação de quota) e
 * `logAction` (auditoria). Essas dependências saem quando OperacionalContext
 * absorver os derivados de disponibilidade.
 */
interface AgendamentosContextType {
  agendamentos: Agendamento[];
  addAgendamento: (ag: Agendamento) => Promise<void>;
  updateAgendamento: (id: string, data: Partial<Agendamento>) => Promise<void>;
  cancelAgendamento: (id: string) => Promise<FilaEspera[]>;
  deleteAgendamento: (id: string) => Promise<void>;
  refreshAgendamentos: () => Promise<void>;
  ensureAgendamentosForDate: (date: string) => Promise<void>;
  ensureAgendamentosForRange: (startDate: string, endDate: string) => Promise<void>;
  atendimentos: Atendimento[];
  addAtendimento: (a: Atendimento) => Promise<void>;
  updateAtendimento: (id: string, data: Partial<Atendimento>) => void;
}

const AgendamentosContext = createContext<AgendamentosContextType | null>(null);

const priorityRank: Record<string, number> = {
  urgente: 0,
  gestante: 1,
  idoso: 2,
  alta: 3,
  pcd: 4,
  crianca: 5,
  normal: 6,
};

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

const upsertById = <T extends { id: string }>(prev: T[], nextItem: T) => {
  const index = prev.findIndex((item) => item.id === nextItem.id);
  if (index === -1) return [nextItem, ...prev];
  const cloned = [...prev];
  cloned[index] = nextItem;
  return cloned;
};

const removeById = <T extends { id: string }>(prev: T[], id: string) =>
  prev.filter((item) => item.id !== id);

export const AgendamentosSliceProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const queryClient = useQueryClient();
  const { user: authUser } = useAuth();
  const { getTurnoInfo, logAction } = useOperacional();
  const isGlobalAdmin = authUser?.usuario === "admin.sms";
  const userUnidadeId = authUser?.unidadeId || "";

  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const agendamentosRef = useRef(agendamentos);
  agendamentosRef.current = agendamentos;
  const loadedExtraDatesRef = useRef<Set<string>>(new Set());

  // Mantém o snapshot module-level em dia para o bridge com o DataProvider
  // (memos `appointmentCountsByKey`/`appointmentsByDateProfUnit`).
  useEffect(() => {
    setAgendamentosSnapshot(agendamentos);
  }, [agendamentos]);

  const invalidateCache = useCallback(
    (...keys: (readonly string[])[]) => {
      keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
    [queryClient],
  );

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

          query =
            scope === "recent"
              ? query.gte("data", cutoff)
              : query
                  .lt("data", cutoff)
                  .not("status", "in", `(${terminalPastStatuses.join(",")})`);

          if (!isGlobalAdmin && userUnidadeId)
            query = query.eq("unidade_id", userUnidadeId);
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
      const allData = Array.from(
        new Map(
          [...recentRows, ...openPastRows].map((row) => [row.id, row]),
        ).values(),
      );
      const mapped = allData.map(mapAgendamentoRow);
      setAgendamentos((prev) => {
        const scopeKey = userUnidadeId || "all";
        const map = new Map<string, Agendamento>();
        for (const item of prev) {
          if (
            loadedExtraDatesRef.current.has(`${item.data}|${scopeKey}`)
          )
            map.set(item.id, item);
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
  const ensureAgendamentosForRange = useCallback(
    async (startDate: string, endDate: string) => {
      try {
        if (!startDate || !endDate) return;
        const scopeKey = userUnidadeId || "all";
        const requestedDates = dateKeysBetween(startDate, endDate);
        const missingDates = requestedDates.filter(
          (date) => !loadedExtraDatesRef.current.has(`${date}|${scopeKey}`),
        );
        if (missingDates.length === 0) return;
        missingDates.forEach((date) =>
          loadedExtraDatesRef.current.add(`${date}|${scopeKey}`),
        );

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
          if (!isGlobalAdmin && userUnidadeId)
            query = query.eq("unidade_id", userUnidadeId);
          const { data, error } = await query;
          if (error) {
            missingDates.forEach((date) =>
              loadedExtraDatesRef.current.delete(`${date}|${scopeKey}`),
            );
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
    },
    [isGlobalAdmin, userUnidadeId],
  );

  const ensureAgendamentosForDate = useCallback(
    async (date: string) => {
      await ensureAgendamentosForRange(date, date);
    },
    [ensureAgendamentosForRange],
  );

  const refreshAgendamentos = useCallback(async () => {
    await loadAgendamentos();
  }, [loadAgendamentos]);

  // Handler de upsert incremental do canal `agendamentos` — interiorizado
  // (Fase 5, Passo 3.1): não é mais exposto via useData().
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
      if (
        !isGlobalAdmin &&
        userUnidadeId &&
        row.unidade_id &&
        row.unidade_id !== userUnidadeId
      )
        return;
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

  const addAgendamento = useCallback(
    async (ag: Agendamento) => {
      const userRole = authUser?.role || "";
      const rolesToBlock = ["recepcao", "gestao", "coordenador"];

      if (rolesToBlock.includes(userRole)) {
        const turnos = getTurnoInfo(ag.profissionalId, ag.unidadeId, ag.data);
        const meuTurno = turnos.find(
          (t) => ag.hora >= t.horaInicio && ag.hora < t.horaFim,
        );

        if (meuTurno) {
          if (meuTurno.vagasLivresInternas <= 0) {
            toast.error(
              `Limite de vagas excedido para este turno (${meuTurno.nome}).`,
            );
            throw new Error("Limite de vagas excedido.");
          }
        }
      }

      const STATUS_INICIAIS_PERMITIDOS = ["confirmado", "pendente", "agendado"];
      const statusInicial = STATUS_INICIAIS_PERMITIDOS.includes(
        ag.status as string,
      )
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
        setAgendamentos((prev) => [
          ...prev,
          { ...ag, status: statusInicial as any },
        ]);
        await logAction({
          acao: "criar",
          entidade: "agendamento",
          entidadeId: ag.id,
          unidadeId: ag.unidadeId,
          detalhes: {
            data: ag.data,
            hora: ag.hora,
            profissionalId: ag.profissionalId,
          },
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
      if (data.googleEventId !== undefined)
        dbData.google_event_id = data.googleEventId;
      if (data.syncStatus !== undefined) dbData.sync_status = data.syncStatus;
      if (data.salaId !== undefined) dbData.sala_id = data.salaId;
      if (data.horaChegada !== undefined) dbData.hora_chegada = data.horaChegada;
      if (data.profissionalId !== undefined)
        dbData.profissional_id = data.profissionalId;
      if (data.profissionalNome !== undefined)
        dbData.profissional_nome = data.profissionalNome;
      if (
        data.status === "remarcado" ||
        data.data !== undefined ||
        data.hora !== undefined
      ) {
        dbData.lembrete_24h_enviado_em = null;
        dbData.lembrete_proximo_enviado_em = null;
      }

      // Validação de vaga se estiver remarcando (mudando data/hora) ou trocando profissional
      const needsQuotaCheck =
        data.data !== undefined ||
        data.hora !== undefined ||
        data.profissionalId !== undefined;
      if (needsQuotaCheck) {
        const agOriginal = agendamentosRef.current.find((a) => a.id === id);
        if (agOriginal) {
          const newData = data.data || agOriginal.data;
          const newHora = data.hora || agOriginal.hora;
          const newProfId = data.profissionalId || agOriginal.profissionalId;
          const newUnidId = agOriginal.unidadeId;

          const userRole = authUser?.role || "";
          const rolesToBlock = ["recepcao", "gestao", "coordenador"];

          if (rolesToBlock.includes(userRole)) {
            const turnos = getTurnoInfo(newProfId, newUnidId, newData);
            const meuTurno = turnos.find(
              (t) => newHora >= t.horaInicio && newHora < t.horaFim,
            );

            if (meuTurno) {
              const isSameTurno =
                agOriginal.data === newData &&
                agOriginal.profissionalId === newProfId &&
                agOriginal.hora >= meuTurno.horaInicio &&
                agOriginal.hora < meuTurno.horaFim;

              // Se mudou de turno ou prof, precisa de vaga livre.
              // Se manteve o mesmo turno, a vaga dele já está ocupada, então não bloqueamos.
              if (!isSameTurno && meuTurno.vagasLivresInternas <= 0) {
                toast.error(
                  `Limite de vagas excedido para este turno (${meuTurno.nome}).`,
                );
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
        setAgendamentos((prev) =>
          prev.map((a) => (a.id === id ? { ...a, ...data } : a)),
        );
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
      setAgendamentos((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, status: "cancelado" as const } : a,
        ),
      );
      invalidateCache(queryKeys.agendamentos.all, queryKeys.fila.all);
      // Filtragem da fila reproduzida inline via snapshot module-level.
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
      setAtendimentos((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...data } : a)),
      );
      invalidateCache(queryKeys.atendimentos.all);
    },
    [invalidateCache],
  );

  // Carrega quando o usuário autenticar
  useEffect(() => {
    if (!authUser) return;
    loadAgendamentos();
  }, [authUser, loadAgendamentos]);

  // Realtime ownership migrado do DataProvider (rt:public:agendamentos:all).
  // Handler preserva upsert incremental interiorizado neste slice.
  useRealtimeSync({
    enabled: !!authUser,
    table: "agendamentos",
    onEvent: applyAgendamentoRealtimeEvent,
    poll: refreshAgendamentos,
  });

  const value = useMemo<AgendamentosContextType>(
    () => ({
      agendamentos,
      addAgendamento,
      updateAgendamento,
      cancelAgendamento,
      deleteAgendamento,
      refreshAgendamentos,
      ensureAgendamentosForDate,
      ensureAgendamentosForRange,
      atendimentos,
      addAtendimento,
      updateAtendimento,
    }),
    [
      agendamentos,
      addAgendamento,
      updateAgendamento,
      cancelAgendamento,
      deleteAgendamento,
      refreshAgendamentos,
      ensureAgendamentosForDate,
      ensureAgendamentosForRange,
      atendimentos,
      addAtendimento,
      updateAtendimento,
    ],
  );

  return (
    <AgendamentosContext.Provider value={value}>
      {children}
    </AgendamentosContext.Provider>
  );
};

export const useAgendamentos = () => {
  const ctx = useContext(AgendamentosContext);
  if (!ctx)
    throw new Error(
      "useAgendamentos must be used within AgendamentosSliceProvider",
    );
  return ctx;
};

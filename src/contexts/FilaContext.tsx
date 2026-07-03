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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOperacional } from "@/contexts/OperacionalContext";
import { useAgendamentos } from "@/contexts/AgendamentosContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { setFilaSnapshot } from "@/contexts/_filaBridge";
import type { Agendamento, FilaEspera } from "@/types";

/**
 * FilaContext — Fase 5 (Passo 3.1): dono próprio de `fila`, loader,
 * CRUDs (`addToFila`, `updateFila`, `removeFromFila`), helpers
 * (`checkFilaForSlot`, `encaixarDaFila`) e canal Realtime `public.fila_espera`.
 *
 * Ainda depende de `useData()` só para `addAgendamento` (usado por
 * `encaixarDaFila`) e `logAction`. Essas dependências saem quando
 * `agendamentos` migrar para AgendamentosContext.
 */
interface FilaContextType {
  fila: FilaEspera[];
  addToFila: (f: FilaEspera) => Promise<void>;
  updateFila: (id: string, data: Partial<FilaEspera>) => Promise<void>;
  removeFromFila: (id: string) => Promise<void>;
  refreshFila: () => Promise<void>;
  checkFilaForSlot: (
    profissionalId: string,
    unidadeId: string,
    data: string,
    hora: string,
  ) => FilaEspera[];
  encaixarDaFila: (
    filaId: string,
    agendamento: Omit<Agendamento, "id" | "criadoEm">,
  ) => void;
}

const FilaContext = createContext<FilaContextType | null>(null);

const priorityRank: Record<string, number> = {
  urgente: 0,
  gestante: 1,
  idoso: 2,
  alta: 3,
  pcd: 4,
  crianca: 5,
  normal: 6,
};

const mapFilaRow = (f: any): FilaEspera => ({
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
});

export const FilaSliceProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const queryClient = useQueryClient();
  const { user: authUser } = useAuth();
  const { logAction } = useOperacional();
  const { addAgendamento } = useAgendamentos();
  const isGlobalAdmin = authUser?.usuario === "admin.sms";
  const userUnidadeId = authUser?.unidadeId || "";

  const [fila, setFila] = useState<FilaEspera[]>([]);
  const filaRef = useRef(fila);
  filaRef.current = fila;

  // Mantém o snapshot module-level em dia para o bridge com o DataProvider.
  useEffect(() => {
    setFilaSnapshot(fila);
  }, [fila]);

  const invalidateCache = useCallback(
    (...keys: (readonly string[])[]) => {
      keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
    [queryClient],
  );

  const loadFila = useCallback(async () => {
    try {
      const TERMINAL_STATUSES = [
        "atendido",
        "cancelado",
        "falta",
        "concluido",
        "excluido_da_fila_triagem",
      ];
      const columns =
        "id,paciente_id,paciente_nome,unidade_id,profissional_id,setor,prioridade,prioridade_perfil,status,posicao,hora_chegada,hora_chamada,observacoes,descricao_clinica,cid,criado_por,criado_em,data_solicitacao_original,origem_cadastro,especialidade_destino";

      let allData: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        let query = supabase
          .from("fila_espera" as any)
          .select(columns)
          .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`)
          .order("criado_em", { ascending: true })
          .range(from, from + PAGE - 1);
        if (!isGlobalAdmin && userUnidadeId)
          query = query.eq("unidade_id", userUnidadeId);
        const { data, error } = await query;
        if (error || !data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      setFila(allData.map(mapFilaRow));
    } catch (err) {
      console.error("Error loading fila:", err);
    }
  }, [isGlobalAdmin, userUnidadeId]);

  const refreshFila = useCallback(async () => {
    await loadFila();
  }, [loadFila]);

  const addToFila = useCallback(
    async (f: FilaEspera) => {
      const { error } = await supabase.from("fila_espera" as any).insert({
        id: f.id,
        paciente_id: f.pacienteId,
        paciente_nome: f.pacienteNome,
        unidade_id: f.unidadeId,
        profissional_id: f.profissionalId || "",
        setor: f.setor,
        prioridade: ["normal", "alta", "urgente"].includes(f.prioridade)
          ? f.prioridade
          : "normal",
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
          detalhes: {
            prioridade: f.prioridade,
            origemCadastro: f.origemCadastro,
          },
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
        dbData.prioridade = ["normal", "alta", "urgente"].includes(
          data.prioridade,
        )
          ? data.prioridade
          : "normal";
        dbData.prioridade_perfil = data.prioridade;
      }
      if (data.profissionalId !== undefined)
        dbData.profissional_id = data.profissionalId;
      if (data.unidadeId !== undefined) dbData.unidade_id = data.unidadeId;
      if (data.observacoes !== undefined) dbData.observacoes = data.observacoes;
      if (data.descricaoClinica !== undefined)
        dbData.descricao_clinica = data.descricaoClinica;
      if (data.cid !== undefined) dbData.cid = data.cid;
      if (data.horaChegada !== undefined) dbData.hora_chegada = data.horaChegada;
      if (data.horaChamada !== undefined) dbData.hora_chamada = data.horaChamada;
      if (data.pacienteNome !== undefined)
        dbData.paciente_nome = data.pacienteNome;
      if (data.pacienteId !== undefined) dbData.paciente_id = data.pacienteId;
      if (data.setor !== undefined) dbData.setor = data.setor;
      const { error } = await supabase
        .from("fila_espera" as any)
        .update(dbData)
        .eq("id", id);
      if (!error) {
        setFila((prev) =>
          prev.map((f) => (f.id === id ? { ...f, ...data } : f)),
        );
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
        await logAction({
          acao: "excluir",
          entidade: "fila_espera",
          entidadeId: id,
        });
        invalidateCache(queryKeys.fila.all);
      } else console.error("Error removing from fila:", error);
    },
    [logAction, invalidateCache],
  );

  const checkFilaForSlot = useCallback(
    (
      profissionalId: string,
      unidadeId: string,
      _data: string,
      _hora: string,
    ): FilaEspera[] => {
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
    async (
      filaId: string,
      agData: Omit<Agendamento, "id" | "criadoEm">,
    ) => {
      const newAg: Agendamento = {
        ...agData,
        id: `ag${Date.now()}`,
        criadoEm: new Date().toISOString(),
      };
      await addAgendamento(newAg);
      await updateFila(filaId, { status: "encaixado" as const });
    },
    [addAgendamento, updateFila],
  );

  // Carrega quando o usuário autenticar
  useEffect(() => {
    if (!authUser) return;
    loadFila();
  }, [authUser, loadFila]);

  // Realtime ownership migrado do DataProvider (rt:public:fila_espera:all).
  useRealtimeSync({
    enabled: !!authUser,
    table: "fila_espera",
    onEvent: () => {
      refreshFila();
    },
    poll: refreshFila,
  });

  const value = useMemo<FilaContextType>(
    () => ({
      fila,
      addToFila,
      updateFila,
      removeFromFila,
      refreshFila,
      checkFilaForSlot,
      encaixarDaFila,
    }),
    [
      fila,
      addToFila,
      updateFila,
      removeFromFila,
      refreshFila,
      checkFilaForSlot,
      encaixarDaFila,
    ],
  );

  return <FilaContext.Provider value={value}>{children}</FilaContext.Provider>;
};

export const useFila = () => {
  const ctx = useContext(FilaContext);
  if (!ctx) throw new Error("useFila must be used within FilaSliceProvider");
  return ctx;
};

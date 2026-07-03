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
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { queryKeys } from "@/hooks/queries/queryKeys";
import type { Paciente } from "@/types";

/**
 * PacientesContext — Fase 5 (Passo 3.1): dono próprio do state, loader,
 * CRUDs e canal Realtime de `public.pacientes`. Não consome mais
 * `pacientes/addPaciente/updatePaciente/refreshPacientes` de `useData()`.
 *
 * Ainda depende de `useData()` só para `resolveScopedUnidadeId` (ponte
 * temporária — será eliminada quando `funcionarios` migrar para Operacional).
 */
interface PacientesContextType {
  pacientes: Paciente[];
  addPaciente: (p: Paciente) => Promise<void>;
  updatePaciente: (id: string, data: Partial<Paciente>) => Promise<void>;
  refreshPacientes: () => Promise<void>;
}

const PacientesContext = createContext<PacientesContextType | null>(null);

const mapPacienteRow = (p: any): Paciente => ({
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
  unidadeId: p.unidade_id || "",
  isGestante: !!p.is_gestante,
  isPne: !!p.is_pne,
  isAutista: !!p.is_autista,
  naturalidade: p.naturalidade || "",
  naturalidade_uf: p.naturalidade_uf || "",
  municipio: p.municipio || "",
  menor_idade: !!p.menor_idade,
  nome_responsavel: p.nome_responsavel || "",
  cpf_responsavel: p.cpf_responsavel || "",
  ubs_origem: p.ubs_origem || "",
  profissional_solicitante: p.profissional_solicitante || "",
  tipo_encaminhamento: p.tipo_encaminhamento || "",
  diagnostico_resumido: p.diagnostico_resumido || "",
  justificativa: p.justificativa || "",
  data_encaminhamento: p.data_encaminhamento || "",
  documento_url: p.documento_url || "",
  tipo_condicao: p.tipo_condicao || "",
  mobilidade: p.mobilidade || "",
  usa_dispositivo: !!p.usa_dispositivo,
  tipo_dispositivo: p.tipo_dispositivo || "",
  comunicacao: p.comunicacao || "",
  comportamento: p.comportamento || "",
  usa_equipamentos: !!p.usa_equipamentos,
  equipamentos: p.equipamentos || [],
  observacao_equipamentos: p.observacao_equipamentos || "",
  outro_servico_sus: !!p.outro_servico_sus,
  transporte: p.transporte || "",
  turno_preferido: p.turno_preferido || "",
  especialidade_destino: p.especialidade_destino || "",
  custom_data: p.custom_data || {},
});

export const PacientesSliceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const { user: authUser } = useAuth();
  const { resolveScopedUnidadeId } = useOperacional();
  const isGlobalAdmin = authUser?.usuario === "admin.sms";

  const [pacientes, setPacientes] = useState<Paciente[]>([]);

  const invalidateCache = useCallback(
    (...keys: (readonly string[])[]) => {
      keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
    [queryClient],
  );

  const loadPacientes = useCallback(async () => {
    try {
      const scopedUnidadeId = await resolveScopedUnidadeId();
      if (!isGlobalAdmin && !scopedUnidadeId) {
        setPacientes([]);
        return;
      }
      const PAGE = 1000;
      const columns =
        "id,nome,cpf,cns,nome_mae,telefone,data_nascimento,email,endereco,observacoes,descricao_clinica,cid,criado_em,is_gestante,is_pne,is_autista,unidade_id,naturalidade,naturalidade_uf,municipio,menor_idade,nome_responsavel,cpf_responsavel,ubs_origem,profissional_solicitante,tipo_encaminhamento,diagnostico_resumido,justificativa,data_encaminhamento,documento_url,tipo_condicao,mobilidade,usa_dispositivo,tipo_dispositivo,comunicacao,comportamento,usa_equipamentos,equipamentos,observacao_equipamentos,outro_servico_sus,transporte,turno_preferido,especialidade_destino,custom_data";
      let allData: any[] = [];
      let from = 0;
      while (true) {
        let query = supabase
          .from("pacientes" as any)
          .select(columns)
          .order("criado_em", { ascending: false })
          .range(from, from + PAGE - 1);
        if (!isGlobalAdmin && scopedUnidadeId) {
          query = query.or(`unidade_id.eq.${scopedUnidadeId},unidade_id.is.null,unidade_id.eq.`);
        }
        const { data, error } = await query;
        if (error) {
          console.error("Error loading pacientes:", error);
          break;
        }
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      setPacientes(allData.map(mapPacienteRow));
    } catch (err) {
      console.error("Error loading pacientes:", err);
    }
  }, [isGlobalAdmin, resolveScopedUnidadeId]);

  const refreshPacientes = useCallback(async () => {
    await loadPacientes();
  }, [loadPacientes]);

  const addPaciente = useCallback(
    async (p: Paciente) => {
      const scopedUnidadeId = await resolveScopedUnidadeId();
      if (authUser?.role === "recepcao" && !scopedUnidadeId) {
        throw new Error(
          "Usuário da recepção sem unidade vinculada. Corrija o cadastro do funcionário.",
        );
      }

      const unidadeIdToUse =
        authUser?.role === "recepcao" ? scopedUnidadeId : p.unidadeId || scopedUnidadeId || "";

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
        unidade_id: unidadeIdToUse,
      } as any);

      if (!error) {
        setPacientes((prev) => [{ ...p, unidadeId: unidadeIdToUse }, ...prev]);
        invalidateCache(queryKeys.pacientes.all);
        queryClient.invalidateQueries({ queryKey: queryKeys.pacientes.all });
      } else {
        console.error("Error adding paciente:", error);
        throw error;
      }
    },
    [authUser?.role, invalidateCache, queryClient, resolveScopedUnidadeId],
  );

  const updatePaciente = useCallback(
    async (id: string, data: Partial<Paciente>) => {
      const dbData: any = {};
      const scopedUnidadeId = await resolveScopedUnidadeId();
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

      if (authUser?.role === "recepcao") {
        if (!scopedUnidadeId) {
          throw new Error(
            "Usuário da recepção sem unidade vinculada. Corrija o cadastro do funcionário.",
          );
        }
        dbData.unidade_id = scopedUnidadeId;
      } else if (data.unidadeId !== undefined) {
        dbData.unidade_id = data.unidadeId;
      }

      const { error } = await supabase.from("pacientes" as any).update(dbData).eq("id", id);

      if (!error) {
        setPacientes((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
        invalidateCache(queryKeys.pacientes.all);
        queryClient.invalidateQueries({ queryKey: queryKeys.pacientes.detail(id) });
        invalidateCache(queryKeys.agendamentos.all);
        invalidateCache(queryKeys.fila.all);
      } else {
        console.error("Error updating paciente:", error);
        throw error;
      }
    },
    [authUser?.role, invalidateCache, queryClient, resolveScopedUnidadeId],
  );

  // Carrega quando o usuário autenticar
  useEffect(() => {
    if (!authUser) return;
    loadPacientes();
  }, [authUser, loadPacientes]);

  // Realtime — full-reload debounced pelo próprio hook (poll fallback)
  useRealtimeSync({
    enabled: !!authUser,
    table: "pacientes",
    onEvent: () => {
      refreshPacientes();
    },
    poll: refreshPacientes,
  });

  const value = useMemo<PacientesContextType>(
    () => ({ pacientes, addPaciente, updatePaciente, refreshPacientes }),
    [pacientes, addPaciente, updatePaciente, refreshPacientes],
  );

  return <PacientesContext.Provider value={value}>{children}</PacientesContext.Provider>;
};

export const usePacientes = () => {
  const ctx = useContext(PacientesContext);
  if (!ctx) throw new Error("usePacientes must be used within PacientesSliceProvider");
  return ctx;
};

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
 * PacientesContext — dono próprio do state, loader, CRUDs e canal Realtime
 * de `public.pacientes`.
 */
interface PacientesContextType {
  pacientes: Paciente[];
  addPaciente: (p: Paciente) => Promise<void>;
  updatePaciente: (id: string, data: Partial<Paciente>) => Promise<void>;
  refreshPacientes: () => Promise<void>;
  applySavedPaciente: (row: Record<string, any>) => void;
  activateLegacyPacientes: () => Promise<void>;
  activateAgendaPatients: () => void;
  hydrateAgendaPatients: (ids: string[], force?: boolean) => Promise<Paciente[]>;
  activateTreatmentPatients: () => void;
  hydrateTreatmentPatients: (ids: string[], force?: boolean) => Promise<Paciente[]>;
  activatePatientList: () => void;
}

const PacientesContext = createContext<PacientesContextType | null>(null);

const pacienteColumns =
  "id,nome,cpf,cns,nome_mae,telefone,data_nascimento,email,endereco,observacoes,descricao_clinica,cid,criado_em,is_gestante,is_pne,is_autista,unidade_id,naturalidade,naturalidade_uf,municipio,menor_idade,nome_responsavel,cpf_responsavel,ubs_origem,profissional_solicitante,tipo_encaminhamento,diagnostico_resumido,justificativa,data_encaminhamento,documento_url,tipo_condicao,mobilidade,usa_dispositivo,tipo_dispositivo,comunicacao,comportamento,usa_equipamentos,equipamentos,observacao_equipamentos,outro_servico_sus,transporte,turno_preferido,especialidade_destino,custom_data";

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
  const pacientesRef = useRef(pacientes);
  pacientesRef.current = pacientes;
  const legacyActiveRef = useRef(false);
  const legacyLoadedRef = useRef(false);
  const legacyLoadRef = useRef<Promise<void> | null>(null);
  const agendaModeRef = useRef(false);
  const scopedRouteRef = useRef<"agenda" | "treatments" | "patients" | null>(null);
  const agendaPatientIdsRef = useRef(new Set<string>());
  const agendaEpochRef = useRef(0);
  const scopeKey = `${authUser?.id || "anonymous"}|${authUser?.role || "none"}|${isGlobalAdmin ? "all" : authUser?.unidadeId || "none"}`;
  const scopeKeyRef = useRef(scopeKey);
  scopeKeyRef.current = scopeKey;

  const activateScopedPatients = useCallback((route: "agenda" | "treatments" | "patients") => {
    if (agendaModeRef.current && scopedRouteRef.current === route) return;
    agendaModeRef.current = true;
    scopedRouteRef.current = route;
    agendaEpochRef.current++;
    agendaPatientIdsRef.current.clear();
    legacyActiveRef.current = false;
    legacyLoadedRef.current = false;
    legacyLoadRef.current = null;
    pacientesRef.current = [];
    setPacientes([]);
  }, []);

  const activateAgendaPatients = useCallback(() => activateScopedPatients("agenda"), [activateScopedPatients]);
  const activateTreatmentPatients = useCallback(() => activateScopedPatients("treatments"), [activateScopedPatients]);
  const activatePatientList = useCallback(() => activateScopedPatients("patients"), [activateScopedPatients]);

  const hydrateScopedPatients = useCallback(async (ids: string[], force: boolean, route: "agenda" | "treatments") => {
    activateScopedPatients(route);
    const unique = [...new Set(ids.filter(Boolean))].filter(id => force || !agendaPatientIdsRef.current.has(id));
    if (!unique.length) return pacientesRef.current.filter(p => ids.includes(p.id));
    const epoch = agendaEpochRef.current;
    const scope = scopeKey;
    const scopedUnit = await resolveScopedUnidadeId();
    if (!isGlobalAdmin && !scopedUnit) throw new Error('Unidade do usuário indisponível');
    const rows: Paciente[] = [];
    for (let offset = 0; offset < unique.length; offset += 100) {
      let query = supabase.from('pacientes' as any).select(pacienteColumns)
        .in('id', unique.slice(offset, offset + 100));
      if (!isGlobalAdmin) query = query.or(`unidade_id.eq.${scopedUnit},unidade_id.is.null,unidade_id.eq.`);
      const { data, error } = await query;
      if (error || !data) throw error || new Error('Resposta de pacientes ausente');
      rows.push(...data.map(mapPacienteRow));
    }
    if (epoch !== agendaEpochRef.current || scope !== scopeKeyRef.current || !agendaModeRef.current || scopedRouteRef.current !== route) {
      throw new Error('Leitura de pacientes obsoleta');
    }
    rows.forEach(p => agendaPatientIdsRef.current.add(p.id));
    const byId = new Map(pacientesRef.current.map(p => [p.id, p] as const));
    rows.forEach(p => byId.set(p.id, p));
    const next = [...byId.values()].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    pacientesRef.current = next;
    setPacientes(next);
    return ids.map(id => byId.get(id)).filter((p): p is Paciente => !!p);
  }, [activateScopedPatients, isGlobalAdmin, resolveScopedUnidadeId, scopeKey]);

  const hydrateAgendaPatients = useCallback((ids: string[], force = false) =>
    hydrateScopedPatients(ids, force, "agenda"), [hydrateScopedPatients]);

  // Replace the small visible cohort on page/filter change; never accumulate the entire registry.
  const hydrateTreatmentPatients = useCallback((ids: string[], force = false) => {
    activateTreatmentPatients();
    agendaEpochRef.current++;
    const wanted = new Set(ids.filter(Boolean));
    const kept = pacientesRef.current.filter((p) => wanted.has(p.id));
    pacientesRef.current = kept;
    agendaPatientIdsRef.current = new Set(kept.map((p) => p.id));
    setPacientes(kept);
    return hydrateScopedPatients([...wanted], force, "treatments");
  }, [activateTreatmentPatients, hydrateScopedPatients]);

  const invalidateCache = useCallback(
    (...keys: (readonly string[])[]) => {
      keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
    [queryClient],
  );

  const loadPacientes = useCallback(async () => {
    const requestedScope = scopeKey;
    try {
      const scopedUnidadeId = await resolveScopedUnidadeId();
      if (!isGlobalAdmin && !scopedUnidadeId) {
        setPacientes([]);
        return;
      }
      const PAGE = 1000;
      let allData: any[] = [];
      let from = 0;
      while (true) {
        let query = supabase
          .from("pacientes" as any)
          .select(pacienteColumns)
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
      if (scopeKeyRef.current === requestedScope && !agendaModeRef.current) {
        setPacientes(allData.map(mapPacienteRow));
      }
    } catch (err) {
      console.error("Error loading pacientes:", err);
    }
  }, [isGlobalAdmin, resolveScopedUnidadeId, scopeKey]);

  // The persisted row is already available after saving: patch only a loaded patient.
  const applySavedPaciente = useCallback((row: Record<string, any>) => {
    if (!row?.id || scopeKeyRef.current !== scopeKey) return;
    const current = pacientesRef.current;
    const index = current.findIndex(p => p.id === row.id);
    if (index < 0) return;
    const next = [...current];
    next[index] = { ...current[index], ...mapPacienteRow(row) };
    pacientesRef.current = next;
    setPacientes(next);
  }, [scopeKey]);

  const refreshPacientes = useCallback(async () => {
    if (window.location.pathname === '/painel/pacientes' && scopedRouteRef.current === 'patients') {
      await queryClient.invalidateQueries({ queryKey: queryKeys.pacientes.all });
      return;
    }
    if (agendaModeRef.current && window.location.pathname === '/painel/agenda' && scopedRouteRef.current === 'agenda') {
      await hydrateAgendaPatients([...agendaPatientIdsRef.current], true);
      return;
    }
    if (agendaModeRef.current && window.location.pathname === '/painel/tratamentos' && scopedRouteRef.current === 'treatments') {
      await hydrateTreatmentPatients([...agendaPatientIdsRef.current], true);
      return;
    }
    agendaModeRef.current = false;
    scopedRouteRef.current = null;
    legacyActiveRef.current = true;
    await loadPacientes();
    if (scopeKeyRef.current === scopeKey) legacyLoadedRef.current = true;
  }, [loadPacientes, hydrateAgendaPatients, hydrateTreatmentPatients, scopeKey, queryClient]);

  const activateLegacyPacientes = useCallback(async () => {
    if (agendaModeRef.current) {
      agendaModeRef.current = false;
      scopedRouteRef.current = null;
      agendaEpochRef.current++;
      agendaPatientIdsRef.current.clear();
      legacyLoadedRef.current = false;
    }
    legacyActiveRef.current = true;
    if (legacyLoadedRef.current) return;
    if (legacyLoadRef.current) return legacyLoadRef.current;

    const pending = loadPacientes().then(() => {
      if (scopeKeyRef.current === scopeKey) legacyLoadedRef.current = true;
    }).finally(() => {
      if (legacyLoadRef.current === pending) legacyLoadRef.current = null;
    });
    legacyLoadRef.current = pending;
    return pending;
  }, [loadPacientes, scopeKey]);

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

  // A1.1: mantém o provider montado, mas só ativa a carga legada sob demanda.
  useEffect(() => {
    agendaModeRef.current = false;
    scopedRouteRef.current = null;
    agendaEpochRef.current++;
    agendaPatientIdsRef.current.clear();
    pacientesRef.current = [];
    legacyActiveRef.current = false;
    legacyLoadedRef.current = false;
    legacyLoadRef.current = null;
    setPacientes([]);
  }, [scopeKey]);

  // Realtime — full-reload debounced pelo próprio hook (poll fallback)
  useRealtimeSync({
    enabled: !!authUser,
    table: "pacientes",
    onEvent: () => {
      if (agendaModeRef.current && ((scopedRouteRef.current === 'agenda' && window.location.pathname === '/painel/agenda') ||
        (scopedRouteRef.current === 'treatments' && window.location.pathname === '/painel/tratamentos'))) {
        void refreshPacientes();
        return;
      }
      if (legacyActiveRef.current) loadPacientes();
    },
    poll: () => {
      if (agendaModeRef.current && ((scopedRouteRef.current === 'agenda' && window.location.pathname === '/painel/agenda') ||
        (scopedRouteRef.current === 'treatments' && window.location.pathname === '/painel/tratamentos'))) return refreshPacientes();
      if (legacyActiveRef.current) return loadPacientes();
      return Promise.resolve();
    },
  });

  const value = useMemo<PacientesContextType>(
    () => ({ pacientes, addPaciente, updatePaciente, refreshPacientes, applySavedPaciente, activateLegacyPacientes, activateAgendaPatients, hydrateAgendaPatients, activateTreatmentPatients, hydrateTreatmentPatients, activatePatientList }),
    [pacientes, addPaciente, updatePaciente, refreshPacientes, applySavedPaciente, activateLegacyPacientes, activateAgendaPatients, hydrateAgendaPatients, activateTreatmentPatients, hydrateTreatmentPatients, activatePatientList],
  );

  return <PacientesContext.Provider value={value}>{children}</PacientesContext.Provider>;
};

export const usePacientes = () => {
  const ctx = useContext(PacientesContext);
  if (!ctx) throw new Error("usePacientes must be used within PacientesSliceProvider");
  return ctx;
};

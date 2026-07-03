import React, { createContext, useContext, useMemo } from "react";
import { useData, type TurnoInfoResult } from "@/contexts/DataContext";
import type {
  Unidade,
  Sala,
  Setor,
  User,
  Disponibilidade,
  Configuracoes,
} from "@/types";

/**
 * OperacionalContext — slice memoizado do DataContext para tudo que é
 * estrutura operacional (unidades, salas, setores, funcionários,
 * disponibilidades, bloqueios, configurações) + cálculos de agenda que
 * dependem desse conjunto.
 *
 * Fase 1: fachada. Fase 2 (TODO): mover useRealtimeSync das tabelas
 * disponibilidades, bloqueios, funcionarios, system_config e os loaders
 * correspondentes para este provider.
 */
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

interface OperacionalContextType {
  unidades: Unidade[];
  salas: Sala[];
  setores: Setor[];
  funcionarios: User[];
  disponibilidades: Disponibilidade[];
  bloqueios: BloqueioAgenda[];
  configuracoes: Configuracoes;
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
  refreshFuncionarios: () => Promise<void>;
  refreshDisponibilidades: () => Promise<void>;
  refreshBloqueios: () => Promise<void>;
  logAction: ReturnType<typeof useData>["logAction"];
}

const OperacionalContext = createContext<OperacionalContextType | null>(null);

export const OperacionalSliceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const data = useData();

  const {
    unidades,
    salas,
    setores,
    funcionarios,
    disponibilidades,
    bloqueios,
    configuracoes,
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
    refreshFuncionarios,
    refreshDisponibilidades,
    refreshBloqueios,
    logAction,
  } = data;

  const value = useMemo<OperacionalContextType>(
    () => ({
      unidades,
      salas,
      setores,
      funcionarios,
      disponibilidades,
      bloqueios,
      configuracoes,
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
      refreshFuncionarios,
      refreshDisponibilidades,
      refreshBloqueios,
      logAction,
    }),
    [
      unidades,
      salas,
      setores,
      funcionarios,
      disponibilidades,
      bloqueios,
      configuracoes,
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
      refreshFuncionarios,
      refreshDisponibilidades,
      refreshBloqueios,
      logAction,
    ],
  );

  return <OperacionalContext.Provider value={value}>{children}</OperacionalContext.Provider>;
};

export const useOperacional = () => {
  const ctx = useContext(OperacionalContext);
  if (!ctx) throw new Error("useOperacional must be used within OperacionalSliceProvider");
  return ctx;
};

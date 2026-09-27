import { useEffect, useRef, useState } from "react";
import { createRequestGeneration } from "@/lib/requestGeneration";

export interface TreatmentPtsRecord {
  id: string;
  patient_id: string;
  professional_id: string;
  unit_id: string;
  diagnostico_funcional: string;
  objetivos_terapeuticos: string;
  metas_curto_prazo: string;
  metas_medio_prazo: string;
  metas_longo_prazo: string;
  especialidades_envolvidas: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

interface UseTreatmentPtsDataOptions {
  createOpen: boolean;
  createPatientId: string | null;
  cyclePatientId: string | null;
  linkedPtsId: string | null;
  scopeKey: string;
  loadActivePtsForPatient: (patientId: string) => Promise<TreatmentPtsRecord[]>;
  loadPtsById: (ptsId: string) => Promise<TreatmentPtsRecord | null>;
  onError?: (error: unknown) => void;
}

export function useTreatmentPtsData({
  createOpen,
  createPatientId,
  cyclePatientId,
  linkedPtsId,
  scopeKey,
  loadActivePtsForPatient,
  loadPtsById,
  onError,
}: UseTreatmentPtsDataOptions) {
  const createGeneration = useRef(createRequestGeneration());
  const cycleGeneration = useRef(createRequestGeneration());
  const linkedGeneration = useRef(createRequestGeneration());
  const [createPtsResult, setCreatePtsResult] = useState<{ key: string; records: TreatmentPtsRecord[] } | null>(null);
  const [cyclePtsResult, setCyclePtsResult] = useState<{ key: string; records: TreatmentPtsRecord[] } | null>(null);
  const [linkedPtsResult, setLinkedPtsResult] = useState<{ key: string; record: TreatmentPtsRecord | null } | null>(null);
  const [createPtsLoadingKey, setCreatePtsLoadingKey] = useState<string | null>(null);
  const [cyclePtsLoadingKey, setCyclePtsLoadingKey] = useState<string | null>(null);
  const [linkedPtsLoadingKey, setLinkedPtsLoadingKey] = useState<string | null>(null);

  useEffect(() => {
    const generation = createGeneration.current;
    const requestId = generation.next();
    if (!createOpen || !createPatientId) {
      setCreatePtsLoadingKey(null);
      return;
    }

    const key = `${scopeKey}|${createPatientId}`;
    setCreatePtsLoadingKey(key);
    loadActivePtsForPatient(createPatientId)
      .then((records) => {
        if (generation.isCurrent(requestId)) setCreatePtsResult({ key, records });
      })
      .catch((error) => {
        if (!generation.isCurrent(requestId)) return;
        setCreatePtsResult({ key, records: [] });
        onError?.(error);
      })
      .finally(() => {
        if (generation.isCurrent(requestId)) setCreatePtsLoadingKey(null);
      });

    return () => generation.invalidate();
  }, [createOpen, createPatientId, scopeKey, loadActivePtsForPatient, onError]);

  useEffect(() => {
    const generation = cycleGeneration.current;
    const requestId = generation.next();
    if (!cyclePatientId) {
      setCyclePtsLoadingKey(null);
      return;
    }

    const key = `${scopeKey}|${cyclePatientId}`;
    setCyclePtsLoadingKey(key);
    loadActivePtsForPatient(cyclePatientId)
      .then((records) => {
        if (generation.isCurrent(requestId)) setCyclePtsResult({ key, records });
      })
      .catch((error) => {
        if (!generation.isCurrent(requestId)) return;
        setCyclePtsResult({ key, records: [] });
        onError?.(error);
      })
      .finally(() => {
        if (generation.isCurrent(requestId)) setCyclePtsLoadingKey(null);
      });

    return () => generation.invalidate();
  }, [cyclePatientId, scopeKey, loadActivePtsForPatient, onError]);

  useEffect(() => {
    const generation = linkedGeneration.current;
    const requestId = generation.next();
    if (!linkedPtsId) {
      setLinkedPtsLoadingKey(null);
      return;
    }

    const key = `${scopeKey}|${linkedPtsId}`;
    setLinkedPtsLoadingKey(key);
    loadPtsById(linkedPtsId)
      .then((record) => {
        if (generation.isCurrent(requestId)) setLinkedPtsResult({ key, record });
      })
      .catch((error) => {
        if (!generation.isCurrent(requestId)) return;
        setLinkedPtsResult({ key, record: null });
        onError?.(error);
      })
      .finally(() => {
        if (generation.isCurrent(requestId)) setLinkedPtsLoadingKey(null);
      });

    return () => generation.invalidate();
  }, [linkedPtsId, scopeKey, loadPtsById, onError]);

  const createKey = createOpen && createPatientId ? `${scopeKey}|${createPatientId}` : null;
  const cycleKey = cyclePatientId ? `${scopeKey}|${cyclePatientId}` : null;
  const linkedKey = linkedPtsId ? `${scopeKey}|${linkedPtsId}` : null;

  return {
    createPts: createKey && createPtsResult?.key === createKey ? createPtsResult.records : [],
    cyclePts: cycleKey && cyclePtsResult?.key === cycleKey ? cyclePtsResult.records : [],
    linkedPts: linkedKey && linkedPtsResult?.key === linkedKey ? linkedPtsResult.record : null,
    createPtsLoading: !!createKey && (createPtsLoadingKey === createKey || createPtsResult?.key !== createKey),
    cyclePtsLoading: !!cycleKey && (cyclePtsLoadingKey === cycleKey || cyclePtsResult?.key !== cycleKey),
    linkedPtsLoading: !!linkedKey && (linkedPtsLoadingKey === linkedKey || linkedPtsResult?.key !== linkedKey),
  };
}

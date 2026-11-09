export function extractBpaCidCodes(value: unknown): string[] {
  const seen = new WeakSet<object>();
  const visit = (v: unknown): string[] => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return [];
      seen.add(v);
      if (Array.isArray(v)) {
        const ordered = [...v].sort((a, b) => Number(isPrincipal(b)) - Number(isPrincipal(a)));
        return ordered.flatMap(visit);
      }
      const obj = v as Record<string, unknown>;
      return ["cid_principal", "cidPrincipal", "codigo", "code", "cid_codigo", "cid", "cid10", "value", "cids", "cids_selecionados"].flatMap(k => visit(obj[k]));
    }
    if (typeof v === "string" && /^[\[{]/.test(v.trim())) {
      try { return visit(JSON.parse(v)); } catch { /* plain clinical text */ }
    }
    return extractText(v);
  };
  return [...new Set(visit(value))];
}

function isPrincipal(v: any): boolean {
  return v?.principal === true || v?.is_principal === true || v?.tipo === "principal";
}

function extractText(value: unknown): string[] {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text) return [];
  const found: string[] = [];
  const regex = /(?:^|[^A-Z0-9])([A-Z]\d{2}(?:\.[A-Z0-9]|[A-Z0-9])?)(?=$|[^A-Z0-9])/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const code = match[1].replace(/\./g, "");
    if (!found.includes(code)) found.push(code);
  }
  return found;
}

/** Prefer the procedure-specific CID, then explicit clinical fields; never invent a diagnosis. */
export type BpaCidInput = {
  procedureCid?: unknown;
  productionCid?: unknown;
  prontuario?: any;
  paciente?: any;
  /** CID(s) do PTS do paciente — usado só quando o prontuário não traz CID. */
  ptsCid?: unknown;
  /** CID(s) de outra sessão realizada do mesmo ciclo e procedimento, usado apenas como último fallback. */
  treatmentCycleCid?: unknown;
};

export interface BpaTreatmentCycleCidCandidate {
  cycleId: string;
  procedureCode: string;
  patientId: string;
  professionalId: string;
  unitId: string;
  appointmentId: string;
  sessionNumber?: number | string | null;
  scheduledDate?: string | null;
  status: string;
  cids: unknown;
}

export type BpaTreatmentCycleCidTarget = Pick<
  BpaTreatmentCycleCidCandidate,
  "cycleId" | "procedureCode" | "patientId" | "professionalId" | "unitId" | "appointmentId" | "sessionNumber" | "scheduledDate"
>;

export interface BpaTreatmentCycleCidResolution {
  cids: string[];
  sessionNumber: number | null;
  scheduledDate: string;
}

/**
 * Recupera o CID apenas de outra sessão REALIZADA do mesmo paciente, profissional,
 * unidade, ciclo e código SIGTAP. Entre referências igualmente próximas, prefere
 * a sessão anterior; nunca usa falta, outro ciclo ou outro procedimento.
 */
export function resolveBpaTreatmentCycleCid(
  candidates: readonly BpaTreatmentCycleCidCandidate[],
  target: BpaTreatmentCycleCidTarget,
): BpaTreatmentCycleCidResolution | null {
  const normalizeCode = (value: unknown) => String(value ?? "").replace(/\D/g, "");
  const targetNumber = Number(target.sessionNumber);
  const hasTargetNumber = Number.isFinite(targetNumber) && targetNumber > 0;
  const targetDate = String(target.scheduledDate ?? "").slice(0, 10);
  const targetTime = targetDate ? Date.parse(`${targetDate}T00:00:00Z`) : NaN;

  const valid = candidates.flatMap((candidate) => {
    if (
      candidate.status?.trim().toLowerCase() !== "realizada" ||
      candidate.cycleId !== target.cycleId ||
      normalizeCode(candidate.procedureCode) !== normalizeCode(target.procedureCode) ||
      candidate.patientId !== target.patientId ||
      candidate.professionalId !== target.professionalId ||
      candidate.unitId !== target.unitId ||
      candidate.appointmentId === target.appointmentId
    ) return [];

    const cids = extractBpaCidCodes(candidate.cids);
    if (!cids.length) return [];
    const number = Number(candidate.sessionNumber);
    const hasNumber = Number.isFinite(number) && number > 0;
    const date = String(candidate.scheduledDate ?? "").slice(0, 10);
    const time = date ? Date.parse(`${date}T00:00:00Z`) : NaN;
    const distance = hasTargetNumber && hasNumber
      ? Math.abs(number - targetNumber)
      : Number.isFinite(targetTime) && Number.isFinite(time)
        ? Math.abs(time - targetTime)
        : Number.POSITIVE_INFINITY;
    const isPrevious = hasTargetNumber && hasNumber
      ? number < targetNumber
      : Number.isFinite(targetTime) && Number.isFinite(time) && time < targetTime;
    return [{ candidate, cids, number: hasNumber ? number : null, date, time, distance, isPrevious }];
  });

  valid.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (a.isPrevious !== b.isPrevious) return a.isPrevious ? -1 : 1;
    if (a.isPrevious && b.isPrevious) {
      if (a.number !== null && b.number !== null && a.number !== b.number) return b.number - a.number;
      if (Number.isFinite(a.time) && Number.isFinite(b.time) && a.time !== b.time) return b.time - a.time;
    } else {
      if (a.number !== null && b.number !== null && a.number !== b.number) return a.number - b.number;
      if (Number.isFinite(a.time) && Number.isFinite(b.time) && a.time !== b.time) return a.time - b.time;
    }
    return a.candidate.appointmentId.localeCompare(b.candidate.appointmentId);
  });

  const selected = valid[0];
  return selected
    ? {
        cids: selected.cids,
        sessionNumber: selected.number,
        scheduledDate: selected.date,
      }
    : null;
}

/**
 * Resolve CIDs de procedimentos sem CID antes da validação final do BPA-I.
 * Só considera outra sessão realizada com o mesmo ciclo, paciente, profissional,
 * unidade e código SIGTAP. Um CID já informado no procedimento nunca é substituído.
 */
export function resolveBpaTreatmentCycleCidsForProcedures(
  procedures: readonly { codigo: string; cid?: unknown }[],
  candidates: readonly BpaTreatmentCycleCidCandidate[],
  target: Omit<BpaTreatmentCycleCidTarget, "procedureCode">,
): Map<string, BpaTreatmentCycleCidResolution> {
  const resolutions = new Map<string, BpaTreatmentCycleCidResolution>();

  for (const procedure of procedures) {
    if (String(procedure.cid ?? "").trim()) continue;
    const procedureCode = String(procedure.codigo ?? "").replace(/\D/g, "");
    if (!procedureCode || resolutions.has(procedureCode)) continue;

    const resolution = resolveBpaTreatmentCycleCid(candidates, {
      ...target,
      procedureCode,
    });
    if (resolution) resolutions.set(procedureCode, resolution);
  }

  return resolutions;
}

export interface BpaSamePatientProcedureCidCandidate {
  patientId: string;
  procedureCode: string;
  appointmentId: string;
  scheduledDate: string;
  status: string;
  cids: unknown;
}

/**
 * Fallback específico da conferência BPA-I: usa CID de outro dia somente
 * quando paciente e código SIGTAP são exatamente os mesmos. A fonte deve
 * ser um prontuário finalizado e conter CID vinculado ao procedimento.
 */
export function resolveBpaSamePatientProcedureCid(
  candidates: readonly BpaSamePatientProcedureCidCandidate[],
  target: { patientId: string; appointmentId: string; scheduledDate: string },
): BpaTreatmentCycleCidResolution | null {
  const targetDate = String(target.scheduledDate || "").slice(0, 10);
  const targetTime = targetDate ? Date.parse(`${targetDate}T00:00:00Z`) : NaN;
  const valid = candidates.flatMap((candidate) => {
    const date = String(candidate.scheduledDate || "").slice(0, 10);
    if (
      candidate.patientId !== target.patientId ||
      candidate.appointmentId === target.appointmentId ||
      date === targetDate ||
      candidate.status?.trim().toLowerCase() !== "finalizado"
    ) return [];
    const cids = extractBpaCidCodes(candidate.cids);
    if (!cids.length) return [];
    const time = date ? Date.parse(`${date}T00:00:00Z`) : NaN;
    if (!Number.isFinite(time) || !Number.isFinite(targetTime)) return [];
    return [{ candidate, cids, date, time, distance: Math.abs(time - targetTime), previous: time < targetTime }];
  });
  valid.sort((a, b) =>
    a.distance - b.distance ||
    Number(b.previous) - Number(a.previous) ||
    a.candidate.appointmentId.localeCompare(b.candidate.appointmentId)
  );
  const selected = valid[0];
  return selected ? { cids: selected.cids, sessionNumber: null, scheduledDate: selected.date } : null;
}

export function resolveBpaSamePatientProcedureCidsForProcedures(
  procedures: readonly { codigo: string; cid?: unknown }[],
  candidates: readonly BpaSamePatientProcedureCidCandidate[],
  target: { patientId: string; appointmentId: string; scheduledDate: string },
): Map<string, BpaTreatmentCycleCidResolution> {
  const resolutions = new Map<string, BpaTreatmentCycleCidResolution>();
  for (const procedure of procedures) {
    if (String(procedure.cid ?? "").trim()) continue;
    const code = String(procedure.codigo ?? "").replace(/\\D/g, "");
    if (!code || resolutions.has(code)) continue;
    const resolution = resolveBpaSamePatientProcedureCid(
      candidates.filter((candidate) => String(candidate.procedureCode ?? "").replace(/\\D/g, "") === code),
      target,
    );
    if (resolution) resolutions.set(code, resolution);
  }
  return resolutions;
}

export function resolveBpaCidDetails(input: BpaCidInput) {
  const pront = input.prontuario || {};
  const clinical = pront.custom_data || {};
  const dados = pront.dados || clinical.dados || {};
  const patient = input.paciente || {};
  const patientData = patient.custom_data || {};
  const candidates = [
    input.procedureCid,
    input.productionCid,
    pront.cid_principal,
    clinical.cid_principal,
    clinical.cidPrincipal,
    pront.cid,
    pront.cid10,
    clinical.cid,
    clinical.cid10,
    clinical.diagnostico_cid,
    clinical.hipotese_cid,
    clinical.esp_hipotese_cid,
    pront.diagCid,
    pront.diagnostico_cid,
    pront.hipotese_diagnostica,
    clinical.hipotese_diagnostica,
    clinical.hipotese_diagnostica_cid,
    clinical.cids,
    clinical.cids_selecionados,
    pront.cids_selecionados,
    pront.hipotese,
    clinical.hipotese,
    dados.cid,
    dados.cid10,
    dados.cid_principal,
    input.treatmentCycleCid,
    input.ptsCid,
    patient.cid,
    patient.cid10,
    patientData.cid,
    patientData.cid10,
    patientData.cid_principal,
  ];
  for (const candidate of candidates) {
    const codes = extractBpaCidCodes(candidate);
    if (codes.length) return { cid: codes[0], adicionais: codes.slice(1) };
  }
  return { cid: "", adicionais: [] as string[] };
}

export function resolveBpaCid(input: BpaCidInput): string {
  return resolveBpaCidDetails(input).cid;
}

export interface BpaProcedureCandidate {
  codigo: string;
  origem: string;
  cid?: string;
}

export interface BpaProcedureRepetition {
  key: string;
  kept: BpaProcedureCandidate;
  repeated: BpaProcedureCandidate;
  reason: string;
}

export interface BpaAttendanceIdentity {
  agendamentoId?: unknown;
  prontuarioId?: unknown;
  pacienteId?: unknown;
  profissionalId?: unknown;
  unidadeId?: unknown;
  dataAtendimento?: unknown;
}

const text = (value: unknown) => String(value ?? "").trim();

export function buildBpaAttendanceKey(identity: BpaAttendanceIdentity): string {
  const agendamentoId = text(identity.agendamentoId);
  if (agendamentoId) return `agendamento:${agendamentoId}`;

  const prontuarioId = text(identity.prontuarioId);
  if (prontuarioId) return `prontuario:${prontuarioId}`;

  return [
    "contexto",
    text(identity.pacienteId),
    text(identity.profissionalId),
    text(identity.unidadeId),
    text(identity.dataAtendimento).slice(0, 10),
  ].join("|");
}

export function buildBpaProductionKey(
  identity: BpaAttendanceIdentity,
  procedure: Pick<BpaProcedureCandidate, "codigo" | "cid">,
  allowsMultipleProcedures: boolean,
): string {
  const parts = [buildBpaAttendanceKey(identity), text(procedure.codigo)];
  if (!allowsMultipleProcedures) parts.push(text(procedure.cid));
  return parts.join("|");
}

export function consolidateBpaProcedureCandidates(
  candidates: BpaProcedureCandidate[],
  dedupeOnlyByCode: boolean,
): { consolidated: BpaProcedureCandidate[]; repetitions: BpaProcedureRepetition[] } {
  const consolidated: BpaProcedureCandidate[] = [];
  const repetitions: BpaProcedureRepetition[] = [];

  for (const candidate of candidates) {
    if (!candidate.codigo) continue;
    const cid = candidate.cid || "";

    if (dedupeOnlyByCode) {
      const existingIndex = consolidated.findIndex((item) => item.codigo === candidate.codigo);
      if (existingIndex >= 0) {
        const kept = consolidated[existingIndex];
        if (cid && !kept.cid) {
          consolidated[existingIndex] = { ...candidate, cid };
        }
        repetitions.push({
          key: candidate.codigo,
          kept,
          repeated: candidate,
          reason: "Mesmo SIGTAP repetido entre fontes do mesmo atendimento",
        });
        continue;
      }
      consolidated.push({ ...candidate, cid });
      continue;
    }

    const sameCodeWithoutCidIndex = consolidated.findIndex(
      (item) => item.codigo === candidate.codigo && !item.cid,
    );
    if (cid && sameCodeWithoutCidIndex >= 0) {
      const kept = consolidated[sameCodeWithoutCidIndex];
      consolidated.splice(sameCodeWithoutCidIndex, 1, { ...candidate, cid });
      repetitions.push({
        key: `${candidate.codigo}|`,
        kept,
        repeated: candidate,
        reason: "Mesmo SIGTAP repetido; mantida a ocorrência com CID",
      });
      continue;
    }

    const sameCode = consolidated.find((item) => item.codigo === candidate.codigo);
    if (!cid && sameCode) {
      repetitions.push({
        key: `${candidate.codigo}|`,
        kept: sameCode,
        repeated: candidate,
        reason: "Mesmo SIGTAP sem CID repetido entre fontes do mesmo atendimento",
      });
      continue;
    }

    const key = `${candidate.codigo}|${cid}`;
    const sameProcedure = consolidated.find(
      (item) => `${item.codigo}|${item.cid || ""}` === key,
    );
    if (sameProcedure) {
      repetitions.push({
        key,
        kept: sameProcedure,
        repeated: candidate,
        reason: "Mesmo SIGTAP e CID repetidos entre fontes do mesmo atendimento",
      });
      continue;
    }
    consolidated.push({ ...candidate, cid });
  }

  return { consolidated, repetitions };
}
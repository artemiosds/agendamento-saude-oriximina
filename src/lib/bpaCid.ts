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
};

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

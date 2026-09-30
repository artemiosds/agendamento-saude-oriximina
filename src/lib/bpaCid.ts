export function extractBpaCidCodes(value: unknown): string[] {
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
export function resolveBpaCid(input: {
  procedureCid?: unknown;
  productionCid?: unknown;
  prontuario?: any;
  paciente?: any;
}): string {
  const pront = input.prontuario || {};
  const clinical = pront.custom_data || {};
  const dados = pront.dados || clinical.dados || {};
  const patient = input.paciente || {};
  const patientData = patient.custom_data || {};
  const candidates = [
    input.procedureCid,
    input.productionCid,
    pront.cid,
    pront.cid10,
    pront.cid_principal,
    clinical.cid,
    clinical.cid10,
    clinical.cid_principal,
    clinical.cidPrincipal,
    clinical.diagnostico_cid,
    clinical.hipotese_cid,
    dados.cid,
    dados.cid10,
    dados.cid_principal,
    patient.cid,
    patient.cid10,
    patientData.cid,
    patientData.cid10,
    patientData.cid_principal,
  ];
  for (const candidate of candidates) {
    const code = extractBpaCidCodes(candidate)[0];
    if (code) return code;
  }
  return "";
}

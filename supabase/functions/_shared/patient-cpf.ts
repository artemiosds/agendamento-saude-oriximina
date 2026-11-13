export function normalizePatientCpf(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

/** A valid checksum is not a lookup or confirmation of ownership. */
export function patientCpfError(value: unknown, options: {
  semCpf?: boolean;
  previousCpf?: unknown;
} = {}): string | undefined {
  const raw = typeof value === 'string' ? value.trim() : '';
  const digits = normalizePatientCpf(raw);
  if (options.previousCpf !== undefined && digits === normalizePatientCpf(options.previousCpf)
      && (digits || !raw) && !/[^\d.\s-]/.test(raw)) return;
  if (!raw) {
    if (options.semCpf === true && !normalizePatientCpf(options.previousCpf)) return;
    return 'CPF do paciente é obrigatório.';
  }
  if (!/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(raw) || /^(\d)\1{10}$/.test(digits)) {
    return 'CPF do paciente inválido.';
  }
  for (const length of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(digits[i]) * (length + 1 - i);
    if ((sum * 10) % 11 % 10 !== Number(digits[length])) return 'CPF do paciente inválido.';
  }
}

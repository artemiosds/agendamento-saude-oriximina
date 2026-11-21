export type QuickSearchTerm =
  | { kind: 'name'; name: string }
  | { kind: 'cpf' | 'cns' | 'sigtap'; digits: string };

export type QuickSearchPatient = { id: string; nome: string };
export type QuickSearchPatientLink = QuickSearchPatient & { userId: string; unitId: string };

export function parseQuickSearchTerm(input: string): QuickSearchTerm | null {
  const value = input.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (/^[0-9. -]+$/.test(value)) {
    const digits = value.replace(/\D/g, '');
    if (digits.length === 10) return { kind: 'sigtap', digits };
    if (digits.length === 11) return { kind: 'cpf', digits };
    if (digits.length === 15) return { kind: 'cns', digits };
    return null;
  }
  return /^\p{L}[\p{L}\p{M} .'’-]{2,79}$/u.test(value) && (value.match(/\p{L}/gu)?.length ?? 0) >= 3
    ? { kind: 'name', name: value }
    : null;
}

export function quickSearchCpfVariants(digits: string): string[] {
  return [digits, digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')];
}

/** Free text is optional; audit must explicitly distinguish omission from a stated reason. */
export function treatmentDateChangeReason(value?: string | null): string {
  return value?.trim() || 'Motivo não informado (campo opcional).';
}

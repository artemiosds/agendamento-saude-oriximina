export interface TreatmentCycleScopeRecord {
  id: string;
  unit_id: string;
  professional_id: string;
}

/** Cycle ownership is the authoritative unit scope for its sessions. */
export const getTreatmentCycleIdsForScope = <T extends TreatmentCycleScopeRecord>(
  cycles: T[],
  unitId: string,
  professionalId: string,
): Set<string> => new Set(cycles
  .filter(cycle => (unitId === 'all' || cycle.unit_id === unitId)
    && (professionalId === 'all' || cycle.professional_id === professionalId))
  .map(cycle => cycle.id));

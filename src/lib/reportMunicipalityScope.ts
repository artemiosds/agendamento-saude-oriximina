export interface MunicipalityPatientCount {
  pacientesCount: number;
}

/** Selects the municipality with the largest registered-patient count. */
export const getMunicipalityWithMostPatients = <T extends MunicipalityPatientCount>(
  municipalities: T[],
): T | null => municipalities.reduce<T | null>((leader, candidate) =>
  !leader || candidate.pacientesCount > leader.pacientesCount ? candidate : leader, null);

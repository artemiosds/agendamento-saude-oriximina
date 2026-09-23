/** Legal priority is independent from the risk selected during triage. */
export interface QueuePriorityPatient {
  dataNascimento?: string | null;
  isGestante?: boolean;
  isPne?: boolean;
  isAutista?: boolean;
}

export function patientAge(dob?: string | null, today = new Date()): number | null {
  const iso = dob?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const br = dob?.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!iso && !br) return null;
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [Number(br![3]), Number(br![2]), Number(br![1])];
  const birth = new Date(year, month - 1, day);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day || birth > today) return null;
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--;
  return age;
}

export function hasTriageTea(comorbidities: unknown): boolean {
  return Array.isArray(comorbidities) && comorbidities.some((value) =>
    /\bTEA\b|autis/i.test(String(value ?? "")),
  );
}

export function legalPriorityKey(patient?: QueuePriorityPatient | null, triageTea = false, today = new Date()) {
  const age = patientAge(patient?.dataNascimento, today);
  return {
    tier: age !== null && age >= 80 ? 0 :
      (age !== null && age >= 60) || !!patient?.isGestante || !!patient?.isPne || !!patient?.isAutista || triageTea ? 1 : 2,
    age,
  };
}

export function compareLegalPriority(
  a: ReturnType<typeof legalPriorityKey>,
  b: ReturnType<typeof legalPriorityKey>,
): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  // Among older patients in the same priority group, the older goes first.
  if (a.age !== null && b.age !== null && a.age >= 60 && b.age >= 60) return b.age - a.age;
  return 0;
}

export function compareClinicalAndLegalPriority(
  aRisk: number,
  aLegal: ReturnType<typeof legalPriorityKey>,
  bRisk: number,
  bLegal: ReturnType<typeof legalPriorityKey>,
): number {
  return aRisk - bRisk || compareLegalPriority(aLegal, bLegal);
}

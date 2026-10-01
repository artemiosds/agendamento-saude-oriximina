type BpaBatchResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/** Keep each PostgREST response below the project's 1,000-row limit. */
export async function loadBpaEntitiesByIds<T>(
  ids: string[],
  source: string,
  fetchBatch: (batch: string[]) => Promise<BpaBatchResult<T>>,
): Promise<T[]> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const rows: T[] = [];
  for (let i = 0; i < uniqueIds.length; i += 500) {
    const batch = uniqueIds.slice(i, i + 500);
    const { data, error } = await fetchBatch(batch);
    if (error) throw new Error(`Erro ao consultar ${source}: ${error.message}`);
    rows.push(...(data || []));
  }
  return rows;
}

/** A PTS plan alone does not prove that its procedure was performed that day. */
export function includeBpaProductionResolution(
  source: string,
  procedureCode: string,
  performedSessionCodes: string[],
): boolean {
  if (source.toLowerCase() !== "pts") return true;
  return performedSessionCodes.includes(procedureCode);
}

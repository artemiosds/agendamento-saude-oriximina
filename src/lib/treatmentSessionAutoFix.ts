import { supabase } from '@/integrations/supabase/client';

export type AutoFixItemStatus =
  | 'corrigido'
  | 'data_valida'
  | 'ja_pendente'
  | 'vinculo_inconsistente'
  | 'estado_protegido'
  | 'falha';

export interface AutoFixItemResult {
  session_id: string;
  status: AutoFixItemStatus;
  reason?: string;
}

interface AutoFixBatchResponse {
  results: AutoFixItemResult[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface AutoFixResult {
  scanned: number;
  fixed: number;
  errors: number;
  items: AutoFixItemResult[];
}

/** Each batch rechecks current blocks and protects each pair with a subtransaction. */
export async function autoFixInvalidTreatmentSessions(): Promise<AutoFixResult> {
  const result: AutoFixResult = { scanned: 0, fixed: 0, errors: 0, items: [] };
  let cursor: string | null = null;
  let hasMore = true;
  const client = supabase as unknown as {
    rpc: (name: string, args: { p_after: string | null; p_limit: number }) =>
      Promise<{ data: unknown; error: { message: string } | null }>;
  };

  try {
    while (hasMore) {
      const { data, error } = await client.rpc('auto_fix_invalid_treatment_sessions_batch', {
        p_after: cursor,
        p_limit: 100,
      });
      if (error) throw error;

      const batch = data as AutoFixBatchResponse | null;
      if (!batch || !Array.isArray(batch.results) || typeof batch.has_more !== 'boolean') {
        throw new Error('Resposta inválida do autoajuste de sessões.');
      }
      if (batch.has_more && (!batch.next_cursor || batch.next_cursor === cursor)) {
        throw new Error('Cursor inválido do autoajuste de sessões.');
      }

      result.items.push(...batch.results);
      result.scanned += batch.results.length;
      result.fixed += batch.results.filter((item) => item.status === 'corrigido').length;
      result.errors += batch.results.filter((item) => item.status === 'falha').length;
      cursor = batch.next_cursor;
      hasMore = batch.has_more;
    }
  } catch (error) {
    result.errors += 1;
    console.error('[autoFixInvalidTreatmentSessions] batch failed', error);
    throw Object.assign(new Error('Não foi possível concluir o autoajuste de todas as sessões.'), {
      result,
      cause: error,
    });
  }

  return result;
}

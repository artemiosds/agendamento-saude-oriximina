import { supabase } from '@/integrations/supabase/client';
import { CANONICAL_SLUGS } from '@/types/formTemplate';

/**
 * Mapa default tipo de agendamento → form_slug.
 * O Master pode sobrescrever em system_config.configuracoes.tipo_agendamento_to_slug.
 */
export const DEFAULT_TIPO_TO_SLUG: Record<string, string> = {
  Avaliação: CANONICAL_SLUGS.INITIAL_EVAL,
  Avaliacao: CANONICAL_SLUGS.INITIAL_EVAL,
  '1ª Consulta': CANONICAL_SLUGS.INITIAL_EVAL,
  'Primeira Consulta': CANONICAL_SLUGS.INITIAL_EVAL,
  Consulta: CANONICAL_SLUGS.CONSULTA,
  Retorno: CANONICAL_SLUGS.RETORNO,
  Sessão: CANONICAL_SLUGS.SESSION,
  Sessao: CANONICAL_SLUGS.SESSION,
  'Sessão de Tratamento': CANONICAL_SLUGS.SESSION,
  Tratamento: CANONICAL_SLUGS.SESSION,
};

let cache: { map: Record<string, string>; ts: number } | null = null;
const TTL_MS = 60_000;

export async function loadTipoSlugMap(forceRefresh = false): Promise<Record<string, string>> {
  if (!forceRefresh && cache && Date.now() - cache.ts < TTL_MS) {
    return cache.map;
  }
  try {
    const { data } = await supabase
      .from('system_config')
      .select('configuracoes')
      .eq('id', 'default')
      .maybeSingle();
    const cfg = (data?.configuracoes as any) ?? {};
    const map = { ...DEFAULT_TIPO_TO_SLUG, ...(cfg.tipo_agendamento_to_slug ?? {}) };
    cache = { map, ts: Date.now() };
    return map;
  } catch {
    return DEFAULT_TIPO_TO_SLUG;
  }
}

/**
 * Resolve o slug do formulário com base no tipo de agendamento da recepção.
 * Esse acoplamento usa SLUG (imutável), nunca o display_name.
 */
export async function resolveSlugFromAgendamento(opts: {
  tipo?: string | null;
  /** fallback caso o tipo não tenha mapping conhecido */
  fallback?: string;
}): Promise<string> {
  const fallback = opts.fallback ?? CANONICAL_SLUGS.CONSULTA;
  if (!opts.tipo) return fallback;
  const map = await loadTipoSlugMap();
  return map[opts.tipo] ?? fallback;
}

export function invalidateSlugMapCache() {
  cache = null;
}

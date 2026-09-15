import { supabase } from '@/integrations/supabase/client';
import { loadBpaDocumentoOrigemInstitucional } from './bpaHeaderSource';

/**
 * Normalização e validação para BPA-Exportar.
 *
 * Foco: corrigir automaticamente raça/cor, etnia, CNS, CEP, município (IBGE)
 * e tipo de logradouro usando fontes já existentes no sistema, sem persistir
 * alterações no cadastro do paciente.
 *
 * Não altera layout do TXT BPA-I. Não persiste no banco. Apenas higieniza
 * o dado em memória durante a exportação.
 */

const onlyDigits = (v: any) => String(v ?? '').replace(/\D/g, '');

// ============================================================
// CNS — validação oficial (mod-11)
// ============================================================

/**
 * Valida CNS pelo algoritmo oficial DATASUS (mod-11).
 * Aceita CNS definitivo (inicia com 1 ou 2) e provisório (7/8/9).
 * Vazio NÃO é válido aqui (use no contexto onde CNS é obrigatório).
 */
export function isValidCnsAlgo(cnsRaw: string | null | undefined): boolean {
  const cns = onlyDigits(cnsRaw);
  if (cns.length !== 15) return false;
  const first = cns[0];
  if (!['1', '2', '7', '8', '9'].includes(first)) return false;

  if (first === '1' || first === '2') {
    const pis = cns.substring(0, 11);
    let soma = 0;
    for (let i = 0; i < 11; i++) soma += parseInt(pis[i], 10) * (15 - i);
    let resto = soma % 11;
    let dv = 11 - resto;
    if (dv === 11) dv = 0;
    let result: string;
    if (dv === 10) {
      soma += 2;
      resto = soma % 11;
      dv = 11 - resto;
      if (dv === 11) dv = 0;
      result = pis + '001' + String(dv);
    } else {
      result = pis + '000' + String(dv);
    }
    return cns === result;
  }
  // Provisório 7/8/9: soma ponderada inteira divisível por 11
  let soma = 0;
  for (let i = 0; i < 15; i++) soma += parseInt(cns[i], 10) * (15 - i);
  return soma % 11 === 0;
}

/**
 * Tenta encontrar um CNS válido no cadastro do paciente percorrendo as fontes
 * conhecidas. Não inventa CNS; apenas substitui um valor inválido por outro
 * que passe na validação oficial, se existir no cadastro.
 */
export function pickValidCnsPaciente(pac: any): {
  cns: string;
  original: string;
  fonte: 'pac.cns' | 'custom_data.cns' | 'custom_data.cartao_sus' | 'custom_data.cns_alternativo' | 'nenhum';
  substituido: boolean;
} {
  const cd = (pac?.custom_data as any) || {};
  const candidatos: Array<{ valor: string; fonte: any }> = [
    { valor: onlyDigits(pac?.cns), fonte: 'pac.cns' },
    { valor: onlyDigits(cd.cns), fonte: 'custom_data.cns' },
    { valor: onlyDigits(cd.cartao_sus), fonte: 'custom_data.cartao_sus' },
    { valor: onlyDigits(cd.cns_alternativo), fonte: 'custom_data.cns_alternativo' },
  ];
  const original = candidatos[0].valor || candidatos[1].valor || '';
  for (const c of candidatos) {
    if (c.valor && isValidCnsAlgo(c.valor)) {
      return {
        cns: c.valor,
        original,
        fonte: c.fonte,
        substituido: c.valor !== original,
      };
    }
  }
  return { cns: '', original, fonte: 'nenhum', substituido: false };
}

// ============================================================
// Raça/Cor — padrão do fluxo: Amarelo (04) quando ausente/não declarada
// ============================================================

export const RACA_COR_PADRAO_FLUXO = '04';

export function normalizeRacaCorBpa(valor: any): {
  codigo: string;
  autoCorrigido: boolean;
  motivo: string;
  valorOriginal: string;
} {
  const original = String(valor ?? '').trim();
  const s = original
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (['01', 'branca', 'branco'].includes(s)) return { codigo: '01', autoCorrigido: false, motivo: '', valorOriginal: original };
  if (['02', 'preta', 'preto', 'negra', 'negro'].includes(s)) return { codigo: '02', autoCorrigido: false, motivo: '', valorOriginal: original };
  if (['03', 'parda', 'pardo'].includes(s)) return { codigo: '03', autoCorrigido: false, motivo: '', valorOriginal: original };
  if (['04', 'amarela', 'amarelo'].includes(s)) return { codigo: '04', autoCorrigido: false, motivo: '', valorOriginal: original };
  if (['05', 'indigena', 'indígena'].includes(s) || s === 'indigena') return { codigo: '05', autoCorrigido: false, motivo: '', valorOriginal: original };

  const motivo = !original
    ? 'Sem valor no cadastro'
    : (s === '99' || /sem\s*informa/.test(s) || /nao\s*declar/.test(s) || /não\s*declar/.test(s))
      ? 'Raça/cor não declarada ou ausente'
      : `Valor não reconhecido: "${original}"`;
  return {
    codigo: RACA_COR_PADRAO_FLUXO,
    autoCorrigido: true,
    motivo: `${motivo} → padrão do fluxo: 04 (Amarelo)`,
    valorOriginal: original,
  };
}

// ============================================================
// Etnia — contextual conforme raça/cor + nacionalidade
// ============================================================

export function normalizeEtniaBpa(opts: {
  racaCodigo: string;
  nacionalidadeCodigo: string;
  etniaCadastro: string | number | null | undefined;
}): {
  etniaPadded: string;
  obrigatoria: boolean;
  pendencia: boolean;
  motivo?: string;
} {
  const etniaNum = onlyDigits(opts.etniaCadastro);
  const obrigatoria = opts.racaCodigo === '05' && opts.nacionalidadeCodigo === '010';
  if (!obrigatoria) {
    return { etniaPadded: '    ', obrigatoria: false, pendencia: false };
  }
  if (!etniaNum) {
    return {
      etniaPadded: '    ',
      obrigatoria: true,
      pendencia: true,
      motivo: 'Etnia indígena obrigatória para brasileiro com raça/cor indígena',
    };
  }
  return {
    etniaPadded: etniaNum.padEnd(4, ' ').slice(0, 4),
    obrigatoria: true,
    pendencia: false,
  };
}

// ============================================================
// Tipo de logradouro — catálogo existente logradouros_dne
// ============================================================

export interface DneLogradouroRow {
  codigo: string | number | null | undefined;
  descricao: string | null | undefined;
}

type DneLogradouroEntry = {
  codigo: string;
  descricao: string;
  chave: string;
};

export interface DneLogradouroIndex {
  byName: Map<string, DneLogradouroEntry>;
  byCode: Map<string, DneLogradouroEntry>;
  entries: DneLogradouroEntry[];
}

const normalizeDneText = (value: any): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const emptyDneIndex = (): DneLogradouroIndex => ({
  byName: new Map(),
  byCode: new Map(),
  entries: [],
});

let dneLogradouroIndex: DneLogradouroIndex = emptyDneIndex();
let dneLoadPromise: Promise<DneLogradouroIndex> | null = null;

export function buildDneLogradouroIndex(rows: DneLogradouroRow[]): DneLogradouroIndex {
  const byName = new Map<string, DneLogradouroEntry>();
  const byCode = new Map<string, DneLogradouroEntry>();
  const entries: DneLogradouroEntry[] = [];

  for (const row of rows || []) {
    const rawCodigo = onlyDigits(row?.codigo);
    const codigo = rawCodigo ? rawCodigo.padStart(3, '0').slice(-3) : '';
    const descricao = String(row?.descricao ?? '').trim();
    const chave = normalizeDneText(descricao);
    if (!codigo || !chave) continue;
    const entry = { codigo, descricao, chave };
    if (!byName.has(chave)) byName.set(chave, entry);
    if (!byCode.has(codigo)) byCode.set(codigo, entry);
    entries.push(entry);
  }

  entries.sort((a, b) => b.chave.length - a.chave.length || a.chave.localeCompare(b.chave));
  return { byName, byCode, entries };
}

export function primeDneLogradouros(rows: DneLogradouroRow[]): DneLogradouroIndex {
  dneLogradouroIndex = buildDneLogradouroIndex(rows);
  return dneLogradouroIndex;
}

export async function ensureDneLogradourosLoaded(): Promise<DneLogradouroIndex> {
  if (dneLogradouroIndex.entries.length > 0) return dneLogradouroIndex;
  if (dneLoadPromise) return dneLoadPromise;

  dneLoadPromise = (async () => {
    const rows: DneLogradouroRow[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await (supabase as any)
        .from('logradouros_dne')
        .select('codigo,descricao')
        .order('descricao', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const part = (data || []) as DneLogradouroRow[];
      rows.push(...part);
      if (part.length < PAGE) break;
    }
    return primeDneLogradouros(rows);
  })();

  try {
    return await dneLoadPromise;
  } finally {
    dneLoadPromise = null;
  }
}

export function getDneLogradouroIndex(): DneLogradouroIndex {
  return dneLogradouroIndex;
}

export function normalizeEnderecoBpaDne(opts: {
  codigoLogradouro?: any;
  tipoLogradouro?: any;
  logradouro?: any;
  index?: DneLogradouroIndex;
}): {
  codigoLogradouro: string;
  logradouro: string;
  tipoDescricao: string;
  correspondenciaSegura: boolean;
  ajustado: boolean;
  fonte: 'codigo_existente' | 'tipo_estruturado' | 'prefixo_logradouro' | 'nenhuma';
} {
  const index = opts.index || dneLogradouroIndex;
  const codigoExistenteRaw = onlyDigits(opts.codigoLogradouro);
  const codigoExistente = codigoExistenteRaw ? codigoExistenteRaw.padStart(3, '0').slice(-3) : '';
  const tipoNorm = normalizeDneText(opts.tipoLogradouro);
  const logradouroNorm = normalizeDneText(opts.logradouro);

  const stripPrefix = (entry: DneLogradouroEntry, value: string): { value: string; stripped: boolean } => {
    const normalized = normalizeDneText(value);
    if (!normalized || !entry.chave) return { value: normalized, stripped: false };
    if (!normalized.startsWith(`${entry.chave} `)) return { value: normalized, stripped: false };
    const restante = normalized.slice(entry.chave.length).trim();
    if (!restante) return { value: normalized, stripped: false };
    return { value: restante, stripped: true };
  };

  // Código estruturado existente tem prioridade absoluta. Se ele existir no
  // catálogo, apenas retiramos do texto um prefixo duplicado correspondente ao
  // MESMO código. Se o catálogo não reconhecer o código, preservamos tudo.
  if (codigoExistente) {
    const entry = index.byCode.get(codigoExistente);
    if (!entry) {
      return {
        codigoLogradouro: codigoExistente,
        logradouro: logradouroNorm,
        tipoDescricao: String(opts.tipoLogradouro ?? '').trim(),
        correspondenciaSegura: false,
        ajustado: false,
        fonte: 'codigo_existente',
      };
    }
    const stripped = stripPrefix(entry, logradouroNorm);
    return {
      codigoLogradouro: codigoExistente,
      logradouro: stripped.value,
      tipoDescricao: entry.descricao,
      correspondenciaSegura: true,
      ajustado: stripped.stripped,
      fonte: 'codigo_existente',
    };
  }

  // Quando o tipo já estiver estruturado como texto, só aceitamos igualdade
  // exata com uma descrição existente em logradouros_dne.
  if (tipoNorm) {
    const entry = index.byName.get(tipoNorm);
    if (entry) {
      const stripped = stripPrefix(entry, logradouroNorm);
      return {
        codigoLogradouro: entry.codigo,
        logradouro: stripped.value,
        tipoDescricao: entry.descricao,
        correspondenciaSegura: true,
        ajustado: stripped.stripped,
        fonte: 'tipo_estruturado',
      };
    }
  }

  // Sem tipo/código estruturado, procuramos a descrição cadastrada como prefixo
  // integral do logradouro. A lista vem exclusivamente de logradouros_dne e é
  // ordenada pelo maior nome primeiro para evitar correspondência parcial.
  if (logradouroNorm) {
    const entry = index.entries.find((candidate) => logradouroNorm.startsWith(`${candidate.chave} `));
    if (entry) {
      const restante = logradouroNorm.slice(entry.chave.length).trim();
      if (restante) {
        return {
          codigoLogradouro: entry.codigo,
          logradouro: restante,
          tipoDescricao: entry.descricao,
          correspondenciaSegura: true,
          ajustado: true,
          fonte: 'prefixo_logradouro',
        };
      }
    }
  }

  return {
    codigoLogradouro: '',
    logradouro: logradouroNorm,
    tipoDescricao: String(opts.tipoLogradouro ?? '').trim(),
    correspondenciaSegura: false,
    ajustado: false,
    fonte: 'nenhuma',
  };
}

// ============================================================
// CEP + Município IBGE — consulta ViaCEP em lote
// ============================================================

export interface CepInfo {
  cep: string;
  ibge6: string;
  uf?: string;
  localidade?: string;
}

export function isCepValido(cepRaw: any): boolean {
  const c = onlyDigits(cepRaw);
  return c.length === 8 && c !== '00000000';
}

export function normalizeCep(cepRaw: any): string {
  const c = onlyDigits(cepRaw);
  return c.length === 8 ? c : '';
}

const VIACEP_TIMEOUT_MS = 2500;
const VIACEP_CHUNK_SIZE = 50;
const VIACEP_CACHE_KEY = "bpa_viacep_cache_v1";
const VIACEP_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

type CepCacheEntry = { info: CepInfo | null; ts: number };

function loadCepCache(): Record<string, CepCacheEntry> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(VIACEP_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCepCache(cache: Record<string, CepCacheEntry>): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(VIACEP_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota cheia/SSR — ignora */
  }
}

async function fetchOneCep(cep: string): Promise<CepInfo | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), VIACEP_TIMEOUT_MS);
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: ctrl.signal });
    if (!r.ok) return null;
    const j: any = await r.json();
    if (!j || j.erro) return null;
    const ibge = onlyDigits(j.ibge);
    if (ibge.length < 6) return null;
    return { cep, ibge6: ibge.slice(0, 6), uf: j.uf, localidade: j.localidade };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCepInfoMap(ceps: string[]): Promise<Map<string, CepInfo>> {
  // O BPA-Exportar já passa por este ponto antes de montar Registros 03 e Header.
  // Reaproveitamos esse ponto já aguardado pelo fluxo para garantir que tanto o
  // catálogo DNE quanto o documento institucional estejam prontos antes do TXT.
  try {
    await ensureDneLogradourosLoaded();
  } catch (e) {
    console.warn('[BPA-Exportar] logradouros_dne indisponível; normalização de tipo de logradouro será conservadora.', e);
  }
  try {
    await loadBpaDocumentoOrigemInstitucional();
  } catch (e) {
    console.warn('[BPA-Exportar] documento institucional indisponível; validação do Header será mantida.', e);
  }

  const out = new Map<string, CepInfo>();
  const unicos = Array.from(new Set(ceps.map(onlyDigits).filter(c => c.length === 8)));
  if (unicos.length === 0) return out;

  const cache = loadCepCache();
  const now = Date.now();
  const aBuscar: string[] = [];

  for (const cep of unicos) {
    const entry = cache[cep];
    if (entry && now - entry.ts < VIACEP_CACHE_TTL_MS) {
      if (entry.info) out.set(cep, entry.info);
    } else {
      aBuscar.push(cep);
    }
  }

  if (aBuscar.length === 0) return out;

  let cacheDirty = false;
  for (let i = 0; i < aBuscar.length; i += VIACEP_CHUNK_SIZE) {
    const chunk = aBuscar.slice(i, i + VIACEP_CHUNK_SIZE);
    const results = await Promise.all(chunk.map(fetchOneCep));
    results.forEach((info, idx) => {
      const cep = chunk[idx];
      cache[cep] = { info, ts: now };
      cacheDirty = true;
      if (info) out.set(cep, info);
    });
  }
  if (cacheDirty) saveCepCache(cache);

  return out;
}

export function resolveMunicipioBpa(opts: {
  municipioCadastro: any;
  cepInfo?: CepInfo;
  municipioPadrao: string;
}): {
  codigo: string;
  fonte: 'cadastro' | 'cep' | 'padrao' | 'nenhum';
  autoCorrigido: boolean;
  motivo?: string;
} {
  const cadastro = onlyDigits(opts.municipioCadastro).slice(0, 6);
  const cepIbge = opts.cepInfo?.ibge6 || '';
  const padrao = onlyDigits(opts.municipioPadrao).slice(0, 6);

  if (cadastro && cadastro.length === 6 && cadastro !== '000000') {
    return {
      codigo: cadastro,
      fonte: 'cadastro',
      autoCorrigido: false,
      motivo: cepIbge && cadastro !== cepIbge
        ? `Município cadastrado (${cadastro}) preservado apesar da divergência com o CEP (${cepIbge})`
        : undefined,
    };
  }

  if (cepIbge && cepIbge.length === 6 && cepIbge !== '000000') {
    return {
      codigo: cepIbge,
      fonte: 'cep',
      autoCorrigido: true,
      motivo: 'Município preenchido automaticamente a partir do CEP porque o cadastro estava ausente ou inválido',
    };
  }

  if (padrao && padrao.length === 6 && padrao !== '000000') {
    return {
      codigo: padrao,
      fonte: 'padrao',
      autoCorrigido: true,
      motivo: 'Município ausente/ inválido — aplicado padrão da exportação',
    };
  }

  return { codigo: '', fonte: 'nenhum', autoCorrigido: false };
}

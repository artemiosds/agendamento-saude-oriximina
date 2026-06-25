/**
 * Normalização e validação para BPA-Exportar.
 *
 * Foco: corrigir automaticamente raça/cor, etnia, CNS, CEP e município (IBGE)
 * usando regras seguras e auditáveis ANTES de gerar TXT/Excel/PDF.
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
  cns: string;            // 15 dígitos válido, ou '' se nenhum encontrado
  original: string;       // valor originalmente preferido (pac.cns / custom_data.cns)
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

export const RACA_COR_PADRAO_FLUXO = '04'; // Amarelo

/**
 * Normaliza raça/cor para o código IBGE oficial (01..05).
 * Quando o cadastro estiver vazio, '99', 'não declarada' ou inválido,
 * aplica automaticamente o padrão do fluxo (04 — Amarelo) e marca como
 * correção automática auditável. Nunca emite '99' no TXT.
 */
export function normalizeRacaCorBpa(valor: any): {
  codigo: string;             // sempre 01..05 (nunca 99)
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

  // Tudo o que não bate (vazio, '99', 'sem informação', 'não declarada', lixo) → padrão Amarelo
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

/**
 * Decide o campo Etnia (4 chars) conforme regra oficial:
 *  - Obrigatória APENAS quando raça/cor = 05 (indígena) E nacionalidade = 010 (brasileira).
 *  - Caso contrário, retorna 4 espaços em branco (conforme layout BPA-I).
 *
 * Se for obrigatória e o cadastro não tiver etnia, retorna `pendencia=true`.
 */
export function normalizeEtniaBpa(opts: {
  racaCodigo: string;
  nacionalidadeCodigo: string;
  etniaCadastro: string | number | null | undefined;
}): {
  etniaPadded: string;          // string com 4 chars (sempre)
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
// CEP + Município IBGE — consulta ViaCEP em lote
// ============================================================

export interface CepInfo {
  cep: string;       // 8 dígitos
  ibge6: string;     // código IBGE 6 dígitos (sem dígito verificador) — usado no BPA
  uf?: string;
  localidade?: string;
}

/** Valida CEP: precisa ter exatamente 8 dígitos e não ser todo zeros. */
export function isCepValido(cepRaw: any): boolean {
  const c = onlyDigits(cepRaw);
  return c.length === 8 && c !== '00000000';
}

/** Normaliza CEP para 8 dígitos. Retorna string vazia se inválido. */
export function normalizeCep(cepRaw: any): string {
  const c = onlyDigits(cepRaw);
  return c.length === 8 ? c : '';
}

/**
 * Consulta o ViaCEP para uma lista de CEPs únicos e devolve um Map cep→info.
 * Falhas individuais não interrompem o lote.
 */
const VIACEP_TIMEOUT_MS = 2500;
const VIACEP_CHUNK_SIZE = 50;
const VIACEP_CACHE_KEY = "bpa_viacep_cache_v1";
const VIACEP_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias

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
    /* timeout/abort/rede — silencioso, fallback assume */
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCepInfoMap(ceps: string[]): Promise<Map<string, CepInfo>> {
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


/**
 * Resolve município IBGE (6 dígitos) usando:
 *  1. Município do cadastro, se válido
 *  2. IBGE derivado do CEP (ViaCEP) — sobrepõe o cadastro quando divergir
 *  3. Município padrão da exportação, como último recurso
 *
 * Retorna o código final + flag de correção automática (CEP→município).
 */
export function resolveMunicipioBpa(opts: {
  municipioCadastro: any;
  cepInfo?: CepInfo;
  municipioPadrao: string;
}): {
  codigo: string;             // 6 dígitos ou '' se nada resolveu
  fonte: 'cadastro' | 'cep' | 'padrao' | 'nenhum';
  autoCorrigido: boolean;
  motivo?: string;
} {
  const cadastro = onlyDigits(opts.municipioCadastro).slice(0, 6);
  const cepIbge = opts.cepInfo?.ibge6 || '';
  const padrao = onlyDigits(opts.municipioPadrao).slice(0, 6);

  // Se o CEP tem IBGE válido e diverge do cadastro, prevalecer o do CEP
  if (cepIbge && cepIbge.length === 6) {
    if (!cadastro || cadastro !== cepIbge) {
      return {
        codigo: cepIbge,
        fonte: 'cep',
        autoCorrigido: !!cadastro && cadastro !== cepIbge,
        motivo: cadastro && cadastro !== cepIbge
          ? `Município do cadastro (${cadastro}) divergia do CEP (${cepIbge}) — ajustado pelo CEP`
          : 'Município preenchido automaticamente a partir do CEP',
      };
    }
    return { codigo: cepIbge, fonte: 'cep', autoCorrigido: false };
  }

  if (cadastro && cadastro.length === 6 && cadastro !== '000000') {
    return { codigo: cadastro, fonte: 'cadastro', autoCorrigido: false };
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

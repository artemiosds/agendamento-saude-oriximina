import { supabase } from '@/integrations/supabase/client';

export interface LinhaBpaNormalizada {
  key: string;
  origem: 'prontuario' | 'triagem' | 'pts' | 'paciente';
  fonte_procedimento: 'prontuario' | 'paciente' | 'pts' | 'triagem';
  fonte_resolucao?: 'prontuario_codigo' | 'catalogo_id' | 'catalogo_nome' | 'sugestao' | 'nao_resolvido';
  fonte_cid: 'prontuario' | 'paciente' | 'pts' | 'nao_encontrado';
  prontuario_id?: string;
  pts_id?: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  unidade_id: string;
  data: string;
  procedimento_id?: string;
  procedimento_nome: string;
  codigo_sigtap: string;
  cid: string;
  cids_relacionados?: string[];
  sugestoes_sigtap?: string[];
  codigo_municipio?: string;
  codigo_logradouro?: string;
  tipo_logradouro?: string;
  cep?: string;
  chave_dedupe?: string;
  duplicado?: boolean;
  carater: string;
  qtd: number;
  status_bpa: 'ok' | 'pendente';
  motivo_pendencia?: string;
  pendenciaTriagemSigtap?: boolean;
}

type FonteCid = LinhaBpaNormalizada['fonte_cid'];
type FonteProc = LinhaBpaNormalizada['fonte_procedimento'];
type FonteResolucao = NonNullable<LinhaBpaNormalizada['fonte_resolucao']>;

type RawProcedimento = {
  pts_id?: string;
  procedimento_id?: string;
  codigo_sigtap?: string;
  sigtap_codigo?: string;
  procedimento_codigo?: string;
  co_procedimento?: string;
  cod_procedimento?: string;
  codigo?: string;
  nome_procedimento?: string;
  nome?: string;
  descricao?: string;
  especialidade?: string;
  quantidade?: number;
  observacao?: string;
  cids_selecionados?: any;
  cid?: any;
  cid10?: any;
  cids?: any;
  cids_vinculados?: any;
  fonte: FonteProc;
};

type PtsBundle = {
  pts_id: string;
  patient_id: string;
  professional_id?: string;
  unit_id?: string;
  status?: string;
  especialidades_envolvidas?: string[];
  custom_data?: any;
  cids: string[];
  procs: RawProcedimento[];
  updated_at?: string;
};

const PAGE = 1000;
const OX_MUNICIPIO = '1505304';
const DNE_LOGRADOURO: Record<string, string> = {
  RUA: '081', R: '081', AVENIDA: '008', AV: '008', TRAVESSA: '100', TV: '100',
  BECO: '011', BC: '011', ESTRADA: '035', EST: '035', RODOVIA: '072', ROD: '072',
  RAMAL: '082', VIA: '107', VIELA: '109', ALAMEDA: '003', PRACA: '062', PRAÇA: '062',
  LARGO: '044', PARQUE: '055', QUADRA: '067', SERVIDAO: '094', SERVIDÃO: '094', VILA: '108',
};

const inBatches = async <T,>(ids: string[], batchSize: number, fn: (batch: string[]) => Promise<T[]>): Promise<T[]> => {
  const unique = [...new Set(ids.filter(Boolean))];
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += batchSize) {
    const part = await fn(unique.slice(i, i + batchSize));
    if (part?.length) out.push(...part);
  }
  return out;
};

const onlyDigits = (v: any) => String(v ?? '').replace(/\D/g, '');
// Extrai apenas CID-10 reconhecível. A versão anterior removia caracteres e
// cortava os quatro primeiros, podendo transformar texto como "DOR LOMBAR" em
// um falso CID "DORL" e "F79/G70/G80" em "F79G".
const extractCidCodes = (v: any): string[] => {
  const texto = String(v ?? '').toUpperCase();
  const encontrados: string[] = [];
  const regex = /(?:^|[^A-Z0-9])([A-TV-Z][0-9]{2}(?:\.[0-9]|[0-9])?)(?=$|[^A-Z0-9])/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(texto)) !== null) {
    const codigo = match[1].replace(/\./g, '');
    if (!encontrados.includes(codigo)) encontrados.push(codigo);
  }
  return encontrados;
};
const sanitizeCid = (v: any) => extractCidCodes(v)[0] || '';
const normalizeName = (s: any) => String(s ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9 ]+/g, ' ')
  .replace(/\b(COMPLETA|COMPLETO|GERAL|INDIVIDUAL|AMBULATORIAL|CLINICA|CLINICO|SESSAO|ATENDIMENTO)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tokenize = (s: any) => normalizeName(s).split(' ').filter((w) => w.length >= 4);

const unique = <T,>(arr: T[]) => [...new Set(arr.filter(Boolean))];

const pushCid = (bag: string[], v: any) => {
  if (!v) return;
  if (Array.isArray(v)) return v.forEach((x) => pushCid(bag, x));
  if (typeof v === 'object') {
    pushCid(bag, v.codigo || v.code || v.cid || v.cid10 || v.cid_codigo || v.value);
    return;
  }
  extractCidCodes(v).forEach((cid) => bag.push(cid));
};

const extractCidsFromAny = (...sources: any[]): string[] => {
  const out: string[] = [];
  sources.forEach((src) => pushCid(out, src));
  return unique(out);
};

const extractArray = (v: any): any[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return t.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
    }
  }
  if (typeof v === 'object') return [v];
  return [];
};

const rawProcFromAny = (item: any, fonte: FonteProc): RawProcedimento | null => {
  if (!item) return null;
  if (typeof item === 'string') {
    const nome = item.trim();
    const codigo = onlyDigits(nome);
    return nome
      ? {
          nome_procedimento: nome,
          codigo_sigtap: codigo.length >= 6 && codigo.length <= 10 ? codigo.padStart(10, '0').slice(-10) : undefined,
          fonte,
          quantidade: 1,
        }
      : null;
  }
  const nome = item.nome_procedimento || item.procedimento_nome || item.nome || item.descricao || item.label || item.procedimento;
  const codigo = item.codigo_sigtap || item.sigtap_codigo || item.procedimento_codigo || item.co_procedimento || item.cod_procedimento || item.codigo;
  const procedimentoId = item.procedimento_id || item.id || item.uuid;
  if (!nome && !codigo && !procedimentoId) return null;
  return {
    procedimento_id: procedimentoId ? String(procedimentoId) : undefined,
    codigo_sigtap: item.codigo_sigtap,
    sigtap_codigo: item.sigtap_codigo,
    procedimento_codigo: item.procedimento_codigo,
    co_procedimento: item.co_procedimento,
    cod_procedimento: item.cod_procedimento,
    codigo: item.codigo,
    nome_procedimento: nome,
    nome,
    descricao: item.descricao || item.observacao,
    quantidade: Number(item.quantidade || item.qtd || 1) || 1,
    observacao: item.observacao || '',
    cids_selecionados: item.cids_selecionados,
    cid: item.cid,
    cid10: item.cid10,
    cids: item.cids,
    cids_vinculados: item.cids_vinculados,
    fonte,
  };
};

const resolveCodigoMunicipioPaciente = (paciente: any, unidade?: any): string => {
  const cd = paciente?.custom_data || {};
  const direct = onlyDigits(
    paciente?.codigo_municipio || paciente?.municipio_codigo || paciente?.cod_municipio || paciente?.ibge_municipio || paciente?.codigo_ibge ||
    cd.codigo_municipio || cd.municipio_codigo || cd.cod_municipio || cd.ibge_municipio || cd.codigo_ibge || cd.municipio_ibge || cd.codigo_ibge_municipio
  );
  if (direct.length >= 7) return direct.slice(0, 7);
  if (direct.length === 6) return `${direct}0`;
  const munUf = normalizeName(`${paciente?.municipio || cd.municipio || ''} ${paciente?.uf || cd.uf || ''}`);
  const uniTxt = normalizeName(`${unidade?.nome || ''} ${unidade?.endereco || ''}`);
  if (munUf.includes('ORIXIMINA') || (munUf.includes('PA') && munUf.includes('ORIX')) || uniTxt.includes('ORIXIMINA')) return OX_MUNICIPIO;
  return '';
};

const resolveCodigoLogradouroPaciente = (paciente: any, dneMap: Map<string, string>): string => {
  const cd = paciente?.custom_data || {};
  const direct = onlyDigits(
    paciente?.codigo_logradouro || paciente?.tipo_logradouro_codigo || paciente?.codigo_tipo_logradouro || paciente?.tipo_logradouro_dne ||
    cd.codigo_logradouro || cd.tipo_logradouro_codigo || cd.tipoLogradouroCodigo || cd.codigo_tipo_logradouro || cd.tipo_logradouro_dne
  );
  if (direct) return direct.padStart(3, '0').slice(-3);
  const rawTipo = String(paciente?.tipo_logradouro || cd.tipo_logradouro || cd.tipoLogradouro || cd.tipo_logradouro_dne || '').trim();
  const rawLog = String(paciente?.logradouro || cd.logradouro || paciente?.endereco || '').trim();
  const candidates = [rawTipo, rawTipo.split(/\s+/)[0], rawLog.split(/\s+/)[0]].map((x) => normalizeName(x));
  for (const key of candidates) {
    if (!key) continue;
    if (dneMap.get(key)) return dneMap.get(key)!;
    if (DNE_LOGRADOURO[key]) return DNE_LOGRADOURO[key];
  }
  return '';
};

const loadAll = async (table: string, select = '*', filters?: (q: any) => any) => {
  const all: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = (supabase as any).from(table).select(select).range(from, from + PAGE - 1);
    if (filters) q = filters(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
};

// Cache em memória do catálogo SIGTAP global + DNE (tabelas estáticas).
// Evita recarregar milhares de linhas a cada troca de filtro/competência.
const CATALOG_TTL_MS = 5 * 60 * 1000;
let _globalCatalogCache: {
  ts: number;
  byCode: Map<string, any>;
  byName: Map<string, any[]>;
  allCatalog: any[];
  dneMap: Map<string, string>;
} | null = null;
let _globalCatalogPromise: Promise<NonNullable<typeof _globalCatalogCache>> | null = null;

const loadGlobalCatalog = async () => {
  if (_globalCatalogCache && Date.now() - _globalCatalogCache.ts < CATALOG_TTL_MS) {
    return _globalCatalogCache;
  }
  if (_globalCatalogPromise) return _globalCatalogPromise;
  _globalCatalogPromise = (async () => {
    const [catalog, dneRows] = await Promise.all([
      loadAll('sigtap_procedimentos', 'id,codigo,nome,descricao,especialidade,ativo', (q) => q.eq('ativo', true)),
      loadAll('logradouros_dne', 'codigo,descricao').catch(() => []),
    ]);
    const byCode = new Map<string, any>();
    const byName = new Map<string, any[]>();
    const allCatalog: any[] = [];
    for (const p of catalog) {
      const obj = { id: p.id, codigo: onlyDigits(p.codigo), nome: p.nome || '', descricao: p.descricao || '', especialidade: p.especialidade || '', fonte: 'sigtap', norm: normalizeName(p.nome || ''), descNorm: normalizeName(p.descricao || '') };
      allCatalog.push(obj);
      if (obj.codigo) byCode.set(obj.codigo, obj);
      if (obj.norm) byName.set(obj.norm, [...(byName.get(obj.norm) || []), obj]);
    }
    const dneMap = new Map<string, string>();
    (dneRows || []).forEach((r: any) => {
      const key = normalizeName(r.descricao);
      const code = onlyDigits(r.codigo).padStart(3, '0').slice(-3);
      if (key && code) dneMap.set(key, code);
    });
    _globalCatalogCache = { ts: Date.now(), byCode, byName, allCatalog, dneMap };
    return _globalCatalogCache;
  })();
  try {
    return await _globalCatalogPromise;
  } finally {
    _globalCatalogPromise = null;
  }
};

const buildCatalog = async (procIds: string[]) => {
  const [global, legacyByIds, sigtapByIds] = await Promise.all([
    loadGlobalCatalog(),
    inBatches(procIds, 500, async (batch) => ((await (supabase as any).from('procedimentos').select('id,nome,descricao,especialidade,codigo_sigtap').in('id', batch)).data || [])),
    inBatches(procIds, 500, async (batch) => ((await (supabase as any).from('sigtap_procedimentos').select('id,codigo,nome,descricao,especialidade').in('id', batch)).data || [])),
  ]);

  const byId = new Map<string, any>();
  const byCode = new Map(global.byCode);
  const byName = new Map(global.byName);

  for (const p of global.allCatalog) {
    if (p.id) byId.set(p.id, p);
  }
  for (const p of sigtapByIds as any[]) {
    const obj = { id: p.id, codigo: onlyDigits(p.codigo), nome: p.nome || '', descricao: p.descricao || '', especialidade: p.especialidade || '', fonte: 'sigtap' };
    if (obj.id) byId.set(obj.id, obj);
    if (obj.codigo && !byCode.has(obj.codigo)) byCode.set(obj.codigo, obj);
  }
  for (const p of legacyByIds as any[]) {
    const obj = { id: p.id, codigo: onlyDigits(p.codigo_sigtap), nome: p.nome || '', descricao: p.descricao || '', especialidade: p.especialidade || '', fonte: 'legacy' };
    if (obj.id) byId.set(obj.id, obj);
    if (obj.codigo && !byCode.has(obj.codigo)) byCode.set(obj.codigo, obj);
  }

  return { byId, byCode, byName, allCatalog: global.allCatalog, dneMap: global.dneMap };
};

const resolveProcedimentoSigtap = (raw: RawProcedimento, catalog: Awaited<ReturnType<typeof buildCatalog>>, profissional?: any, especialidade?: string) => {
  const directFields = [raw.codigo_sigtap, raw.sigtap_codigo, raw.procedimento_codigo, raw.co_procedimento, raw.cod_procedimento, raw.codigo];
  for (const field of directFields) {
    const code = onlyDigits(field);
    if (code.length >= 8) {
      const hit = catalog.byCode.get(code);
      return {
        codigo_sigtap: code,
        nome_procedimento: raw.nome_procedimento || raw.nome || hit?.nome || `Procedimento ${code}`,
        procedimento_id: raw.procedimento_id || hit?.id || '',
        fonte_resolucao: 'prontuario_codigo' as FonteResolucao,
        sugestoes_sigtap: [] as string[],
      };
    }
  }

  if (raw.procedimento_id) {
    const hit = catalog.byId.get(String(raw.procedimento_id));
    if (hit?.codigo) {
      return {
        codigo_sigtap: hit.codigo,
        nome_procedimento: raw.nome_procedimento || raw.nome || hit.nome,
        procedimento_id: String(raw.procedimento_id),
        fonte_resolucao: 'catalogo_id' as FonteResolucao,
        sugestoes_sigtap: [] as string[],
      };
    }
  }

  const name = raw.nome_procedimento || raw.nome || raw.descricao || '';
  const norm = normalizeName(name);
  const exact = norm ? (catalog.byName.get(norm) || []).filter((x) => x.codigo) : [];
  if (exact.length === 1) {
    const hit = exact[0];
    return { codigo_sigtap: hit.codigo, nome_procedimento: name || hit.nome, procedimento_id: raw.procedimento_id || hit.id, fonte_resolucao: 'catalogo_nome' as FonteResolucao, sugestoes_sigtap: [] as string[] };
  }
  if (exact.length > 1) {
    return { codigo_sigtap: '', nome_procedimento: name || 'Procedimento', procedimento_id: raw.procedimento_id || '', fonte_resolucao: 'sugestao' as FonteResolucao, sugestoes_sigtap: exact.slice(0, 5).map((h) => `${h.codigo} - ${h.nome}`) };
  }

  const tokens = tokenize(name);
  const espNorm = normalizeName(especialidade || profissional?.profissao || profissional?.cargo || '');
  const scored = catalog.allCatalog
    .map((p: any) => {
      const all = `${p.norm} ${p.descNorm}`;
      const hits = tokens.filter((t) => all.includes(t)).length;
      const score = hits + (espNorm && normalizeName(p.especialidade).includes(espNorm) ? 0.5 : 0);
      const safePartial = norm && (p.norm.includes(norm) || norm.includes(p.norm)) ? 3 : 0;
      return { p, score: score + safePartial };
    })
    .filter((x: any) => x.p.codigo && x.score >= Math.max(1, Math.min(2, tokens.length)))
    .sort((a: any, b: any) => b.score - a.score || a.p.nome.localeCompare(b.p.nome));

  if (scored.length === 1 || (scored[0] && scored[0].score > (scored[1]?.score || 0))) {
    const hit = scored[0].p;
    return { codigo_sigtap: hit.codigo, nome_procedimento: name || hit.nome, procedimento_id: raw.procedimento_id || hit.id, fonte_resolucao: 'catalogo_nome' as FonteResolucao, sugestoes_sigtap: scored.slice(0, 5).map((h: any) => `${h.p.codigo} - ${h.p.nome}`) };
  }

  return {
    codigo_sigtap: '',
    nome_procedimento: name || 'Procedimento encontrado',
    procedimento_id: raw.procedimento_id || '',
    fonte_resolucao: scored.length ? 'sugestao' as FonteResolucao : 'nao_resolvido' as FonteResolucao,
    sugestoes_sigtap: scored.slice(0, 5).map((h: any) => `${h.p.codigo} - ${h.p.nome}`),
  };
};

const extractAllProcedimentosFromProntuario = (prontuario: any, related: RawProcedimento[], realizados: RawProcedimento[]): RawProcedimento[] => {
  const out: RawProcedimento[] = [];
  const add = (p: RawProcedimento | null) => { if (p) out.push(p); };
  const addFromAny = (src: any) => extractArray(src).forEach((item) => add(rawProcFromAny(item, 'prontuario')));
  const addCodesFromText = (src: any) => {
    const texto = String(src ?? '');
    if (!texto) return;
    [...texto.matchAll(/\b\d{6,10}\b/g)].forEach((m) => add(rawProcFromAny(m[0], 'prontuario')));
  };
  const addDeepProcedureFields = (src: any) => {
    const visitar = (valor: any, chavePai = '') => {
      if (valor === null || valor === undefined) return;
      const chaveProc = /(sigtap|proced|proc_)/i.test(chavePai);
      if (Array.isArray(valor)) {
        valor.forEach((item) => visitar(item, chavePai));
        return;
      }
      if (typeof valor === 'object') {
        Object.entries(valor).forEach(([chave, item]) => visitar(item, `${chavePai}.${chave}`));
        return;
      }
      if (chaveProc) addCodesFromText(valor);
    };
    visitar(src);
  };
  related.forEach(add);
  realizados.forEach((p) => {
    const exists = out.some((x) => x.procedimento_id && x.procedimento_id === p.procedimento_id);
    if (!exists) add(p);
  });

  const cd = prontuario?.custom_data || {};
  const dados = prontuario?.dados || cd.dados || {};
  const metadata = prontuario?.metadata || cd.metadata || {};
  [
    prontuario?.procedimentos,
    prontuario?.procedimentos_realizados,
    prontuario?.procedimentosSelecionados,
    prontuario?.procedimentos_sigtap,
    cd.procedimentos,
    cd.procedimentos_realizados,
    cd.procedimentosSelecionados,
    cd.procedimentos_sigtap,
    cd.sigtap_lista,
    cd.procedimentos_extras,
    dados.procedimentos,
    dados.procedimentos_realizados,
    metadata.procedimentos,
  ].forEach(addFromAny);

  addFromAny(prontuario?.procedimentos_texto);
  addCodesFromText(prontuario?.procedimentos_texto);
  addCodesFromText(prontuario?.outro_procedimento);
  addDeepProcedureFields(cd);
  addDeepProcedureFields(dados);
  addDeepProcedureFields(metadata);
  const seen = new Set<string>();
  return out.filter((p) => {
    const key = `${p.procedimento_id || ''}|${onlyDigits(p.codigo_sigtap || p.sigtap_codigo || p.procedimento_codigo || p.codigo)}|${normalizeName(p.nome_procedimento || p.nome || p.descricao)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const extractProcedimentosFromPts = (pts: PtsBundle | undefined): RawProcedimento[] => {
  if (!pts) return [];
  const cd = pts.custom_data || {};
  const out: RawProcedimento[] = [...(pts.procs || [])];
  [
    cd.procedimentos,
    cd.procedimentos_realizados,
    cd.procedimentosSelecionados,
    cd.procedimentos_sigtap,
    cd.sigtap,
    cd.plano_terapeutico?.procedimentos,
    cd.planos_terapeuticos?.procedimentos,
    cd.tratamento_procedimentos,
  ].forEach((src) => extractArray(src).forEach((item) => {
    const raw = rawProcFromAny(item, 'pts');
    if (raw) out.push({ ...raw, pts_id: pts.pts_id });
  }));

  const seen = new Set<string>();
  return out.filter((p) => {
    const key = `${p.procedimento_id || ''}|${onlyDigits(p.codigo_sigtap || p.sigtap_codigo || p.procedimento_codigo || p.codigo)}|${normalizeName(p.nome_procedimento || p.nome || p.descricao)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const resolveCidForBpaProcedure = ({ prontuario, procedimento, pts, paciente }: { prontuario: any; procedimento: RawProcedimento; pts?: PtsBundle; paciente?: any }) => {
  const cd = prontuario?.custom_data || {};
  const pcd = paciente?.custom_data || {};
  const complementares = paciente?.complementares || pcd.complementares || {};
  const procCids = extractCidsFromAny(procedimento.cid, procedimento.cid10, procedimento.cids, procedimento.cids_vinculados, procedimento.cids_selecionados);
  const prontCids = extractCidsFromAny(
    prontuario?.cid, prontuario?.cid10, prontuario?.diagCid, prontuario?.cid_principal, prontuario?.cids, prontuario?.cids_vinculados,
    prontuario?.diagnostico_cid, prontuario?.hipotese_diagnostica, prontuario?.hipotese,
    cd.cid, cd.cids, cd.cid_principal, cd.diagnostico_cid, cd.hipotese_diagnostica, cd.hipotese_diagnostica_cid
  );
  const ptsProcMatch = (pts?.procs || []).find((p) => {
    const sameId = p.procedimento_id && procedimento.procedimento_id && p.procedimento_id === procedimento.procedimento_id;
    const sameCode = onlyDigits(p.codigo_sigtap || p.sigtap_codigo || p.procedimento_codigo || p.codigo) && onlyDigits(p.codigo_sigtap || p.sigtap_codigo || p.procedimento_codigo || p.codigo) === onlyDigits(procedimento.codigo_sigtap || procedimento.sigtap_codigo || procedimento.procedimento_codigo || procedimento.codigo);
    const sameName = normalizeName(p.nome_procedimento || p.nome || p.descricao) && normalizeName(p.nome_procedimento || p.nome || p.descricao) === normalizeName(procedimento.nome_procedimento || procedimento.nome || procedimento.descricao);
    return sameId || sameCode || sameName;
  });
  const ptsProcCids = extractCidsFromAny(ptsProcMatch?.cid, ptsProcMatch?.cid10, ptsProcMatch?.cids, ptsProcMatch?.cids_vinculados, ptsProcMatch?.cids_selecionados);
  const ptsCids = extractCidsFromAny(pts?.cids, pts?.custom_data?.cid, pts?.custom_data?.cid10, pts?.custom_data?.cid_principal, pts?.custom_data?.cids, pts?.custom_data?.diagnostico_cid, pts?.custom_data?.hipotese_diagnostica, ...(pts?.procs || []).map((p: any) => p.cid));
  const pacienteCids = extractCidsFromAny(paciente?.cid, paciente?.cid10, paciente?.cids, paciente?.diagnostico_cid, pcd.cid, pcd.cids, complementares.cid, complementares.cids);

  const source: [string[], FonteCid][] = [[procCids, procedimento.fonte === 'pts' ? 'pts' : 'prontuario'], [prontCids, 'prontuario'], [ptsProcCids, 'pts'], [ptsCids, 'pts'], [pacienteCids, 'paciente']];
  const first = source.find(([arr]) => arr.length > 0);
  const all = unique([...procCids, ...prontCids, ...ptsProcCids, ...ptsCids, ...pacienteCids]);
  return { cid_usado: first?.[0][0] || '', cids_relacionados: all.filter((c) => c !== (first?.[0][0] || '')), fonte_cid: first?.[1] || 'nao_encontrado' as FonteCid };
};

const choosePtsForBpa = (ptsList: PtsBundle[], prontuario: any, profissional?: any): PtsBundle | undefined => {
  const profNorm = normalizeName(`${profissional?.profissao || ''} ${profissional?.cargo || ''}`);
  const linkedPtsId = prontuario?.custom_data?.pts_id || prontuario?.pts_id;
  return [...ptsList].sort((a, b) => {
    const score = (pts: PtsBundle) =>
      (linkedPtsId && pts.pts_id === linkedPtsId ? 16 : 0) +
      ((pts.procs || []).length ? 8 : 0) +
      (pts.professional_id && pts.professional_id === prontuario.profissional_id ? 4 : 0) +
      (pts.unit_id && pts.unit_id === prontuario.unidade_id ? 2 : 0) +
      ((pts.especialidades_envolvidas || []).some((e) => profNorm && profNorm.includes(normalizeName(e))) ? 1 : 0) +
      (pts.status === 'ativo' ? 1 : 0);
    return score(b) - score(a) || String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  })[0];
};

const sortPtsForBpa = (ptsList: PtsBundle[], prontuario: any, profissional?: any): PtsBundle[] => {
  const first = choosePtsForBpa(ptsList, prontuario, profissional);
  return [...ptsList].sort((a, b) => {
    if (first?.pts_id === a.pts_id) return -1;
    if (first?.pts_id === b.pts_id) return 1;
    const aSameProf = a.professional_id && a.professional_id === prontuario.profissional_id ? 1 : 0;
    const bSameProf = b.professional_id && b.professional_id === prontuario.profissional_id ? 1 : 0;
    return bSameProf - aSameProf || String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  });
};

const resolveBpaProcedimentosPaciente = ({
  pacienteId,
  prontuario,
  ptsList,
  relacionados,
  realizados,
  profissional,
}: {
  pacienteId: string;
  prontuario: any;
  ptsList: PtsBundle[];
  relacionados: RawProcedimento[];
  realizados: RawProcedimento[];
  profissional?: any;
}) => {
  const ptsOrdenados = sortPtsForBpa(ptsList, prontuario, profissional);
  const pts = ptsOrdenados[0];
  const prontuarioProcedimentos = extractAllProcedimentosFromProntuario(prontuario, relacionados, realizados);
  const ptsProcedimentos = ptsOrdenados.flatMap((item) => extractProcedimentosFromPts(item));
  const seenPtsProc = new Set<string>();
  const ptsProcedimentosUnicos = ptsProcedimentos.filter((p) => {
    const key = `${p.procedimento_id || ''}|${onlyDigits(p.codigo_sigtap || p.sigtap_codigo || p.procedimento_codigo || p.codigo)}|${normalizeName(p.nome_procedimento || p.nome || p.descricao)}`;
    if (seenPtsProc.has(key)) return false;
    seenPtsProc.add(key);
    return true;
  });
  const ptsNormalizado = pts ? { ...pts, cids: unique(ptsOrdenados.flatMap((item) => item.cids || [])), procs: ptsProcedimentosUnicos } : undefined;
  return {
    paciente_id: pacienteId,
    pts: ptsNormalizado,
    procedimentos: prontuarioProcedimentos.length ? prontuarioProcedimentos : ptsProcedimentosUnicos,
    fonte_base: prontuarioProcedimentos.length ? 'prontuario' as FonteProc : (ptsProcedimentosUnicos.length ? 'pts' as FonteProc : 'prontuario' as FonteProc),
  };
};

export const bpaService = {
  async resolveBpaProcedimentosECids({
    competencia,
    unidadeId,
    profissionalId,
    triagemSigtapPadrao,
  }: {
    competencia: string;
    unidadeId?: string;
    profissionalId?: string;
    triagemSigtapPadrao?: string;
  }): Promise<LinhaBpaNormalizada[]> {
    const ano = competencia.slice(0, 4);
    const mes = competencia.slice(4, 6);
    const dataInicio = `${ano}-${mes}-01`;
    const lastDay = new Date(Number(ano), Number(mes), 0).getDate();
    const dataFim = `${ano}-${mes}-${String(lastDay).padStart(2, '0')}`;

    console.log('[BPA] filtros aplicados', { competencia, dataInicio, dataFim, unidadeId: unidadeId || 'all', profissionalId: profissionalId || 'all' });

    const prontuarios = await loadAll('prontuarios', 'id,paciente_id,paciente_nome,profissional_id,profissional_nome,data_atendimento,unidade_id,tipo_registro,hipotese,procedimentos_texto,outro_procedimento,custom_data', (q) => {
      let query = q.gte('data_atendimento', dataInicio).lte('data_atendimento', dataFim);
      if (unidadeId && unidadeId !== 'all') query = query.eq('unidade_id', unidadeId);
      if (profissionalId && profissionalId !== 'all') query = query.eq('profissional_id', profissionalId);
      return query;
    });

    console.log('[BPA] prontuarios encontrados', prontuarios.length);

    const sessoesTratamento = await loadAll('treatment_sessions', 'id,cycle_id,patient_id,professional_id,scheduled_date,status,procedure_done', (q) => {
      let query = q.gte('scheduled_date', dataInicio).lte('scheduled_date', dataFim).not('status', 'in', '(agendada,cancelada,cancelado,falta,ausente,remarcada,remarcado)');
      if (profissionalId && profissionalId !== 'all') query = query.eq('professional_id', profissionalId);
      return query;
    }).catch(() => []);
    const cycleIds = unique(sessoesTratamento.map((s: any) => s.cycle_id));
    const ciclosTratamento = cycleIds.length ? await inBatches(cycleIds, 500, async (batch) => ((await (supabase as any).from('treatment_cycles').select('id,patient_id,professional_id,unit_id,pts_id,specialty,treatment_type,custom_data').in('id', batch)).data || [])) : [];
    const ciclosMap = new Map(ciclosTratamento.map((c: any) => [c.id, c]));
    const prontuarioKeys = new Set(prontuarios.map((p) => `${p.paciente_id}|${p.profissional_id}|${p.data_atendimento}`));
    const sessoesComoAtendimento = sessoesTratamento
      .map((s: any) => ({ sessao: s, ciclo: ciclosMap.get(s.cycle_id) }))
      .filter(({ ciclo }: any) => ciclo && (!unidadeId || unidadeId === 'all' || ciclo.unit_id === unidadeId))
      .filter(({ sessao, ciclo }: any) => !prontuarioKeys.has(`${sessao.patient_id}|${sessao.professional_id}|${sessao.scheduled_date}`))
      .map(({ sessao, ciclo }: any) => ({
        id: `sessao_${sessao.id}`,
        paciente_id: sessao.patient_id,
        paciente_nome: '',
        profissional_id: sessao.professional_id,
        profissional_nome: '',
        data_atendimento: sessao.scheduled_date,
        unidade_id: ciclo.unit_id,
        tipo_registro: 'sessao_tratamento',
        procedimentos_texto: '',
        outro_procedimento: '',
        custom_data: { treatment_session_id: sessao.id, treatment_cycle_id: sessao.cycle_id, pts_id: ciclo.pts_id, procedure_done: sessao.procedure_done, specialty: ciclo.specialty, treatment_type: ciclo.treatment_type },
      }));
    const basesProducao = [...prontuarios, ...sessoesComoAtendimento];
    const seedPacIds = unique([
      ...basesProducao.map((p) => p.paciente_id),
      ...ciclosTratamento.filter((c: any) => !unidadeId || unidadeId === 'all' || c.unit_id === unidadeId).map((c: any) => c.patient_id),
    ]);

    const prontIds = prontuarios.map((p) => p.id).filter(Boolean);
    const pacIds = seedPacIds;
    const profIds = unique(basesProducao.map((p) => p.profissional_id));
    const uniIds = unique(basesProducao.map((p) => p.unidade_id));

    const [vincsPront, realizados, pacientes, profissionais, unidades, ptsList, triagens] = await Promise.all([
      inBatches(prontIds, 500, async (batch) => ((await (supabase as any).from('prontuario_procedimentos').select('prontuario_id, procedimento_id, cids_selecionados, quantidade, observacao').in('prontuario_id', batch)).data || [])),
      inBatches(pacIds, 500, async (batch) => ((await (supabase as any).from('procedimentos_realizados').select('paciente_id, procedimento_id, data_atendimento, cids_selecionados, quantidade, observacao').in('paciente_id', batch).gte('data_atendimento', dataInicio).lte('data_atendimento', dataFim)).data || [])),
      inBatches(pacIds, 500, async (batch) => ((await (supabase as any).from('pacientes').select('id,nome,cpf,cns,data_nascimento,sexo,raca_cor,nacionalidade,naturalidade,naturalidade_uf,municipio,cep,tipo_logradouro,logradouro,numero,complemento,bairro,uf,telefone,email,endereco,custom_data').in('id', batch)).data || [])),
      inBatches(profIds, 500, async (batch) => ((await (supabase as any).from('funcionarios').select('id,nome,profissao,cargo,custom_data').in('id', batch)).data || [])),
      inBatches(uniIds, 500, async (batch) => ((await (supabase as any).from('unidades').select('id,nome,endereco,custom_data').in('id', batch)).data || [])),
      inBatches(pacIds, 500, async (batch) => {
        const { data } = await (supabase as any).from('pts').select('id,patient_id,professional_id,unit_id,status,especialidades_envolvidas,custom_data,updated_at').in('patient_id', batch);
        return (data || []).filter((p: any) => !['excluido', 'cancelado', 'inativo'].includes(String(p.status || '').toLowerCase()));
      }),
      loadAll('triage_records', 'id,agendamento_id,tecnico_id,criado_em', (q) => q.gte('criado_em', `${dataInicio}T00:00:00`).lte('criado_em', `${dataFim}T23:59:59`)).catch(() => []),
    ]);

    const procIds = unique([
      ...vincsPront.map((v: any) => v.procedimento_id),
      ...realizados.map((v: any) => v.procedimento_id),
      ...sessoesTratamento.map((s: any) => s.procedure_done).filter((v: any) => /^[0-9a-f-]{30,}$/i.test(String(v || ''))),
    ]);
    const catalog = await buildCatalog(procIds);

    const activePtsIds = ptsList.map((p: any) => p.id).filter(Boolean);
    const [ptsCids, ptsProcs] = await Promise.all([
      inBatches(activePtsIds, 500, async (batch) => ((await (supabase as any).from('pts_cid').select('pts_id, cid_codigo').in('pts_id', batch)).data || [])),
      inBatches(activePtsIds, 500, async (batch) => ((await (supabase as any).from('pts_sigtap').select('pts_id, procedimento_codigo, procedimento_nome, especialidade').in('pts_id', batch)).data || [])),
    ]);

    const sigtapCodes = unique([
      ...procIds.map((id) => catalog.byId.get(String(id))?.codigo),
      ...ptsProcs.map((p: any) => onlyDigits(p.procedimento_codigo)),
      ...realizados.map((p: any) => onlyDigits(p.codigo_sigtap || p.procedimento_codigo || p.codigo)),
      ...vincsPront.map((p: any) => onlyDigits(p.codigo_sigtap || p.procedimento_codigo || p.codigo)),
    ]).filter(Boolean);
    const sigtapCidRows = await inBatches(sigtapCodes, 500, async (batch) => ((await (supabase as any).from('sigtap_procedimento_cids').select('procedimento_codigo, cid_codigo').in('procedimento_codigo', batch)).data || []));
    const procedimentoCidsMap = new Map<string, string[]>();
    sigtapCidRows.forEach((r: any) => {
      const code = onlyDigits(r.procedimento_codigo);
      if (!code) return;
      procedimentoCidsMap.set(code, unique([...(procedimentoCidsMap.get(code) || []), sanitizeCid(r.cid_codigo)]));
    });

    const pacMap = new Map(pacientes.map((p: any) => [p.id, p]));
    const profMap = new Map(profissionais.map((p: any) => [p.id, p]));
    const uniMap = new Map(unidades.map((u: any) => [u.id, u]));

    const ptsByPaciente = new Map<string, PtsBundle[]>();
    ptsList.forEach((p: any) => {
      const procs = ptsProcs.filter((pr: any) => pr.pts_id === p.id).map((pr: any) => ({
        pts_id: p.id,
        procedimento_codigo: pr.procedimento_codigo,
        nome_procedimento: pr.procedimento_nome,
        codigo_sigtap: pr.procedimento_codigo,
        especialidade: pr.especialidade,
        fonte: 'pts' as FonteProc,
      }));
      const bundle: PtsBundle = {
        pts_id: p.id,
        patient_id: p.patient_id,
        professional_id: p.professional_id,
        unit_id: p.unit_id,
        status: p.status,
        especialidades_envolvidas: p.especialidades_envolvidas || [],
        cids: unique(ptsCids.filter((c: any) => c.pts_id === p.id).map((c: any) => sanitizeCid(c.cid_codigo))),
        procs,
        custom_data: p.custom_data || {},
        updated_at: p.updated_at,
      };
      ptsByPaciente.set(p.patient_id, [...(ptsByPaciente.get(p.patient_id) || []), bundle]);
    });

    const vincsByPront = new Map<string, RawProcedimento[]>();
    vincsPront.forEach((v: any) => {
      const arr = vincsByPront.get(v.prontuario_id) || [];
      arr.push({ ...v, fonte: 'prontuario', quantidade: v.quantidade || 1 });
      vincsByPront.set(v.prontuario_id, arr);
    });

    const realizadosByPacData = new Map<string, RawProcedimento[]>();
    realizados.forEach((r: any) => {
      const k = `${r.paciente_id}|${r.data_atendimento}`;
      const arr = realizadosByPacData.get(k) || [];
      arr.push({ ...r, fonte: 'prontuario', quantidade: r.quantidade || 1 });
      realizadosByPacData.set(k, arr);
    });

    const agIds = unique((triagens || []).map((t: any) => t.agendamento_id));
    const agsData = agIds.length ? await inBatches(agIds, 500, async (batch) => ((await (supabase as any).from('agendamentos').select('id,paciente_id,paciente_nome,unidade_id,data').in('id', batch)).data || [])) : [];
    const agsMap = new Map(agsData.map((a: any) => [a.id, a]));

    const result: LinhaBpaNormalizada[] = [];
    const seen = new Map<string, LinhaBpaNormalizada>();
    let totalProcedimentos = 0;
    let totalProcProntuario = 0;
    let totalProcPts = 0;
    let procedimentosSemSigtap = 0;
    let municipiosSemCodigo = 0;
    let logradourosSemCodigo = 0;

    const pushLine = (line: LinhaBpaNormalizada) => {
      const key = `${competencia}|${line.prontuario_id || line.pts_id || line.key}|${line.paciente_id}|${line.profissional_id}|${line.data}|${line.codigo_sigtap || normalizeName(line.procedimento_nome)}|${line.cid}|${line.procedimento_id || ''}`;
      line.chave_dedupe = key;
      if (seen.has(key)) {
        line.duplicado = true;
        line.status_bpa = 'pendente';
        line.motivo_pendencia = `Duplicado ignorado: ${seen.get(key)?.procedimento_nome || line.procedimento_nome}`;
        result.push(line);
        return;
      }
      seen.set(key, line);
      result.push(line);
    };

    for (const pront of basesProducao) {
      const pac = pacMap.get(pront.paciente_id);
      const prof = profMap.get(pront.profissional_id);
      const unidade = uniMap.get(pront.unidade_id);
      const ptsCandidates = ptsByPaciente.get(pront.paciente_id) || [];
      const relacionados = vincsByPront.get(pront.id) || [];
      const realizadosCompat = realizadosByPacData.get(`${pront.paciente_id}|${pront.data_atendimento}`) || [];
      const { pts, procedimentos, fonte_base } = resolveBpaProcedimentosPaciente({
        pacienteId: pront.paciente_id,
        prontuario: pront,
        ptsList: ptsCandidates,
        relacionados,
        realizados: realizadosCompat,
        profissional: prof,
      });
      const procsProntuarioBase = extractAllProcedimentosFromProntuario(pront, relacionados, realizadosCompat);
      totalProcProntuario += procsProntuarioBase.length;
      if (!procsProntuarioBase.length) totalProcPts += procedimentos.filter((p) => p.fonte === 'pts').length;
      const codigoMunicipio = resolveCodigoMunicipioPaciente(pac, unidade);
      const codigoLogradouro = resolveCodigoLogradouroPaciente(pac, catalog.dneMap);
      if (!codigoMunicipio) municipiosSemCodigo += 1;
      if (!codigoLogradouro && (pac?.tipo_logradouro || pac?.custom_data?.tipo_logradouro || pac?.logradouro || pac?.endereco)) logradourosSemCodigo += 1;

      if (!procedimentos.length) {
        const cidData = resolveCidForBpaProcedure({ prontuario: pront, procedimento: { fonte: 'prontuario' }, pts, paciente: pac });
        const isMedico = normalizeName(`${prof?.profissao || ''} ${prof?.cargo || ''}`).includes('MEDIC');
        pushLine({
          key: `pron_empty_${pront.id}`,
          origem: 'prontuario',
          fonte_procedimento: fonte_base,
          fonte_resolucao: 'nao_resolvido',
          fonte_cid: cidData.fonte_cid,
          prontuario_id: pront.id,
          pts_id: pts?.pts_id,
          paciente_id: pront.paciente_id,
          paciente_nome: pront.paciente_nome || pac?.nome || '',
          profissional_id: pront.profissional_id,
          profissional_nome: pront.profissional_nome || prof?.nome || '',
          unidade_id: pront.unidade_id,
          data: pront.data_atendimento,
          procedimento_nome: 'Prontuário sem procedimento salvo',
          codigo_sigtap: '',
          cid: cidData.cid_usado,
          cids_relacionados: cidData.cids_relacionados,
          codigo_municipio: codigoMunicipio,
          codigo_logradouro: codigoLogradouro,
          tipo_logradouro: pac?.tipo_logradouro || pac?.custom_data?.tipo_logradouro || '',
          cep: pac?.cep || pac?.custom_data?.cep || '',
          carater: '01',
          qtd: 1,
          status_bpa: 'pendente',
          motivo_pendencia: isMedico ? 'Configure procedimento padrão médico para exportação BPA-I.' : 'Procedimento não encontrado no Prontuário nem no PTS.',
        });
        continue;
      }

      for (const rawProc of procedimentos) {
        totalProcedimentos += 1;
        const resolved = resolveProcedimentoSigtap(rawProc, catalog, prof, rawProc.especialidade || prof?.profissao);
        if (!resolved.codigo_sigtap) procedimentosSemSigtap += 1;
        const cidData = resolveCidForBpaProcedure({ prontuario: pront, procedimento: rawProc, pts, paciente: pac });
        const linkCids = resolved.codigo_sigtap ? (procedimentoCidsMap.get(resolved.codigo_sigtap) || []) : [];
        // A tabela SIGTAP informa compatibilidade, não o diagnóstico real do
        // paciente. Nunca escolher automaticamente o primeiro CID relacionado.
        // Só usar CID efetivamente registrado no procedimento/prontuário/PTS/paciente.
        const cidUsado = cidData.cid_usado || '';
        const cidsRelacionados = unique([...(cidData.cids_relacionados || []), ...linkCids])
          .filter((c) => c && c !== cidUsado);
        const fonteCid = cidData.fonte_cid;

        pushLine({
          key: `pron_${pront.id}_${resolved.procedimento_id || rawProc.procedimento_id || normalizeName(resolved.nome_procedimento)}_${cidUsado}`,
          origem: rawProc.fonte === 'pts' ? 'pts' : 'prontuario',
          fonte_procedimento: rawProc.fonte,
          fonte_resolucao: resolved.fonte_resolucao,
          fonte_cid: fonteCid,
          prontuario_id: pront.id,
          pts_id: pts?.pts_id,
          paciente_id: pront.paciente_id,
          paciente_nome: pront.paciente_nome || pac?.nome || '',
          profissional_id: pront.profissional_id,
          profissional_nome: pront.profissional_nome || prof?.nome || '',
          unidade_id: pront.unidade_id,
          data: pront.data_atendimento,
          procedimento_id: resolved.procedimento_id || rawProc.procedimento_id,
          procedimento_nome: resolved.nome_procedimento,
          codigo_sigtap: resolved.codigo_sigtap,
          cid: cidUsado,
          cids_relacionados: cidsRelacionados,
          sugestoes_sigtap: resolved.sugestoes_sigtap,
          codigo_municipio: codigoMunicipio,
          codigo_logradouro: codigoLogradouro,
          tipo_logradouro: pac?.tipo_logradouro || pac?.custom_data?.tipo_logradouro || '',
          cep: pac?.cep || pac?.custom_data?.cep || '',
          carater: '01',
          qtd: Math.max(1, Number(rawProc.quantidade || 1)),
          status_bpa: resolved.codigo_sigtap ? 'ok' : 'pendente',
          motivo_pendencia: resolved.codigo_sigtap ? undefined : (resolved.sugestoes_sigtap?.length
            ? `Procedimento ambíguo. Escolha o código SIGTAP correto para "${resolved.nome_procedimento}".`
            : `Procedimento encontrado no ${rawProc.fonte === 'pts' ? 'PTS' : 'Prontuário'}, mas sem código SIGTAP resolvido: "${resolved.nome_procedimento}".`),
        });
      }
    }

    (triagens || []).forEach((t: any) => {
      const ag = agsMap.get(t.agendamento_id);
      if (!ag) return;
      if (unidadeId && unidadeId !== 'all' && ag.unidade_id !== unidadeId) return;
      const pac = pacMap.get(ag.paciente_id);
      const unidade = uniMap.get(ag.unidade_id);
      const codigoMunicipio = resolveCodigoMunicipioPaciente(pac, unidade);
      const codigoLogradouro = resolveCodigoLogradouroPaciente(pac, catalog.dneMap);
      const cid = extractCidsFromAny(pac?.cid, pac?.custom_data?.cid, pac?.custom_data?.cids)[0] || '';
      pushLine({
        key: `tri_${t.id}`,
        origem: 'triagem',
        fonte_procedimento: 'triagem',
        fonte_resolucao: triagemSigtapPadrao ? 'prontuario_codigo' : 'nao_resolvido',
        fonte_cid: cid ? 'paciente' : 'nao_encontrado',
        paciente_id: ag.paciente_id,
        paciente_nome: ag.paciente_nome,
        profissional_id: t.tecnico_id || '',
        profissional_nome: 'Técnico de Triagem',
        unidade_id: ag.unidade_id,
        data: ag.data || (t.criado_em || '').slice(0, 10),
        procedimento_nome: triagemSigtapPadrao ? 'Acolhimento com classificação de risco' : 'SIGTAP triagem não configurado',
        codigo_sigtap: triagemSigtapPadrao || '',
        cid,
        codigo_municipio: codigoMunicipio,
        codigo_logradouro: codigoLogradouro,
        tipo_logradouro: pac?.tipo_logradouro || pac?.custom_data?.tipo_logradouro || '',
        cep: pac?.cep || pac?.custom_data?.cep || '',
        carater: '01',
        qtd: 1,
        status_bpa: triagemSigtapPadrao ? 'ok' : 'pendente',
        motivo_pendencia: triagemSigtapPadrao ? undefined : 'SIGTAP da triagem não configurado',
        pendenciaTriagemSigtap: !triagemSigtapPadrao,
      });
    });

    result.forEach((row) => {
      const pendencias: string[] = [];
      if (row.motivo_pendencia) pendencias.push(row.motivo_pendencia);
      if (!row.codigo_sigtap) pendencias.push(`Código SIGTAP não resolvido para "${row.procedimento_nome}"`);
      const pac = pacMap.get(row.paciente_id);
      const prof = profMap.get(row.profissional_id);
      const uni = uniMap.get(row.unidade_id);
      const cns = onlyDigits(pac?.cns);
      const cpf = onlyDigits(pac?.cpf);
      if (!pac) pendencias.push('Paciente não identificado');
      if (cns.length !== 15 && cpf.length !== 11) pendencias.push('Paciente sem CNS ou CPF');
      if (!pac?.nome) pendencias.push('Paciente sem nome');
      if (!pac?.data_nascimento) pendencias.push('Paciente sem data de nascimento');
      if (!pac?.sexo && !pac?.custom_data?.sexo) pendencias.push('Paciente sem sexo');
      if (!onlyDigits(prof?.custom_data?.cbo_codigo)) pendencias.push('Profissional sem CBO');
      if (!onlyDigits(uni?.custom_data?.cnes)) pendencias.push('Unidade sem CNES');
      if (!row.codigo_municipio) pendencias.push('Código de município não identificado');
      if (!row.codigo_logradouro && (pac?.tipo_logradouro || pac?.custom_data?.tipo_logradouro || pac?.logradouro)) pendencias.push('Código de logradouro não identificado');
      if (row.codigo_sigtap && (row.codigo_sigtap.startsWith('0301') || row.codigo_sigtap.startsWith('0303')) && !row.cid) pendencias.push('CID obrigatório ausente');
      if (pendencias.length) {
        row.status_bpa = 'pendente';
        row.motivo_pendencia = unique(pendencias).join(' | ');
      }
    });

    console.log('[BPA] pts encontrados', ptsList.length);
    console.log('[BPA] procedimentos prontuario', totalProcProntuario);
    console.log('[BPA] procedimentos pts', totalProcPts);
    console.log('[BPA] linhas montadas antes do filtro', result.length);
    console.log('[BPA] procedimentos extraidos', totalProcedimentos);
    console.log('[BPA] procedimentos sem sigtap', procedimentosSemSigtap);
    console.log('[BPA] municipios sem codigo', municipiosSemCodigo);
    console.log('[BPA] logradouros sem codigo', logradourosSemCodigo);
    console.log('[BPA] validos', result.filter((r) => r.status_bpa === 'ok' && !r.duplicado).length);
    console.log('[BPA] pendentes', result.filter((r) => r.status_bpa === 'pendente' && !r.duplicado).length);
    console.log('[BPA] resultado', { total: result.length, ok: result.filter((r) => r.status_bpa === 'ok').length, pendentes: result.filter((r) => r.status_bpa === 'pendente').length, duplicados: result.filter((r) => r.duplicado).length });

    return result;
  },
};

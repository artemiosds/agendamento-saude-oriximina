import { supabase } from '@/integrations/supabase/client';

const CACHE_TTL_MS = 3 * 60 * 1000;
const DOWNLOAD_BATCH_SIZE = 6;
const cache = new Map<string, { expires: number; rows: EncaminhamentoData[] }>();
const pending = new Map<string, Promise<EncaminhamentoData[]>>();
let cacheGeneration = 0;
let cacheSession = '';

/** Also fences off reads already in flight, so an old response cannot refill the cache. */
export function invalidarCacheEncaminhamentos(): void {
  cacheGeneration++;
  cache.clear();
  pending.clear();
}

async function listFiles(folder: string) {
  const result: Array<{ name: string; id: string | null }> = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.storage.from('encaminhamentos')
      .list(folder, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    result.push(...(data || []));
    if (!data || data.length < 100) return result;
  }
}

async function downloadRecords(profissionalId?: string): Promise<EncaminhamentoData[]> {
  const folders = profissionalId ? [profissionalId] : (await listFiles('')).filter(f => !f.id).map(f => f.name);
  const paths: string[] = [];
  // Listing folders and downloading files have separate, bounded concurrency.
  for (let offset = 0; offset < folders.length; offset += 4) {
    const batches = await Promise.all(folders.slice(offset, offset + 4).map(async folder =>
      (await listFiles(folder)).filter(f => f.name.endsWith('.json')).map(f => `${folder}/${f.name}`)));
    paths.push(...batches.flat());
  }
  const records: EncaminhamentoData[] = [];
  for (let offset = 0; offset < paths.length; offset += DOWNLOAD_BATCH_SIZE) {
    const batch = await Promise.all(paths.slice(offset, offset + DOWNLOAD_BATCH_SIZE).map(async path => {
      const { data, error } = await supabase.storage.from('encaminhamentos').download(path);
      if (error || !data) throw error || new Error('Documento indisponível.');
      const record = JSON.parse(await data.text()) as EncaminhamentoData;
      if (!record.id || !record.profissional_destino_id || !record.paciente_nome) {
        throw new Error('Encaminhamento inválido. Atualize ou contate a administração.');
      }
      return record;
    }));
    records.push(...batch);
  }
  return records.sort((a, b) => b.data_geracao.localeCompare(a.data_geracao) || a.id.localeCompare(b.id));
}

export interface EncaminhamentoData {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  paciente_cpf: string;
  paciente_cns: string;
  paciente_data_nascimento: string;
  paciente_cid: string;
  paciente_especialidade_destino: string;
  profissional_origem_id: string;
  profissional_origem_nome: string;
  profissional_origem_profissao: string;
  profissional_origem_conselho: string;
  profissional_destino_id: string;
  especialidade_destino: string;
  conteudo_documento: string;
  observacao: string;
  status: 'recebido' | 'lido';
  data_geracao: string;
  data_leitura?: string;
  gerado_por: string;
  gerado_por_perfil: string;
  unidade: string;
  tipo_documento: string;
}

function generateId(): string {
  // Simple UUID v4 without external dep
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function salvarEncaminhamento(data: Omit<EncaminhamentoData, 'id' | 'status' | 'data_geracao'>): Promise<{ success: boolean; error?: string }> {
  try {
    const id = generateId();
    const now = new Date().toISOString();
    const record: EncaminhamentoData = {
      ...data,
      id,
      status: 'recebido',
      data_geracao: now,
    };

    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const path = `${data.profissional_destino_id}/${id}.json`;

    const { error } = await supabase.storage
      .from('encaminhamentos')
      .upload(path, blob, { contentType: 'application/json', upsert: false });

    if (error) throw error;
    invalidarCacheEncaminhamentos();
    return { success: true };
  } catch (err: unknown) {
    console.error('Erro ao salvar encaminhamento:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
  }
}

export async function listarEncaminhamentos(profissionalId?: string, scope = ''): Promise<EncaminhamentoData[]> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw error || new Error('Sessão expirada. Entre novamente.');
  if (cacheSession !== session.access_token) {
    invalidarCacheEncaminhamentos();
    cacheSession = session.access_token;
  }
  const key = JSON.stringify([session.user.id, scope, profissionalId || 'all']);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.rows;
  const running = pending.get(key);
  if (running) return running;
  const generation = cacheGeneration;
  const request = downloadRecords(profissionalId).then(rows => {
    if (generation === cacheGeneration) cache.set(key, { rows, expires: Date.now() + CACHE_TTL_MS });
    return rows;
  }).finally(() => {
    if (pending.get(key) === request) pending.delete(key);
  });
  pending.set(key, request);
  return request;
}

export async function marcarComoLido(encaminhamento: EncaminhamentoData): Promise<boolean> {
  try {
    const updated: EncaminhamentoData = {
      ...encaminhamento,
      status: 'lido',
      data_leitura: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(updated, null, 2)], { type: 'application/json' });
    const path = `${encaminhamento.profissional_destino_id}/${encaminhamento.id}.json`;

    const { error } = await supabase.storage
      .from('encaminhamentos')
      .update(path, blob, { contentType: 'application/json', upsert: true });

    if (error) throw error;
    // Patch every cached view of this document. Do not re-download the entire
    // inbox simply because one document was read; stale in-flight reads are fenced.
    cacheGeneration++;
    pending.clear();
    for (const entry of cache.values()) {
      entry.rows = entry.rows.map(row => row.id === updated.id ? updated : row);
    }
    return true;
  } catch (err) {
    console.error('Erro ao marcar como lido:', err);
    return false;
  }
}

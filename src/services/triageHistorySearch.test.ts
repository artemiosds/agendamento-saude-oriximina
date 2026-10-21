import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, any>[]>, urls: [] as URL[], fetch: vi.fn() }));
vi.mock('@/integrations/supabase/client', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return { supabase: createClient('https://example.supabase.co', 'test-key', {
    global: { fetch: fixture.fetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) };
});
import { supabase } from '@/integrations/supabase/client';
import { patientNamePattern, searchTriageHistoryIndex } from './triageHistorySearch';
const makeQuery = (columns: string) => supabase.from('triage_records').select(columns)
  .order('criado_em', { ascending: false }).order('id', { ascending: false });
const row = (id: string, appointment: string, name?: string) => ({
  id, agendamento_id: appointment, criado_em: '2026-10-21T10:00:00Z', custom_data: name ? { paciente_nome: name } : {},
});
beforeEach(() => {
  fixture.urls = []; fixture.tables = {}; fixture.fetch.mockReset();
  fixture.fetch.mockImplementation(async (input: string | Request, init?: RequestInit) => {
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const url = new URL(typeof input === 'string' ? input : input.url);
    fixture.urls.push(url);
    const table = url.pathname.split('/').at(-1)!;
    let rows = [...(fixture.tables[table] || [])];
    for (const [column, filter] of url.searchParams) {
      if (['select', 'order', 'offset', 'limit'].includes(column)) continue;
      const read = (r: Record<string, any>) => column === 'custom_data->>paciente_nome' ? r.custom_data?.paciente_nome : r[column];
      if (filter.startsWith('imatch.')) {
        const regex = new RegExp(filter.slice(7).split('[[:space:]]+').join('\\s+'), 'iu');
        rows = rows.filter(r => regex.test(String(read(r) || '')));
      } else if (filter.startsWith('in.(')) {
        const ids = filter.slice(4, -1).split(',').map(v => v.replace(/^"|"$/g, ''));
        rows = rows.filter(r => ids.includes(String(read(r))));
      } else if (filter.startsWith('eq.')) rows = rows.filter(r => String(read(r)) === filter.slice(3));
      else if (filter.startsWith('gte.')) rows = rows.filter(r => String(read(r)) >= filter.slice(4));
    }
    rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || rows.length);
    rows = rows.slice(offset, offset + limit);
    const columns = (url.searchParams.get('select') || '*').split(',').map(v => v.trim());
    if (!columns.includes('*')) rows = rows.map(r => Object.fromEntries(columns.map(c => [c, r[c]])));
    return new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
});

describe('pesquisa seletiva no histórico de triagem', () => {
  it('não percorre 9.975 triagens quando o nome não existe: faz quatro buscas filtradas', async () => {
    fixture.tables.triage_records = Array.from({ length: 9975 }, (_, i) => row(`t${i}`, `ag${i}`));
    const result = await searchTriageHistoryIndex('teste inexistente', makeQuery, new AbortController().signal);
    expect(result).toEqual([]);
    expect(fixture.urls).toHaveLength(4);
    expect(fixture.urls.filter(u => u.pathname.endsWith('/triage_records'))).toHaveLength(1);
    expect(fixture.urls.every(u => [...u.searchParams.values()].some(v => v.startsWith('imatch.')))).toBe(true);
    expect(fixture.urls.every(u => u.searchParams.get('select') !== '*')).toBe(true);
  });
  it('encontra pelo cadastro atual, pela fila, pelo nome histórico e por snapshot sem vínculo', async () => {
    fixture.tables.pacientes = [{ id: 'p1', nome: 'JOSÉ SILVA' }];
    fixture.tables.agendamentos = [{ id: 'ag1', paciente_id: 'p1', paciente_nome: 'NOME ANTIGO' }, { id: 'ag2', paciente_nome: 'JOSÉ SILVA' }];
    fixture.tables.fila_espera = [{ id: 'f1', paciente_id: 'p1', paciente_nome: 'OUTRO NOME' }];
    fixture.tables.triage_records = [row('t1', 'ag1'), row('t2', 'f1'), row('t3', 'ag2'), row('t4', 'removido', 'JOSÉ SILVA')];
    const result = await searchTriageHistoryIndex('  jose  silva ', makeQuery, new AbortController().signal);
    expect(result.map(r => r.id).sort()).toEqual(['t1', 't2', 't3', 't4']);
    expect(new Set(result.map(r => r.id)).size).toBe(4);
  });
  it('não trunca nomes ou vínculos quando há mais de 1.000 resultados', async () => {
    fixture.tables.pacientes = Array.from({ length: 1005 }, (_, i) => ({ id: `p${String(i).padStart(4, '0')}`, nome: 'MARIA' }));
    fixture.tables.agendamentos = fixture.tables.pacientes.map(p => ({ id: `ag-${p.id}`, paciente_id: p.id, paciente_nome: 'MARIA' }));
    fixture.tables.triage_records = fixture.tables.agendamentos.map((a, i) => row(`t${i}`, a.id));
    expect(await searchTriageHistoryIndex('maria', makeQuery, new AbortController().signal)).toHaveLength(1005);
    expect(fixture.urls.every(u => u.searchParams.get('select') !== '*')).toBe(true);
    expect(fixture.urls.some(u => u.pathname.endsWith('/pacientes') && u.searchParams.get('offset') === '1000')).toBe(true);
  });
  it('mantém os filtros de risco/data em todos os caminhos da consulta de triagens', async () => {
    fixture.tables.agendamentos = [{ id: 'ag1', paciente_nome: 'MARIA' }];
    fixture.tables.triage_records = [
      { ...row('t1', 'ag1', 'MARIA'), classificacao_risco: 'verde' },
      { ...row('t2', 'ag1', 'MARIA'), classificacao_risco: 'vermelho' },
    ];
    const filtered = (columns: string) => makeQuery(columns).eq('classificacao_risco', 'verde').gte('criado_em', '2026-10-01');
    expect((await searchTriageHistoryIndex('maria', filtered, new AbortController().signal)).map(r => r.id)).toEqual(['t1']);
    for (const url of fixture.urls.filter(u => u.pathname.endsWith('/triage_records'))) {
      expect(url.searchParams.get('classificacao_risco')).toBe('eq.verde');
      expect(url.searchParams.get('criado_em')).toBe('gte.2026-10-01');
    }
  });
  it('escapa metacaracteres e aceita acentos sem transformar a entrada em expressão livre', () => {
    const pattern = patientNamePattern('JOÃO (A+B).*');
    const regex = new RegExp(pattern.split('[[:space:]]+').join('\\s+'), 'iu');
    expect(regex.test('JOAO (A+B).*')).toBe(true);
    expect(regex.test('JOAO AAAAA')).toBe(false);
  });
  it('não começa uma pesquisa já cancelada', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(searchTriageHistoryIndex('maria', makeQuery, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fixture.urls).toHaveLength(0);
  });

  it('cancela requisição em andamento quando o atendente troca a busca', async () => {
    const controller = new AbortController();
    let started!: () => void;
    const pending = new Promise<void>(resolve => { started = resolve; });
    fixture.fetch.mockImplementationOnce((_input: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      started();
    }));
    const result = searchTriageHistoryIndex('maria', makeQuery, controller.signal);
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await pending;
    controller.abort();
    await assertion;
  });
});

import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ calls: [] as any[], rows: [] as any[], fail: false }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from(table: string) {
  const filters: any = {}; let offset = 0;
  const q: any = { select: () => q, eq: (k: string, v: string) => { filters[k] = v; return q; },
    lte: () => q, neq: () => q, order: () => q, range: (n: number) => { offset = n; return q; },
    then(resolve: any) { f.calls.push({ table, filters, offset }); return Promise.resolve({ error: f.fail ? { message: 'falha' } : null,
      data: table === 'prontuarios' ? f.rows.slice(offset, offset + 20) : filters.prontuario_id === 'com-proc' ? [{ procedimento_id: 'uuid', cids_selecionados: ['F82','G809'], quantidade: 2 }] : [] }).then(resolve); }
  }; return q;
} } }));
vi.mock('@/services/procedureService', () => ({ procedureService: { getSpecific: async () => [{ uuid: 'uuid', id: '0301010048', nome: 'Consulta' }] } }));
import { usePreviousProcedures } from './usePreviousProcedures';
const merge = vi.fn();
const input = () => ({ patientId: 'paciente', date: '2026-10-27', editId: null as string | null, open: true,
  form: { profissional_id: '', profissional_nome: '' }, user: { id: 'prof-logado', nome: 'Profissional' }, mergeProcedimentos: merge });
beforeEach(() => { f.calls = []; f.fail = false; f.rows = [{ id: 'com-proc', data_atendimento: '2026-10-26' }]; vi.clearAllMocks(); });
afterEach(cleanup);
it('busca no novo prontuário pelo responsável logado e preserva CIDs e quantidade', async () => {
 const { result } = renderHook(() => usePreviousProcedures(input()));
 await waitFor(() => expect(result.current.ultimoAtendProcs).not.toBeNull());
 expect(f.calls[0].filters).toMatchObject({ paciente_id: 'paciente', profissional_id: 'prof-logado' });
 expect(result.current.ultimoAtendProcs?.itens[0]).toMatchObject({ cids: ['F82','G809'], quantidade: 2 });
});
it('preserva responsável ao editar e refaz a consulta ao trocar paciente', async () => {
 const props = { ...input(), editId: 'editado', form: { profissional_id: 'original', profissional_nome: 'Original' } };
 const { result, rerender } = renderHook(p => usePreviousProcedures(p), { initialProps: props });
 await waitFor(() => expect(result.current.ultimoAtendProcs).not.toBeNull());
 expect(f.calls[0].filters.profissional_id).toBe('original');
 rerender({ ...props, patientId: 'outro' });
 await waitFor(() => expect(f.calls.some(c => c.filters.paciente_id === 'outro')).toBe(true));
 rerender({...props, form: {profissional_id: 'novo-responsavel', profissional_nome: 'Novo'}});
 await waitFor(() => expect(f.calls.some(c => c.filters.profissional_id === 'novo-responsavel')).toBe(true));
});
it('encontra procedimentos além dos cinco e da primeira página', async () => {
 f.rows = [...Array.from({length: 20}, (_, i) => ({ id: String(i) })), {id:'com-proc',data_atendimento:'2026-09-01'}];
 const { result } = renderHook(() => usePreviousProcedures(input()));
 await waitFor(() => expect(result.current.ultimoAtendProcs).not.toBeNull());
 expect(f.calls.some(c => c.table === 'prontuarios' && c.offset === 20)).toBe(true);
});
it('não consulta janela fechada e distingue erro de ausência de histórico', async () => {
 const { result, rerender } = renderHook(p => usePreviousProcedures(p), { initialProps: {...input(),open:false} });
 expect(f.calls).toHaveLength(0); f.fail = true; rerender({...input(),open:true});
 await waitFor(() => expect(result.current.repeatHistoryError).toBe(true));
 expect(result.current.ultimoAtendProcs).toBeNull();
});

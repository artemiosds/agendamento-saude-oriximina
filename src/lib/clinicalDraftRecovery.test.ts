import { describe, it, expect } from 'vitest';
import { canCloseClinicalDraft, clinicalDraftKey, storeClinicalDraft, readClinicalDraft, clearClinicalDraft, CLINICAL_DRAFT_TTL } from './clinicalDraftRecovery';
function storage() {
  const entries = new Map<string, string>();
  return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
}
describe('fallback de fechamento clínico', () => {
  it('não fecha com dados pendentes sem confirmação de gravação nem cópia na aba', () => {
    expect(canCloseClinicalDraft(false, false, false)).toBe(false);
    expect(canCloseClinicalDraft(true, false, false)).toBe(true);
    expect(canCloseClinicalDraft(false, true, false)).toBe(true);
    expect(canCloseClinicalDraft(false, false, true)).toBe(true);
  });
  it('preserva último texto, seletores, métricas, prescrições e procedimentos na retomada', () => {
    const db = storage(), key = clinicalDraftKey('professional', 'unit-a');
    const draft = { form: { paciente_id: 'isolated-test', soap_plano: 'Última letra: ç', custom_data: { clinical_metrics: { dor: 4 } } }, selectedProcIds: ['procedure'], listaPrescricao: [{ dosagem: 'dose digitada' }], especialidadeFields: { forca: '3' } };
    expect(storeClinicalDraft(db, key, draft, 100)).toBe(true);
    expect(readClinicalDraft(db, key, 101)).toEqual(draft);
  });
  it('isola profissional e unidade', () => {
    const db = storage();
    storeClinicalDraft(db, clinicalDraftKey('a', '1'), { text: 'pendente' });
    expect(readClinicalDraft(db, clinicalDraftKey('b', '1'))).toBeNull();
    expect(readClinicalDraft(db, clinicalDraftKey('a', '2'))).toBeNull();
  });
  it('não autoriza fechar quando armazenamento falha ou não confirma escrita', () => {
    const db = storage();
    expect(storeClinicalDraft({ ...db, setItem: () => { throw new Error('quota'); } }, 'key', { text: 'pendente' })).toBe(false);
    expect(storeClinicalDraft({ ...db, setItem: () => {} }, 'key', { text: 'pendente' })).toBe(false);
  });
  it('expira e remove o rascunho após oito horas', () => {
    const db = storage();
    storeClinicalDraft(db, 'key', { text: 'pendente' }, 100);
    expect(readClinicalDraft(db, 'key', 100 + CLINICAL_DRAFT_TTL - 1)).toEqual({ text: 'pendente' });
    expect(readClinicalDraft(db, 'key', 100 + CLINICAL_DRAFT_TTL)).toBeNull();
    expect(db.getItem('key')).toBeNull();
  });
  it('remove a cópia quando o salvamento foi confirmado', () => {
    const db = storage();
    storeClinicalDraft(db, 'key', { text: 'pendente' });
    clearClinicalDraft(db, 'key');
    expect(readClinicalDraft(db, 'key')).toBeNull();
  });
});
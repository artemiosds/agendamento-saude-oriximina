import { describe, expect, it } from 'vitest';
import { validateTreatmentCycle, assertTreatmentSessionChange, getMissingSessionNumbers, suggestTreatmentSessionDate, type SessionIntegritySnapshot } from './treatmentCycleIntegrity';

const cycle = { id: 'c', patient_id: 'p', professional_id: 'd', unit_id: 'u', total_sessions: 7 };
const sessions = (): SessionIntegritySnapshot[] => Array.from({ length: 7 }, (_, i) => ({
  id: `s${i}`, cycle_id: 'c', patient_id: 'p', professional_id: 'd', session_number: i + 1,
  scheduled_date: `2027-01-${String(i + 10).padStart(2, '0')}`, status: 'pendente_agendamento', appointment_id: null,
}));

describe('integridade documental do ciclo (sem reparar histórico)', () => {
  it('aceita exatamente sete sessões numeradas de 1 a 7', () => {
    expect(validateTreatmentCycle(cycle, sessions())).toEqual([]);
  });
  it('mostra 6 de 7 sem criar, renumerar ou modificar a entrada', () => {
    const rows = sessions().slice(0, 6);
    const original = JSON.stringify(rows);
    expect(validateTreatmentCycle(cycle, rows).map((issue) => issue.message)).toContain('Quantidade incompleta: ciclo previsto para 7 sessões, mas possui 6 registradas.');
    expect(JSON.stringify(rows)).toBe(original);
  });
  it('identifica ciclo sem sessões e quantidade superior ao planejado', () => {
    expect(validateTreatmentCycle(cycle, []).map((i) => i.code)).toContain('count');
    expect(validateTreatmentCycle({ ...cycle, total_sessions: 6 }, sessions()).map((i) => i.code)).toContain('count');
  });
  it('detecta salto e numeração repetida mesmo com sete linhas', () => {
    const rows = sessions(); rows[3].session_number = 5;
    expect(validateTreatmentCycle(cycle, rows).map((issue) => issue.code)).toContain('sequence');
  });
  it('detecta duplicidade ativa, mas libera datas de canceladas e remarcadas', () => {
    const rows = sessions(); rows[3].scheduled_date = rows[2].scheduled_date;
    expect(validateTreatmentCycle(cycle, rows).find((issue) => issue.code === 'date')?.sessionIds).toEqual(['s2', 's3']);
    for (const status of ['cancelada', 'remarcada']) {
      rows[3].status = status;
      expect(validateTreatmentCycle(cycle, rows)).toEqual([]);
    }
  });
  it('impede reutilizar agendamento deste ciclo ou de outro ciclo', () => {
    const rows = sessions(); rows[0].appointment_id = 'a'; rows[1].appointment_id = 'a';
    expect(validateTreatmentCycle(cycle, rows).map((i) => i.code)).toContain('appointment');
    rows[1].appointment_id = null;
    expect(validateTreatmentCycle(cycle, rows, [{ id: 'other-session', appointment_id: 'a' }]).map((i) => i.code)).toContain('appointment');
  });
  it.each(['patient_id', 'professional_id', 'cycle_id'] as const)('detecta identidade divergente: %s', (key) => {
    const rows = sessions(); rows[0][key] = 'other';
    expect(validateTreatmentCycle(cycle, rows).map((i) => i.code)).toContain('identity');
  });
});


describe('autonomia segura do profissional', () => {
  it('não bloqueia sessão válida por quantidade histórica incompleta ou duplicidade em outra data', () => {
    const rows = sessions().slice(0,6); rows[3].scheduled_date = rows[2].scheduled_date;
    expect(() => assertTreatmentSessionChange(cycle,rows,'s4','2027-01-20')).not.toThrow();
    expect(() => assertTreatmentSessionChange(cycle,rows,'s3',rows[2].scheduled_date!)).toThrow('sessão nº 3 deste ciclo');
  });
  it('sessão sem data permanece registrada e não bloqueia as demais', () => {
    const rows = sessions(); rows[3].scheduled_date = null;
    expect(getMissingSessionNumbers(7,rows)).toEqual([]);
    expect(validateTreatmentCycle(cycle,rows).some((i) => i.code==='undated')).toBe(false);
    expect(() => assertTreatmentSessionChange(cycle,rows,'s4')).not.toThrow();
    expect(() => assertTreatmentSessionChange(cycle,rows,'s3','2027-01-25')).not.toThrow();
  });
  it('não considera outro ciclo ou profissional como duplicidade deste ciclo', () => {
    const rows = sessions();
    rows.push({ ...rows[0],id:'other',cycle_id:'other-cycle',professional_id:'other-professional' });
    expect(() => assertTreatmentSessionChange(cycle,rows,'s0')).not.toThrow();
  });
  it('sugestão respeita a sequência e as datas ocupadas, sem alterar nada', () => {
    const rows = sessions(); rows[3].scheduled_date = null;
    const copy=JSON.stringify(rows);
    expect(suggestTreatmentSessionDate(rows,4,['2027-01-13','2027-01-15','2027-01-14'],'2027-01-01','manual')).toBe('2027-01-13');
    expect(JSON.stringify(rows)).toBe(copy);
  });
});

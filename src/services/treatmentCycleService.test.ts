import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
import { createTreatmentCycleWriter } from './treatmentCycleService';

const cycle = { id: 'cycle', patient_id: 'patient', professional_id: 'professional', unit_id: 'unit', total_sessions: 7 };
const dates = ['2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25', '2027-02-01', '2027-02-08', '2027-02-15'];

describe('gravação transacional de plano', () => {
  it('grava sete sessões em uma chamada, confirmando a contagem do servidor', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { cycle, registered_sessions: 7 }, error: null });
    expect(await createTreatmentCycleWriter({ rpc }).create(cycle, dates)).toEqual(cycle);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('save_treatment_cycle_plan', { p_cycle: cycle, p_dates: dates, p_reason: null, p_expected_total: 0 });
  });
  it.each([dates.slice(0, 6), [...dates, '2027-02-22'], [...dates.slice(0, 6), dates[0]]].map((invalidDates) => ({ invalidDates })))('recusa quantidade incorreta ou datas repetidas antes de chamar o banco', async ({ invalidDates }) => {
    const rpc = vi.fn();
    await expect(createTreatmentCycleWriter({ rpc }).create(cycle, invalidDates)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('não transforma falha de transação em sucesso nem repete a geração', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'Falha na sessão 7' } });
    await expect(createTreatmentCycleWriter({ rpc }).create(cycle, dates)).rejects.toThrow('Falha na sessão 7');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('informa diferença entre previsto e registrado se a confirmação for parcial', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { cycle, registered_sessions: 6 }, error: null });
    await expect(createTreatmentCycleWriter({ rpc }).create(cycle, dates)).rejects.toThrow('7 sessões previstas e 6 registradas');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('extensão preserva todas as linhas existentes e exige justificativa', async () => {
    const rows = dates.map((date, i) => ({ id: `s${i}`, cycle_id: 'cycle', patient_id: 'patient', professional_id: 'professional', session_number: i + 1, status: 'agendada', scheduled_date: date }));
    const before = JSON.stringify(rows);
    const rpc = vi.fn().mockResolvedValue({ data: { cycle: { ...cycle, total_sessions: 8 }, registered_sessions: 8 }, error: null });
    const writer = createTreatmentCycleWriter({ rpc });
    await expect(writer.extend({ ...cycle, total_sessions: 8 }, rows, ['2027-02-22'], '')).rejects.toThrow('justificativa');
    expect(rpc).not.toHaveBeenCalled();
    await writer.extend({ ...cycle, total_sessions: 8 }, rows, ['2027-02-22'], '  Continuidade autorizada  ');
    expect(rpc).toHaveBeenCalledWith('save_treatment_cycle_plan', expect.objectContaining({ p_expected_total: 7, p_reason: 'Continuidade autorizada' }));
    expect(JSON.stringify(rows)).toBe(before);
  });
});

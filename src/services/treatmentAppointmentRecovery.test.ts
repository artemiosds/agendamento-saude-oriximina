import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
import { supabase } from '@/integrations/supabase/client';
import { recoverMissingTreatmentAppointments } from './treatmentAppointmentRecovery';
const session = {id:'s',cycle_id:'c',status:'agendada',appointment_id:'a',scheduled_date:'2026-10-16',session_number:4};
beforeEach(()=>vi.clearAllMocks());
describe('recuperação confirmada de vínculo ausente',()=>{
 it('não consulta nem altera quando o vínculo foi encontrado',async()=>{
  const rows=[session]; expect(await recoverMissingTreatmentAppointments('c',rows,new Set(['a']))).toBe(rows); expect(supabase.rpc).not.toHaveBeenCalled();
 });
 it('volta a aguardar agendamento somente após confirmação do servidor, preservando o número',async()=>{
  vi.mocked(supabase.rpc).mockResolvedValue({data:{recovered_ids:['s']},error:null} as any);
  expect(await recoverMissingTreatmentAppointments('c',[session],new Set())).toEqual([{...session,status:'pendente_agendamento',appointment_id:null,scheduled_date:null}]);
  expect(session.appointment_id).toBe('a'); expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('recover_missing_treatment_appointments',{p_cycle_id:'c'});
 });
 it('não interpreta erro de consulta como autorização para liberar sessão',async()=>{
  vi.mocked(supabase.rpc).mockResolvedValue({data:null,error:new Error('rede')} as any);
  await expect(recoverMissingTreatmentAppointments('c',[session],new Set())).rejects.toThrow('rede'); expect(session.status).toBe('agendada');
 });
 it('preserva vínculos existentes mas ocultos pela consulta e histórico clínico',async()=>{
  vi.mocked(supabase.rpc).mockResolvedValue({data:{recovered_ids:[]},error:null} as any);
  expect(await recoverMissingTreatmentAppointments('c',[session],new Set())).toEqual([session]);
  vi.clearAllMocks(); expect(await recoverMissingTreatmentAppointments('c',[{...session,status:'realizada'}],new Set())).toEqual([{...session,status:'realizada'}]); expect(supabase.rpc).not.toHaveBeenCalled();
 });
});

import { beforeEach, expect, it, vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
import { startClinicalAttendance } from './clinicalAttendance';
beforeEach(()=>rpc.mockReset());
it('usa a mesma operação atômica com paciente esperado e a sala confirmada',async()=>{
  const data={status:'em_atendimento',hora_inicio:'08:30',agendamento:{id:'ag'},already_processed:false,iniciado_em:'2026-11-23T11:30:00Z',atendimento_id:'t'};
  rpc.mockResolvedValue({data,error:null});
  expect(await startClinicalAttendance('ag','p','s')).toEqual(data);
  expect(rpc).toHaveBeenCalledWith('start_clinical_attendance',{p_agendamento_id:'ag',p_patient_id:'p',p_room_id:'s'});
});
it('não informa sucesso sem confirmação do banco e não usa gravações HTTP separadas como fallback',async()=>{
  rpc.mockResolvedValue({data:null,error:null});
  await expect(startClinicalAttendance('ag','p')).rejects.toThrow('não confirmou');
  rpc.mockResolvedValue({data:null,error:{code:'42501',message:'Sem permissão'}});
  await expect(startClinicalAttendance('ag','p')).rejects.toMatchObject({code:'42501'});
  expect(rpc).toHaveBeenCalledTimes(2);
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
import { supabase } from '@/integrations/supabase/client';
import { updateAgendaWithTreatment } from './agendaTreatmentSync';
beforeEach(() => vi.clearAllMocks());
describe('edição atômica da Agenda e sessão', () => {
 it('envia edição e versão esperada em uma única operação', async () => {
  vi.mocked(supabase.rpc).mockResolvedValue({ data: { id:'a' }, error:null } as any);
  await updateAgendaWithTreatment('a',{data:'2031-01-14'},{data:'2031-01-07',hora:'16:25',profissionalId:'p'});
  expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('update_agenda_treatment_appointment',{p_id:'a',p_patch:{data:'2031-01-14'},p_expected:{data:'2031-01-07',hora:'16:25',profissional_id:'p'}});
 });
 it('não tenta salvar separadamente se a operação atômica falhar', async () => {
  vi.mocked(supabase.rpc).mockResolvedValue({ data:null,error:{code:'23514',message:'Data duplicada'} } as any);
  await expect(updateAgendaWithTreatment('a',{data:'2031-01-14'})).rejects.toThrow('Data duplicada');
  expect(supabase.rpc).toHaveBeenCalledTimes(1);
 });
 it('não informa sucesso sem confirmação do agendamento correto', async () => {
  vi.mocked(supabase.rpc).mockResolvedValue({data:{id:'outro'},error:null} as any);
  await expect(updateAgendaWithTreatment('a',{})).rejects.toThrow('Atualização não confirmada');
 });
});

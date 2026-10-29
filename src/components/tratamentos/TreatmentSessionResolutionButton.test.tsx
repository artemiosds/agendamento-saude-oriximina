import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn()}}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TreatmentSessionResolutionButton } from './TreatmentSessionResolutionButton';
const props={sessionId:'s',appointmentId:'a',date:'2026-11-04',number:7,onChanged:vi.fn()};
beforeEach(()=>{vi.clearAllMocks();vi.spyOn(window,'confirm').mockReturnValue(true);});
it('requires explicit confirmation before releasing',()=>{
 vi.mocked(window.confirm).mockReturnValue(false); render(<TreatmentSessionResolutionButton {...props}/>);
 fireEvent.click(screen.getByRole('button'));expect(supabase.rpc).not.toHaveBeenCalled();
});
it('sends the selected session and stale-check snapshot, then refreshes',async()=>{
 vi.mocked(supabase.rpc).mockResolvedValue({data:{status:'liberado',appointment_preserved:true},error:null} as any);
 render(<TreatmentSessionResolutionButton {...props}/>);fireEvent.click(screen.getByRole('button'));
 await waitFor(()=>expect(props.onChanged).toHaveBeenCalledOnce());
 expect(supabase.rpc).toHaveBeenCalledWith('release_treatment_session_for_booking',{p_session_id:'s',p_expected_appointment_id:'a',p_expected_date:'2026-11-04'});
 expect(toast.success).toHaveBeenCalledWith('Sessão liberada; reserva compartilhada preservada.');
});
it('does not claim success on a database rejection',async()=>{
 vi.mocked(supabase.rpc).mockResolvedValue({data:null,error:{message:'Paciente já recebido'}} as any);
 render(<TreatmentSessionResolutionButton {...props}/>);fireEvent.click(screen.getByRole('button'));
 await waitFor(()=>expect(toast.error).toHaveBeenCalledWith('Paciente já recebido'));
 expect(props.onChanged).not.toHaveBeenCalled();expect(toast.success).not.toHaveBeenCalled();
});

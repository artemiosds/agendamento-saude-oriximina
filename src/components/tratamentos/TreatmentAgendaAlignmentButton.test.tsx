import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { supabase } from '@/integrations/supabase/client';
import { TreatmentAgendaAlignmentButton } from './TreatmentAgendaAlignmentButton';
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });
const props = {sessionId:'s',sessionDate:'2026-10-30',appointmentId:'a',agendaDate:'2026-10-28'};
describe('alinhamento individual com a Agenda', () => {
 it('não grava ao renderizar nem quando a confirmação é cancelada', () => {
  vi.spyOn(window,'confirm').mockReturnValue(false);
  render(<TreatmentAgendaAlignmentButton {...props} onChanged={async()=>{}} />);
  expect(supabase.rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button'));
  expect(supabase.rpc).not.toHaveBeenCalled();
 });
 it('envia versões de ambas as datas e atualiza a tela após confirmar', async () => {
  vi.spyOn(window,'confirm').mockReturnValue(true);
  vi.mocked(supabase.rpc).mockResolvedValue({data:{id:'a'},error:null} as any);
  const changed=vi.fn().mockResolvedValue(undefined);
  render(<TreatmentAgendaAlignmentButton {...props} onChanged={changed} />);
  fireEvent.click(screen.getByRole('button'));
  await waitFor(()=>expect(changed).toHaveBeenCalledOnce());
  expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('align_treatment_session_to_agenda',{p_session_id:'s',p_expected_date:'2026-10-30',p_appointment_id:'a',p_expected_agenda_date:'2026-10-28'});
 });
});

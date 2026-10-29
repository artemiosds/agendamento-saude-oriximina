import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import PatientRegistrationBoundary from './PatientRegistrationBoundary';
it('keeps a failed lazy registration local and offers a way back',()=>{
 const spy=vi.spyOn(console,'error').mockImplementation(()=>{});const back=vi.fn();
 function Failed():never {throw new Error('chunk unavailable');}
 try {
  render(<PatientRegistrationBoundary onBack={back}><Failed/></PatientRegistrationBoundary>);
  expect(screen.getByRole('alert')).toHaveTextContent('O agendamento foi preservado');
  fireEvent.click(screen.getByRole('button',{name:'Voltar para o Agendamento'}));expect(back).toHaveBeenCalledOnce();
 }finally{spy.mockRestore();}
});

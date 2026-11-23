import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AttendanceRoomDialog } from './AttendanceRoomDialog';
afterEach(cleanup);
const rooms=[{id:'s',nome:'Consultório 1',unidadeId:'u',ativo:true}];
it('exige confirmação humana do local antes de iniciar e mantém cancelamento sem gravar',()=>{
 const confirm=vi.fn(),cancel=vi.fn();
 render(<AttendanceRoomDialog rooms={rooms} busy={false} onConfirm={confirm} onCancel={cancel}/>);
 const button=screen.getByRole('button',{name:'Iniciar atendimento'});
 expect(button).toBeDisabled(); expect(confirm).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Sala / consultório'),{target:{value:'s'}});
 fireEvent.click(button); expect(confirm).toHaveBeenCalledWith('s');
 fireEvent.click(screen.getByRole('button',{name:'Cancelar'})); expect(cancel).toHaveBeenCalledOnce();
});
it('preserva a operação sem sala física quando isso for confirmado explicitamente',()=>{
 const confirm=vi.fn();
 render(<AttendanceRoomDialog rooms={[]} busy={false} onConfirm={confirm} onCancel={()=>{}}/>);
 fireEvent.change(screen.getByLabelText('Sala / consultório'),{target:{value:'__none__'}});
 fireEvent.click(screen.getByRole('button',{name:'Iniciar atendimento'})); expect(confirm).toHaveBeenCalledWith('');
});

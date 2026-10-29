import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({data:[] as any[],error:null as any}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({or:()=>({order:()=>({limit:async()=>({data:m.data,error:m.error})})})})})}}));
import { BuscaPaciente } from './BuscaPaciente';
beforeEach(()=>{m.data=[];m.error=null;});
it('opens registration with the searched term and closes its menu',async()=>{
 const register=vi.fn();render(<BuscaPaciente value="" onChange={vi.fn()} onCadastrarNovo={register}/>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'MARIA'}});
 fireEvent.click(await screen.findByText('+ Cadastrar Novo Paciente Completo'));
 expect(register).toHaveBeenCalledWith('MARIA');expect(screen.queryByText('+ Cadastrar Novo Paciente Completo')).not.toBeInTheDocument();
});
it('does not offer registration while the lookup failed',async()=>{
 m.error={message:'offline'};render(<BuscaPaciente value="" onChange={vi.fn()} onCadastrarNovo={vi.fn()}/>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'MARIA'}});
 await screen.findByRole('alert');expect(screen.queryByText('+ Cadastrar Novo Paciente Completo')).not.toBeInTheDocument();
});
it('keeps the optional registration shortcut out of other consumers',async()=>{
 render(<BuscaPaciente value="" onChange={vi.fn()}/>);fireEvent.change(screen.getByRole('textbox'),{target:{value:'MARIA'}});
 await screen.findByText(/Nenhum paciente encontrado/);expect(screen.queryByText(/Cadastrar Novo/)).not.toBeInTheDocument();
});

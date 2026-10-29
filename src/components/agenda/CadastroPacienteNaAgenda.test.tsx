import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({create:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'staff',role:'recepcao',unidadeId:'u'}})}));
vi.mock('@/services/patientService',()=>({patientService:{createPaciente:m.create}}));
vi.mock('@/components/CadastroPacienteForm',()=>({emptyPacienteForm:{nome:'',cpf:'',cns:'',customData:{}},default:({form,onChange,onSave,saving}:any)=><div>
 <input aria-label="Nome" value={form.nome} onChange={e=>onChange({...form,nome:e.target.value})}/><output>{form.cpf}</output>
 <button onClick={()=>onChange({...form,nomeMae:'MAE',dataNascimento:'2000-01-01',cns:'700000000000001',telefone:'93999990000',naturalidade:'ORIXIMINA',municipio:'ORIXIMINA',sexo:'F',customData:{cep:'68270000',tipoLogradouro:'RUA',logradouro:'TESTE',bairro:'CENTRO',uf:'PA',nacionalidade:'brasileiro',racaCor:'parda'}})}>Preencher</button>
 <button disabled={saving} onClick={onSave}>Salvar paciente</button></div>}));
import CadastroPacienteNaAgenda from './CadastroPacienteNaAgenda';
const callbacks={onSaved:vi.fn(),onCancel:vi.fn(),onBusyChange:vi.fn()};
beforeEach(()=>{vi.clearAllMocks();m.create.mockResolvedValue({id:'saved',nome:'PACIENTE'});});
it('keeps typing isolated from the parent and cancel does not persist',()=>{
 let parentRenders=0;function Parent(){parentRenders++;return <CadastroPacienteNaAgenda termo="Maria" unidadeId="u" {...callbacks}/>;}
 render(<Parent/>);expect(screen.getByLabelText('Nome')).toHaveValue('MARIA');
 fireEvent.change(screen.getByLabelText('Nome'),{target:{value:'MARIA SILVA'}});expect(parentRenders).toBe(1);
 fireEvent.click(screen.getByText(/Voltar para/));expect(callbacks.onCancel).toHaveBeenCalledOnce();expect(m.create).not.toHaveBeenCalled();
});
it('initializes a masked CPF without placing it in the name',()=>{render(<CadastroPacienteNaAgenda termo="123.456.789-00" unidadeId="u" {...callbacks}/>);expect(screen.getByLabelText('Nome')).toHaveValue('');expect(screen.getByText('12345678900')).toBeInTheDocument();});
it('keeps the form open on errors and uses the same request ID on retry',async()=>{
 m.create.mockRejectedValueOnce(new Error('CPF já cadastrado'));
 render(<CadastroPacienteNaAgenda termo="Maria" unidadeId="u" {...callbacks}/>);fireEvent.click(screen.getByText('Preencher'));fireEvent.click(screen.getByText('Salvar paciente'));
 await screen.findByText('CPF já cadastrado');expect(callbacks.onSaved).not.toHaveBeenCalled();expect(screen.getByLabelText('Nome')).toHaveValue('MARIA');
 fireEvent.click(screen.getByText('Salvar paciente'));await waitFor(()=>expect(callbacks.onSaved).toHaveBeenCalledWith({id:'saved',nome:'PACIENTE'}));
 expect(m.create.mock.calls[0][3]).toBe(m.create.mock.calls[1][3]);
});
it('prevents repeated submits while a save is in progress',async()=>{
 let resolve!:(x:any)=>void;m.create.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 render(<CadastroPacienteNaAgenda termo="Maria" unidadeId="u" {...callbacks}/>);fireEvent.click(screen.getByText('Preencher'));fireEvent.click(screen.getByText('Salvar paciente'));fireEvent.click(screen.getByText('Salvar paciente'));
 expect(m.create).toHaveBeenCalledOnce();expect(screen.getByText(/Voltar para/)).toBeDisabled();resolve({id:'saved'});
 await waitFor(()=>expect(callbacks.onSaved).toHaveBeenCalledOnce());
});

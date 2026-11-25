import React from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import PacienteItemCard,{type PacienteItemCardProps} from './PacienteItemCard';
import PacienteDetalheModal,{patientInitials} from '@/components/PacienteDetalheModal';
vi.mock('@/components/ContactActionButton',()=>({default:()=> <span>Contato</span>}));
afterEach(cleanup);
function props():PacienteItemCardProps{return {paciente:{id:'p1',nome:'PACIENTE FICTÍCIO TESTE',cpf:'01234567890',cns:'000000000000000',telefone:'93900000000'},naFila:false,demandaReprimida:false,unidadeNome:'Unidade teste',canAddToFila:true,canDelete:true,onImprimirFicha:vi.fn(),onImprimirLaudoApac:vi.fn(),onAddFila:vi.fn(),onOpenDetalhe:vi.fn(),onOpenDocuments:vi.fn(),onVerProntuarios:vi.fn(),onEditar:vi.fn(),onDelete:vi.fn()};}
describe('card operacional de paciente',()=>{
 it('preserva identificação e rotas de acesso com fila discreta',()=>{
 const p=props();render(<PacienteItemCard {...p}/>);
 expect(screen.getByText(p.paciente.nome)).toBeInTheDocument();
 expect(screen.getByText('012.345.678-90')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Paciente'}));expect(p.onOpenDetalhe).toHaveBeenCalledWith(p.paciente);
 fireEvent.click(screen.getByRole('button',{name:'Prontuário'}));expect(p.onVerProntuarios).toHaveBeenCalledWith(p.paciente);
 fireEvent.click(screen.getByRole('button',{name:'Documentos'}));expect(p.onOpenDocuments).toHaveBeenCalledWith(p.paciente);
 fireEvent.click(screen.getByRole('button',{name:'Adicionar à fila'}));expect(p.onAddFila).toHaveBeenCalledWith(p.paciente);
 });
 it('não permite adicionar novamente à fila e mantém sinalizações',()=>{
 const p=props();render(<PacienteItemCard {...p} naFila filaEntry={{horaChegada:'08:30',prioridade:'normal'}} demandaReprimida canDelete={false}/>);
 expect(screen.queryByRole('button',{name:'Adicionar à fila'})).not.toBeInTheDocument();
 expect(screen.getByText(/Fila de espera · 08:30/)).toBeInTheDocument();
 expect(screen.getByText('Demanda reprimida')).toBeInTheDocument();
 });
 it('não mostra fila sem permissão',()=>{render(<PacienteItemCard {...props()} canAddToFila={false}/>);expect(screen.queryByRole('button',{name:'Adicionar à fila'})).not.toBeInTheDocument();});
 it('identificação usa iniciais sem inventar nome',()=>{expect(patientInitials('Paciente de Teste')).toBe('PT');expect(patientInitials('')).toBe('—');});
 it('modal mantém identificação ao navegar entre seções',()=>{
 render(<PacienteDetalheModal open onOpenChange={vi.fn()} nome="Paciente teste" cpf="01234567890" cns="000000000000000" sections={[{id:'geral',label:'Visão geral',content:<p>Dados pessoais teste</p>},{id:'contato',label:'Contato',content:<p>Dados contato teste</p>},{id:'anexos',label:'Anexos',content:<p>Dados anexos teste</p>}]} footer={<button>Documentos</button>}/>);
 expect(screen.getByText('012.345.678-90')).toBeVisible();
 expect(screen.getByText('Dados pessoais teste')).toBeVisible();
 fireEvent.keyDown(screen.getByRole('tab',{name:'Visão geral'}),{key:'ArrowRight'});
 // Radix uses pointer activation as well as keyboard; click the desired tab explicitly.
 fireEvent.mouseDown(screen.getByRole('tab',{name:'Contato'}),{button:0,ctrlKey:false});
 expect(screen.getByText('Dados contato teste')).toBeVisible();
 expect(screen.getByText('Dados pessoais teste')).not.toBeVisible();
 expect(screen.getByText('012.345.678-90')).toBeVisible();
 expect(screen.getByRole('button',{name:'Documentos'})).toBeVisible();
 });
});
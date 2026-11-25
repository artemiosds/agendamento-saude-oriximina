import React from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({fill:vi.fn(async(_source:unknown,_patient:unknown,_clinical:unknown,_normalized:unknown)=>new Uint8Array([1,2,3])),load:vi.fn(async()=>new ArrayBuffer(1))}));
vi.mock('@/lib/apacPdf',()=>({APAC_DOCUMENT_NAME:'FORMULARIO_APAC_LAUDO',apacFilename:()=> 'TESTE.pdf',fillApacPdf:f.fill,loadApprovedApac:f.load}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>({select:()=>({eq:(_k:string,id:string)=>({single:async()=>({data:table==='unidades'?{nome:'Unidade Teste',custom_data:{cnes:'0123456'}}:{id,nome:id==='p1'?'Paciente':'Outro'},error:null})})})})}}));
vi.mock('@/lib/useApacLaudoData',()=>({useApacLaudoData:(p:any)=>({data:{nome:p?.nome||''},ibgeLoading:false})}));
vi.mock('@/components/documents/SigtapProcedurePicker',()=>({default:()=> <span>Busca SIGTAP</span>}));
import ApacLaudoModal from './ApacLaudoModal';
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('URL',class extends URL{static createObjectURL(){return 'blob:teste'}static revokeObjectURL(){}});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const patient={id:'p1',nome:'Paciente'};
it('permite emitir somente identificação e usa PDF na prévia',async()=>{
 render(<ApacLaudoModal open onOpenChange={()=>{}} paciente={patient}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Baixar PDF'})).toBeEnabled());
 expect(screen.getByTitle('FORMULARIO_APAC_LAUDO')).toHaveAttribute('src','blob:teste');
});
it('impede emissão inválida e reinicia edição ao mudar de paciente',async()=>{
 const {rerender}=render(<ApacLaudoModal open onOpenChange={()=>{}} paciente={patient}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Preencher laudo'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Preencher laudo'}));
 fireEvent.change(screen.getByLabelText('37 — CID principal'),{target:{value:'XYZ'}});
 expect(screen.getByRole('alert')).toHaveTextContent('CID inválido');
 expect(screen.getByRole('button',{name:'Baixar PDF'})).toBeDisabled();
 rerender(<ApacLaudoModal open onOpenChange={()=>{}} paciente={{id:'p2',nome:'Outro'}}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Baixar PDF'})).toBeEnabled());
 expect(f.fill.mock.calls.at(-1)?.[1]).toMatchObject({id:'p2'});
});

it('carrega nome e CNES do cadastro real da unidade antes de emitir e preserva ao limpar',async()=>{
 render(<ApacLaudoModal open onOpenChange={()=>{}} paciente={patient} unidadeId="u1" unidadeNome="Nome em cache"/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Baixar PDF'})).toBeEnabled());
 expect(f.fill.mock.calls.at(-1)?.[2]).toMatchObject({estabelecimento:'Unidade Teste',cnes:'0123456'});
 fireEvent.click(screen.getByRole('button',{name:'Preencher laudo'}));
 fireEvent.click(screen.getByText('Estabelecimento solicitante e CNES', {exact:false}));
 expect(screen.getByLabelText('1 — Estabelecimento solicitante')).toHaveValue('Unidade Teste');
 expect(screen.getByLabelText('2 — CNES')).toHaveValue('0123456');
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
 try{
  fireEvent.click(screen.getByRole('button',{name:'Somente dados do paciente'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Baixar PDF'})).toBeEnabled());
  expect(f.fill.mock.calls.at(-1)?.[2]).toMatchObject({estabelecimento:'Unidade Teste',cnes:'0123456'});
 }finally{confirm.mockRestore();}
});

it('abre o complemento diretamente e conserva o preenchimento ao trocar de etapa',async()=>{
 render(<ApacLaudoModal open onOpenChange={()=>{}} paciente={patient}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Preencher laudo'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Preencher laudo'}));
 fireEvent.change(screen.getByLabelText('36 — Descrição do diagnóstico'),{target:{value:'EXEMPLO'}});
 fireEvent.click(screen.getByRole('button',{name:'Dados complementares'}));
 expect(screen.getByRole('checkbox',{name:'Prótese mamária'})).toBeVisible();
 fireEvent.click(screen.getByRole('checkbox',{name:'Prótese mamária'}));
 expect(screen.getByLabelText('Ano de implantação')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Preencher laudo'}));
 expect(screen.getByLabelText('36 — Descrição do diagnóstico')).toHaveValue('EXEMPLO');
 expect(screen.getByRole('button',{name:'Baixar PDF'})).toBeDisabled();
});
it('protege contra descarte acidental de edição não baixada',async()=>{
 const close=vi.fn();
 render(<ApacLaudoModal open onOpenChange={close} paciente={patient}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Preencher laudo'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Preencher laudo'}));
 fireEvent.change(screen.getByLabelText('36 — Descrição do diagnóstico'),{target:{value:'EXEMPLO'}});
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 try{
 fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});
 expect(close).not.toHaveBeenCalled();
 expect(confirm).toHaveBeenCalled();
 }finally{confirm.mockRestore();}
});

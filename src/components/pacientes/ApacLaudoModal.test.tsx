import React from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({fill:vi.fn(async()=>new Uint8Array([1,2,3])),load:vi.fn(async()=>new ArrayBuffer(1))}));
vi.mock('@/lib/apacPdf',()=>({APAC_DOCUMENT_NAME:'FORMULARIO_APAC_LAUDO',apacFilename:()=> 'TESTE.pdf',fillApacPdf:f.fill,loadApprovedApac:f.load}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:(_k:string,id:string)=>({single:async()=>({data:{id,nome:id==='p1'?'Paciente':'Outro'},error:null})})})})}}));
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

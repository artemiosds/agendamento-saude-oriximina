import React from 'react';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const f=vi.hoisted(()=>({print:vi.fn(),download:vi.fn()}));
vi.mock('@/lib/apacLaudoPrint',()=>({printApacLaudo:f.print,downloadApacLaudoPDF:f.download}));
vi.mock('@/components/documents/SigtapProcedurePicker',()=>({default:()=> <span>Busca SIGTAP</span>}));
vi.mock('./ApacLaudoTemplate',async()=>{
 const React=await import('react');
 return {default:React.forwardRef((props:any,ref:any)=>{
  React.useImperativeHandle(ref,()=>({waitReady:async()=>{},svg:null}));
  return <div data-testid="preview">{props.paciente?.nome}|{props.clinicalData?.diagnostico||'sem dados clínicos'}</div>;
 })};
});
import ApacLaudoModal from './ApacLaudoModal';
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const patient={id:'p1',nome:'Paciente'};
it('mantém impressão antiga disponível sem preencher o laudo',async()=>{
 render(<ApacLaudoModal open onOpenChange={()=>{}} paciente={patient}/>);
 expect(screen.getByTestId('preview')).toHaveTextContent('sem dados clínicos');
 fireEvent.click(screen.getByRole('button',{name:'Imprimir Laudo APAC'}));
 await waitFor(()=>expect(f.print).toHaveBeenCalledOnce());
});
it('edição e prévia usam o mesmo conteúdo e não migram entre pacientes',async()=>{
 const {rerender}=render(<ApacLaudoModal open onOpenChange={()=>{}} paciente={patient}/>);
 fireEvent.click(screen.getByRole('button',{name:'Preencher laudo'}));
 fireEvent.change(screen.getByLabelText('36 — Descrição do diagnóstico'),{target:{value:'Informação revisada'}});
 expect(screen.getByTestId('preview')).toHaveTextContent('Informação revisada');
 fireEvent.click(screen.getByRole('button',{name:'Ver prévia'}));
 expect(screen.getByTestId('preview')).toHaveTextContent('Informação revisada');
 rerender(<ApacLaudoModal open onOpenChange={()=>{}} paciente={{id:'p2',nome:'Outro'}}/>);
 await waitFor(()=>expect(screen.getByTestId('preview')).toHaveTextContent('Outro|sem dados clínicos'));
});
it('bloqueia emissão quando o preenchimento contém erro estrutural',()=>{
 render(<ApacLaudoModal open onOpenChange={()=>{}} paciente={patient}/>);
 fireEvent.click(screen.getByRole('button',{name:'Preencher laudo'}));
 fireEvent.change(screen.getByLabelText('37 — CID principal'),{target:{value:'XYZ'}});
 expect(screen.getByRole('alert')).toHaveTextContent('CID inválido');
 expect(screen.getByRole('button',{name:'Imprimir Laudo APAC'})).toBeDisabled();
 expect(screen.getByRole('button',{name:'Baixar PDF'})).toBeDisabled();
});

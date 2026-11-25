import React from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import DocumentLibrary,{classifyDocument,matchesDocument,modelCode,type LibraryItem} from './DocumentLibrary';
afterEach(()=>{cleanup();localStorage.clear();});
const items:LibraryItem[]=[{id:'a',nome:'FORMULARIO_APAC_LAUDO',categoria:'Regulação',descricao:'Complementar'},{id:'b',nome:'OCI AVALIAÇÃO CARDIOLÓGICA',categoria:'Regulação',codigo:'0902010026'},{id:'c',nome:'Ficha Completa',categoria:'Cadastro'}];
function Harness({onGenerate=vi.fn(),userId='test'}:{onGenerate?:(id:string)=>void;userId?:string}){
 const [search,setSearch]=React.useState('');const [category,setCategory]=React.useState<Parameters<typeof DocumentLibrary>[0]['category']>('Todos');
 return <DocumentLibrary items={items} userId={userId} search={search} onSearch={setSearch} category={category} onCategory={setCategory} onGenerate={onGenerate}/>;
}
describe('biblioteca de documentos compartilhada',()=>{
 it('classifica OCI e CER sem confundir a palavra câncer',()=>{
 expect(classifyDocument('Laudo Clínico','OCI CÂNCER')).toBe('Regulação');expect(classifyDocument('Laudo','CÂNCER')).toBe('Clínico');expect(classifyDocument('Relatório','CER II')).toBe('CER');
 });
 it('busca sem acentos e por código oficial',()=>{
 expect(matchesDocument(items[1],'avaliacao 0902010026')).toBe(true);
 expect(matchesDocument(items[0],'formulario apac')).toBe(true);
 expect(modelCode({blocos_clinicos:{oci:{procedimento_principal:{codigo:'0902010026'}}}})).toBe('0902010026');
 });
 it('filtra a categoria e gera somente o documento clicado',()=>{
 const fn=vi.fn();render(<Harness onGenerate={fn}/>);
 fireEvent.click(screen.getByRole('button',{name:/Cadastro 1/}));
 expect(screen.queryByRole('button',{name:'Gerar FORMULARIO_APAC_LAUDO'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Gerar Ficha Completa'}));expect(fn).toHaveBeenCalledWith('c');
 });
 it('persiste apenas IDs favoritos por profissional e não mistura contas',()=>{
 const {unmount}=render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Favoritar Ficha Completa'}));unmount();
 expect(JSON.parse(localStorage.getItem('document-library-favorites:v1:test')!)).toEqual(['c']);
 render(<Harness userId="outro"/>);expect(screen.getByRole('button',{name:'Favoritar Ficha Completa'})).toBeInTheDocument();
 });
});

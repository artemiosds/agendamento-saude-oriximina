// @vitest-environment node
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {emptyComplement,activeGroups,validateComplement,parts,GROUPS} from './apacComplementData';
import {COMPLEMENT_SHA256,fillComplement,appendComplement} from './apacComplementPdf';
const source=readFileSync('public/Formulario_Apac_Laudo_Complementar.pdf');
describe('APAC complementar',()=>{
 it('preserva o arquivo aprovado e não repete posições',()=>{
 expect(createHash('sha256').update(source).digest('hex')).toBe(COMPLEMENT_SHA256);
 const f=GROUPS.flatMap(g=>g.fields);expect(new Set(f.map(x=>x.id)).size).toBe(f.length);
 expect(f.flatMap(x=>x.targets).length).toBe(163);
 });
 it('emissão padrão não exige dados extras',()=>expect(validateComplement(emptyComplement())).toEqual([]));
 it('esconde tratamentos anteriores não aplicáveis',()=>{
 const d=emptyComplement();d.areas=['radioterapia'];d.values['radioterapia.tratamento_anterior']='nao';d.values['radioterapia.anteriores.1.descricao']='NÃO EMITIR';
 expect(activeGroups(d).some(g=>g.series==='radioterapia.anteriores')).toBe(false);
 });
 it('não emite quimioterapia sem medicamento e confirmação',()=>expect(validateComplement({areas:['quimioterapia'],values:{}})).toContain('Quimioterapia: informe o primeiro medicamento com código oficial e descrição.'));
 it('preenche complemento e junta as quatro páginas',async()=>{
 const d={areas:['protese'] as const,values:{'protese_mamaria.marca':'pip','protese_mamaria.ano_implantacao':'2010','protese_mamaria.estabelecimento':'HOSPITAL FICTÍCIO','protese_mamaria.cnes':'0000001'}};
 const b=await fillComplement(source,{...d,areas:[...d.areas]});
 expect((await PDFDocument.load(b)).getPageCount()).toBe(2);
 const p=await appendComplement(readFileSync('public/Formulario_APAC_LAUDO.pdf'),b);
 expect((await PDFDocument.load(p)).getPageCount()).toBe(4);
 });
 it('não arredonda resultados nem marca exames ausentes',()=>{
 const f=GROUPS.flatMap(g=>g.fields).find(f=>f.id==='nefrologia.primeiro.hb')!;
 expect(parts(f,'10,5')).toEqual(['10,','5']);expect(()=>parts(f,'10,55')).toThrow();expect(parts(f,'')).toEqual([]);
 });
});

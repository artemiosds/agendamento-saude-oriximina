import {describe,it,expect} from 'vitest';
import {auditExportEligibility,readFilteredExport,EXPORT_BATCH,EXPORT_LIMITS,exportSafeText,auditExportCsv,auditExportHtml} from './auditDocumentExport';
describe('exportação documental de auditoria',()=>{
 it('exige datas, total confirmado e pesquisa não parcial',()=>{
   expect(auditExportEligibility('csv','2026-11-01','2026-11-27',5000,false)).toBe('');
   expect(auditExportEligibility('pdf','2026-11-01','2026-11-27',501,false)).toContain('excede');
   expect(auditExportEligibility('csv','','',1,false)).toContain('período');
   expect(auditExportEligibility('csv','2026-10-01','2026-11-27',1,false)).toContain('período');
   expect(auditExportEligibility('csv','2026-11-01','2026-11-27',1,true)).toContain('parcial');
   expect(auditExportEligibility('csv','2026-11-01','2026-11-27',0,false)).toContain('Nenhum');
 });
 it('lê todos os lotes, na ordem recebida, e reconfirma o total',async()=>{
   const source=Array.from({length:EXPORT_BATCH+1},(_,i)=>({id:'id-'+i}));let counts=0;let reads=0;
   const result=await readFilteredExport('csv',async()=>{counts++;return source.length;},async(from,to)=>{reads++;return source.slice(from,to+1);},new AbortController().signal,()=>{});
   expect(result).toEqual(source);expect(reads).toBe(2);expect(counts).toBe(2);
 });
 it('interrompe limites, truncamento, repetição, mudança e cancelamento',async()=>{
   const c=new AbortController(),noop=()=>{};
   await expect(readFilteredExport('pdf',async()=>EXPORT_LIMITS.pdf+1,async()=>[],c.signal,noop)).rejects.toThrow('limite');
   await expect(readFilteredExport('csv',async()=>2,async()=>[{id:'a'}],c.signal,noop)).rejects.toThrow('Cobertura');
   await expect(readFilteredExport('csv',async()=>2,async()=>[{id:'a'},{id:'a'}],c.signal,noop)).rejects.toThrow('repetidos');
   let n=0;await expect(readFilteredExport('csv',async()=>++n,async()=>[{id:'a'}],c.signal,noop)).rejects.toThrow('mudou');
   c.abort();await expect(readFilteredExport('csv',async()=>1,async()=>[],c.signal,noop)).rejects.toThrow('cancelada');
 });
 it('protege documentos, credenciais comuns e conteúdo de CSV e HTML',()=>{
   expect(exportSafeText('CPF 123.456.789-01')).toBe('CPF ***.***.***-01');
   expect(exportSafeText('CNS 123456789012345')).toBe('CNS ***.***.***.***-345');
   expect(exportSafeText('senha=abc')).toBe('senha=********');
   expect(auditExportCsv([['Motivo','=1+1']],['Nome'],[['@x']])).toContain('"\'=1+1"');
   expect(auditExportCsv([],['Nome'],[['@x']])).toContain('"\'@x"');
   expect(auditExportHtml([['Motivo','<script>']],['Nome'],[['<b>']])).toContain('&lt;script&gt;');
   expect(auditExportHtml([],['Nome'],[['<b>']])).toContain('&lt;b&gt;');
 });
});

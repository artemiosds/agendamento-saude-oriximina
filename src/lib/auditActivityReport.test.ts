import {describe,it,expect} from 'vitest';
import {buildAuditReport,auditReportDays,readAuditReport,REPORT_LIMIT,REPORT_PAGE,type ReportEvent} from './auditActivityReport';
const e=(id:string,over:Partial<ReportEvent>={}):ReportEvent=>({id,created_at:'2026-11-27T15:00:00Z',user_id:'u1',user_nome:'Pessoa A',role:'profissional',unidade_id:'un1',unidade_nome:'Unidade A',acao:'login_sucesso',status:'sucesso',...over});
describe('relatório de atividade',()=>{
 it('separa autenticações e horários de outros eventos',()=>{
   const r=buildAuditReport([e('1',{acao:'login',status:'tentativa',created_at:'2026-11-27T09:00:00Z'}),e('2'),e('3',{acao:'login_falha',status:'erro'}),e('4',{acao:'logout',created_at:'2026-11-27T20:00:00Z'}),e('5',{acao:'login_sucesso',status:'erro'}),e('6',{created_at:'2026-11-27T16:00:00Z'})]);
   expect(r.totals.logins).toBe(2);expect(r.totals.tentativas).toBe(1);expect(r.totals.falhasLogin).toBe(2);expect(r.totals.erros).toBe(2);
   expect(r.actors[0].primeiroAcesso).toBe('2026-11-27T15:00:00Z');expect(r.actors[0].ultimoAcesso).toBe('2026-11-27T16:00:00Z');
 });
 it('contabiliza eventos clínicos bem-sucedidos sem presumir atendimentos únicos',()=>{
   const r=buildAuditReport([e('1',{acao:'atendimento_finalizado'}),e('2',{acao:'finalizar_atendimento'}),e('3',{acao:'atendimento_finalizado',status:'erro'}),e('4',{acao:'edicao_prontuario'}),e('5',{acao:'prontuario_criado'})]);
   expect(r.totals.atendimentosFinalizados).toBe(2);expect(r.totals.prontuariosEditados).toBe(1);expect(r.totals.prontuariosCriados).toBe(1);expect(r.totals.logins).toBe(0);expect(r.actors[0].primeiroAcesso).toBe('');
 });
 it('distingue pessoas homônimas, unidade histórica e eventos sem responsável individual',()=>{
   const r=buildAuditReport([e('1',{usuario_cpf:'12345678901'}),e('2',{user_id:'u2'}),e('3',{unidade_id:'un2',unidade_nome:'Unidade B'}),e('4',{user_id:'',unidade_id:'',unidade_nome:null}),e('5',{role:'sistema'})]);
   expect(r.actors.length).toBe(2);expect(r.units.length).toBe(3);expect(r.semResponsavel).toBe(2);expect(r.totals.totalAcoes).toBe(5);expect(r.actors.find(a=>a.userId==='u1')?.totalAcoes).toBe(2);
   expect(buildAuditReport([e('1',{usuario_cpf:'12345678901'})]).actors[0].cpf).toBe('***.***.***-01');
 });
 it('valida intervalo inclusivo e rejeita datas inexistentes',()=>{
   expect(auditReportDays('2026-11-01','2026-11-27')).toBe(27);expect(auditReportDays('2026-11-27','2026-11-27')).toBe(1);expect(Number.isNaN(auditReportDays('2026-02-30','2026-03-01'))).toBe(true);
 });
 it('lê todas as páginas e confirma a contagem final',async()=>{
   const rows=Array.from({length:REPORT_PAGE+1},(_,i)=>e(String(i)));let reads=0;let counts=0;
   const r=await readAuditReport(async()=>{counts++;return rows.length;},async(from,to)=>{reads++;return rows.slice(from,to+1);},new AbortController().signal,()=>{});
   expect(r.totals.totalAcoes).toBe(rows.length);expect(reads).toBe(2);expect(counts).toBe(2);
 });
 it('recusa truncamento, duplicidade, mudança de contagem, limite e cancelamento',async()=>{
   const c=new AbortController();const noop=()=>{};
   await expect(readAuditReport(async()=>2,async()=>[e('1')],c.signal,noop)).rejects.toThrow('Cobertura');
   await expect(readAuditReport(async()=>2,async()=>[e('1'),e('1')],c.signal,noop)).rejects.toThrow('mudou');
   let n=0;await expect(readAuditReport(async()=>++n,async()=>[e('1')],c.signal,noop)).rejects.toThrow('mudou');
   await expect(readAuditReport(async()=>REPORT_LIMIT+1,async()=>[],c.signal,noop)).rejects.toThrow('Reduza');
   c.abort();await expect(readAuditReport(async()=>0,async()=>[],c.signal,noop)).rejects.toThrow('cancelada');
 });
});

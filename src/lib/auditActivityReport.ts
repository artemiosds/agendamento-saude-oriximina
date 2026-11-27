import {auditSafeText,maskAuditIdentifier} from './auditSecurity';
import {auditUnitLabel,recordedUnitName} from './auditUnitIdentity';
export const REPORT_LIMIT=10000;
export const REPORT_PAGE=500;
export const REPORT_MAX_DAYS=31;
export type ReportEvent={id:string;created_at:string;user_id:string;user_nome:string;role:string;unidade_id:string;unidade_nome:string|null;acao:string;status:string;usuario_cpf?:string|null};
export type ActivityCounts={totalAcoes:number;logins:number;tentativas:number;falhasLogin:number;erros:number;atendimentosIniciados:number;atendimentosFinalizados:number;prontuariosVisualizados:number;prontuariosEditados:number;prontuariosCriados:number;primeiroAcesso:string;ultimoAcesso:string};
export type ActorReport=ActivityCounts & {userId:string;nome:string;cpf:string;role:string};
export type UnitReport=ActivityCounts & {unitId:string;nome:string;nomeRegistrado:string;actors:number;semResponsavel:number};
export type AuditReport={actors:ActorReport[];units:UnitReport[];totals:ActivityCounts;semResponsavel:number};
const fresh=():ActivityCounts=>({totalAcoes:0,logins:0,tentativas:0,falhasLogin:0,erros:0,atendimentosIniciados:0,atendimentosFinalizados:0,prontuariosVisualizados:0,prontuariosEditados:0,prontuariosCriados:0,primeiroAcesso:'',ultimoAcesso:''});
const loginActions=['login','login_sucesso','login_falha','login_erro'];
function tally(c:ActivityCounts,e:ReportEvent){
  c.totalAcoes++;
  const failure=['erro','falha'].includes(e.status);
  if(failure)c.erros++;
  if(loginActions.includes(e.acao)){
    if(e.status==='sucesso'&&['login','login_sucesso'].includes(e.acao)){
      c.logins++;
      const t=Date.parse(e.created_at);
      if(Number.isFinite(t)){
        if(!c.primeiroAcesso||t<Date.parse(c.primeiroAcesso))c.primeiroAcesso=e.created_at;
        if(!c.ultimoAcesso||t>Date.parse(c.ultimoAcesso))c.ultimoAcesso=e.created_at;
      }
    }else if(failure||['login_falha','login_erro'].includes(e.acao))c.falhasLogin++;
    else if(e.status==='tentativa')c.tentativas++;
  }
  if(e.status!=='sucesso')return;
  if(['atendimento_iniciado','iniciar_atendimento'].includes(e.acao))c.atendimentosIniciados++;
  if(['atendimento_finalizado','finalizar_atendimento'].includes(e.acao))c.atendimentosFinalizados++;
  if(e.acao==='prontuario_visualizado')c.prontuariosVisualizados++;
  if(['prontuario_editado','edicao_prontuario'].includes(e.acao))c.prontuariosEditados++;
  if(e.acao==='prontuario_criado')c.prontuariosCriados++;
}
export function buildAuditReport(events:readonly ReportEvent[]):AuditReport{
  const actors=new Map<string,ActorReport>(),units=new Map<string,{row:UnitReport;ids:Set<string>}>();
  const totals=fresh();
  let semResponsavel=0;
  // The latest recorded label is displayed; distinct user IDs are never merged by name.
  const ordered=[...events].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id.localeCompare(a.id));
  for(const e of ordered){
    tally(totals,e);
    const uid=e.unidade_id?.trim()||'';
    let unit=units.get(uid);
    if(!unit){unit={row:{...fresh(),unitId:uid,nome:auditSafeText(auditUnitLabel(e)),nomeRegistrado:auditSafeText(recordedUnitName(e)),actors:0,semResponsavel:0},ids:new Set()};units.set(uid,unit);}
    if(!unit.row.nomeRegistrado&&recordedUnitName(e)){unit.row.nomeRegistrado=auditSafeText(recordedUnitName(e));unit.row.nome=unit.row.nomeRegistrado;}
    tally(unit.row,e);
    const id=e.user_id?.trim()||'';
    if(!id||/^(sistema|system|automacao|automação|anonimo|anonymous|null|undefined)$/i.test(id)||['sistema','system'].includes(e.role?.toLowerCase())){
      semResponsavel++;unit.row.semResponsavel++;continue;
    }
    unit.ids.add(id);
    let actor=actors.get(id);
    if(!actor){actor={...fresh(),userId:id,nome:auditSafeText(e.user_nome?.trim()||'Responsável não registrado'),cpf:maskAuditIdentifier(e.usuario_cpf,'cpf'),role:auditSafeText(e.role||'Não informado')};actors.set(id,actor);}
    tally(actor,e);
  }
  return {actors:[...actors.values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')||a.userId.localeCompare(b.userId)),units:[...units.values()].map(u=>({...u.row,actors:u.ids.size})).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')||a.unitId.localeCompare(b.unitId)),totals,semResponsavel};
}
export function auditReportDays(from:string,to:string):number{
  const parse=(s:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return NaN;const t=Date.parse(s+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s?t:NaN;};
  return (parse(to)-parse(from))/86400000+1;
}
export async function readAuditReport(count:()=>Promise<number>,read:(from:number,to:number)=>Promise<ReportEvent[]>,signal:AbortSignal,onProgress:(n:number,total:number)=>void):Promise<AuditReport>{
  const check=()=>{if(signal.aborted)throw Error('Consulta cancelada.');};
  check();const expected=await count();check();
  if(!Number.isSafeInteger(expected)||expected<0)throw Error('Contagem do relatório não confirmada.');
  if(expected>REPORT_LIMIT)throw Error('O período contém mais de '+REPORT_LIMIT.toLocaleString('pt-BR')+' eventos. Reduza o período ou filtre uma unidade.');
  const events:ReportEvent[]=[],seen=new Set<string>();
  onProgress(0,expected);
  for(let from=0;from<expected;from+=REPORT_PAGE){
    check();
    const to=Math.min(expected,from+REPORT_PAGE)-1;
    const rows=await read(from,to);check();
    if(rows.length!==to-from+1)throw Error('Cobertura do período não confirmada. Tente novamente.');
    for(const row of rows){
      if(!row.id||seen.has(row.id))throw Error('A consulta mudou durante a leitura. Tente novamente.');
      seen.add(row.id);events.push(row);
    }
    onProgress(events.length,expected);
  }
  const final=await count();check();
  if(final!==expected)throw Error('O total de eventos mudou durante a leitura. Tente novamente.');
  return buildAuditReport(events);
}
const clock=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Santarem',dateStyle:'short',timeStyle:'medium'});
export const reportTime=(v:string)=>v&&Number.isFinite(Date.parse(v))?clock.format(new Date(v)):'—';
export const REPORT_METRICS=[['Eventos','totalAcoes'],['Logins confirmados','logins'],['Tentativas registradas','tentativas'],['Falhas de login','falhasLogin'],['Erros / falhas','erros'],['Atend. iniciados','atendimentosIniciados'],['Atend. finalizados','atendimentosFinalizados'],['Pront. visualizados','prontuariosVisualizados'],['Pront. editados','prontuariosEditados'],['Pront. criados','prontuariosCriados'],['Primeiro login','primeiroAcesso'],['Último login','ultimoAcesso']] as const;
export function reportMetricCells(c:ActivityCounts){return REPORT_METRICS.map(([,k])=>typeof c[k]==='number'?String(c[k]):reportTime(String(c[k])));}

import { gradeDay, validWindow, timeOverlap, type ReviewGrade } from './availabilityReview';
import { gradePeriod, gradeMode } from './availabilityDirectory';

export const PROFILE_DAYS=[1,2,3,4,5,6,0];
export const PROFILE_DAY_NAMES=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
export type ProfileGrade=ReviewGrade & {salaId?:string;duracaoConsulta?:number};
export type ProfileLabel={id:string;nome:string;unidadeId?:string};
export const profileEscape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
export const profileDate=(value:string)=>gradeDay(value)>=0?value.split('-').reverse().join('/'):value||'Não informada';
export function buildAvailabilityWeek(rows:readonly ProfileGrade[],rooms:readonly ProfileLabel[],turns:readonly ProfileLabel[],today:string){
  const first=rows[0];
  const valid=!!first&&gradeDay(first.dataInicio)>=0&&gradeDay(first.dataFim)>=0&&first.dataInicio<=first.dataFim&&
    new Set(rows.map(r=>r.id)).size===rows.length&&rows.every(r=>r.profissionalId===first.profissionalId&&r.unidadeId===first.unidadeId&&r.dataInicio===first.dataInicio&&r.dataFim===first.dataFim&&Array.isArray(r.diasSemana)&&r.diasSemana.length>0&&new Set(r.diasSemana).size===r.diasSemana.length&&r.diasSemana.every(d=>Number.isInteger(d)&&d>=0&&d<=6)&&validWindow(r.horaInicio,r.horaFim)&&Number.isInteger(r.vagasPorDia)&&r.vagasPorDia>=0&&Number.isInteger(r.vagasPorHora)&&r.vagasPorHora>=0);
  const period=valid?gradePeriod(first.dataInicio,first.dataFim,today):'invalido';
  const mode=gradeMode(rows);
  const days=PROFILE_DAYS.map(day=>{
    const blocks=rows.filter(r=>r.diasSemana.includes(day)).map(r=>{
      const byTurn=r.vagasPorHora===0;
      const label=byTurn?turns.find(t=>t.id===r.salaId)?.nome||r.salaId||'Turno':rooms.find(s=>s.id===r.salaId&&s.unidadeId===r.unidadeId)?.nome||(r.salaId?'Sala não localizada':'Sala não definida');
      return {id:r.id,label,start:r.horaInicio,end:r.horaFim,mode:byTurn?'Por turno':'Por hora',nominal:r.vagasPorDia,perHour:r.vagasPorHora,duration:r.duracaoConsulta&&r.duracaoConsulta>0?r.duracaoConsulta:null};
    }).sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end)||a.id.localeCompare(b.id));
    const conflict=blocks.some((b,i)=>blocks.slice(i+1).some(c=>timeOverlap(b.start,b.end,c.start,c.end)));
    const ambiguous=blocks.filter(b=>b.perHour>0).length>1||blocks.some(b=>b.perHour>0)&&blocks.some(b=>b.perHour===0);
    return {day,blocks,conflict,ambiguous};
  });
  const alerts=days.some(d=>d.conflict||d.ambiguous)||mode==='misto';
  return {valid,period,mode,days,configuredDays:days.filter(d=>d.blocks.length).length,blocks:days.reduce((sum,d)=>sum+d.blocks.length,0),nominal:valid&&!alerts?days.reduce((sum,d)=>sum+d.blocks.reduce((n,b)=>n+b.nominal,0),0):null,alerts};
}
export type AvailabilityWeek=ReturnType<typeof buildAvailabilityWeek>;
export function buildAvailabilityProfilePrint(input:{week:AvailabilityWeek;name:string;profession:string;registration:string;unit:string;start:string;end:string;status:string;emittedBy:string}){
  if(!input.week.valid||!input.name.trim()||!input.unit.trim()||!input.week.blocks)throw new Error('Confira o cadastro e a grade antes de imprimir.');
  const e=profileEscape;
  const {week}=input;
  const rows=week.days.map(d=>d.blocks.length?d.blocks.map((b,i)=>'<tr><td>'+ (i===0?e(PROFILE_DAY_NAMES[d.day]):'')+'</td><td>'+e(b.label)+'<small>'+e(b.mode)+'</small></td><td class="ap-time">'+e(b.start)+' – '+e(b.end)+'</td><td>'+e(b.nominal)+(b.perHour>0?'<small>'+e(b.perHour)+'/hora</small>':'')+'</td><td>'+(b.perHour>0?e(b.duration===null?'Não informada':b.duration+' min'):'—')+'</td><td>'+(d.conflict?'Sobreposição':d.ambiguous?'Conferir':'—')+'</td></tr>').join(''):'<tr><td>'+e(PROFILE_DAY_NAMES[d.day])+'</td><td colspan="5">Sem horário configurado neste dia</td></tr>').join('');
  return `<style>.ap-profile{font:9pt/1.35 Arial,sans-serif;color:#163d53;text-align:left}.ap-profile h3{font-size:10pt;margin:7px 0 4px;break-after:avoid}.ap-profile p{margin:4px 0}.ap-profile .ap-meta{border:1px solid #a8bbc5;border-radius:4px;padding:7px;margin-bottom:6px;break-inside:avoid}.ap-profile .ap-summary{display:flex;flex-wrap:wrap;gap:8px 18px;padding:6px;background:#edf4f6;border:1px solid #a8bbc5;break-inside:avoid}.ap-profile table{width:100%;border-collapse:collapse;margin:6px 0;font-size:8pt;table-layout:auto}.ap-profile thead{display:table-header-group}.ap-profile th,.ap-profile td{border:1px solid #c6d5dc;text-align:left;padding:4px;vertical-align:top;overflow-wrap:anywhere}.ap-profile th{background:#e5eff5;color:#163d53}.ap-profile tr{break-inside:avoid}.ap-profile small{display:block;color:#475569;font-size:7.5pt}.ap-time{white-space:nowrap}.ap-note{font-size:8pt;color:#475569}.ap-alert{font-weight:bold;color:#963c23}</style>
<div class="ap-profile"><div class="ap-meta"><strong>${e(input.name)}</strong><p>${e(input.profession)}${input.registration?' · '+e(input.registration):''}</p><p><strong>Unidade de atendimento:</strong> ${e(input.unit)}</p><p><strong>Vigência:</strong> ${e(profileDate(input.start))} a ${e(profileDate(input.end))} · ${e(input.status)}</p></div>
<div class="ap-summary"><span><strong>${week.configuredDays}/7</strong> dias configurados</span><span><strong>${week.blocks}</strong> faixas semanais</span><span><strong>${week.nominal??'A conferir'}</strong> vagas nominais/semana</span></div>
${week.alerts?'<p class="ap-alert">Há sobreposição ou modalidades que exigem conferência; total nominal omitido.</p>':''}
<h3>Grade semanal cadastrada</h3><table><thead><tr><th>Dia</th><th>Sala / turno</th><th>Horário</th><th>Vagas cadastradas</th><th>Duração da consulta</th><th>Conferência</th></tr></thead><tbody>${rows}</tbody></table>
<p class="ap-note">Padrão semanal de configuração dentro da vigência indicada; não representa frequência, escala efetivamente cumprida ou vagas livres. Não desconta feriados, bloqueios, agendamentos ou cotas. Períodos curtos podem não conter todos os dias configurados. Histórico corresponde aos períodos atualmente registrados, não a versões anteriores das edições.</p><p class="ap-note">Emitido por: ${e(input.emittedBy)} · Uso administrativo.</p></div>`;
}

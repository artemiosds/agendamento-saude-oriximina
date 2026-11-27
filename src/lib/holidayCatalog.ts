// Calendar reference, not an instruction to suspend health services.
// 2026: municipal Decree 510/2025, published 06/01/2026, edition 77.
export const MUNICIPAL_SOURCE='https://oriximina.1dom.com.br/edicao/01KE836KAWFV69PVQ0ZX8DY5KD';
export const MUNICIPAL_PDF='https://acessoinformacao.org.br/licitacoes/arquivos/download/019b8e68-75cf-77d3-aced-50d9cd218b81-gem9f2JFOkJvXmF2.pdf';
export const FEDERAL_SOURCE='https://www.planalto.gov.br/ccivil_03/leis/l0662.htm';
export const STATE_SOURCE='https://www.seplad.pa.gov.br/2025/12/22/governo-do-para-divulga-datas-de-feriados-e-pontos-facultativos-para-2026/';
export type HolidayKind='nacional'|'estadual'|'municipal'|'facultativo';
export type HolidayCandidate={date:string;title:string;kind:HolidayKind;verified:boolean;source:string;fullDay:boolean;start:string;end:string;note?:string};
export const holidayKindLabels:Record<HolidayKind,string>={nacional:'Feriado nacional',estadual:'Feriado estadual',municipal:'Feriado municipal',facultativo:'Ponto facultativo'};
export function holidayCatalog(year:number):HolidayCandidate[]{
 if(year!==2026&&year!==2027)return [];
 const rows:HolidayCandidate[]=[];
 const add=(md:string,title:string,kind:HolidayKind,verified:boolean,source:string,partialEnd='',note?:string)=>rows.push({date:year+'-'+md,title,kind,verified,source,fullDay:!partialEnd,start:partialEnd?'00:00':'',end:partialEnd,note});
 const local='Decreto municipal 510/2025';
 for(const [date,title,law] of [
 ['01-01','Confraternização Universal','Lei 662/1949'],['04-21','Tiradentes','Lei 662/1949'],['05-01','Dia do Trabalho','Lei 662/1949'],['09-07','Independência do Brasil','Lei 662/1949'],['10-12','Nossa Senhora Aparecida','Lei 6.802/1980'],['11-02','Finados','Lei 662/1949'],['11-15','Proclamação da República','Lei 662/1949'],['11-20','Consciência Negra','Lei 14.759/2023'],['12-25','Natal','Lei 662/1949']])add(date,title,'nacional',true,year===2026?local:law,'',date==='11-20'&&year===2026?'Também consta como municipal no decreto; uma única data.':undefined);
 add('08-15','Adesão do Pará à Independência','estadual',true,year===2026?local:'Leis estaduais 37/1947 e 5.999/1996');
 if(year===2026){
  add('04-03','Sexta-feira Santa','nacional',true,local);
  add('08-03','Segunda-feira após o Círio','municipal',true,local);
  add('08-17','Segunda-feira após a Festa de Santo Antônio','municipal',true,local);
  add('12-24','Emancipação Política de Oriximiná','municipal',true,local);
  for(const [date,title] of [['02-16','Véspera de Carnaval'],['02-17','Carnaval'],['03-08','Dia Internacional da Mulher'],['04-02','Quinta-feira Santa'],['06-04','Corpus Christi'],['10-28','Dia do Servidor Público']])add(date,title,'facultativo',true,local);
  add('02-18','Quarta-feira de Cinzas','facultativo',true,local,'14:00','Horário conforme decreto municipal, não a regra federal/estadual.');
 }else{
  // Provisional dates are informational and never eligible for batch import.
  add('03-26','Sexta-feira Santa','nacional',false,'Previsão de calendário; confirmar ato municipal');
  add('12-24','Emancipação Política de Oriximiná','municipal',false,'Referência de 2026; confirmar ato de 2027');
  for(const [date,title] of [['02-08','Véspera de Carnaval'],['02-09','Carnaval'],['02-10','Quarta-feira de Cinzas'],['03-08','Dia Internacional da Mulher'],['03-25','Quinta-feira Santa'],['05-27','Corpus Christi'],['10-28','Dia do Servidor Público']])add(date,title,'facultativo',false,'Previsão; horário e suspensão sujeitos ao ato municipal');
 }
 return rows.sort((a,b)=>a.date.localeCompare(b.date));
}
export type ExistingHolidayBlock={data_inicio:string;data_fim:string;dia_inteiro:boolean|null;hora_inicio:string|null;hora_fim:string|null;unidade_id:string|null;profissional_id:string|null;titulo:string;tipo:string};
export function holidayEligibility(candidate:HolidayCandidate,existing:readonly ExistingHolidayBlock[],today:string){
 const global=existing.filter(b=>!b.unidade_id&&!b.profissional_id&&b.data_inicio<=candidate.date&&b.data_fim>=candidate.date);
 const covered=global.some(b=>b.dia_inteiro===true||(!candidate.fullDay&&b.dia_inteiro===false&&!!b.hora_inicio&&!!b.hora_fim&&b.hora_inicio.slice(0,5)<=candidate.start&&b.hora_fim.slice(0,5)>=candidate.end));
 if(covered)return 'coberto' as const;
 if(global.length)return 'conferir' as const;
 if(candidate.date<today)return 'passado' as const;
 if(!candidate.verified)return 'provisorio' as const;
 return 'disponivel' as const;
}
export function holidayPayload(candidate:HolidayCandidate,actor:string){
 return {titulo:candidate.title,tipo:candidate.kind==='facultativo'?'ferias':'feriado',data_inicio:candidate.date,data_fim:candidate.date,dia_inteiro:candidate.fullDay,hora_inicio:candidate.start,hora_fim:candidate.end,unidade_id:'',profissional_id:'',criado_por:actor};
}

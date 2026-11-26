import { CLINICAL_SCALES, clinicalSeries, type ClinicalMetricEntry, type ClinicalScale, type ClinicalEvolutionSection } from "./clinicalEvolution";

export type AltaMetricSection = ClinicalEvolutionSection & { professionalId: string; startDate: string };
export type AltaEvolutionSnapshot = { schema: 1; state: "recorded" | "none" | "unavailable" | "unscoped"; sections: AltaMetricSection[] };
type Cycle = { id:string; patient_id:string; professional_id:string; unit_id:string; specialty:string|null; treatment_type:string|null; start_date:string|null };
type Note = { id:string; paciente_id:string; profissional_id:string; unidade_id:string; data_atendimento:string; status:string|null; tipo_registro:string; custom_data:unknown };
type Scope = { patientId:string; unitId:string; professionalId:string|null; cycleId:string|null; through:string; from?:string; to?:string; contributors?:Record<string,{from:string;to:string}> };
const date = (v:unknown):v is string => typeof v==="string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
const str = (v:unknown) => typeof v==="string" ? v : "";
const obj = (v:unknown):Record<string,unknown> => v && typeof v==="object" && !Array.isArray(v) ? v as Record<string,unknown> : {};
export const altaDateLabel = (v:unknown) => date(v)?v.split("-").reverse().join("/"):"—";
export const escapeAlta = (v:unknown) => String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
const types = new Set(["avaliacao_inicial","consulta","retorno","reavaliacao","sessao","procedimento","visita_domiciliar"]);
const statuses = new Set(["finalizado","concluido","validado","emitido"]);
function entry(raw:unknown):ClinicalMetricEntry|null {
  const r=obj(raw);
  if(!str(r.id)||!date(r.date))return null;
  const mrcContext=str(r.mrcContext).trim().slice(0,80);
  const metrics:ClinicalMetricEntry["metrics"]={};
  for(const scale of Object.keys(CLINICAL_SCALES) as ClinicalScale[]){
    const val=obj(r.metrics)[scale];
    // Do not coerce boolean, empty strings, null or object values into clinical scores.
    if(typeof val!=="number" && !(typeof val==="string" && /^\d+(\.\d+)?$/.test(val.trim())))continue;
    const n=Number(val);const def=CLINICAL_SCALES[scale];
    if(Number.isFinite(n)&&n>=def.min&&n<=def.max&&(scale==="eva"||Number.isInteger(n))&&(scale!=="mrc"||mrcContext))metrics[scale]=n;
  }
  if(!Object.keys(metrics).length)return null;
  const session=typeof r.session==="number"||typeof r.session==="string"&&/^\d+$/.test(r.session)?Number(r.session):0;
  return {id:str(r.id),date:r.date,session:Number.isInteger(session)&&session>0?session:null,metrics,mrcContext};
}
const sorted = (entries:ClinicalMetricEntry[]) => [...new Map(entries.map(e=>[e.id,e])).values()].sort((a,b)=>a.date.localeCompare(b.date)||(a.session||0)-(b.session||0)||a.id.localeCompare(b.id));
export function collectAltaEvolution(cycles:Cycle[],notes:Note[],scope:Scope):AltaMetricSection[]{
  if(!scope.patientId||!scope.unitId||!date(scope.through))return [];
  return cycles.filter(c=>c.patient_id===scope.patientId&&c.unit_id===scope.unitId&&(!scope.professionalId||c.professional_id===scope.professionalId)&&(!scope.cycleId||c.id===scope.cycleId))
    .flatMap(c=>{
      const contributor=scope.contributors?.[c.professional_id];
      if(scope.contributors&&!contributor)return [];
      const from=scope.from||contributor?.from||"";
      const to=scope.to||contributor?.to||scope.through;
      if(!date(from)||!date(to)||from>to)return [];
      const entries=sorted(notes.flatMap(n=>{
        const cd=obj(n.custom_data);
        if(n.paciente_id!==scope.patientId||n.unidade_id!==scope.unitId||n.profissional_id!==c.professional_id||!statuses.has(n.status||"")||!types.has(n.tipo_registro)||!date(n.data_atendimento)||n.data_atendimento<from||n.data_atendimento>to||n.data_atendimento>scope.through||cd.clinical_metrics_cycle_id!==c.id)return [];
        // A divergent explicit cycle link is never silently reconciled.
        const explicit=cd.treatment_cycle_id||cd.cycle_id||cd.treatmentCycleId;
        if(explicit&&explicit!==c.id)return [];
        const value=entry({id:n.id,date:n.data_atendimento,session:cd.clinical_metrics_session,metrics:cd.clinical_metrics,mrcContext:obj(cd.clinical_metrics_context).mrc});
        return value?[value]:[];
      }));
      return entries.length?[{cycleId:c.id,specialty:c.specialty||c.treatment_type||"Ciclo sem especialidade",professionalId:c.professional_id,startDate:date(c.start_date)?c.start_date:"",entries}]:[];
    });
}
export function readAltaEvolution(value:unknown):AltaEvolutionSnapshot|null{
  const r=obj(value);
  if(r.schema!==1||!["recorded","none","unavailable","unscoped"].includes(str(r.state))||!Array.isArray(r.sections))return null;
  const sections:AltaMetricSection[]=r.sections.flatMap(raw=>{
    const s=obj(raw);
    if(!str(s.cycleId)||!str(s.professionalId)||!Array.isArray(s.entries))return [];
    const entries=sorted(s.entries.map(entry).filter((v):v is ClinicalMetricEntry=>v!==null));
    return entries.length?[{cycleId:str(s.cycleId),professionalId:str(s.professionalId),specialty:str(s.specialty)||"Ciclo",startDate:date(s.startDate)?s.startDate:"",entries}]:[];
  });
  if(r.state==="recorded"&&!sections.length)return null;
  return {schema:1,state:r.state as AltaEvolutionSnapshot["state"],sections:r.state==="recorded"?sections:[]};
}
export function altaSeries(section:AltaMetricSection){
  return clinicalSeries(section.entries).map(({scale,context,points})=>{
    const def=CLINICAL_SCALES[scale];
    const values=points.map(p=>p.metrics[scale]!);
    const geometry=values.map((v,i)=>({x:38+i*284/Math.max(1,values.length-1),y:100-(v-def.min)/(def.max-def.min)*80}));
    const delta=values.length>1?Math.round((values[values.length-1]-values[0])*100)/100:null;
    return {scale,context,points,values,geometry,delta,label:def.label,min:def.min,max:def.max};
  });
}
export function altaEvolutionMessage(snapshot:AltaEvolutionSnapshot|null):string {
  if(!snapshot)return "Versão anterior sem conjunto de medidas consolidado. Nenhuma medida posterior foi incorporada.";
  if(snapshot.state==="none")return "Não há medidas estruturadas válidas no recorte conferido.";
  if(snapshot.state==="unavailable")return "Consulta das medidas indisponível ou incompleta no momento da finalização.";
  if(snapshot.state==="unscoped")return "Sem recorte clínico confirmado para inclusão de medidas.";
  return "";
}
export function altaEvolutionHtml(snapshot:AltaEvolutionSnapshot|null):string{
  const message=altaEvolutionMessage(snapshot);
  if(message)return '<div class="section"><div class="section-title">Medidas clínicas registradas</div><p>'+escapeAlta(message)+'</p></div>';
  return '<div class="section-title">Medidas clínicas registradas</div>'+snapshot!.sections.map(section=>
    '<div class="alta-chart-cycle">'+escapeAlta(section.specialty)+' · início '+altaDateLabel(section.startDate)+' · ciclo '+escapeAlta(section.cycleId.slice(-8))+'</div>'+
    altaSeries(section).map(s=>{
      const poly=s.geometry.map(p=>p.x+','+p.y).join(' ');
      const plot=s.values.length<2?'':`<svg width="340" height="120" viewBox="0 0 340 120" role="img" aria-label="Curva de medidas em ordem de registro"><line x1="38" y1="20" x2="38" y2="100" stroke="#94a3b8"/><line x1="38" y1="100" x2="322" y2="100" stroke="#94a3b8"/><text x="30" y="23" text-anchor="end" font-size="10">${s.max}</text><text x="30" y="103" text-anchor="end" font-size="10">${s.min}</text><polyline fill="none" stroke="#09678c" stroke-width="2" points="${poly}"/>${s.geometry.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="#09678c"/>`).join("")}</svg>`;
      return '<div class="alta-chart"><strong>'+escapeAlta(s.label)+(s.context?' · '+escapeAlta(s.context):'')+'</strong><div>'+s.values[0]+' → '+s.values[s.values.length-1]+' · '+s.values.length+' medida(s)'+(s.delta===null?' · sem comparação':' · variação '+(s.delta>0?'+':'')+s.delta+' ponto(s)')+'</div>'+plot+'<div>'+altaDateLabel(s.points[0].date)+' a '+altaDateLabel(s.points[s.points.length-1].date)+' · ordem dos registros</div></div>';
    }).join("")
  ).join("")+'<p>Medidas registradas no prontuário. A interpretação clínica e a decisão de alta cabem ao profissional responsável.</p>';
}
// Applied exclusively to Relatório de Alta, preserving the shared institutional shell.
export function altaOfficialBody(body:string, evolution:AltaEvolutionSnapshot|null, version:number):string{
  const charts=altaEvolutionHtml(evolution);
  const i=body.lastIndexOf('<div class="signature"');
  const content=i<0?body+charts:body.slice(0,i)+charts+body.slice(i);
  return `<style>
  .alta-official{color:#172f40;overflow-wrap:anywhere}
  .alta-official .section{break-inside:auto!important;page-break-inside:auto!important;margin:0 0 4mm}
  .alta-official .section-title{font-size:10pt;background:#edf4f7;padding:2mm 2.5mm;border-bottom:1px solid #b9cdd9;margin:0 0 2mm;color:#164f70;break-after:avoid;page-break-after:avoid}
  .alta-official .field{margin:0 0 2mm;min-width:0}
  .alta-official .field-label{font-size:8pt;color:#31576d;font-weight:700;break-after:avoid}
  .alta-official .field-value{line-height:1.35;white-space:pre-wrap;overflow-wrap:anywhere}
  .alta-official .info-grid{grid-template-columns:repeat(3,minmax(0,1fr));break-inside:avoid;page-break-inside:avoid;padding:2.5mm}
  .alta-official .signature{margin-top:0!important;padding-top:32mm;break-inside:avoid;page-break-inside:avoid}
  .alta-official .signature-line{max-width:100%}
  .alta-official .alta-chart{border:1px solid #cbd5e1;border-radius:4px;padding:2.5mm;margin:0 0 3mm;break-inside:avoid;page-break-inside:avoid;font-size:9pt}
  .alta-official .alta-chart svg{display:block;max-width:100%;height:auto}
  .alta-official .alta-chart-cycle{font-size:9pt;font-weight:700;break-after:avoid;margin:2mm 0}
  .alta-official .alta-version{font-size:8pt;text-align:right;color:#475569;margin-bottom:3mm}
  </style><div class="alta-official"><div class="alta-version">Relatório de alta · Versão ${escapeAlta(version)}</div>${content}</div>`;
}

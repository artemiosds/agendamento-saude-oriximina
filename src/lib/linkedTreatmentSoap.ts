export interface SessionSoapSource { id:string; appointment_id:string|null; patient_id:string; professional_id:string; scheduled_date:string|null; status:string; clinical_notes:string|null }
export interface RecordSoapSource { id:string; agendamento_id:string|null; paciente_id:string; profissional_id:string; unidade_id:string; data_atendimento:string; soap_subjetivo?:string|null; soap_objetivo?:string|null; soap_avaliacao?:string|null; soap_plano?:string|null }
export function readSoap(notes:string|null|undefined){
 try {const v=JSON.parse(notes||"");if(v&&v.tipo==="soap")return {subjetivo:typeof v.subjetivo==="string"?v.subjetivo:"",objetivo:typeof v.objetivo==="string"?v.objetivo:"",avaliacao:typeof v.avaliacao==="string"?v.avaliacao:"",plano:typeof v.plano==="string"?v.plano:""};}catch{/* legacy text */}
 return null;
}
export function canShowLinkedSoap(session:SessionSoapSource){
 if(session.status!=="realizada"||!session.appointment_id||!session.scheduled_date)return false;
 const raw=session.clinical_notes||"";
 if(!raw.trim())return true;
 const soap=readSoap(raw);
 return !!soap&&!Object.values(soap).some(v=>v.trim());
}
export function resolveLinkedSoap(session:SessionSoapSource,unitId:string,records:RecordSoapSource[],claims:number){
 if(!canShowLinkedSoap(session)||claims!==1)return null;
 const matches=records.filter(p=>p.agendamento_id===session.appointment_id&&p.paciente_id===session.patient_id&&p.profissional_id===session.professional_id&&p.unidade_id===unitId&&p.data_atendimento===session.scheduled_date);
 if(matches.length!==1)return null;
 const p=matches[0],soap={subjetivo:p.soap_subjetivo||"",objetivo:p.soap_objetivo||"",avaliacao:p.soap_avaliacao||"",plano:p.soap_plano||""};
 return Object.values(soap).some(v=>v.trim())?{recordId:p.id,soap}:null;
}

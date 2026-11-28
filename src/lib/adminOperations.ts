type AdminAppointmentState={status:string;concluido_em:string|null;iniciado_em:string|null};
export function adminAppointmentAllowed(a:AdminAppointmentState,kind:'reactivate'|'transfer'){
 if(a.concluido_em)return false;
 const safe=['pendente','confirmado','confirmado_chegada','atraso','aguardando_atendimento','apto_atendimento'];
 return kind==='reactivate'?['confirmado_chegada','atraso','aguardando_atendimento','apto_atendimento','em_atendimento'].includes(a.status):!a.iniciado_em&&safe.includes(a.status);
}
export function validateOnlineRules(c:{antecedencia_minima_dias:number;antecedencia_maxima_dias:number;limite_por_dia_profissional:number}){
 if(![c.antecedencia_minima_dias,c.antecedencia_maxima_dias,c.limite_por_dia_profissional].every(Number.isSafeInteger)||c.antecedencia_minima_dias<0||c.antecedencia_maxima_dias<1||c.antecedencia_maxima_dias<c.antecedencia_minima_dias||c.limite_por_dia_profissional<1)return 'Confira antecedência mínima, máxima e limite diário.';
 return null;
}
export function validateCancellationRules(c:{prazo_minimo_horas:number;limite_cancelamentos_mes:number;dias_bloqueio_apos_limite:number;motivos:string[]}){
 if(![c.prazo_minimo_horas,c.limite_cancelamentos_mes,c.dias_bloqueio_apos_limite].every(Number.isSafeInteger)||c.prazo_minimo_horas<0||c.limite_cancelamentos_mes<1||c.dias_bloqueio_apos_limite<0||c.motivos.some(m=>typeof m!=='string'||!m.trim()))return 'Confira os limites e motivos de cancelamento.';
 return null;
}
export function confirmedIds(expected:readonly string[],actual:readonly {id:string}[]|null){return !!actual&&new Set(expected).size===expected.length&&actual.length===expected.length&&new Set(actual.map(r=>r.id)).size===expected.length&&actual.every(r=>expected.includes(r.id));}

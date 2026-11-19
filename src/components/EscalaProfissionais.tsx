import { resolveProfessionalCbo } from '@/lib/sigtapClinicalValidation';
import { useState } from 'react';
import { addDays, eachDayOfInterval, endOfMonth, format, startOfWeek } from 'date-fns';
import { useOperacional } from '@/contexts/OperacionalContext';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { openPrintDocument } from '@/lib/printLayout';

export function EscalaProfissionais() {
  return <Dialog><DialogTrigger asChild><Button variant="outline">Consultar Escala da Rede</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] max-w-6xl overflow-y-auto"><DialogTitle>Escala dos Profissionais</DialogTitle><Escala /></DialogContent></Dialog>;
}

export function Escala() {
  const { disponibilidades, bloqueios } = useOperacional();
  const { unidadesVisiveis, profissionaisVisiveis, salasVisiveis, isGlobalAdmin, userUnidadeId } = useUnidadeFilter();
  const [unit, setUnit] = useState('');
  const [name, setName] = useState('');
  const [monthly, setMonthly] = useState(false);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const units = unidadesVisiveis.filter(u => (isGlobalAdmin || u.id === userUnidadeId) && (!unit || u.id === unit));
  const grades = disponibilidades.filter(g => units.some(u => u.id === g.unidadeId));
  const staff = profissionaisVisiveis.filter(p => units.some(u => u.id === p.unidadeId) || grades.some(g => g.profissionalId === p.id));
  const selected = staff.filter(p => !name || p.nome.toLocaleLowerCase().includes(name.trim().toLocaleLowerCase()));
  const ref = new Date(date + 'T12:00:00');
  const start = monthly ? new Date(ref.getFullYear(), ref.getMonth(), 1) : startOfWeek(ref, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end: monthly ? endOfMonth(start) : addDays(start, 5) });
  const counts = new Map<string, number>();
  let minutes = 0;
  let workingDays = 0;
  const calendar = days.map(day => {
    const key = format(day, 'yyyy-MM-dd');
    let active = false;
    const entries = grades.flatMap(g => {
      const person = selected.find(p => p.id === g.profissionalId);
      if (!person || key < g.dataInicio || (g.dataFim && key > g.dataFim) || !g.diasSemana.includes(day.getDay())) return [];
      const unitName = units.find(u => u.id === g.unidadeId)!.nome;
      const room = salasVisiveis.find(s => s.id === g.salaId)?.nome;
      const blocks = bloqueios.filter(b => (!b.unidadeId || b.unidadeId === g.unidadeId) && (!b.profissionalId || b.profissionalId === person.id) && key >= b.dataInicio && key <= b.dataFim);
      const time = (h: string) => Number(h.slice(0,2))*60 + Number(h.slice(3,5));
      let spans = [[time(g.horaInicio), time(g.horaFim)]];
      const reasons = [];
      for (const b of blocks) {
        const from = b.diaInteiro ? 0 : time(b.horaInicio);
        const to = b.diaInteiro ? 1440 : time(b.horaFim);
        if (from >= time(g.horaFim) || to <= time(g.horaInicio)) continue;
        reasons.push(b.titulo || b.tipo);
        spans = spans.flatMap(([a,z]) => [[a,Math.min(z,from)], [Math.max(a,to),z]].filter(([l,r]) => l<r));
      }
      if (spans.length) {
        active = true;
        counts.set(unitName,(counts.get(unitName)||0)+1);
        minutes += spans.reduce((sum,[a,z]) => sum+z-a,0);
      }
      const clock = (m:number) => String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
      return [{ person:person.nome, place:[unitName,room].filter(Boolean).join(' · '), hours:spans.map(([a,z]) => clock(a)+'–'+clock(z)).join(', '), reason:reasons.join(', '), mode:g.vagasPorHora > 0 ? 'Por hora' : 'Por turno', duration:g.duracaoConsulta }];
    });
    if (active) workingDays++;
    return {day,entries};
  });
  const summary = [workingDays+' dias com atendimento', Math.floor(minutes/60)+'h '+minutes%60+'min', ...Array.from(counts, ([u,n]) => n+' turnos em '+u)].join(' · ');
  const print = () => {
    const e = (s:string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const entries = calendar.flatMap(({day,entries}) => entries.map(r => '<tr>'+[format(day,'dd/MM'),r.person,r.place,r.hours || 'Bloqueado',r.reason].map(v=>'<td>'+e(v)+'</td>').join('')+'</tr>')).join('');
    const identity = selected.map(p => [p.nome,p.profissao,p.tipoConselho,p.numeroConselho,p.ufConselho,'CBO '+(resolveProfessionalCbo(p) || 'não informado'),unidadesVisiveis.find(u=>u.id===p.unidadeId)?.nome].filter(Boolean).join(' · ')).map(v=>'<p>'+e(v)+'</p>').join('');
    void openPrintDocument('ESCALA '+(monthly?'MENSAL':'SEMANAL')+' DE ATENDIMENTO — REDE MUNICIPAL DE SAÚDE',identity+'<table><thead><tr><th>Data</th><th>Profissional</th><th>Local</th><th>Atendimento</th><th>Bloqueio</th></tr></thead><tbody>'+entries+'</tbody></table><p>'+e(summary)+'</p><div style="display:flex;gap:2em;text-align:center;margin-top:4em;break-inside:avoid"><div style="flex:1;border-top:1px solid">Assinatura do(a) Profissional</div><div style="flex:1;border-top:1px solid">Chefia Imediata / Coordenação SMS</div></div>',{Período:format(start,'dd/MM/yyyy')+' a '+format(days[days.length-1],'dd/MM/yyyy'),Unidades:e(units.map(u=>u.nome).join(', ')),Emissão:new Date().toLocaleString('pt-BR')});
  };
  return <div className="space-y-4"><div className="flex flex-wrap gap-3 [&_input]:border [&_select]:border">
    <select aria-label="Visão" value={monthly?'mensal':'semanal'} onChange={ev=>setMonthly(ev.target.value==='mensal')}><option value="semanal">Visão semanal</option><option value="mensal">Visão mensal</option></select>
    <input aria-label="Período" type={monthly?'month':'date'} value={monthly?date.slice(0,7):date} onChange={ev=>ev.target.value && setDate(ev.target.value+(monthly?'-01':''))}/>
    <select aria-label="Unidade" value={unit} onChange={ev=>setUnit(ev.target.value)}><option value="">Todas as unidades autorizadas</option>{unidadesVisiveis.filter(u=>isGlobalAdmin||u.id===userUnidadeId).map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}</select>
    <input aria-label="Pesquisar profissional" list="escala-equipe" value={name} placeholder="Todos os profissionais" onChange={ev=>setName(ev.target.value)}/><datalist id="escala-equipe">{staff.map(p=><option key={p.id} value={p.nome}/>)}</datalist></div>
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">{monthly && Array.from({length:(start.getDay()+6)%7},(_,i)=><div key={i} className="hidden lg:block"/>)}{calendar.map(({day,entries})=><section key={day.toISOString()} className="rounded-lg border bg-card p-2"><strong className="text-[#2A6F97]">{day.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'})}</strong>{entries.length===0 && <p className="text-xs">Sem escala</p>}{entries.map((r,i)=><div key={i} className="mt-2 border-t pt-1 text-xs"><b>{r.person}</b><p>{r.place}</p><p>{r.hours}</p><p>{r.mode} {r.duration && '· '+r.duration+' min'}</p>{r.reason && <p className="bg-amber-100 text-amber-950">{r.reason}</p>}</div>)}</section>)}</div>
    <p>{summary}</p><Button disabled={!calendar.some(d=>d.entries.length)} onClick={print}>Imprimir Escala Oficial (A4)</Button></div>;
}

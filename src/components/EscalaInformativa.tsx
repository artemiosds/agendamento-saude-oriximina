import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOperacional } from '@/contexts/OperacionalContext';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import type { User } from '@/types';

interface Registro { id:string; unidade:string; sala:string; data:string; inicio:string; fim:string; semanal:boolean; origem?:string }
export function registros(p:User): Registro[] {
  const rows=p.customData?.escala_informativa;
  return Array.isArray(rows)? rows.filter(r=>r && typeof r.data==='string' && typeof r.inicio==='string' && typeof r.fim==='string'):[];
}
export function escalaDoDia(p:User,data:string) {
  const rows=registros(p);
  const weekday=(s:string)=>new Date(s+'T12:00:00').getDay();
  return rows.filter(r=>r.semanal ? r.data<=data && weekday(r.data)===weekday(data) && !rows.some(x=>x.origem===r.id && x.data===data) : r.data===data);
}
export function CadastroEscala({date}:{date:string}) {
  const {user}=useAuth();
  const {refreshFuncionarios}=useOperacional();
  const {isGlobalAdmin,userUnidadeId,profissionaisVisiveis,unidadesVisiveis,salasVisiveis}=useUnidadeFilter();
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [person,setPerson]=useState('');
  const [unit,setUnit]=useState(userUnidadeId);
  const [source,setSource]=useState('');
  if (!user || !['master','gestao','coordenador'].includes(user.role)) return null;
  const staff=profissionaisVisiveis.filter(p=>isGlobalAdmin || (userUnidadeId && p.unidadeId===userUnidadeId));
  const professional=staff.find(p=>p.id===person);
  return <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Cadastrar escala informativa</summary>
    <form className="mt-3 grid gap-3 sm:grid-cols-2 [&_input]:border [&_select]:border" onSubmit={async ev=>{
      ev.preventDefault(); if(busy)return;
      const fields=new FormData(ev.currentTarget);
      setBusy(true);setMessage('');
      try {
        const {error}=await supabase.rpc('salvar_escala_informativa' as never,{
          p_profissional:person,p_unidade:unit,p_sala:fields.get('sala'),p_data:fields.get('data'),p_inicio:fields.get('inicio'),p_fim:fields.get('fim'),p_semanal:!source && fields.get('repetir')==='on',p_origem:source||null
        } as never);
        if(error) throw error;
        await refreshFuncionarios();setMessage('Escala informativa salva.');
      }catch(err){setMessage((err as Error).message || 'Falha ao salvar escala.');}finally{setBusy(false);}
    }}>
    <label>Profissional <select required value={person} onChange={e=>{setPerson(e.target.value);setSource('');}}><option value="">Selecione</option>{staff.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
    <label>Operação <select value={source} onChange={e=>setSource(e.target.value)}><option value="">Novo horário</option>{professional && registros(professional).filter(r=>r.semanal && (isGlobalAdmin||r.unidade===userUnidadeId)).map(r=><option key={r.id} value={r.id}>Alterar somente uma data · {new Date(r.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long'})} {r.inicio}–{r.fim}</option>)}</select></label>
    <label>Unidade <select required value={unit} onChange={e=>setUnit(e.target.value)}><option value="">Selecione</option>{unidadesVisiveis.filter(u=>isGlobalAdmin||u.id===userUnidadeId).map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}</select></label>
    <label>Sala <select key={unit} name="sala"><option value="">Sem sala definida</option>{salasVisiveis.filter(s=>s.unidadeId===unit && s.ativo).map(s=><option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
    <label>Data <input required type="date" name="data" defaultValue={date}/></label>
    {!source && <label><input type="checkbox" name="repetir"/> Repetir semanalmente</label>}
    <label>Início <input required name="inicio" type="time"/></label><label>Fim <input required name="fim" type="time"/></label>
    <Button disabled={busy}>Salvar escala informativa</Button><span role="status">{message}</span></form></details>;
}

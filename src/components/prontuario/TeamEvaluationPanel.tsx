import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, RefreshCw, Users, CheckCircle2, Clock3, ArrowRight, FileText, Search, Send, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { canUseTeamEvaluation, pendingTeamMembers, validateTeamRequest, type TeamRequest, type TeamMember } from '@/lib/teamEvaluation';
import { listTeamRequests, createTeamRequest, replyTeamRequest, finishTeamRequest } from '@/services/teamEvaluationService';

type Props = { patientId?: string; patientName?: string; onHistory?: () => void };
type Candidate = { id: string; nome: string; profissao: string; cargo: string; unidade_id: string };
type Source = { id: string; unidade_id: string; profissional_nome: string; data_atendimento: string; queixa_principal: string; anamnese: string; soap_avaliacao: string; conduta: string };

export default function TeamEvaluationPanel({ patientId, patientName, onHistory }: Props) {
 const { user } = useAuth();
 const cache = useQueryClient();
 const allowed = canUseTeamEvaluation(user);
 const [selectedId, setSelectedId] = useState('');
 const [creating, setCreating] = useState(false);
 const [saving, setSaving] = useState(false);
 const [requestId, setRequestId] = useState('');
 const [reason, setReason] = useState('');
 const [priority, setPriority] = useState('rotina');
 const [sourceId, setSourceId] = useState('');
 const [members, setMembers] = useState<TeamMember[]>([]);
 const [evaluation, setEvaluation] = useState('');
 const [recommendations, setRecommendations] = useState('');
 const [plan, setPlan] = useState('');
 const [search, setSearch] = useState('');
 const scope = `${user?.id || ''}:${patientId || ''}`;
 useEffect(() => { setSelectedId(''); setCreating(false); setEvaluation(''); setRecommendations(''); setPlan(''); }, [scope]);
 const requests = useQuery({ queryKey: ['team-evaluation', user?.id, patientId || 'queue'], queryFn: () => listTeamRequests(patientId), enabled: allowed, staleTime: 30000 });
 const sources = useQuery({ queryKey: ['team-evaluation-sources', user?.id, patientId], enabled: allowed && creating && !!patientId, queryFn: async (): Promise<Source[]> => {
  let q = supabase.from('prontuarios').select('id,unidade_id,profissional_nome,data_atendimento,queixa_principal,anamnese,soap_avaliacao,conduta').eq('paciente_id',patientId).eq('status','finalizado').order('data_atendimento',{ascending:false}).limit(30);
  if(user?.usuario !== 'admin.sms') q=q.eq('unidade_id',user?.unidadeId || '');
  const {data,error}=await q; if(error) throw error; return data || [];
 }});
 const source = sources.data?.find(s => s.id === sourceId);
 const candidates = useQuery({queryKey:['team-evaluation-candidates',user?.id,source?.unidade_id],enabled: allowed && creating && !!source,queryFn:async ():Promise<Candidate[]>=>{
  const {data,error}=await supabase.from('funcionarios').select('id,nome,profissao,cargo,unidade_id').eq('ativo',true).in('role',['master','profissional','enfermagem']).eq('unidade_id',source?.unidade_id).order('nome').limit(300);
  if(error)throw error; return data || [];
 }});
 const selected = requests.data?.find(r=>r.id===selectedId);
 const pending = selected ? pendingTeamMembers(selected) : [];
 const ownPending = pending.some(m=>m.id===user?.id);
 const busy = saving;
 async function save(work:()=>Promise<TeamRequest>) {
  if(saving)return;
  setSaving(true);
  try { await work(); toast.success('Registro confirmado.'); setCreating(false); setSelectedId(''); setEvaluation(''); setRecommendations(''); setPlan(''); await cache.invalidateQueries({queryKey:['team-evaluation']}); await cache.invalidateQueries({queryKey:['prontuarios']}); }
  catch { toast.error('Não foi possível confirmar o registro. Atualize a lista para conferir a situação antes de tentar novamente.'); }
  finally { setSaving(false); }
 }
 function openCreate() { setRequestId(crypto.randomUUID()); setReason(''); setSourceId(''); setMembers([]); setPriority('rotina'); setSearch(''); setCreating(true); }
 if(!allowed)return <p className="p-4 text-sm text-muted-foreground">Disponível para profissionais e Master ativos.</p>;
 return <section className="space-y-4 p-3" aria-label="Avaliação em equipe">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users className="h-4 w-4"/></span><div><h3 className="text-sm font-semibold">Avaliação em equipe</h3><p className="text-xs text-muted-foreground">Pareceres conectados ao cuidado</p></div></div>
   <div className="flex gap-1"><Button type="button" size="icon" variant="ghost" title="Atualizar solicitações" onClick={()=>void requests.refetch()}><RefreshCw className="h-4 w-4"/></Button>{patientId && <Button type="button" size="sm" className="rounded-lg shadow-sm" onClick={openCreate}><Plus className="mr-1.5 h-3.5 w-3.5"/>Solicitar</Button>}</div>
  </div>
  {requests.isPending && <Loader2 className="h-4 w-4 animate-spin"/>}
  {requests.isError && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">Não foi possível carregar as solicitações. Tente atualizar a lista.</p>}
  {requests.data?.length===0 && <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-7 text-center"><Users className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60"/><p className="text-sm font-medium">Nenhuma solicitação registrada.</p><p className="mt-1 text-xs text-muted-foreground">Organize a participação dos profissionais neste cuidado.</p></div>}
  {!patientId && <p className="text-xs text-muted-foreground">Solicite uma avaliação a partir do prontuário do paciente. Até 100 solicitações mais recentes desta unidade.</p>}
  {requests.data?.map(r=>{const remaining=pendingTeamMembers(r);const completed=r.members.length-remaining.length;return <button type="button" key={r.id} onClick={()=>{setSelectedId(r.id);setEvaluation('');setRecommendations('');setPlan('');}} className="group block w-full rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
   <div className="flex items-start justify-between gap-3"><span className="min-w-0 break-words text-sm font-semibold leading-relaxed">{patientId ? r.reason : r.patient_name}</span><Badge variant={r.status==='concluida'?'secondary':'outline'} className="shrink-0 rounded-md">{r.status==='concluida'?'Concluída':`${completed}/${r.members.length}`}</Badge></div>
   <p className="mt-2 text-xs text-muted-foreground">{r.requested_name} · {new Date(r.created_at).toLocaleDateString('pt-BR')}</p>
   <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${r.members.length ? completed/r.members.length*100 : 0}%`}}/></div>
   <div className="mt-2 flex items-center justify-between gap-2 text-xs"><span className={remaining.some(m=>m.id===user?.id)?'font-medium text-primary':'text-muted-foreground'}>{remaining.some(m=>m.id===user?.id)?'Seu parecer está pendente':r.status==='concluida'?'Plano de cuidado registrado':`${remaining.length} parecer(es) pendente(s)`}</span><ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary"/></div>
  </button>})}

  <Dialog open={creating} onOpenChange={open=>{if(!busy)setCreating(open);}}>
   <DialogContent className="flex max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-5xl sm:p-0">
    <DialogHeader className="shrink-0 border-b bg-primary/[0.04] px-5 py-5 pr-12 text-left sm:px-7 sm:pr-14">
     <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary"><Users className="h-3.5 w-3.5"/>Prontuário · avaliação em equipe</div>
     <DialogTitle className="break-words text-xl leading-snug sm:text-2xl">Nova solicitação — {patientName || 'Paciente'}</DialogTitle>
     <p className="pt-1 text-sm text-muted-foreground">Compartilhe o contexto clínico e direcione o parecer de cada profissional.</p>
    </DialogHeader>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
     <div className="grid lg:grid-cols-[1.05fr_1fr]">
      <div className="space-y-6 p-5 sm:p-7">
       <section className="space-y-4" aria-label="Contexto da solicitação">
        <div className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">01</span><div><h4 className="text-sm font-semibold">Contexto clínico</h4><p className="text-xs text-muted-foreground">Escolha a avaliação que fundamenta o pedido.</p></div></div>
        <div className="space-y-2"><Label htmlFor="team-source" className="text-xs font-medium">Avaliação inicial salva *</Label><select id="team-source" className="h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" value={sourceId} onChange={e=>{setSourceId(e.target.value);setMembers([]);}}><option value="">Selecione um registro finalizado</option>{sources.data?.map(s=><option key={s.id} value={s.id}>{s.data_atendimento} · {s.profissional_nome}</option>)}</select></div>
        {sources.isError&&<p role="alert" className="text-sm text-destructive">Falha ao carregar o histórico.</p>}
        {sources.data?.length===0&&<p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">Finalize a avaliação inicial para vinculá-la à solicitação.</p>}
        {source && <details className="group rounded-xl border bg-muted/20 text-sm"><summary className="cursor-pointer px-4 py-3 font-medium text-primary">Conferir avaliação inicial</summary><div className="border-t px-4 py-3"><p className="whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">{[source.queixa_principal,source.anamnese,source.soap_avaliacao,source.conduta].filter(Boolean).join('\n\n')}</p><Button type="button" variant="outline" size="sm" className="mt-3 rounded-lg" onClick={()=>setReason([source.queixa_principal,source.soap_avaliacao].filter(Boolean).join('\n').slice(0,6000))}><FileText className="mr-2 h-3.5 w-3.5"/>Usar como ponto de partida</Button></div></details>}
       </section>
       <section className="space-y-4 border-t pt-5" aria-label="Motivo e prioridade">
        <div className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">02</span><div><h4 className="text-sm font-semibold">Objetivo da avaliação</h4><p className="text-xs text-muted-foreground">O que a equipe precisa compreender?</p></div></div>
        <div className="space-y-2"><Label htmlFor="team-reason" className="text-xs font-medium">Motivo geral *</Label><Textarea id="team-reason" className="min-h-[112px] rounded-lg bg-background text-sm leading-relaxed" value={reason} maxLength={6000} onChange={e=>setReason(e.target.value)} placeholder="O que motivou a solicitação à equipe?"/><p className="text-right text-[11px] tabular-nums text-muted-foreground">{reason.length}/6.000</p></div>
        <div className="space-y-2"><Label htmlFor="team-priority" className="text-xs font-medium">Prioridade</Label><select id="team-priority" value={priority} onChange={e=>setPriority(e.target.value)} className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="rotina">Rotina</option><option value="prioritaria">Prioritária</option></select></div>
       </section>
      </div>
      <div className="space-y-5 border-t bg-muted/20 p-5 sm:p-7 lg:border-l lg:border-t-0">
       <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">03</span><div><h4 className="text-sm font-semibold">Equipe solicitada</h4><p className="text-xs text-muted-foreground">Selecione quem participará do cuidado.</p></div></div><Badge variant="secondary" className="shrink-0 rounded-md tabular-nums">{members.length}</Badge></div>
       <div className="space-y-2"><Label htmlFor="team-search" className="text-xs font-medium">Profissionais da unidade</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"/><Input id="team-search" className="h-11 rounded-lg bg-background pl-9" placeholder="Buscar nome ou profissão" value={search} onChange={e=>setSearch(e.target.value)}/></div></div>
       {candidates.isError&&<p role="alert" className="text-sm text-destructive">Falha ao carregar os profissionais.</p>}
       {!source && <div className="rounded-xl border border-dashed bg-background/60 p-5 text-center"><Users className="mx-auto mb-2 h-5 w-5 text-muted-foreground"/><p className="text-xs leading-relaxed text-muted-foreground">Selecione a avaliação inicial para visualizar a equipe da unidade.</p></div>}
       <div className="max-h-56 space-y-2 overflow-y-auto overscroll-contain pr-1">{candidates.data?.filter(c=>`${c.nome} ${c.profissao} ${c.cargo}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map(c=>{const checked=members.some(m=>m.id===c.id);return <label key={c.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${checked?'border-primary/50 bg-primary/[0.06]':'border-border bg-background hover:border-primary/30'}`}><input type="checkbox" aria-label={`${c.nome} · ${c.profissao||c.cargo||'Profissional'}`} className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" checked={checked} onChange={e=>setMembers(previous=>e.target.checked?[...previous,{id:c.id,name:c.nome,specialty:c.profissao||c.cargo,reason:''}]:previous.filter(m=>m.id!==c.id))}/><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary" aria-hidden="true">{c.nome.trim().charAt(0)}</span><span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{c.nome}</span><span className="block text-xs text-muted-foreground">{c.profissao||c.cargo||'Profissional'}</span></span></label>})}</div>
       {members.length>0 && <div className="space-y-3 border-t pt-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Defina o objetivo de cada parecer</p>{members.map(m=><div key={m.id} className="space-y-2 rounded-xl border bg-background p-3"><Label htmlFor={`team-member-${m.id}`} className="block text-xs leading-relaxed">{m.name} — motivo específico *</Label><p className="text-[11px] text-primary">{m.specialty}</p><Textarea id={`team-member-${m.id}`} className="min-h-[76px] rounded-lg text-sm" placeholder="Descreva o que este profissional deve avaliar…" maxLength={3000} value={m.reason} onChange={e=>setMembers(previous=>previous.map(item=>item.id===m.id?{...item,reason:e.target.value}:item))}/></div>)}</div>}
      </div>
     </div>
    </div>
    <div className="flex shrink-0 flex-col gap-3 border-t bg-background px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7"><p className="flex items-center gap-2 text-xs text-muted-foreground"><ClipboardList className="h-4 w-4 shrink-0 text-primary"/>{members.length} profissional(is) selecionado(s)</p><Button type="button" className="h-11 rounded-lg px-6 shadow-sm" disabled={busy||!source} onClick={()=>{const problem=validateTeamRequest(reason,members);if(problem){toast.error(problem);return;} void save(()=>createTeamRequest({id:requestId,source_id:sourceId,reason,priority,members}));}}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Send className="mr-2 h-4 w-4"/>}Enviar solicitação</Button></div>
   </DialogContent>
  </Dialog>

  <Dialog open={!!selected} onOpenChange={open=>{if(!open&&!busy)setSelectedId('');}}>
   <DialogContent className="flex max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-5xl sm:p-0">
    <DialogHeader className="shrink-0 border-b bg-primary/[0.04] px-5 py-5 pr-12 text-left sm:px-7 sm:pr-14"><div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary"><Users className="h-3.5 w-3.5"/>Acompanhamento multiprofissional</div><DialogTitle className="break-words text-xl leading-snug sm:text-2xl">Avaliação em equipe — {selected?.patient_name}</DialogTitle></DialogHeader>
    {selected&&<>
     <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-5 py-3 sm:px-7"><div className="flex flex-wrap gap-2"><Badge variant={selected.status==='concluida'?'secondary':'outline'} className="rounded-md">{selected.status==='concluida'?'Concluída':'Em andamento'}</Badge><Badge variant="outline" className="rounded-md">{selected.priority==='prioritaria'?'Prioritária':'Rotina'}</Badge></div><Button type="button" size="sm" variant="ghost" className="h-8 text-xs" disabled={busy || requests.isFetching} onClick={()=>void requests.refetch()}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${requests.isFetching?'animate-spin':''}`}/>Atualizar situação</Button></div>
     <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain"><div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="space-y-5 border-b bg-muted/20 p-5 sm:p-7 lg:border-b-0 lg:border-r">
       <div className="rounded-xl border bg-background p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">Pareceres concluídos</span><Users className="h-4 w-4 text-primary"/></div><p className="mt-2 text-3xl font-semibold tracking-tight">{selected.members.length-pending.length}<span className="ml-1 text-base font-normal text-muted-foreground">de {selected.members.length}</span></p><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${selected.members.length?(selected.members.length-pending.length)/selected.members.length*100:0}%`}}/></div><p className="mt-2 text-xs text-muted-foreground">{pending.length?`${pending.length} parecer(es) aguardando resposta`:'Todos os pareceres registrados'}</p></div>
       <div className="space-y-2"><h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><ClipboardList className="h-3.5 w-3.5"/>Motivo da solicitação</h4><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{selected.reason}</p><p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">Solicitante: <span className="font-medium text-foreground">{selected.requested_name}</span><br/>{new Date(selected.created_at).toLocaleDateString('pt-BR')}</p></div>
       <details className="rounded-xl border bg-background"><summary className="cursor-pointer px-4 py-3 text-xs font-medium text-primary">Avaliação inicial e contexto</summary><div className="space-y-3 border-t p-4">{Object.entries(selected.source_snapshot).filter(([,v])=>v).map(([k,v])=><div key={k}><p className="text-[11px] font-semibold capitalize text-muted-foreground">{k}</p><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed">{String(v)}</p></div>)}{onHistory&&<Button type="button" size="sm" variant="outline" className="h-auto w-full whitespace-normal py-2 text-xs" onClick={()=>{setSelectedId('');onHistory();}}>Ver histórico do paciente</Button>}</div></details>
      </div>
      <div className="space-y-5 p-5 sm:p-7">
       <div><h4 className="text-base font-semibold">Participação da equipe</h4><p className="mt-1 text-xs text-muted-foreground">Acompanhe o pedido e a resposta de cada profissional.</p></div>
       <div className="space-y-3">{selected.members.map(m=>{const opinion=selected.opinions.find(o=>o.professional_id===m.id);return <div key={m.id} className={`overflow-hidden rounded-xl border ${opinion?'border-primary/25':'border-border'}`}><div className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 ${opinion?'bg-primary/[0.04]':'bg-muted/30'}`}><div className="flex min-w-0 items-center gap-2.5"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${opinion?'bg-primary/10 text-primary':'bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}>{opinion?<CheckCircle2 className="h-4 w-4"/>:<Clock3 className="h-4 w-4"/>}</span><div className="min-w-0"><p className="break-words text-sm font-semibold">{m.name}</p><p className="text-xs text-muted-foreground">{m.specialty}</p></div></div><Badge variant="outline" className="rounded-md text-[11px]">{opinion?'Parecer registrado':'Aguardando parecer'}</Badge></div><div className="space-y-3 p-4"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Objetivo solicitado</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{m.reason}</p></div>{opinion&&<><div className="border-t pt-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Avaliação clínica</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{opinion.evaluation}</p></div>{opinion.recommendations&&<div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recomendações</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{opinion.recommendations}</p></div>}<p className="text-[11px] text-muted-foreground">Registrado em {new Date(opinion.created_at).toLocaleString('pt-BR')}</p></>}</div></div>})}</div>
       {selected.status==='aberta'&&ownPending&&<div className="overflow-hidden rounded-xl border border-primary/30"><div className="border-b bg-primary/[0.05] px-4 py-3"><h4 className="flex items-center gap-2 text-sm font-semibold text-primary"><FileText className="h-4 w-4"/>Registrar meu parecer</h4><p className="mt-1 text-xs text-muted-foreground">Sua contribuição para o plano de cuidado.</p></div><div className="space-y-4 p-4"><div className="space-y-2"><Label htmlFor="team-evaluation" className="text-xs">Minha avaliação *</Label><Textarea id="team-evaluation" className="min-h-[120px] rounded-lg text-sm leading-relaxed" maxLength={12000} value={evaluation} onChange={e=>setEvaluation(e.target.value)}/></div><div className="space-y-2"><Label htmlFor="team-recommendations" className="text-xs">Recomendações</Label><Textarea id="team-recommendations" className="min-h-[84px] rounded-lg text-sm leading-relaxed" maxLength={12000} value={recommendations} onChange={e=>setRecommendations(e.target.value)}/></div><div className="flex justify-end"><Button type="button" className="h-10 w-full rounded-lg sm:w-auto" disabled={busy||!evaluation.trim()} onClick={()=>void save(()=>replyTeamRequest(selected,evaluation,recommendations))}>{busy&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Registrar meu parecer</Button></div></div></div>}
       {selected.status==='aberta'&&pending.length===0&&<div className="overflow-hidden rounded-xl border border-primary/30"><div className="border-b bg-primary/[0.05] px-4 py-3"><h4 className="flex items-center gap-2 text-sm font-semibold text-primary"><CheckCircle2 className="h-4 w-4"/>Conclusão e continuidade do cuidado</h4></div><div className="space-y-3 p-4"><Label htmlFor="team-plan" className="text-xs">Plano de cuidado e próximos passos *</Label><Textarea id="team-plan" className="min-h-[120px] rounded-lg text-sm leading-relaxed" value={plan} maxLength={12000} onChange={e=>setPlan(e.target.value)}/><p className="text-xs leading-relaxed text-muted-foreground">Descreva o acompanhamento e os encaminhamentos. A conclusão não cria consultas automaticamente.</p><Button type="button" className="h-10 w-full rounded-lg sm:w-auto" disabled={busy||!plan.trim()} onClick={()=>void save(()=>finishTeamRequest(selected,plan))}>{busy&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Concluir avaliação em equipe</Button></div></div>}
       {selected.status==='concluida'&&<div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4"><h4 className="flex items-center gap-2 text-sm font-semibold text-primary"><CheckCircle2 className="h-4 w-4"/>Plano de cuidado</h4><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{selected.care_plan}</p></div>}
      </div>
     </div></div>
    </>}
   </DialogContent>
  </Dialog>
 </section>;
}

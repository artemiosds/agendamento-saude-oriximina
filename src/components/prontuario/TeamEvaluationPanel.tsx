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
import { Loader2, Plus, RefreshCw, Users, CheckCircle2, Clock3 } from 'lucide-react';
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
 return <section className="space-y-3 p-3" aria-label="Avaliação em equipe">
  <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-primary"/>Avaliação em equipe</h3><div className="flex gap-1"><Button type="button" size="icon" variant="ghost" title="Atualizar solicitações" onClick={()=>void requests.refetch()}><RefreshCw className="h-4 w-4"/></Button>{patientId && <Button type="button" size="sm" onClick={openCreate}><Plus className="mr-1 h-3 w-3"/>Solicitar</Button>}</div></div>
  {requests.isPending && <Loader2 className="h-4 w-4 animate-spin"/>}
  {requests.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar as solicitações. Tente atualizar a lista.</p>}
  {requests.data?.length===0 && <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Nenhuma solicitação registrada.</p>}
  {!patientId && <p className="text-xs text-muted-foreground">Solicite uma avaliação a partir do prontuário do paciente. Até 100 solicitações mais recentes desta unidade.</p>}
  {requests.data?.map(r=>{const remaining=pendingTeamMembers(r);return <button type="button" key={r.id} onClick={()=>{setSelectedId(r.id);setEvaluation('');setRecommendations('');setPlan('');}} className="block w-full rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent/40">
   <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{patientId ? r.reason : r.patient_name}</span><Badge variant={r.status==='concluida'?'secondary':'outline'}>{r.status==='concluida'?'Concluída':`${r.members.length-remaining.length}/${r.members.length}`}</Badge></div>
   <p className="mt-1 text-xs text-muted-foreground">{r.requested_name} · {new Date(r.created_at).toLocaleDateString('pt-BR')}</p>
   {remaining.some(m=>m.id===user?.id)&&<p className="mt-2 text-xs font-semibold text-primary">Seu parecer está pendente</p>}
  </button>})}
  <Dialog open={creating} onOpenChange={open=>{if(!busy)setCreating(open);}}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Nova solicitação — {patientName || 'Paciente'}</DialogTitle></DialogHeader>
   <Label htmlFor="team-source">Avaliação inicial salva *</Label><select id="team-source" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={sourceId} onChange={e=>{setSourceId(e.target.value);setMembers([]);}}><option value="">Selecione um registro finalizado</option>{sources.data?.map(s=><option key={s.id} value={s.id}>{s.data_atendimento} · {s.profissional_nome}</option>)}</select>
   {sources.isError&&<p role="alert">Falha ao carregar o histórico.</p>}
   {sources.data?.length===0&&<p className="text-sm text-muted-foreground">Finalize a avaliação inicial para vinculá-la à solicitação.</p>}
   {source && <details className="rounded-lg border p-3 text-sm"><summary>Conferir avaliação inicial</summary><p className="mt-2 whitespace-pre-wrap">{[source.queixa_principal,source.anamnese,source.soap_avaliacao,source.conduta].filter(Boolean).join('\n\n')}</p><Button type="button" variant="outline" size="sm" className="mt-2" onClick={()=>setReason([source.queixa_principal,source.soap_avaliacao].filter(Boolean).join('\n').slice(0,6000))}>Usar como ponto de partida</Button></details>}
   <Label htmlFor="team-reason">Motivo geral *</Label><Textarea id="team-reason" value={reason} maxLength={6000} onChange={e=>setReason(e.target.value)} placeholder="O que motivou a solicitação à equipe?"/>
   <Label htmlFor="team-priority">Prioridade</Label><select id="team-priority" value={priority} onChange={e=>setPriority(e.target.value)} className="h-10 rounded-md border bg-background px-2"><option value="rotina">Rotina</option><option value="prioritaria">Prioritária</option></select>
   <Label htmlFor="team-search">Profissionais da unidade</Label><Input id="team-search" placeholder="Buscar nome ou profissão" value={search} onChange={e=>setSearch(e.target.value)}/>
   {candidates.isError&&<p role="alert">Falha ao carregar os profissionais.</p>}
   <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-2">{candidates.data?.filter(c=>`${c.nome} ${c.profissao} ${c.cargo}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map(c=><label key={c.id} className="flex items-center gap-2 p-1 text-sm"><input type="checkbox" checked={members.some(m=>m.id===c.id)} onChange={e=>setMembers(previous=>e.target.checked?[...previous,{id:c.id,name:c.nome,specialty:c.profissao||c.cargo,reason:''}]:previous.filter(m=>m.id!==c.id))}/>{c.nome} · {c.profissao||c.cargo||'Profissional'}</label>)}</div>
   {members.map(m=><div key={m.id}><Label htmlFor={`team-member-${m.id}`}>{m.name} — motivo específico *</Label><Textarea id={`team-member-${m.id}`} maxLength={3000} value={m.reason} onChange={e=>setMembers(previous=>previous.map(item=>item.id===m.id?{...item,reason:e.target.value}:item))}/></div>)}
   <Button type="button" disabled={busy||!source} onClick={()=>{const problem=validateTeamRequest(reason,members);if(problem){toast.error(problem);return;} void save(()=>createTeamRequest({id:requestId,source_id:sourceId,reason,priority,members}));}}>{busy&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Enviar solicitação</Button>
  </DialogContent></Dialog>
  <Dialog open={!!selected} onOpenChange={open=>{if(!open&&!busy)setSelectedId('');}}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Avaliação em equipe — {selected?.patient_name}</DialogTitle></DialogHeader>
   {selected&&<><Button type="button" size="sm" variant="outline" disabled={busy || requests.isFetching} onClick={()=>void requests.refetch()}>Atualizar situação</Button><p className="whitespace-pre-wrap text-sm">{selected.reason}</p><p className="text-xs text-muted-foreground">Solicitante: {selected.requested_name} · {selected.priority==='prioritaria'?'Prioritária':'Rotina'}</p>
    <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Avaliação inicial e contexto</summary>{Object.entries(selected.source_snapshot).filter(([,v])=>v).map(([k,v])=><p key={k} className="mt-2 whitespace-pre-wrap text-sm"><strong>{k}: </strong>{String(v)}</p>)}{onHistory&&<Button type="button" size="sm" variant="outline" onClick={()=>{setSelectedId('');onHistory();}}>Ver histórico do paciente</Button>}</details>
    {selected.members.map(m=>{const opinion=selected.opinions.find(o=>o.professional_id===m.id);return <div key={m.id} className="rounded-lg border p-3"><div className="flex items-center gap-2 text-sm font-semibold">{opinion?<CheckCircle2 className="h-4 w-4 text-emerald-600"/>:<Clock3 className="h-4 w-4 text-amber-600"/>}{m.name} · {m.specialty}</div><p className="mt-1 text-xs text-muted-foreground">Solicitado: {m.reason}</p>{opinion?<div className="mt-2 whitespace-pre-wrap text-sm"><p>{opinion.evaluation}</p><p className="mt-1">{opinion.recommendations}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(opinion.created_at).toLocaleString('pt-BR')}</p></div>:<Badge variant="outline" className="mt-2">Aguardando parecer</Badge>}</div>})}
    {selected.status==='aberta'&&ownPending&&<div className="space-y-2 rounded-xl border border-primary/30 p-3"><Label htmlFor="team-evaluation">Minha avaliação *</Label><Textarea id="team-evaluation" maxLength={12000} value={evaluation} onChange={e=>setEvaluation(e.target.value)}/><Label htmlFor="team-recommendations">Recomendações</Label><Textarea id="team-recommendations" maxLength={12000} value={recommendations} onChange={e=>setRecommendations(e.target.value)}/><Button type="button" disabled={busy||!evaluation.trim()} onClick={()=>void save(()=>replyTeamRequest(selected,evaluation,recommendations))}>Registrar meu parecer</Button></div>}
    {selected.status==='aberta'&&pending.length===0&&<div className="space-y-2 rounded-xl border p-3"><Label htmlFor="team-plan">Plano de cuidado e próximos passos *</Label><Textarea id="team-plan" value={plan} maxLength={12000} onChange={e=>setPlan(e.target.value)}/><p className="text-xs text-muted-foreground">Descreva o acompanhamento e os encaminhamentos. A conclusão não cria consultas automaticamente.</p><Button type="button" disabled={busy||!plan.trim()} onClick={()=>void save(()=>finishTeamRequest(selected,plan))}>Concluir avaliação em equipe</Button></div>}
    {selected.status==='concluida'&&<div className="rounded-xl bg-primary/5 p-3"><h4 className="text-sm font-semibold">Plano de cuidado</h4><p className="mt-2 whitespace-pre-wrap text-sm">{selected.care_plan}</p></div>}
   </>}
  </DialogContent></Dialog>
 </section>;
}

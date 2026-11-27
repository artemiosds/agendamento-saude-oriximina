import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Ban, KeyRound, UserPlus, Unlock, ShieldCheck, RefreshCw, History, Loader2 } from 'lucide-react';
import { maskPortalCpf, maskPortalEmail } from '@/lib/portalAccessDirectory';
import { portalAssistanceRoute } from '@/lib/portalAssistance';
import PortalAssistedAccess from './PortalAssistedAccess';

export interface PortalPatientRow { id: string; nome: string; cpf: string | null; email: string | null; auth_user_id: string | null; unidade_id: string | null }
type Diagnosis = { state: 'unlinked' | 'verified' | 'divergent' | 'unknown'; emailValid: boolean; emailConfirmed: boolean | null; lastSignIn: string | null };
type Entry = { id: string; action: string; time: string; actor: string; status: string };
type Detail = { patient: PortalPatientRow; diagnosis: Diagnosis; history: {entries: Entry[]; hasMore: boolean} | null };
const labels: Record<string,string> = {portal_criar_acesso:'Acesso criado', portal_redefinir_senha:'Redefinição de senha', portal_bloquear:'Bloqueio', portal_desbloquear:'Desbloqueio', portal_convite_primeiro_acesso:'Solicitação de primeiro acesso'};
const nullableString = (v: unknown): v is string | null => v === null || typeof v === 'string';
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function parseDetail(data: unknown, patientId: string, unitId?: string): Detail | null {
  if (!obj(data) || data.success !== true || !obj(data.patient) || !obj(data.diagnosis)) return null;
  const p = data.patient, d = data.diagnosis;
  if (p.id !== patientId || typeof p.nome !== 'string' || !nullableString(p.cpf) || !nullableString(p.email) ||
      !nullableString(p.auth_user_id) || !nullableString(p.unidade_id) || (unitId && p.unidade_id !== unitId)) return null;
  if (!['unlinked','verified','divergent','unknown'].includes(String(d.state)) || typeof d.emailValid !== 'boolean' ||
      !(d.emailConfirmed === null || typeof d.emailConfirmed === 'boolean') || !nullableString(d.lastSignIn) ||
      ((d.state === 'unlinked') !== !p.auth_user_id) || (d.state !== 'verified' && (d.lastSignIn !== null || d.emailConfirmed !== null))) return null;
  let history: Detail['history'] = null;
  const h = data.history;
  if (obj(h) && typeof h.hasMore === 'boolean' && Array.isArray(h.entries) && h.entries.length <= 20 &&
      h.entries.every(e => obj(e) && typeof e.id === 'string' && typeof e.action === 'string' && Object.hasOwnProperty.call(labels,e.action) &&
        typeof e.actor === 'string' && typeof e.time === 'string' && typeof e.status === 'string')) {
    history = { entries: h.entries as Entry[], hasMore: h.hasMore };
  }
  return { patient: p as unknown as PortalPatientRow, diagnosis: d as unknown as Diagnosis, history };
}
const timeLabel = (v: string | null) => v && Number.isFinite(Date.parse(v)) ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Santarem'}).format(new Date(v)) : 'Não registrado';

interface Props {
  patient: PortalPatientRow; unitId?: string; blockedIds: string[]; settingsReady: boolean; enabled?: boolean; busy: boolean;
  onClose: () => void; onCredential: (p: PortalPatientRow, action: 'create_access' | 'reset_password') => void; onBlock: (p: PortalPatientRow) => void;
}
export default function PortalPatientDetail({ patient, unitId, blockedIds, settingsReady, enabled, busy, onClose, onCredential, onBlock }: Props) {
  const [refresh,setRefresh] = useState(0);
  const [result,setResult] = useState<{revision:number;detail:Detail | null} | null>(null);
  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const {data,error} = await supabase.functions.invoke('manage-patient-portal',{body:{action:'read_patient_detail',pacienteId:patient.id}});
        if (current) setResult({revision:refresh,detail:error ? null : parseDetail(data,patient.id,unitId)});
      } catch { if(current) setResult({revision:refresh,detail:null}); }
    })();
    return () => {current=false;};
  },[patient.id,unitId,refresh]);
  const loading = result?.revision !== refresh;
  const detail = loading ? null : result?.detail ?? null;
  const p = detail?.patient ?? patient;
  const d = detail?.diagnosis;
  const blocked = settingsReady && blockedIds.includes(p.id);
  const assistanceRoute = portalAssistanceRoute({settingsReady,enabled,blocked,diagnosis:d,cpf:p.cpf});
  const badge = !p.auth_user_id ? 'Sem acesso' : !settingsReady ? 'Bloqueio não confirmado' : blocked ? 'Bloqueado' : enabled === false ? 'Portal desativado' : 'Vínculo não bloqueado';
  return <Sheet open onOpenChange={open=>{if(!open)onClose();}}>
    <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-4 sm:p-6">
      <SheetHeader className="pr-7">
        <SheetTitle>Gestão individual de acesso</SheetTitle>
        <SheetDescription>Diagnóstico administrativo do portal. Não exibe dados clínicos nem credenciais.</SheetDescription>
      </SheetHeader>
      <div className="mt-5 space-y-4">
        <section className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary shrink-0"/><h3 className="font-semibold break-words">{p.nome}</h3></div>
          <Badge variant="outline">{badge}</Badge>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">CPF</dt><dd>{maskPortalCpf(p.cpf)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">E-mail</dt><dd>{maskPortalEmail(p.email)}</dd></div>
          </dl>
        </section>
        <section className="rounded-xl border p-4 space-y-3">
          <div className="flex justify-between items-center gap-2"><h3 className="font-semibold">Diagnóstico da conta</h3><Button size="sm" variant="outline" disabled={loading} onClick={()=>setRefresh(n=>n+1)}><RefreshCw className="h-4 w-4 mr-1"/>Atualizar</Button></div>
          {loading ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Conferindo a conta…</p> : !d ? <p role="alert" className="text-sm text-muted-foreground">Diagnóstico indisponível. Nenhuma condição da conta foi presumida. Confira a publicação da função ou tente novamente.</p> :
            <dl className="space-y-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">Titularidade e vínculo</dt><dd className="font-medium">{d.state==='verified'?'Vínculo exclusivo e e-mail correspondente':d.state==='divergent'?'Divergência de vínculo ou e-mail — requer conferência':d.state==='unlinked'?'Sem conta vinculada':'Não foi possível confirmar'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">E-mail cadastrado</dt><dd>{d.emailValid?'Formato válido':'Ausente ou inválido'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Confirmação no serviço de autenticação</dt><dd>{d.emailConfirmed===null?'Não confirmada':d.emailConfirmed?'Registrada (não comprova posse atual)':'Ainda não registrada'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Última autenticação registrada</dt><dd>{timeLabel(d.lastSignIn)}</dd><p className="text-xs text-muted-foreground">Não comprova utilização do portal ou sessão ativa.</p></div>
            </dl>}
        </section>
        <PortalAssistedAccess key={p.id+':'+assistanceRoute+':'+refresh} route={assistanceRoute} busy={busy}
          onCreate={()=>{if(detail && !p.auth_user_id && (assistanceRoute==='first'||assistanceRoute==='legacy')) onCredential(p,'create_access');}}/>
        <section className="rounded-xl border p-4 space-y-2">
          <h3 className="font-semibold">Gerenciamento</h3>
          <p className="text-xs text-muted-foreground">As ações reutilizam a confirmação, o motivo e a autorização já existentes.</p>
          {p.auth_user_id ? <>
            <Button className="w-full justify-start" variant="outline" disabled={busy || !detail || d?.state!=='verified'} onClick={()=>onCredential(p,'reset_password')}><KeyRound className="h-4 w-4 mr-2"/>Redefinir senha</Button>
            <Button className="w-full justify-start" variant="outline" disabled={busy || !detail || !settingsReady} onClick={()=>onBlock(p)}>{blocked?<Unlock className="h-4 w-4 mr-2"/>:<Ban className="h-4 w-4 mr-2"/>}{blocked?'Desbloquear':'Bloquear'} acesso</Button>
          </> : <Button className="w-full justify-start" variant="outline" disabled={busy || !detail || !d?.emailValid} onClick={()=>onCredential(p,'create_access')}><UserPlus className="h-4 w-4 mr-2"/>Criar acesso</Button>}
          {!p.email && <p className="text-xs text-muted-foreground">Oriente o paciente a atualizar o e-mail no cadastro da unidade. Não utilize endereços fictícios.</p>}
          {d?.state==='divergent' && <p className="text-xs text-destructive">Não redefina a senha até conferir a titularidade.</p>}
        </section>
        <section className="rounded-xl border p-4 space-y-3">
          <h3 className="flex items-center gap-2 font-semibold"><History className="h-4 w-4"/>Histórico administrativo</h3>
          <p className="text-xs text-muted-foreground">Até 20 eventos recentes de acesso. No Master local, somente eventos com unidade correspondente; registros antigos sem unidade não são exibidos. Não inclui dados clínicos, conteúdo livre ou senhas.</p>
          {loading ? <p className="text-sm text-muted-foreground">Consultando…</p> : !detail?.history ? <p role="status" className="text-sm text-muted-foreground">Histórico não confirmado.</p> : !detail.history.entries.length ? <p className="text-sm text-muted-foreground">Nenhum evento encontrado no recorte autorizado. Isso não comprova ausência de ações anteriores.</p> :
            <ol className="divide-y divide-border">{detail.history.entries.map(e=><li key={e.id} className="py-3 space-y-1"><div className="flex flex-wrap items-center justify-between gap-1"><strong className="text-sm">{labels[e.action]}</strong><Badge variant="outline">{e.status==='sucesso'?'Sucesso registrado':'Outro estado registrado'}</Badge></div><p className="text-xs text-muted-foreground break-words">{e.actor} · {timeLabel(e.time)}</p></li>)}</ol>}
          {detail?.history?.hasMore && <p className="text-xs text-muted-foreground">Existem mais eventos. Consulte a Auditoria para pesquisa ampliada, conforme suas permissões.</p>}
        </section>
      </div>
    </SheetContent>
  </Sheet>;
}

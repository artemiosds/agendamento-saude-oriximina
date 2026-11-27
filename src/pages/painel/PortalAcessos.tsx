import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOperacional } from '@/contexts/OperacionalContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import PortalPatientDetail from '@/components/portal/PortalPatientDetail';
import PortalPublicGuide from '@/components/portal/PortalPublicGuide';
import { PORTAL_PERMISSION_GROUPS } from '@/lib/portalPermissionView';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { KeyRound, Loader2, Search, ShieldCheck, Ban, UserPlus, Unlock, Eye, EyeOff, Wand2, UsersRound, Mail, CreditCard, RefreshCw, ChevronLeft, ChevronRight, AlertCircle, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { PORTAL_PERMISSOES_PADRAO, type PortalPermissoes } from '@/types';
import { PORTAL_FILTERS, PORTAL_PAGE_SIZES, isPortalId, portalSearchExpression, maskPortalCpf, maskPortalEmail, portalPageRange, portalLastPage, portalLinkRate, type PortalFilter, type PortalPageSize, type PortalCounts } from '@/lib/portalAccessDirectory';
import type { PortalChange } from '../../../supabase/functions/_shared/portal-admin-config';

interface Pac { id: string; nome: string; cpf: string | null; email: string | null; auth_user_id: string | null; unidade_id: string | null }
type Settings = { enabled: boolean; permissions: PortalPermissoes; blocked: string[]; canEditInstitutional: boolean };
type ConfigDialog = { change: PortalChange; label: string; patient?: Pac };
const EMPTY_BLOCKED: string[] = [];
const FILTER_LABELS: Record<PortalFilter, string> = { todos: 'Pacientes cadastrados', ativo: 'Vínculos não bloqueados', bloqueado: 'Bloqueados', sem: 'Sem acesso', semEmail: 'Sem e-mail informado', semCpf: 'Sem CPF informado' };
const FILTER_ICONS = { todos: UsersRound, ativo: ShieldCheck, bloqueado: Ban, sem: UserPlus, semEmail: Mail, semCpf: CreditCard };
const NUMBER_FORMAT = new Intl.NumberFormat('pt-BR');
function parseSettings(data: any): Settings | null {
  const v = data?.settings;
  if (data?.success !== true || typeof data.canEditInstitutional !== 'boolean' || typeof v?.enabled !== 'boolean' ||
      !Array.isArray(v?.blocked) || v.blocked.some((id: unknown) => !isPortalId(id)) ||
      !v.permissions || Object.keys(PORTAL_PERMISSOES_PADRAO).some(k => typeof v.permissions[k] !== 'boolean')) return null;
  return { enabled: v.enabled, permissions: v.permissions, blocked: v.blocked, canEditInstitutional: data.canEditInstitutional };
}
async function operationError(error: any, data: any, fallback: string) {
  if (typeof data?.error === 'string') return data.error;
  try {
    const body = await error?.context?.clone?.().json();
    if (typeof body?.error === 'string') return body.error;
  } catch { /* no reliable server response */ }
  return fallback;
}

const gerarSenha = () => {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = new Uint32Array(8); crypto.getRandomValues(arr);
  return Array.from(arr, n => c[n % c.length]).join('') + '1a';
};

const PortalAcessos: React.FC = () => {
  const { configuracoes, refreshConfiguracoes } = useOperacional();
  const { user } = useAuth();
  const [settings, setSettings] = useState<{ scope: string; value: Settings } | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState(false);
  const [configDlg, setConfigDlg] = useState<ConfigDialog | null>(null);
  const [configMotivo, setConfigMotivo] = useState('');
  const settingsSeq = useRef(0);
  const operation = useRef(false);

  const [selectedPatient, setSelectedPatient] = useState<{ scope: string; patient: Pac } | null>(null);
  const [guideOpen,setGuideOpen] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<PortalFilter>('todos');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PortalPageSize>(25);
  const [revision, setRevision] = useState(0);
  const [directory, setDirectory] = useState<{key: string; rows: Pac[]; count: number} | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{key: string; counts: PortalCounts} | null>(null);
  const [dlg, setDlg] = useState<{ pac: Pac; tipo: 'reset_password' | 'create_access' } | null>(null);
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const restrito = user?.usuario !== 'admin.sms';
  const scope = JSON.stringify([user?.id, user?.role, user?.unidadeId, restrito, user?.ativo]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const authorized = !!user && user.role === 'master' && user.ativo === true && (!restrito || !!user.unidadeId);
  const confirmed = settings?.scope === scope ? settings.value : null;
  const settingsReady = !!confirmed && !settingsError;
  const bloqueados = settingsReady ? confirmed!.blocked : EMPTY_BLOCKED;
  const perms = settingsReady ? confirmed!.permissions : null;
  const canEditRules = settingsReady && confirmed!.canEditInstitutional && !restrito;
  const blockedKey = [...new Set(bloqueados)].sort().join(',');
  const unitId = restrito ? user?.unidadeId : undefined;
  const summaryKey = JSON.stringify([scope, settingsReady, blockedKey, revision]);
  const directoryKey = JSON.stringify([summaryKey, filtro, busca, page, pageSize]);
  const visibleList = authorized && directory?.key === directoryKey ? directory.rows : [];
  const total = authorized && directory?.key === directoryKey ? directory.count : null;
  const listFailed = directoryError === directoryKey;
  const loading = authorized && total === null && !listFailed;
  const counts = authorized && summary?.key === summaryKey ? summary.counts : null;
  const linkRate = counts ? portalLinkRate(counts) : null;
  const changeFilter = (value: PortalFilter) => { setFiltro(value); setPage(1); };
  const configSignal = JSON.stringify(configuracoes.portalPaciente ?? {});

  const readSettings = useCallback(async () => {
    const seq = ++settingsSeq.current;
    if (!authorized) { setSettings(null); setSettingsLoading(false); setSettingsError(true); return false; }
    setSettingsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-patient-portal', { body: { action: 'read_settings' } });
      const parsed = !error ? parseSettings(data) : null;
      if (scopeRef.current !== scope || seq !== settingsSeq.current) return false;
      if (!parsed) { setSettingsError(true); return false; }
      setSettings({ scope, value: parsed }); setSettingsError(false); return true;
    } catch {
      if (scopeRef.current === scope && seq === settingsSeq.current) setSettingsError(true);
      return false;
    } finally {
      if (scopeRef.current === scope && seq === settingsSeq.current) setSettingsLoading(false);
    }
  }, [scope, authorized]);

  // Reuse the existing shared configuration realtime notification; no new polling/subscription.
  useEffect(() => { void readSettings(); return () => { settingsSeq.current++; }; }, [readSettings, configSignal]);
  useEffect(() => {
    if (!settingsReady && (filtro === 'ativo' || filtro === 'bloqueado')) { setFiltro('todos'); setPage(1); }
  }, [settingsReady, filtro]);

  const makeQuery = useCallback((filter: PortalFilter, term: string, head = false) => {
    // Keep existing authenticated client and RLS; never elevate the privileges of list reads.
    let q = supabase.from('pacientes').select('id,nome,cpf,email,auth_user_id,unidade_id', { count: 'exact', head });
    if (unitId) q = q.eq('unidade_id', unitId);
    const blocked = blockedKey ? blockedKey.split(',') : [];
    if (filter === 'ativo' || filter === 'bloqueado') q = q.not('auth_user_id', 'is', null);
    if (filter === 'sem') q = q.is('auth_user_id', null);
    if (filter === 'ativo' && blocked.length) q = q.not('id', 'in', '(' + blocked.join(',') + ')');
    if (filter === 'bloqueado') q = q.in('id', blocked.length ? blocked : ['00000000-0000-0000-0000-000000000000']);
    if (filter === 'semEmail') q = q.or('email.is.null,email.eq.""');
    if (filter === 'semCpf') q = q.or('cpf.is.null,cpf.eq.""');
    const expression = portalSearchExpression(term);
    if (expression) q = q.or(expression);
    else if (term.trim()) q = q.eq('id', '00000000-0000-0000-0000-000000000000');
    return q;
  }, [unitId, blockedKey]);

  useEffect(() => {
    if (!authorized) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if ((filtro === 'ativo' || filtro === 'bloqueado') && !settingsReady) return;
      try {
        const range = portalPageRange(page, pageSize);
        const { data, count, error } = await makeQuery(filtro, busca)
          .order('nome').order('id').range(range.from, range.to).abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        // PostgREST may return HTTP 416 for a page which became empty.
        // Move only when a count was actually supplied; otherwise show the read error.
        if (count !== null && page > portalLastPage(count, pageSize)) { setPage(portalLastPage(count, pageSize)); return; }
        if (error || !data || count === null) { setDirectoryError(directoryKey); return; }
        setDirectory({ key: directoryKey, rows: data, count });
        setDirectoryError(null);
      } catch { if (!controller.signal.aborted) setDirectoryError(directoryKey); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [authorized, directoryKey, filtro, busca, page, pageSize, settingsReady, makeQuery]);

  // Only scoped HEAD counts: no patient records transferred, no queries per row,
  // no refresh on search typing or page navigation.
  useEffect(() => {
    if (!authorized || settingsLoading) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const values = await Promise.all(PORTAL_FILTERS.map(async filter => {
        if (!settingsReady && (filter === 'ativo' || filter === 'bloqueado')) return [filter, null] as const;
        try {
          const { count, error } = await makeQuery(filter, '', true).abortSignal(controller.signal);
          return [filter, error || count === null ? null : count] as const;
        } catch { return [filter, null] as const; }
      }));
      if (!controller.signal.aborted) setSummary({ key: summaryKey, counts: Object.fromEntries(values) as PortalCounts });
    }, 100);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [authorized, summaryKey, settingsReady, settingsLoading, makeQuery]);

  useEffect(() => {
    setDlg(null); setSenha(''); setMotivo(''); setVerSenha(false);
    setConfigDlg(null); setConfigMotivo(''); setPage(1); setBusca(''); setFiltro('todos');
    setDirectory(null); setSummary(null); setDirectoryError(null); setSelectedPatient(null); setGuideOpen(false);
  }, [scope]);

  const closeConfig = () => { if (!operation.current) { setConfigDlg(null); setConfigMotivo(''); } };
  const openConfig = (change: PortalChange, label: string, patient?: Pac) => {
    if (!authorized || !settingsReady || settingsLoading || operation.current) return;
    if (change.kind !== 'block' && !canEditRules) return;
    if (change.kind === 'block' && (!patient || !patient.auth_user_id || (restrito && patient.unidade_id !== user?.unidadeId))) return;
    setConfigDlg({ change, label, patient }); setConfigMotivo('');
  };
  const toggleBloqueio = (p: Pac) => {
    const value = !bloqueados.includes(p.id);
    openConfig({ kind: 'block', patientId: p.id, value }, value ? 'Bloquear acesso' : 'Desbloquear acesso', p);
  };
  const confirmarConfig = async () => {
    if (!configDlg || !authorized || !settingsReady || settingsLoading || operation.current) return;
    const { change, patient } = configDlg;
    if (change.kind !== 'block' && !canEditRules) return;
    if (change.kind === 'block' && (!patient || (restrito && patient.unidade_id !== user?.unidadeId))) return;
    const reason = configMotivo.trim();
    if (reason.length < 3 || reason.length > 500) return toast.error('Informe um motivo entre 3 e 500 caracteres.');
    operation.current = true; setSalvando(true);
    const requestedScope = scope;
    try {
      const { data, error } = await supabase.functions.invoke('manage-patient-portal', {
        body: { action: 'update_settings', change, motivo: reason },
      });
      if (scopeRef.current !== requestedScope) return;
      if (error || data?.success !== true || data.value !== change.value || typeof data.changed !== 'boolean') {
        toast.error(await operationError(error, data, 'Não foi possível confirmar a alteração. Confira o estado atualizado antes de repetir.'));
      } else {
        toast.success(data.changed ? 'Alteração confirmada pelo servidor.' : 'A configuração já estava no estado solicitado.');
        if (data.changed && data.auditConfirmed !== true) toast.warning('Alteração confirmada, mas o registro de auditoria não foi confirmado.');
        setConfigDlg(null); setConfigMotivo('');
      }
    } catch {
      if (scopeRef.current === requestedScope) toast.error('Resposta não confirmada. Confira os dados antes de repetir.');
    } finally {
      if (scopeRef.current === requestedScope) {
        await readSettings();
        void refreshConfiguracoes().catch(() => {});
      }
      operation.current = false; setSalvando(false);
    }
  };

  const fechar = () => { setDlg(null); setSenha(''); setMotivo(''); setVerSenha(false); };
  const abrir = (pac: Pac, tipo: 'reset_password' | 'create_access') => {
    if (!authorized || !user || operation.current || (restrito && (!user.unidadeId || pac.unidade_id !== user.unidadeId))) return;
    setDlg({ pac, tipo }); setSenha(gerarSenha()); setMotivo(''); setVerSenha(false);
  };

  const confirmar = async () => {
    if (!dlg || operation.current || !authorized || !user || (restrito && (!user.unidadeId || dlg.pac.unidade_id !== user.unidadeId))) return;
    if (senha.length < 8 || senha.length > 100) return toast.error('A senha deve ter entre 8 e 100 caracteres.');
    if (motivo.trim().length < 3 || motivo.trim().length > 500) return toast.error('Informe um motivo entre 3 e 500 caracteres.');
    operation.current = true; setSalvando(true);
    const requestedScope = scope;
    try {
      const { data, error } = await supabase.functions.invoke('manage-patient-portal', {
        body: { action: dlg.tipo, pacienteId: dlg.pac.id, novaSenha: senha, motivo },
      });
      if (scopeRef.current !== requestedScope) return;
      if (error || data?.error || data?.success !== true || typeof data?.authUserId !== 'string') {
        toast.error(await operationError(error, data, 'Não foi possível confirmar a alteração.'));
        return;
      }
      toast.success(dlg.tipo === 'reset_password' ? 'Senha alterada. Entregue a senha ao paciente identificado.' : 'Acesso criado. Entregue as credenciais ao paciente identificado.');
      if (data.auditConfirmed !== true) toast.warning('Alteração realizada, mas o registro de auditoria não foi confirmado.');
      fechar();
    } catch {
      if (scopeRef.current === requestedScope) toast.error('Não foi possível confirmar a alteração. Confira o cadastro antes de repetir.');
    } finally { if (scopeRef.current === requestedScope) setRevision(n => n + 1); operation.current = false; setSalvando(false); }
  };

  const status = (p: Pac) => !p.auth_user_id ? 'sem' : !settingsReady ? 'incerto' : bloqueados.includes(p.id) ? 'bloqueado' : 'ativo';

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-primary/10 text-primary p-2.5 shrink-0"><ShieldCheck className="h-6 w-6" aria-hidden="true" /></div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Portal do Paciente · Gestão de acessos</p>
            <h1 className="text-xl sm:text-2xl font-bold font-display text-foreground">Acessos ao Portal do Paciente</h1>
            <p className="text-sm text-muted-foreground">Gerencie credenciais, bloqueios e permissões com segurança.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{restrito ? 'Minha unidade' : 'Rede municipal'}</Badge>
          <Badge variant="outline" className={settingsReady && confirmed?.enabled ? 'text-success' : 'text-muted-foreground'}>{!settingsReady ? 'Portal não confirmado' : confirmed?.enabled ? 'Portal habilitado' : 'Portal desativado'}</Badge>
          <Button size="sm" variant="outline" disabled={!authorized || salvando} onClick={()=>setGuideOpen(true)}>Guia do portal</Button>
          <Button size="sm" variant="outline" disabled={!authorized || salvando || settingsLoading} onClick={() => { setRevision(n => n + 1); void readSettings(); }}><RefreshCw className="h-4 w-4 mr-1" />Atualizar</Button>
        </div>
      </header>

      {(!settingsReady || settingsLoading) && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <span>{settingsLoading ? 'Conferindo regras e bloqueios do portal…' : 'Não foi possível confirmar as regras e bloqueios. As alterações de configuração estão suspensas até uma leitura válida.'}</span>
        {!settingsLoading && authorized && <Button size="sm" variant="outline" disabled={salvando} onClick={() => void readSettings()}>Tentar novamente</Button>}
      </div>}
      <Tabs defaultValue="pacientes">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="pacientes">Pacientes</TabsTrigger>
          <TabsTrigger value="regras">O que o paciente pode ver</TabsTrigger>
        </TabsList>

        <TabsContent value="pacientes" className="space-y-4">
          <section className="space-y-2" aria-label="Indicadores de acesso">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
              {PORTAL_FILTERS.map(key => {
                const Icon = FILTER_ICONS[key];
                const value = counts?.[key];
                return <button key={key} type="button" aria-pressed={filtro === key} disabled={!authorized || (!settingsReady && (key === 'ativo' || key === 'bloqueado'))}
                  onClick={() => changeFilter(key)}
                  className={'min-w-0 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ' + (filtro === key ? 'border-primary ring-1 ring-primary/30' : 'border-border')}>
                  <div className="flex items-center justify-between gap-1"><Icon className={'h-4 w-4 ' + (key === 'bloqueado' ? 'text-destructive' : key === 'ativo' ? 'text-success' : 'text-primary')} aria-hidden="true" /><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true"/></div>
                  <div className="mt-2 text-xl sm:text-2xl font-bold tabular-nums">{value == null ? '—' : NUMBER_FORMAT.format(value)}</div>
                  <div className="text-xs leading-snug text-muted-foreground break-words">{FILTER_LABELS[key]}</div>
                </button>;
              })}
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
              <span><strong className="text-foreground">Fichas vinculadas:</strong> {linkRate === null ? 'Não confirmado' : NUMBER_FORMAT.format(linkRate) + '%'}</span>
              <span>Contagens da abrangência autorizada, sem filtro de busca. Vínculo não comprova login ou uso do portal.</span>
              {counts && PORTAL_FILTERS.some(k => counts[k] === null) && <span role="status">Indicadores com — não puderam ser confirmados.</span>}
            </div>
          </section>
          <div className="rounded-xl border border-border bg-card p-3 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/>
              <Input aria-label="Buscar pacientes" value={busca} maxLength={100} onChange={e => { setBusca(e.target.value); setPage(1); }} placeholder="Buscar por nome, CPF ou e-mail" className="pl-9 pr-20"/>
              {busca && <Button variant="ghost" size="sm" className="absolute right-1 top-1/2 -translate-y-1/2 h-7" onClick={() => { setBusca(''); setPage(1); }}>Limpar</Button>}
            </div>
            <div className="flex gap-1 flex-wrap" aria-label="Filtros de pacientes">
              {PORTAL_FILTERS.map(k => <Button key={k} size="sm" aria-pressed={filtro === k} variant={filtro === k ? 'default' : 'outline'}
                disabled={!authorized || (!settingsReady && (k === 'ativo' || k === 'bloqueado'))}
                onClick={() => changeFilter(k)}>{k === 'todos' ? 'Todos' : k === 'ativo' ? 'Não bloqueados' : FILTER_LABELS[k]}</Button>)}
            </div>
          </div>

          <Card className="border border-border/50">
            <CardContent className="p-0 divide-y divide-border">
              {!authorized ? (
                <p className="p-8 text-center text-sm text-muted-foreground">Acesso administrativo não autorizado.</p>
              ) : listFailed ? (
                <div role="alert" className="p-6 flex flex-col items-center gap-2 text-sm"><AlertCircle className="h-5 w-5 text-muted-foreground"/>Não foi possível consultar os pacientes. Nenhum resultado foi presumido.<Button size="sm" variant="outline" onClick={() => setRevision(n => n + 1)}>Tentar novamente</Button></div>
              ) : loading ? (
                <div role="status" className="p-8 flex justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin text-primary" />Consultando pacientes…</div>
              ) : total === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">Nenhum paciente encontrado.</p>
              ) : visibleList.map(p => {
                const st = status(p);
                return (
                  <div key={p.id} className="px-3 py-3 sm:px-4 flex flex-col md:flex-row md:items-center gap-2 justify-between hover:bg-muted/20">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground break-words">{p.nome}</span>
                        {st === 'ativo' && (confirmed?.enabled ? <Badge className="bg-success/10 text-success border-0">Acesso ativo</Badge> : <Badge variant="outline">Vínculo ativo · portal desativado</Badge>)}
                        {st === 'bloqueado' && <Badge className="bg-destructive/10 text-destructive border-0">Bloqueado</Badge>}
                        {st === 'sem' && <Badge variant="outline" className="text-muted-foreground">Sem acesso</Badge>}
                        {st === 'incerto' && <Badge variant="outline">Vínculo existente · status a conferir</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">CPF: {maskPortalCpf(p.cpf)} · Login: {maskPortalEmail(p.email)}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" disabled={salvando} aria-label={'Gerenciar acesso de ' + p.nome} onClick={()=>setSelectedPatient({scope,patient:p})}>Gerenciar acesso<ChevronRight className="h-4 w-4 ml-1"/></Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" disabled={salvando} aria-label={'Ações rápidas de ' + p.nome}><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {p.auth_user_id ? <DropdownMenuItem onSelect={()=>abrir(p,'reset_password')}><KeyRound className="h-4 w-4 mr-2"/>Redefinir senha</DropdownMenuItem> :
                            <DropdownMenuItem disabled={!p.email} onSelect={()=>abrir(p,'create_access')}><UserPlus className="h-4 w-4 mr-2"/>Criar acesso</DropdownMenuItem>}
                          {p.auth_user_id && <DropdownMenuItem disabled={!settingsReady || settingsLoading} onSelect={()=>toggleBloqueio(p)}>{st==='bloqueado'?<Unlock className="h-4 w-4 mr-2"/>:<Ban className="h-4 w-4 mr-2"/>}{st==='bloqueado'?'Desbloquear':'Bloquear'}</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
                    <nav aria-label="Paginação dos pacientes" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-xs">
            <div aria-live="polite" className="text-muted-foreground">{total === null ? 'Total não confirmado' : total === 0 ? '0 registros' : `${NUMBER_FORMAT.format((page-1)*pageSize+1)}–${NUMBER_FORMAT.format(Math.min(page*pageSize,total))} de ${NUMBER_FORMAT.format(total)} registros`}</div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="portal-page-size" className="text-muted-foreground">Por página</label>
              <select id="portal-page-size" value={pageSize} onChange={e => { const value = Number(e.target.value); if (PORTAL_PAGE_SIZES.some(n => n === value)) { setPageSize(value as PortalPageSize); setPage(1); } }} className="h-8 rounded-md border border-input bg-background px-2 text-foreground">
                {PORTAL_PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <Button size="sm" variant="outline" aria-label="Página anterior" disabled={page <= 1 || loading || listFailed} onClick={() => setPage(n => Math.max(1,n-1))}><ChevronLeft className="h-4 w-4"/></Button>
              <span className="tabular-nums whitespace-nowrap">Página {page}{total !== null ? ' de ' + portalLastPage(total,pageSize) : ''}</span>
              <Button size="sm" variant="outline" aria-label="Próxima página" disabled={total === null || loading || page >= portalLastPage(total,pageSize)} onClick={() => setPage(n => n+1)}><ChevronRight className="h-4 w-4"/></Button>
            </div>
          </nav>
        </TabsContent>

        <TabsContent value="regras" className="space-y-3">
          <Card className="border border-border/50">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary shrink-0"/>Central de permissões</h2>
                  <p className="text-xs text-muted-foreground mt-1">Regras institucionais da rede municipal. Cada alteração exige confirmação e motivo.</p>
                </div>
                <Badge variant="outline" className="shrink-0">{!settingsReady?'Não confirmado':canEditRules?'Master Global':'Somente leitura'}</Badge>
              </div>
              <div className="rounded-xl border border-border p-3 flex items-center justify-between gap-3">
                <div><p className="font-medium text-sm">Portal ativo</p><p className="text-xs text-muted-foreground">Desativar restringe o acesso ao portal, sem excluir contas ou registros.</p></div>
                {confirmed && settingsReady ? <Switch aria-label="Portal ativo" checked={confirmed.enabled} disabled={!canEditRules || settingsLoading || salvando} onCheckedChange={value => openConfig({ kind: 'enabled', value }, value ? 'Ativar portal para toda a rede' : 'Desativar portal para toda a rede')} /> : <span className="text-xs text-muted-foreground">Não confirmado</span>}
              </div>
              {confirmed && settingsReady && !confirmed.enabled && <p role="status" className="text-sm bg-muted rounded-lg p-3">Portal desativado. As permissões individuais ficam armazenadas para quando for reativado.</p>}
              <p className="text-xs text-muted-foreground">{perms ? Object.values(perms).filter(Boolean).length+' de 6 permissões habilitadas na configuração' : 'Permissões não confirmadas'}. Meus dados (leitura) e exames continuam seguindo as regras existentes; não há controle independente para essas áreas.</p>
            </CardContent>
          </Card>
          {PORTAL_PERMISSION_GROUPS.map(group=><Card key={group.title} className="border border-border/50"><CardContent className="p-4 sm:p-5 space-y-3">
            <div><h3 className="font-semibold">{group.title}</h3><p className="text-xs text-muted-foreground">{group.description}</p></div>
            {group.rules.map(({key,label,desc,enforcement})=><div key={key} className="flex items-start justify-between gap-3 border-t border-border pt-3">
              <div className="min-w-0 space-y-1"><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{desc}</p><p className="text-xs text-muted-foreground">{enforcement}</p>
                {key==='cancelar' && perms?.cancelar && !perms.verProximas && <p className="text-xs text-muted-foreground">A próxima consulta está oculta; o botão de cancelamento não aparece nessa configuração.</p>}
                {key==='imprimirComprovante' && perms?.imprimirComprovante && !perms.verProximas && !perms.verHistorico && <p className="text-xs text-muted-foreground">Sem abas de consultas visíveis, não há botão de comprovante.</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {perms ? <><Switch aria-label={label} checked={perms[key]} disabled={!canEditRules || settingsLoading || salvando} onCheckedChange={value => openConfig({ kind: 'permission', key, value }, `${value ? 'Permitir' : 'Restringir'}: ${label}`)} /><span className="text-[11px] text-muted-foreground">{perms[key]?'Habilitada':'Restrita'}</span></> : <span className="text-xs text-muted-foreground">Não confirmado</span>}
              </div>
            </div>)}
          </CardContent></Card>)}
          <p className="text-xs text-muted-foreground">A configuração não apaga informações nem impede cópias de conteúdo já visualizado. A aplicação efetiva das políticas do servidor depende da versão publicada.</p>
        </TabsContent>
      </Tabs>

      <Dialog open={guideOpen && authorized} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Guia de acesso ao Portal do Paciente</DialogTitle><DialogDescription>Material de orientação para atendimento assistido. Não contém informações de pacientes.</DialogDescription></DialogHeader>
          {guideOpen && authorized && <PortalPublicGuide/>}
        </DialogContent>
      </Dialog>
      {authorized && selectedPatient?.scope===scope && <PortalPatientDetail key={scope+':'+selectedPatient.patient.id} patient={selectedPatient.patient}
        unitId={unitId} blockedIds={bloqueados} settingsReady={settingsReady && !settingsLoading} enabled={confirmed?.enabled} busy={salvando}
        onClose={()=>setSelectedPatient(null)}
        onCredential={(p,action)=>{setSelectedPatient(null);abrir(p,action);}}
        onBlock={p=>{setSelectedPatient(null);toggleBloqueio(p);}}/>}
      <Dialog open={!!configDlg && authorized} onOpenChange={open => { if (!open) closeConfig(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{configDlg?.label}</DialogTitle>
            <DialogDescription>{configDlg?.patient ? configDlg.patient.nome : 'Esta regra se aplica a toda a rede municipal.'} A alteração não exclui agendamentos, prontuários ou contas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="portal-config-reason">Motivo da alteração *</Label>
            <Textarea id="portal-config-reason" value={configMotivo} onChange={e => setConfigMotivo(e.target.value)} maxLength={500} disabled={salvando} placeholder="Registre o motivo para auditoria." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeConfig} disabled={salvando}>Cancelar</Button>
            <Button onClick={confirmarConfig} disabled={salvando || settingsLoading || !settingsReady || configMotivo.trim().length < 3}>{salvando && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Confirmar alteração</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dlg && !!user && (!restrito || (!!user.unidadeId && dlg.pac.unidade_id === user.unidadeId))} onOpenChange={o => { if (!o && !salvando) fechar(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dlg?.tipo === 'reset_password' ? 'Redefinir senha' : 'Criar acesso ao portal'}</DialogTitle>
            <DialogDescription>{dlg?.pac.nome} — login: {dlg?.pac.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nova senha</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input type={verSenha ? 'text' : 'password'} value={senha} onChange={e => setSenha(e.target.value)} className="pr-10 font-mono" />
                  <button type="button" onClick={() => setVerSenha(!verSenha)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {verSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <Button type="button" variant="outline" onClick={() => setSenha(gerarSenha())} title="Gerar senha"><Wand2 className="w-4 h-4" /></Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Entre 8 e 100 caracteres. Entregue a senha temporária somente ao paciente identificado.</p>
            </div>
            <div>
              <Label>Motivo da alteração *</Label>
              <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: paciente esqueceu a senha e compareceu à recepção" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fechar} disabled={salvando}>Cancelar</Button>
            <Button onClick={confirmar} disabled={salvando}>{salvando && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PortalAcessos;

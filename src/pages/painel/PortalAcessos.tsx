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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { KeyRound, Loader2, Search, ShieldCheck, Ban, UserPlus, Unlock, Eye, EyeOff, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { PORTAL_PERMISSOES_PADRAO, type PortalPermissoes } from '@/types';
import type { PortalChange } from '../../../supabase/functions/_shared/portal-admin-config';

interface Pac { id: string; nome: string; cpf: string | null; email: string | null; auth_user_id: string | null; unidade_id: string | null }
type Settings = { enabled: boolean; permissions: PortalPermissoes; blocked: string[]; canEditInstitutional: boolean };
type ConfigDialog = { change: PortalChange; label: string; patient?: Pac };
const EMPTY_BLOCKED: string[] = [];
function parseSettings(data: any): Settings | null {
  const v = data?.settings;
  if (data?.success !== true || typeof data.canEditInstitutional !== 'boolean' || typeof v?.enabled !== 'boolean' ||
      !Array.isArray(v?.blocked) || v.blocked.some((id: unknown) => typeof id !== 'string') ||
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

const PERM_LABELS: { key: keyof PortalPermissoes; label: string; desc: string }[] = [
  { key: 'verProximas', label: 'Ver próximas consultas', desc: 'Aba com os agendamentos futuros' },
  { key: 'cancelar', label: 'Cancelar consultas', desc: 'Paciente pode cancelar agendamentos pendentes/confirmados' },
  { key: 'verHistorico', label: 'Ver histórico de atendimentos', desc: 'Aba com consultas passadas, faltas e canceladas' },
  { key: 'verFila', label: 'Ver posição na fila de espera', desc: 'Aba de acompanhamento da fila' },
  { key: 'editarDados', label: 'Editar dados cadastrais', desc: 'Desativado = somente leitura' },
  { key: 'imprimirComprovante', label: 'Imprimir comprovante', desc: 'Botão de impressão do comprovante de agendamento' },
];

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

  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<Pac[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState<'todos' | 'ativo' | 'bloqueado' | 'sem'>('todos');
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
  const [listScope, setListScope] = useState('');
  const visibleList = listScope === scope && authorized ? lista : [];
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
    if (!settingsReady && (filtro === 'ativo' || filtro === 'bloqueado')) setFiltro('todos');
  }, [settingsReady, filtro]);

  useEffect(() => {
    let current = true;
    const t = setTimeout(async () => {
      if (!authorized || !user) { setLista([]); setLoading(false); return; }
      if ((filtro === 'ativo' || filtro === 'bloqueado') && !settingsReady) { setLista([]); setLoading(false); return; }
      setLoading(true);
      let q = (supabase as any).from('pacientes').select('id,nome,cpf,email,auth_user_id,unidade_id').order('nome').limit(100);
      const termo = busca.trim();
      if (termo) {
        const dig = termo.replace(/\D/g, '');
        const safe = termo.replace(/[,%()]/g, ' ');
        q = q.or([`nome.ilike.%${safe}%`, `email.ilike.%${safe}%`, dig.length >= 3 ? `cpf.ilike.%${dig}%` : null].filter(Boolean).join(','));
      }
      if (filtro === 'ativo' || filtro === 'bloqueado') q = q.not('auth_user_id', 'is', null);
      if (filtro === 'sem') q = q.is('auth_user_id', null);
      if (filtro === 'bloqueado') q = q.in('id', bloqueados.length ? bloqueados : ['00000000-0000-0000-0000-000000000000']);
      if (restrito) q = q.eq('unidade_id', user!.unidadeId);
      const { data, error } = await q;
      if (!current) return;
      if (error) toast.error('Erro ao buscar pacientes.');
      let rows: Pac[] = data || [];
      if (filtro === 'ativo') rows = rows.filter(p => !bloqueados.includes(p.id));
      setLista(rows);
      setListScope(scope);
      setLoading(false);
    }, 300);
    return () => { current = false; clearTimeout(t); };
  }, [busca, filtro, bloqueados.join(','), restrito, user?.unidadeId, scope, authorized, settingsReady]);

  useEffect(() => {
    setDlg(null); setSenha(''); setMotivo(''); setVerSenha(false);
    setConfigDlg(null); setConfigMotivo('');
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
      if (dlg.tipo === 'create_access') setLista(l => l.map(p => p.id === dlg.pac.id ? { ...p, auth_user_id: data.authUserId } : p));
      fechar();
    } catch {
      if (scopeRef.current === requestedScope) toast.error('Não foi possível confirmar a alteração. Confira o cadastro antes de repetir.');
    } finally { operation.current = false; setSalvando(false); }
  };

  const status = (p: Pac) => !p.auth_user_id ? 'sem' : !settingsReady ? 'incerto' : bloqueados.includes(p.id) ? 'bloqueado' : 'ativo';

  const total = visibleList.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Acessos ao Portal do Paciente</h1>
        <p className="text-sm text-muted-foreground">Gerencie senhas, bloqueios e o que os pacientes podem ver no portal.</p>
      </div>

      {(!settingsReady || settingsLoading) && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <span>{settingsLoading ? 'Conferindo regras e bloqueios do portal…' : 'Não foi possível confirmar as regras e bloqueios. As alterações de configuração estão suspensas até uma leitura válida.'}</span>
        {!settingsLoading && authorized && <Button size="sm" variant="outline" disabled={salvando} onClick={() => void readSettings()}>Tentar novamente</Button>}
      </div>}
      <Tabs defaultValue="pacientes">
        <TabsList>
          <TabsTrigger value="pacientes">Pacientes</TabsTrigger>
          <TabsTrigger value="regras">O que o paciente pode ver</TabsTrigger>
        </TabsList>

        <TabsContent value="pacientes" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, CPF ou e-mail" className="pl-9" />
            </div>
            <div className="flex gap-1 flex-wrap">
              {([['todos', 'Todos'], ['ativo', 'Ativos'], ['bloqueado', 'Bloqueados'], ['sem', 'Sem acesso']] as const).map(([k, l]) => (
                <Button key={k} size="sm" variant={filtro === k ? 'default' : 'outline'} disabled={!settingsReady && (k === 'ativo' || k === 'bloqueado')} onClick={() => setFiltro(k)}>{l}</Button>
              ))}
            </div>
          </div>

          <Card className="border border-border/50">
            <CardContent className="p-0 divide-y divide-border">
              {loading ? (
                <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : total === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">Nenhum paciente encontrado.</p>
              ) : visibleList.map(p => {
                const st = status(p);
                return (
                  <div key={p.id} className="p-3 flex flex-col md:flex-row md:items-center gap-2 justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground truncate">{p.nome}</span>
                        {st === 'ativo' && (confirmed?.enabled ? <Badge className="bg-success/10 text-success border-0">Acesso ativo</Badge> : <Badge variant="outline">Vínculo ativo · portal desativado</Badge>)}
                        {st === 'bloqueado' && <Badge className="bg-destructive/10 text-destructive border-0">Bloqueado</Badge>}
                        {st === 'sem' && <Badge variant="outline" className="text-muted-foreground">Sem acesso</Badge>}
                        {st === 'incerto' && <Badge variant="outline">Vínculo existente · status a conferir</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">CPF: {p.cpf || '—'} · Login: {p.email || 'sem e-mail'}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {p.auth_user_id ? (
                        <Button size="sm" variant="outline" disabled={salvando} onClick={() => abrir(p, 'reset_password')}><KeyRound className="w-4 h-4 mr-1" />Redefinir senha</Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={!p.email || salvando} title={!p.email ? 'Cadastre um e-mail no paciente' : ''} onClick={() => abrir(p, 'create_access')}><UserPlus className="w-4 h-4 mr-1" />Criar acesso</Button>
                      )}
                      {p.auth_user_id && (
                        <Button size="sm" variant={st === 'bloqueado' ? 'default' : 'outline'} disabled={!settingsReady || settingsLoading || salvando} onClick={() => toggleBloqueio(p)}>
                          {st === 'bloqueado' ? <><Unlock className="w-4 h-4 mr-1" />Desbloquear</> : <><Ban className="w-4 h-4 mr-1" />Bloquear</>}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">Mostrando até 100 pacientes. Use a busca para encontrar outros.</p>
        </TabsContent>

        <TabsContent value="regras">
          <Card className="border border-border/50">
            <CardContent className="p-6 space-y-4">
              {!canEditRules && <p className="text-xs text-muted-foreground">{settingsReady ? 'Regras institucionais: edição exclusiva do Master Global.' : 'Aguardando leitura confirmada das regras.'}</p>}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-foreground flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" />Portal ativo</span>
                  <p className="text-xs text-muted-foreground">Desativado = nenhum paciente consegue entrar</p>
                </div>
                {confirmed && settingsReady ? <Switch aria-label="Portal ativo" checked={confirmed.enabled} disabled={!canEditRules || settingsLoading || salvando} onCheckedChange={value => openConfig({ kind: 'enabled', value }, value ? 'Ativar portal para toda a rede' : 'Desativar portal para toda a rede')} /> : <span className="text-xs text-muted-foreground">Não confirmado</span>}
              </div>
              {PERM_LABELS.map(({ key, label, desc }) => (
                <div key={String(key)} className="flex items-center justify-between border-t border-border pt-4">
                  <div>
                    <span className="text-sm font-medium text-foreground">{label}</span>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  {perms ? <Switch aria-label={label} checked={perms[key]} disabled={!canEditRules || settingsLoading || salvando} onCheckedChange={value => openConfig({ kind: 'permission', key, value }, `${value ? 'Permitir' : 'Restringir'}: ${label}`)} /> : <span className="text-xs text-muted-foreground">Não confirmado</span>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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

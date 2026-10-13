import React, { useEffect, useMemo, useState } from 'react';
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

interface Pac { id: string; nome: string; cpf: string | null; email: string | null; auth_user_id: string | null; unidade_id: string | null }

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
  const { configuracoes, updateConfiguracoes } = useOperacional();
  const { user } = useAuth();
  const portal = configuracoes.portalPaciente!;
  const bloqueados = portal?.pacientesBloqueados ?? [];
  const perms: PortalPermissoes = { ...PORTAL_PERMISSOES_PADRAO, ...(portal?.permissoes || {}) };

  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<Pac[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState<'todos' | 'ativo' | 'bloqueado' | 'sem'>('todos');
  const [dlg, setDlg] = useState<{ pac: Pac; tipo: 'reset_password' | 'create_access' } | null>(null);
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(true);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const restrito = !!user?.unidadeId && user?.usuario !== 'admin.sms';

  useEffect(() => {
    const t = setTimeout(async () => {
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
      if (error) toast.error('Erro ao buscar pacientes.');
      let rows: Pac[] = data || [];
      if (filtro === 'ativo') rows = rows.filter(p => !bloqueados.includes(p.id));
      setLista(rows);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [busca, filtro, bloqueados.join(','), restrito, user?.unidadeId]);

  const salvarPortal = (patch: Partial<typeof portal>) =>
    updateConfiguracoes({ portalPaciente: { ...PORTAL_DEFAULT, ...portal, ...patch } });

  const toggleBloqueio = async (p: Pac) => {
    const bloq = bloqueados.includes(p.id);
    const novo = bloq ? bloqueados.filter(id => id !== p.id) : [...bloqueados, p.id];
    await salvarPortal({ pacientesBloqueados: novo });
    await (supabase as any).from('action_logs').insert({
      user_id: user?.id, user_nome: user?.nome, role: user?.role,
      acao: bloq ? 'portal_desbloquear' : 'portal_bloquear', entidade: 'paciente', entidade_id: p.id,
      modulo: 'portal_paciente', status: 'sucesso', detalhes: { paciente_nome: p.nome },
    }).then(() => {}, () => {});
    toast.success(bloq ? 'Acesso desbloqueado.' : 'Acesso bloqueado.');
  };

  const abrir = (pac: Pac, tipo: 'reset_password' | 'create_access') => {
    setDlg({ pac, tipo }); setSenha(gerarSenha()); setMotivo(''); setVerSenha(true);
  };

  const confirmar = async () => {
    if (!dlg) return;
    if (senha.length < 6) return toast.error('A senha deve ter no mínimo 6 caracteres.');
    if (motivo.trim().length < 3) return toast.error('Informe o motivo da alteração.');
    setSalvando(true);
    const { data, error } = await supabase.functions.invoke('manage-patient-portal', {
      body: { action: dlg.tipo, pacienteId: dlg.pac.id, novaSenha: senha, motivo },
    });
    setSalvando(false);
    if (error || data?.error) return toast.error(data?.error || 'Erro ao salvar.');
    toast.success(dlg.tipo === 'reset_password' ? 'Senha alterada. Informe a nova senha ao paciente.' : 'Acesso criado. Informe o e-mail e a senha ao paciente.');
    if (dlg.tipo === 'create_access') setLista(l => l.map(p => p.id === dlg.pac.id ? { ...p, auth_user_id: 'ok' } : p));
    setDlg(null);
  };

  const status = (p: Pac) => !p.auth_user_id ? 'sem' : bloqueados.includes(p.id) ? 'bloqueado' : 'ativo';

  const total = useMemo(() => lista.length, [lista]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Acessos ao Portal do Paciente</h1>
        <p className="text-sm text-muted-foreground">Gerencie senhas, bloqueios e o que os pacientes podem ver no portal.</p>
      </div>

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
                <Button key={k} size="sm" variant={filtro === k ? 'default' : 'outline'} onClick={() => setFiltro(k)}>{l}</Button>
              ))}
            </div>
          </div>

          <Card className="border border-border/50">
            <CardContent className="p-0 divide-y divide-border">
              {loading ? (
                <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : total === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">Nenhum paciente encontrado.</p>
              ) : lista.map(p => {
                const st = status(p);
                return (
                  <div key={p.id} className="p-3 flex flex-col md:flex-row md:items-center gap-2 justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground truncate">{p.nome}</span>
                        {st === 'ativo' && <Badge className="bg-success/10 text-success border-0">Acesso ativo</Badge>}
                        {st === 'bloqueado' && <Badge className="bg-destructive/10 text-destructive border-0">Bloqueado</Badge>}
                        {st === 'sem' && <Badge variant="outline" className="text-muted-foreground">Sem acesso</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">CPF: {p.cpf || '—'} · Login: {p.email || 'sem e-mail'}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {p.auth_user_id ? (
                        <Button size="sm" variant="outline" onClick={() => abrir(p, 'reset_password')}><KeyRound className="w-4 h-4 mr-1" />Redefinir senha</Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={!p.email} title={!p.email ? 'Cadastre um e-mail no paciente' : ''} onClick={() => abrir(p, 'create_access')}><UserPlus className="w-4 h-4 mr-1" />Criar acesso</Button>
                      )}
                      {p.auth_user_id && (
                        <Button size="sm" variant={st === 'bloqueado' ? 'default' : 'outline'} onClick={() => toggleBloqueio(p)}>
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
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-foreground flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" />Portal ativo</span>
                  <p className="text-xs text-muted-foreground">Desativado = nenhum paciente consegue entrar</p>
                </div>
                <Switch checked={portal?.permitirPortal ?? true} onCheckedChange={v => salvarPortal({ permitirPortal: v })} />
              </div>
              {PERM_LABELS.map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between border-t border-border pt-4">
                  <div>
                    <span className="text-sm font-medium text-foreground">{label}</span>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <Switch checked={perms[key]} onCheckedChange={v => salvarPortal({ permissoes: { ...perms, [key]: v } })} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!dlg} onOpenChange={o => !o && setDlg(null)}>
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
              <p className="text-xs text-muted-foreground mt-1">Mínimo 6 caracteres. Anote e entregue ao paciente.</p>
            </div>
            <div>
              <Label>Motivo da alteração *</Label>
              <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: paciente esqueceu a senha e compareceu à recepção" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>Cancelar</Button>
            <Button onClick={confirmar} disabled={salvando}>{salvando && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const PORTAL_DEFAULT = { permitirPortal: true, enviarSenhaAutomaticamente: true, enviarLinkAcesso: true, pacientesBloqueados: [] as string[] };

export default PortalAcessos;

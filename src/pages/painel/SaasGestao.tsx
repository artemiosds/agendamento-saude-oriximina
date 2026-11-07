import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Plus, Pencil, Download, ShieldCheck, Search, LayoutGrid, Building2, Wallet, Activity, History,
  RefreshCw, CircleDollarSign, Clock, Lock, ArrowLeftRight,
} from 'lucide-react';
import { LICENSE_MODULES } from '@/lib/licenseModules';
import {
  SaasCliente, StatusContrato, TipoOrganizacao, PlanoId, STATUS_LABEL, TIPO_LABEL, PLANOS,
  novoCliente, normalizeClientes, validarCliente, diasParaVencer, gerarPacoteInstalacao,
  calcularMrr, clientesAtencao, gerarSlug,
} from '@/lib/saasClientes';

const ROW_ID = 'saas_clientes';
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const maskCnpj = (v: string) => v.replace(/\D/g, '').slice(0, 14)
  .replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
  .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');

const statusVariant = (s: StatusContrato) =>
  s === 'ativo' ? 'default' : s === 'demonstracao' ? 'secondary' : s === 'suspenso' ? 'outline' : 'destructive';

function Kpi({ titulo, valor, sub, icon: Icon }: { titulo: string; valor: string | number; sub: string; icon: any }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <p className="text-sm text-muted-foreground">{titulo}</p>
          <Icon className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-3xl font-bold text-foreground mt-2">{valor}</p>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

export default function SaasGestao() {
  const { user, isGlobalAdmin } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('visao');
  const [clientes, setClientes] = useState<SaasCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<SaasCliente | null>(null);
  const [editTab, setEditTab] = useState('institucional');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | StatusContrato>('todos');

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('system_config').select('configuracoes').eq('id', ROW_ID).maybeSingle();
    if (error) toast.error('Não foi possível carregar os clientes.');
    setClientes(normalizeClientes((data?.configuracoes as any)?.clientes));
    setLoading(false);
  }, []);

  useEffect(() => { if (isGlobalAdmin) carregar(); }, [isGlobalAdmin, carregar]);

  const m = useMemo(() => {
    const demo = clientes.filter(c => c.status === 'demonstracao');
    return {
      mrr: calcularMrr(clientes),
      ativos: clientes.filter(c => c.status === 'ativo').length,
      demo: demo.length,
      demoVence7: demo.filter(c => { const d = diasParaVencer(c); return d !== null && d >= 0 && d <= 7; }).length,
      bloqueados: clientes.filter(c => c.status === 'suspenso').length,
      atencao: clientesAtencao(clientes),
      usuariosContratados: clientes.filter(c => c.status === 'ativo').reduce((s, c) => s + (c.limiteUsuarios || 0), 0),
    };
  }, [clientes]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return clientes.filter(c =>
      (filtroStatus === 'todos' || c.status === filtroStatus) &&
      (!q || [c.nome, c.nomeCurto, c.cidade, c.cnpj, c.slug].join(' ').toLowerCase().includes(q)));
  }, [clientes, busca, filtroStatus]);

  const auditoria = useMemo(() =>
    clientes.flatMap(c => c.historico.map(h => ({ ...h, cliente: c.nomeCurto || c.nome })))
      .sort((a, b) => b.em.localeCompare(a.em)), [clientes]);

  if (!isGlobalAdmin) return <Navigate to="/painel" replace />;

  const abrir = (c: SaasCliente) => { setEdit(structuredClone(c)); setMotivo(''); setEditTab('institucional'); };

  const salvar = async () => {
    if (!edit) return;
    const erros = validarCliente(edit);
    if (erros.length) { toast.error(erros[0]); return; }
    if (motivo.trim().length < 5) { toast.error('Informe o motivo da alteração (mín. 5 caracteres).'); return; }
    const slug = edit.slug || gerarSlug(edit.nomeCurto || edit.nome);
    if (clientes.some(c => c.id !== edit.id && c.slug === slug)) { toast.error('Identificador interno já usado por outro cliente.'); return; }
    setSaving(true);
    const existe = clientes.some(c => c.id === edit.id);
    const registro: SaasCliente = {
      ...edit, slug, uf: edit.uf.toUpperCase(),
      historico: [...edit.historico, { em: new Date().toISOString(), por: user?.usuario ?? null, motivo: motivo.trim(), acao: existe ? 'alteracao' : 'cadastro' }],
    };
    const next = existe ? clientes.map(c => (c.id === edit.id ? registro : c)) : [...clientes, registro];
    const { error } = await supabase.from('system_config').upsert({
      id: ROW_ID,
      configuracoes: { clientes: next, motivo_alteracao: motivo.trim(), alterado_por: user?.usuario ?? null, alterado_em: new Date().toISOString() } as any,
    });
    setSaving(false);
    if (error) { toast.error('Falha ao salvar: acesso negado ou erro de conexão.'); return; }
    setClientes(next); setEdit(null); setMotivo('');
    toast.success(existe ? 'Secretaria atualizada.' : 'Secretaria cadastrada.');
  };

  const baixarPacote = (c: SaasCliente) => {
    const blob = new Blob([JSON.stringify(gerarPacoteInstalacao(c), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pacote-instalacao-${c.slug || gerarSlug(c.nomeCurto || c.nome)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const set = <K extends keyof SaasCliente>(k: K, v: SaasCliente[K]) => setEdit(e => (e ? { ...e, [k]: v } : e));
  const aplicarPlano = (p: PlanoId) => {
    const plano = PLANOS.find(x => x.id === p)!;
    setEdit(e => (e ? { ...e, plano: p, modulos: { ...plano.modulos }, limiteUsuarios: plano.limiteUsuarios } : e));
  };
  const planoLabel = (p: PlanoId) => PLANOS.find(x => x.id === p)?.label ?? p;

  const contar = <T extends string>(key: (c: SaasCliente) => T) =>
    clientes.reduce<Record<string, number>>((acc, c) => { const k = key(c); acc[k] = (acc[k] || 0) + 1; return acc; }, {});

  return (
    <div className="space-y-6">
      {/* Cabeçalho do backoffice */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center"><ShieldCheck className="w-6 h-6" /></div>
          <div>
            <p className="text-[11px] tracking-[0.2em] text-muted-foreground uppercase">Backoffice SaaS</p>
            <h1 className="text-2xl font-bold text-foreground leading-tight">Painel Master</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">{user?.usuario}</span>
          <Button variant="outline" size="sm" onClick={() => navigate('/painel')}><ArrowLeftRight className="w-4 h-4 mr-1" />Portal operacional</Button>
          <Button variant="ghost" size="sm" onClick={carregar} disabled={loading}><RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />Atualizar</Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="visao"><LayoutGrid className="w-4 h-4 mr-1" />Visão geral</TabsTrigger>
          <TabsTrigger value="clientes"><Building2 className="w-4 h-4 mr-1" />Clientes</TabsTrigger>
          <TabsTrigger value="planos"><Wallet className="w-4 h-4 mr-1" />Planos</TabsTrigger>
          <TabsTrigger value="metricas"><Activity className="w-4 h-4 mr-1" />Métricas</TabsTrigger>
          <TabsTrigger value="auditoria"><History className="w-4 h-4 mr-1" />Auditoria global</TabsTrigger>
        </TabsList>

        {/* VISÃO GERAL */}
        <TabsContent value="visao" className="space-y-4 mt-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Visão executiva</h2>
            <p className="text-sm text-muted-foreground">Acompanhamento comercial e operacional de toda a plataforma.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Kpi titulo="MRR estimado" valor={brl(m.mrr)} sub="Clientes ativos e adimplentes" icon={CircleDollarSign} />
            <Kpi titulo="Clientes ativos" valor={m.ativos} sub="Secretarias em operação" icon={Building2} />
            <Kpi titulo="Em demonstração" valor={m.demo} sub={`${m.demoVence7} vencem nos próximos 7 dias`} icon={Clock} />
            <Kpi titulo="Bloqueados" valor={m.bloqueados} sub="Pendência de cobrança" icon={Lock} />
          </div>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Clientes que exigem atenção</CardTitle>
                <CardDescription>Demonstrações próximas do fim, contratos vencidos e contas bloqueadas.</CardDescription>
              </div>
              <Badge variant="secondary">{m.atencao.length}</Badge>
            </CardHeader>
            <CardContent>
              {m.atencao.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum cliente exige ação imediata.</p>
              ) : (
                <div className="divide-y divide-border">
                  {m.atencao.map(({ cliente, motivo }) => (
                    <div key={cliente.id} className="py-2 flex items-center justify-between gap-3">
                      <div><p className="font-medium text-foreground">{cliente.nomeCurto || cliente.nome}</p><p className="text-xs text-muted-foreground">{motivo}</p></div>
                      <Button size="sm" variant="outline" onClick={() => abrir(cliente)}>Resolver</Button>
                    </div>
                  ))}
                </div>
              )}
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setTab('clientes')}>Abrir gestão de clientes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CLIENTES */}
        <TabsContent value="clientes" className="space-y-4 mt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Clientes e secretarias</h2>
              <p className="text-sm text-muted-foreground">Cadastro institucional, contrato e módulos liberados. Nenhum dado de paciente é acessado aqui.</p>
            </div>
            <Button onClick={() => abrir(novoCliente())}><Plus className="w-4 h-4 mr-1" />Nova Secretaria</Button>
          </div>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0">
              <div className="relative w-72"><Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" /><Input className="pl-8" placeholder="Buscar nome, cidade, CNPJ" value={busca} onChange={e => setBusca(e.target.value)} /></div>
              <Select value={filtroStatus} onValueChange={v => setFiltroStatus(v as any)}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as situações</SelectItem>
                  {Object.entries(STATUS_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : filtrados.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhum cliente encontrado.</p>
              ) : (
                <div className="divide-y divide-border">
                  {filtrados.map(c => {
                    const d = diasParaVencer(c);
                    return (
                      <div key={c.id} className="py-3 flex flex-wrap items-center gap-3 justify-between">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{c.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {TIPO_LABEL[c.tipo]} · {[c.cidade, c.uf].filter(Boolean).join('/') || 'Local não informado'} · Plano {planoLabel(c.plano)} · {brl(c.mensalidade || 0)}/mês · até {c.limiteUsuarios} usuários
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {LICENSE_MODULES.filter(mod => c.modulos[mod.id]).map(mod => <Badge key={mod.id} variant="outline" className="text-[10px]">{mod.label}</Badge>)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {d !== null && d < 0 && c.status !== 'cancelado' && <Badge variant="destructive">Vencido há {-d}d</Badge>}
                          {d !== null && d >= 0 && d <= 30 && <Badge variant="secondary">Vence em {d}d</Badge>}
                          <Badge variant={statusVariant(c.status) as any}>{STATUS_LABEL[c.status]}</Badge>
                          <Button size="sm" variant="outline" onClick={() => baixarPacote(c)} title="Baixar pacote de instalação"><Download className="w-4 h-4" /></Button>
                          <Button size="sm" variant="outline" onClick={() => abrir(c)} title="Editar"><Pencil className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PLANOS */}
        <TabsContent value="planos" className="space-y-4 mt-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Planos</h2>
            <p className="text-sm text-muted-foreground">Pacotes de referência. Ao escolher um plano no cadastro, módulos e limite de usuários são preenchidos; a mensalidade é negociada por contrato.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANOS.map(p => {
              const qtd = clientes.filter(c => c.plano === p.id && c.status !== 'cancelado').length;
              return (
                <Card key={p.id}>
                  <CardHeader><CardTitle>{p.label}</CardTitle><CardDescription>{p.descricao}</CardDescription></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="text-muted-foreground">Até <span className="font-semibold text-foreground">{p.limiteUsuarios}</span> usuários ativos</p>
                    {LICENSE_MODULES.map(mod => (
                      <p key={mod.id} className={p.modulos[mod.id] ? 'text-foreground' : 'text-muted-foreground line-through'}>{mod.label}</p>
                    ))}
                    <p className="pt-2 text-xs text-muted-foreground">{qtd} cliente(s) neste plano</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* MÉTRICAS */}
        <TabsContent value="metricas" className="space-y-4 mt-6">
          <h2 className="text-2xl font-semibold text-foreground">Métricas da plataforma</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Kpi titulo="Total de clientes" valor={clientes.length} sub="Todos os contratos registrados" icon={Building2} />
            <Kpi titulo="Receita anual estimada" valor={brl(m.mrr * 12)} sub="MRR × 12" icon={CircleDollarSign} />
            <Kpi titulo="Usuários contratados" valor={m.usuariosContratados} sub="Soma dos limites dos clientes ativos" icon={Activity} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { t: 'Por situação', d: contar(c => STATUS_LABEL[c.status]) },
              { t: 'Por tipo de instituição', d: contar(c => TIPO_LABEL[c.tipo]) },
              { t: 'Por plano', d: contar(c => planoLabel(c.plano)) },
            ].map(b => (
              <Card key={b.t}>
                <CardHeader><CardTitle className="text-base">{b.t}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {Object.keys(b.d).length === 0 ? <p className="text-sm text-muted-foreground">Sem dados.</p> :
                    Object.entries(b.d).map(([k, v]) => (
                      <div key={k}>
                        <div className="flex justify-between text-sm"><span className="text-foreground">{k}</span><span className="text-muted-foreground">{v}</span></div>
                        <div className="h-1.5 rounded bg-muted mt-1"><div className="h-1.5 rounded bg-primary" style={{ width: `${(v / clientes.length) * 100}%` }} /></div>
                      </div>
                    ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* AUDITORIA */}
        <TabsContent value="auditoria" className="space-y-4 mt-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Auditoria global</h2>
            <p className="text-sm text-muted-foreground">Toda alteração de contrato, plano, mensalidade ou módulo, com responsável e motivo.</p>
          </div>
          <Card>
            <CardContent className="pt-6">
              {auditoria.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Nenhum registro.</p> : (
                <div className="divide-y divide-border">
                  {auditoria.map((h, i) => (
                    <div key={i} className="py-2 grid grid-cols-1 md:grid-cols-[170px_1fr_120px] gap-2 text-sm">
                      <span className="text-muted-foreground">{new Date(h.em).toLocaleString('pt-BR')}</span>
                      <span className="text-foreground"><span className="font-medium">{h.cliente}</span> — {h.motivo}</span>
                      <span className="text-muted-foreground md:text-right">{h.acao === 'cadastro' ? 'Cadastro' : 'Alteração'} · {h.por ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Acesso exclusivo do dono do sistema, travado também no banco de dados.</p>

      {/* MODAL */}
      <Dialog open={!!edit} onOpenChange={o => !o && setEdit(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edit && clientes.some(c => c.id === edit.id) ? 'Editar Secretaria' : 'Cadastrar nova Secretaria'}</DialogTitle>
            <DialogDescription>Dados institucionais e comerciais. Cada cliente terá banco de dados próprio e isolado.</DialogDescription>
          </DialogHeader>
          {edit && (
            <Tabs value={editTab} onValueChange={setEditTab}>
              <TabsList>
                <TabsTrigger value="institucional">Institucional</TabsTrigger>
                <TabsTrigger value="comercial">Comercial e módulos</TabsTrigger>
              </TabsList>

              <TabsContent value="institucional" className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="md:col-span-2"><Label>Razão social / Nome institucional *</Label><Input value={edit.nome} onChange={e => set('nome', e.target.value)} placeholder="Secretaria Municipal de Saúde de…" /></div>
                <div><Label>Nome fantasia / Apelido</Label><Input value={edit.nomeCurto} onChange={e => set('nomeCurto', e.target.value)} /></div>
                <div><Label>CNPJ</Label><Input value={edit.cnpj} onChange={e => set('cnpj', maskCnpj(e.target.value))} placeholder="00.000.000/0000-00" /></div>
                <div><Label>Tipo de instituição</Label>
                  <Select value={edit.tipo} onValueChange={v => set('tipo', v as TipoOrganizacao)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(TIPO_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2"><Label>Município</Label><Input value={edit.cidade} onChange={e => set('cidade', e.target.value)} /></div>
                  <div><Label>UF</Label><Input maxLength={2} value={edit.uf} placeholder="PA" onChange={e => set('uf', e.target.value.toUpperCase())} /></div>
                </div>
                <div><Label>Código IBGE do município</Label><Input inputMode="numeric" maxLength={7} value={edit.codigoIbge} onChange={e => set('codigoIbge', e.target.value.replace(/\D/g, ''))} placeholder="7 dígitos" /></div>
                <div><Label>Secretário / Gestor principal</Label><Input value={edit.responsavel} onChange={e => set('responsavel', e.target.value)} /></div>
                <div><Label>E-mail institucional</Label><Input type="email" value={edit.email} onChange={e => set('email', e.target.value)} /></div>
                <div><Label>WhatsApp / Telefone</Label><Input value={edit.telefone} onChange={e => set('telefone', e.target.value)} /></div>
                <div className="md:col-span-2"><Label>Endereço</Label><Input value={edit.endereco} onChange={e => set('endereco', e.target.value)} /></div>
                <div className="md:col-span-2">
                  <Label>Identificador interno</Label>
                  <Input value={edit.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder={gerarSlug(edit.nomeCurto || edit.nome) || 'ex.: sms-obidos'} />
                  <p className="text-xs text-muted-foreground mt-1">Se ficar vazio, é gerado a partir do nome.</p>
                </div>
              </TabsContent>

              <TabsContent value="comercial" className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div><Label>Situação comercial</Label>
                  <Select value={edit.status} onValueChange={v => set('status', v as StatusContrato)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(STATUS_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Plano</Label>
                  <Select value={edit.plano} onValueChange={v => aplicarPlano(v as PlanoId)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PLANOS.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Mensalidade (R$)</Label><Input type="number" min={0} step="0.01" value={edit.mensalidade} onChange={e => set('mensalidade', Number(e.target.value))} /></div>
                <div><Label>Dia de vencimento</Label><Input type="number" min={1} max={28} value={edit.diaVencimento} onChange={e => set('diaVencimento', Number(e.target.value))} /></div>
                <div><Label>Início do contrato</Label><Input type="date" value={edit.inicio} onChange={e => set('inicio', e.target.value)} /></div>
                <div><Label>Fim do contrato / demonstração</Label><Input type="date" value={edit.vencimento} onChange={e => set('vencimento', e.target.value)} /></div>
                <div><Label>E-mail financeiro</Label><Input type="email" value={edit.emailFinanceiro} onChange={e => set('emailFinanceiro', e.target.value)} /></div>
                <div><Label>Contato financeiro</Label><Input value={edit.contatoFinanceiro} onChange={e => set('contatoFinanceiro', e.target.value)} /></div>
                <div><Label>Limite de usuários ativos</Label><Input type="number" min={1} value={edit.limiteUsuarios} onChange={e => set('limiteUsuarios', Number(e.target.value))} /></div>
                <div className="md:col-span-2 space-y-3 rounded-md border border-border p-4">
                  <div><p className="text-sm font-medium text-foreground">Módulos liberados</p><p className="text-xs text-muted-foreground">Vão no pacote de instalação do cliente.</p></div>
                  {LICENSE_MODULES.map(mod => (
                    <div key={mod.id} className="flex items-center justify-between gap-3">
                      <div><p className="text-sm text-foreground">{mod.label}</p><p className="text-xs text-muted-foreground">{mod.descricao}</p></div>
                      <Switch checked={edit.modulos[mod.id]} onCheckedChange={v => set('modulos', { ...edit.modulos, [mod.id]: v })} />
                    </div>
                  ))}
                </div>
                <div className="md:col-span-2"><Label>Observações comerciais</Label><Textarea rows={2} value={edit.observacoes} onChange={e => set('observacoes', e.target.value)} /></div>
              </TabsContent>

              <div className="mt-4 space-y-2">
                <Label>Motivo da alteração *</Label>
                <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: assinatura do contrato nº 012/2026" />
                {edit.historico.length > 0 && (
                  <div className="text-xs text-muted-foreground space-y-1 pt-2">
                    <p className="font-medium">Histórico</p>
                    {[...edit.historico].reverse().slice(0, 5).map((h, i) => <p key={i}>{new Date(h.em).toLocaleString('pt-BR')} · {h.por ?? '—'} · {h.motivo}</p>)}
                  </div>
                )}
              </div>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : edit && clientes.some(c => c.id === edit.id) ? 'Salvar alterações' : 'Criar Secretaria'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

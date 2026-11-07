import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Building2, Plus, Pencil, Download, ShieldCheck, AlertTriangle, Search } from 'lucide-react';
import { LICENSE_MODULES } from '@/lib/licenseModules';
import {
  SaasCliente, StatusContrato, TipoOrganizacao, STATUS_LABEL, TIPO_LABEL,
  novoCliente, normalizeClientes, validarCliente, diasParaVencer, gerarPacoteInstalacao,
} from '@/lib/saasClientes';

const ROW_ID = 'saas_clientes';

const statusVariant = (s: StatusContrato) =>
  s === 'ativo' ? 'default' : s === 'demonstracao' ? 'secondary' : s === 'suspenso' ? 'outline' : 'destructive';

export default function SaasGestao() {
  const { user, isGlobalAdmin } = useAuth();
  const [clientes, setClientes] = useState<SaasCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<SaasCliente | null>(null);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (!isGlobalAdmin) return;
    (async () => {
      const { data, error } = await supabase.from('system_config').select('configuracoes').eq('id', ROW_ID).maybeSingle();
      if (error) toast.error('Não foi possível carregar os clientes.');
      setClientes(normalizeClientes((data?.configuracoes as any)?.clientes));
      setLoading(false);
    })();
  }, [isGlobalAdmin]);

  const metricas = useMemo(() => {
    const ativos = clientes.filter(c => c.status === 'ativo').length;
    const demo = clientes.filter(c => c.status === 'demonstracao').length;
    const vencendo = clientes.filter(c => { const d = diasParaVencer(c); return d !== null && d >= 0 && d <= 30 && c.status !== 'cancelado'; }).length;
    const vencidos = clientes.filter(c => { const d = diasParaVencer(c); return d !== null && d < 0 && c.status !== 'cancelado'; }).length;
    return { ativos, demo, vencendo, vencidos };
  }, [clientes]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? clientes.filter(c => [c.nome, c.nomeCurto, c.cidade, c.cnpj].join(' ').toLowerCase().includes(q)) : clientes;
  }, [clientes, busca]);

  if (!isGlobalAdmin) return <Navigate to="/painel" replace />;

  const salvar = async () => {
    if (!edit) return;
    const erros = validarCliente(edit);
    if (erros.length) { toast.error(erros[0]); return; }
    if (motivo.trim().length < 5) { toast.error('Informe o motivo da alteração (mín. 5 caracteres).'); return; }
    setSaving(true);
    const existe = clientes.some(c => c.id === edit.id);
    const registro: SaasCliente = {
      ...edit,
      uf: edit.uf.toUpperCase(),
      historico: [...edit.historico, { em: new Date().toISOString(), por: user?.usuario ?? null, motivo: motivo.trim(), acao: existe ? 'alteracao' : 'cadastro' }],
    };
    const next = existe ? clientes.map(c => (c.id === edit.id ? registro : c)) : [...clientes, registro];
    const { error } = await supabase.from('system_config').upsert({
      id: ROW_ID,
      configuracoes: { clientes: next, motivo_alteracao: motivo.trim(), alterado_por: user?.usuario ?? null, alterado_em: new Date().toISOString() } as any,
    });
    setSaving(false);
    if (error) { toast.error('Falha ao salvar: acesso negado ou erro de conexão.'); return; }
    setClientes(next);
    setEdit(null);
    setMotivo('');
    toast.success(existe ? 'Cliente atualizado.' : 'Cliente cadastrado.');
  };

  const baixarPacote = (c: SaasCliente) => {
    const blob = new Blob([JSON.stringify(gerarPacoteInstalacao(c), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pacote-instalacao-${(c.nomeCurto || c.nome).replace(/[^\w-]+/g, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const set = <K extends keyof SaasCliente>(k: K, v: SaasCliente[K]) => setEdit(e => (e ? { ...e, [k]: v } : e));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Building2 className="w-6 h-6 text-primary" /> Painel Central</h1>
          <p className="text-sm text-muted-foreground">Clientes, contratos e módulos licenciados. Nenhum dado de paciente é acessado aqui.</p>
        </div>
        <Button onClick={() => { setEdit(novoCliente()); setMotivo(''); }}><Plus className="w-4 h-4 mr-1" /> Novo cliente</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: 'Ativos', v: metricas.ativos },
          { l: 'Em demonstração', v: metricas.demo },
          { l: 'Vencem em 30 dias', v: metricas.vencendo },
          { l: 'Vencidos', v: metricas.vencidos },
        ].map(m => (
          <Card key={m.l}><CardContent className="pt-5"><p className="text-xs text-muted-foreground">{m.l}</p><p className="text-3xl font-bold text-foreground">{m.v}</p></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Clientes ({clientes.length})</CardTitle>
          <div className="relative w-64"><Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" /><Input className="pl-8" placeholder="Buscar nome, cidade, CNPJ" value={busca} onChange={e => setBusca(e.target.value)} /></div>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : filtrados.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum cliente cadastrado ainda. Use "Novo cliente" para registrar o primeiro contrato.</p>
          ) : (
            <div className="divide-y divide-border">
              {filtrados.map(c => {
                const d = diasParaVencer(c);
                return (
                  <div key={c.id} className="py-3 flex flex-wrap items-center gap-3 justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">{TIPO_LABEL[c.tipo]} · {[c.cidade, c.uf].filter(Boolean).join('/') || 'Local não informado'} · {c.responsavel || 'Sem responsável'}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {LICENSE_MODULES.filter(m => c.modulos[m.id]).map(m => <Badge key={m.id} variant="outline" className="text-[10px]">{m.label}</Badge>)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {d !== null && d < 0 && c.status !== 'cancelado' && <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Vencido há {-d}d</Badge>}
                      {d !== null && d >= 0 && d <= 30 && <Badge variant="secondary">Vence em {d}d</Badge>}
                      <Badge variant={statusVariant(c.status) as any}>{STATUS_LABEL[c.status]}</Badge>
                      <Button size="sm" variant="outline" onClick={() => baixarPacote(c)} title="Baixar pacote de instalação"><Download className="w-4 h-4" /></Button>
                      <Button size="sm" variant="outline" onClick={() => { setEdit(structuredClone(c)); setMotivo(''); }}><Pencil className="w-4 h-4" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Acesso exclusivo do dono do sistema, travado também no banco de dados. Toda alteração fica registrada com motivo.</p>

      <Dialog open={!!edit} onOpenChange={o => !o && setEdit(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit && clientes.some(c => c.id === edit.id) ? 'Editar cliente' : 'Novo cliente'}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2"><Label>Instituição *</Label><Input value={edit.nome} onChange={e => set('nome', e.target.value)} placeholder="Prefeitura Municipal de…" /></div>
              <div><Label>Nome curto (marca)</Label><Input value={edit.nomeCurto} onChange={e => set('nomeCurto', e.target.value)} /></div>
              <div><Label>Tipo</Label>
                <Select value={edit.tipo} onValueChange={v => set('tipo', v as TipoOrganizacao)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TIPO_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>CNPJ</Label><Input value={edit.cnpj} onChange={e => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2"><Label>Cidade</Label><Input value={edit.cidade} onChange={e => set('cidade', e.target.value)} /></div>
                <div><Label>UF</Label><Input maxLength={2} value={edit.uf} onChange={e => set('uf', e.target.value.toUpperCase())} /></div>
              </div>
              <div><Label>Responsável</Label><Input value={edit.responsavel} onChange={e => set('responsavel', e.target.value)} /></div>
              <div><Label>E-mail</Label><Input type="email" value={edit.email} onChange={e => set('email', e.target.value)} /></div>
              <div><Label>Telefone</Label><Input value={edit.telefone} onChange={e => set('telefone', e.target.value)} /></div>
              <div><Label>Status do contrato</Label>
                <Select value={edit.status} onValueChange={v => set('status', v as StatusContrato)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUS_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Início</Label><Input type="date" value={edit.inicio} onChange={e => set('inicio', e.target.value)} /></div>
              <div><Label>Vencimento</Label><Input type="date" value={edit.vencimento} onChange={e => set('vencimento', e.target.value)} /></div>
              <div className="md:col-span-2 space-y-2 rounded-md border border-border p-3">
                <p className="text-sm font-medium text-foreground">Módulos contratados</p>
                {LICENSE_MODULES.map(m => (
                  <div key={m.id} className="flex items-center justify-between gap-3">
                    <div><p className="text-sm text-foreground">{m.label}</p><p className="text-xs text-muted-foreground">{m.descricao}</p></div>
                    <Switch checked={edit.modulos[m.id]} onCheckedChange={v => set('modulos', { ...edit.modulos, [m.id]: v })} />
                  </div>
                ))}
              </div>
              <div className="md:col-span-2"><Label>Observações comerciais</Label><Textarea rows={2} value={edit.observacoes} onChange={e => set('observacoes', e.target.value)} /></div>
              <div className="md:col-span-2"><Label>Motivo da alteração *</Label><Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: assinatura do contrato nº 012/2026" /></div>
              {edit.historico.length > 0 && (
                <div className="md:col-span-2 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium">Histórico</p>
                  {[...edit.historico].reverse().slice(0, 5).map((h, i) => <p key={i}>{new Date(h.em).toLocaleString('pt-BR')} · {h.por ?? '—'} · {h.motivo}</p>)}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Fechar</Button>
            <Button onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

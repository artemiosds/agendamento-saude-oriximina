import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Plus, Trash2, KeyRound, RefreshCw, Wifi, Copy, ShieldCheck, ShieldAlert,
  Loader2, Edit, Network, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Sistema {
  id: string;
  nome: string;
  identificador: string;
  url_base: string;
  token_saida: string;
  token_entrada_hash: string;
  token_entrada_prefix: string;
  ativo: boolean;
  pode_enviar: boolean;
  pode_receber: boolean;
  unidade_id: string;
  ultimo_teste_em: string | null;
  ultimo_teste_status: string;
  created_at: string;
}

const empty: Partial<Sistema> = {
  nome: '', identificador: '', url_base: '', token_saida: '',
  ativo: true, pode_enviar: true, pode_receber: true, unidade_id: '',
};

const ConfigSistemasIntegrados: React.FC = () => {
  const { user } = useAuth();
  const [sistemas, setSistemas] = useState<Sistema[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Sistema> | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<{ id: string; token: string } | null>(null);

  const isMaster = user?.role === 'master';
  const isGlobal = user?.usuario === 'admin.sms';
  const userUnidade = user?.unidadeId || '';

  const carregar = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('sistemas_integrados').select('*').order('nome');
    if (!isGlobal && userUnidade) q = q.eq('unidade_id', userUnidade);
    const { data, error } = await q;
    if (error) toast.error('Erro ao carregar sistemas: ' + error.message);
    setSistemas((data || []) as Sistema[]);
    setLoading(false);
  }, [isGlobal, userUnidade]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async () => {
    if (!editing) return;
    if (!editing.nome || !editing.identificador) {
      toast.error('Nome e Identificador são obrigatórios.');
      return;
    }
    setSaving(true);
    const payload: any = {
      nome: editing.nome,
      identificador: editing.identificador.trim().toLowerCase().replace(/\s+/g, '-'),
      url_base: editing.url_base || '',
      token_saida: editing.token_saida || '',
      ativo: editing.ativo ?? true,
      pode_enviar: editing.pode_enviar ?? true,
      pode_receber: editing.pode_receber ?? true,
      unidade_id: editing.unidade_id ?? userUnidade,
      criado_por: user?.usuario || '',
    };
    
    let result;
    if (editing.id) {
      result = await supabase.from('sistemas_integrados').update(payload).eq('id', editing.id).select().single();
    } else {
      result = await supabase.from('sistemas_integrados').insert(payload).select().single();
    }
    
    setSaving(false);
    if (result.error) { 
      toast.error('Erro ao salvar: ' + result.error.message); 
      return; 
    }
    
    toast.success('Sistema salvo.');
    // Atualiza o estado de edição com os dados salvos (incluindo o ID novo se for o caso)
    setEditing(result.data);
    carregar();
  };

  const excluir = async (id: string) => {
    if (!confirm('Excluir este sistema integrado? Esta ação não pode ser desfeita.')) return;
    const { error } = await supabase.from('sistemas_integrados').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Removido.');
    carregar();
  };

  const gerarToken = async (sistemaId: string) => {
    setGenerating(sistemaId);
    const { data, error } = await supabase.functions.invoke('integracao-admin', {
      body: { sistema_id: sistemaId },
      headers: {},
      // action via query string não é suportado por invoke -> usamos fetch direto:
    });
    setGenerating(null);
    // fallback usando fetch direto pois precisamos de ?action=gerar-token
    if (!data || error) {
      // try direct fetch
    }
    if (data?.ok) {
      setGeneratedToken({ id: sistemaId, token: data.token });
      carregar();
    } else if (error) {
      toast.error('Erro: ' + (error.message || 'falha'));
    }
  };

  // Direct fetch helper (para edge functions com ?action=...)
  const callAdmin = async (action: string, body: Record<string, unknown>) => {
    const { data: sess } = await supabase.auth.getSession();
    const jwt = sess.session?.access_token;
    if (!jwt) { toast.error('Sessão expirada.'); return null; }
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/integracao-admin?action=${action}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    try { return await resp.json(); } catch { return null; }
  };

  const gerarTokenV2 = async (sistemaId: string) => {
    setGenerating(sistemaId);
    const r = await callAdmin('gerar-token', { sistema_id: sistemaId });
    setGenerating(null);
    if (r?.ok) {
      setGeneratedToken({ id: sistemaId, token: r.token });
      
      // Atualiza o prefixo no estado local de edição se for o mesmo sistema
      if (editing?.id === sistemaId) {
        setEditing(prev => prev ? { ...prev, token_entrada_prefix: r.prefix } : null);
      }
      
      carregar();
      toast.success('Token gerado.');
    } else {
      toast.error('Erro ao gerar token: ' + (r?.error || 'desconhecido'));
    }
  };

  const testar = async (sistemaId: string) => {
    setTesting(sistemaId);
    const r = await callAdmin('testar', { sistema_id: sistemaId });
    setTesting(null);
    if (r?.ok) {
      toast.success(r.message || 'Conectado!');
    } else {
      toast.error(r?.message || r?.error || 'Falha na conexão.');
    }
    carregar();
  };

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success('Copiado.');
  };

  if (!isMaster) {
    return (
      <Card><CardContent className="p-6 text-sm text-muted-foreground">
        Apenas usuários Master podem gerenciar Sistemas Integrados.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Network className="w-5 h-5 text-primary" /> Sistemas Integrados
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Conecte este sistema a outros sistemas (CER II, CAPS II, etc.) para enviar e receber encaminhamentos com segurança.
            </p>
          </div>
          <Button onClick={() => setEditing({ ...empty, unidade_id: userUnidade })} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Novo Sistema
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : sistemas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhum sistema integrado cadastrado.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Identificador</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Permissões</TableHead>
                  <TableHead>Último Teste</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sistemas.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.nome}</TableCell>
                    <TableCell><code className="text-xs">{s.identificador}</code></TableCell>
                    <TableCell>
                      {s.ativo
                        ? <Badge className="bg-emerald-100 text-emerald-800">Ativo</Badge>
                        : <Badge variant="secondary">Inativo</Badge>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.pode_enviar && <Badge variant="outline" className="mr-1">Envia</Badge>}
                      {s.pode_receber && <Badge variant="outline">Recebe</Badge>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.ultimo_teste_em ? (
                        <span className={s.ultimo_teste_status === 'ok' ? 'text-emerald-600' : 'text-red-600'}>
                          {s.ultimo_teste_status === 'ok' ? '✓ conectado' : `✗ ${s.ultimo_teste_status}`}
                          <br />
                          <span className="text-muted-foreground">
                            {new Date(s.ultimo_teste_em).toLocaleString('pt-BR')}
                          </span>
                        </span>
                      ) : <span className="text-muted-foreground">nunca</span>}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => testar(s.id)} disabled={testing === s.id}>
                        {testing === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => gerarTokenV2(s.id)} disabled={generating === s.id}>
                        {generating === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => excluir(s.id)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog de edição */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar Sistema Integrado' : 'Novo Sistema Integrado'}</DialogTitle>
            <DialogDescription>
              Configure os dados de conexão entre este sistema e o sistema externo.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome da unidade externa *</Label>
                  <Input
                    value={editing.nome || ''}
                    onChange={(e) => setEditing({ ...editing, nome: e.target.value })}
                    placeholder="Ex.: CAPS II"
                  />
                </div>
                <div>
                  <Label>Identificador do sistema *</Label>
                  <Input
                    value={editing.identificador || ''}
                    onChange={(e) => setEditing({ ...editing, identificador: e.target.value })}
                    placeholder="Ex.: caps-ii-oriximina"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-start gap-1">
                    <Info className="w-3 h-3 mt-0.5" />
                    Use um identificador único e igual nos dois sistemas (ex.: cer-ii-oriximina ou caps-ii-oriximina).
                  </p>
                </div>
              </div>

              <div>
                <Label>URL base do sistema externo</Label>
                <Input
                  value={editing.url_base || ''}
                  onChange={(e) => setEditing({ ...editing, url_base: e.target.value })}
                  placeholder="https://<projeto>.supabase.co"
                />
                <p className="text-[11px] text-muted-foreground mt-1 flex items-start gap-1">
                  <Info className="w-3 h-3 mt-0.5" />
                  Informe a URL base do projeto/sistema externo. As funções de integração serão chamadas a partir desta URL.
                </p>
              </div>

              <Separator />

              <div>
                <Label className="flex items-center gap-1">
                  <ShieldAlert className="w-4 h-4 text-amber-600" /> Token de SAÍDA
                </Label>
                <Input
                  type="password"
                  value={editing.token_saida || ''}
                  onChange={(e) => setEditing({ ...editing, token_saida: e.target.value })}
                  placeholder="Cole aqui o Token de ENTRADA gerado no outro sistema"
                />
                <p className="text-[11px] text-muted-foreground mt-1 flex items-start gap-1">
                  <Info className="w-3 h-3 mt-0.5" />
                  Cole aqui o <strong>Token de ENTRADA</strong> gerado no outro sistema. Este token será usado para enviar dados para ele.
                </p>
              </div>

              <div className="bg-emerald-50/50 p-4 rounded-lg border border-emerald-100 space-y-3">
                <Label className="flex items-center gap-1 text-emerald-800">
                  <ShieldCheck className="w-4 h-4" /> Token de ENTRADA (Gerado por este sistema)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={editing.token_entrada_prefix ? `${editing.token_entrada_prefix}••••••••••••••••` : '— ainda não gerado —'}
                    className="font-mono text-xs bg-white"
                  />
                  {editing.id ? (
                    <Button
                      type="button" size="sm" variant="outline"
                      onClick={() => gerarTokenV2(editing.id!)}
                      disabled={generating === editing.id}
                      className="whitespace-nowrap bg-white hover:bg-emerald-50"
                    >
                      {generating === editing.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <><RefreshCw className="w-4 h-4 mr-1 text-emerald-600" /> {editing.token_entrada_prefix ? 'Regenerar' : 'Gerar Token'}</>}
                    </Button>
                  ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground flex items-start gap-1">
                  <Info className="w-3 h-3 mt-0.5" />
                  Gere este token e copie para o outro sistema usar como <strong>Token de SAÍDA</strong>. 
                  Por segurança, o valor completo só aparece no momento da geração.
                </p>
                {!editing.id && (
                  <p className="text-[11px] text-amber-600 font-medium bg-amber-50 p-2 rounded border border-amber-100">
                    Clique em "Salvar" abaixo para habilitar a geração do Token de Entrada.
                  </p>
                )}
              </div>

              <Separator />

              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={editing.ativo ?? true} onCheckedChange={(v) => setEditing({ ...editing, ativo: v })} />
                  <Label>Ativo</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editing.pode_enviar ?? true} onCheckedChange={(v) => setEditing({ ...editing, pode_enviar: v })} />
                  <Label>Pode enviar</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editing.pode_receber ?? true} onCheckedChange={(v) => setEditing({ ...editing, pode_receber: v })} />
                  <Label>Pode receber</Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog mostrando token gerado UMA VEZ */}
      <Dialog open={!!generatedToken} onOpenChange={(o) => !o && setGeneratedToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-600" /> Token de Entrada gerado
            </DialogTitle>
            <DialogDescription>
              Copie este token agora e cole no outro sistema como <strong>Token de SAÍDA</strong>.
              Por segurança, ele não será exibido novamente.
            </DialogDescription>
          </DialogHeader>
          {generatedToken && (
            <div className="space-y-3">
              <div className="bg-muted p-3 rounded font-mono text-xs break-all border">
                {generatedToken.token}
              </div>
              <Button onClick={() => copy(generatedToken.token)} className="w-full">
                <Copy className="w-4 h-4 mr-2" /> Copiar token
              </Button>
              <p className="text-[11px] text-amber-600 flex items-start gap-1">
                <ShieldAlert className="w-3 h-3 mt-0.5" />
                Após fechar esta janela, o token não poderá mais ser visualizado. Você poderá apenas regenerar um novo.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setGeneratedToken(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConfigSistemasIntegrados;

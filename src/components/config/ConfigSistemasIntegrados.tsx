import React, { useEffect, useState, useCallback, useRef } from 'react';
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
import {safeIntegrationUrl} from '@/lib/adminIntegrations';
import {nextVersion} from '@/lib/adminWhatsApp';
import {readCompleteCatalog} from '@/lib/adminCatalog';
import type {TablesInsert,TablesUpdate} from '@/integrations/supabase/types';

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
  updated_at: string;
}

const empty: Partial<Sistema> = {
  nome: '', identificador: '', url_base: '', token_saida: '',
  ativo: true, pode_enviar: true, pode_receber: true, unidade_id: '',
};

const ConfigSistemasIntegrados: React.FC = () => {
  const { user } = useAuth();
  const [sistemas, setSistemas] = useState<Sistema[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed,setFailed]=useState(false);
  const lock=useRef(false);
  const [busy,setBusy]=useState(false);
  const confirmSession=async()=>{const {data,error}=await supabase.auth.getSession();if(error||!user?.authUserId||user.role!=='master'||user.ativo!==true||data.session?.user.id!==user.authUserId)throw Error('Sessão não confirmada.');return data.session.access_token;};
  const [editing, setEditing] = useState<Partial<Sistema> | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<{ id: string; token: string } | null>(null);

  const isMaster = user?.role === 'master';
  const isGlobal = user?.usuario === 'admin.sms';
  const userUnidade = user?.unidadeId || '';

  const carregar=useCallback(async()=>{
    setLoading(true);setFailed(false);
    try{
      if(!isMaster||(!isGlobal&&!userUnidade))throw Error('Escopo não confirmado.');
      const rows=await readCompleteCatalog(async(from,to)=>{
        let q=supabase.from('sistemas_integrados').select('*',{count:'exact'}).order('id').range(from,to);
        if(!isGlobal)q=q.eq('unidade_id',userUnidade);
        const {data,error,count}=await q;if(error||!data)throw Error('Consulta não confirmada.');return {rows:data,count};
      });
      setSistemas(rows.sort((a,b)=>a.nome.localeCompare(b.nome)));
    }catch{setFailed(true);toast.error('Sistemas integrados não confirmados.');}
    finally{setLoading(false);}
  },[isMaster,isGlobal,userUnidade]);
  useEffect(()=>{void carregar();},[carregar]);
  const run=async(fn:()=>Promise<void>)=>{
    if(lock.current||loading||failed)return;lock.current=true;setBusy(true);
    try{await confirmSession();await fn();}
    catch{setFailed(true);toast.error('Operação não confirmada. Atualize os sistemas antes de repetir.');}
    finally{lock.current=false;setBusy(false);}
  };
  const current=async(id:string)=>{
    const old=sistemas.find(s=>s.id===id);
    if(!old||(!isGlobal&&old.unidade_id!==userUnidade))throw Error('Escopo não confirmado.');
    const {data,error}=await supabase.from('sistemas_integrados').select('id,updated_at,unidade_id').eq('id',id).maybeSingle();
    if(error||!data||data.updated_at!==old.updated_at||data.unidade_id!==old.unidade_id)throw Error('Sistema alterado.');
    return old;
  };
  const salvar=()=>run(async()=>{
    if(!editing?.nome?.trim()||!editing.identificador?.trim()){toast.error('Nome e identificador obrigatórios.');return;}
    if(editing.url_base&&!safeIntegrationUrl(editing.url_base)){toast.error('Confira a URL HTTP/HTTPS sem credenciais embutidas.');return;}
    if(!isGlobal&&!userUnidade)return;
    const old=editing.id?await current(editing.id):null;
    if(old&&editing.updated_at!==old.updated_at)throw Error('Rascunho desatualizado.');
    if(!window.confirm('Salvar esta configuração de integração?'))return;
    setSaving(true);
    try{
      const payload:TablesInsert<'sistemas_integrados'>={nome:editing.nome.trim(),identificador:editing.identificador.trim().toLowerCase().replace(/\s+/g,'-'),url_base:editing.url_base||'',token_saida:editing.token_saida||old?.token_saida||'',ativo:editing.ativo??true,pode_enviar:editing.pode_enviar??true,pode_receber:editing.pode_receber??true,unidade_id:editing.unidade_id??userUnidade};
      if(!isGlobal&&payload.unidade_id!==userUnidade)throw Error('Unidade inválida.');
      const result=old?await supabase.from('sistemas_integrados').update({...payload,updated_at:nextVersion(old.updated_at)} as TablesUpdate<'sistemas_integrados'>).eq('id',old.id).eq('unidade_id',old.unidade_id).eq('updated_at',old.updated_at).select('*').maybeSingle():await supabase.from('sistemas_integrados').insert({...payload,criado_por:user?.usuario||''}).select('*').single();
      if(result.error||!result.data)throw Error('Gravação não confirmada.');
      setEditing({...result.data,token_saida:''});toast.success('Sistema salvo.');await carregar();
    }finally{setSaving(false);}
  });
  const excluir=(id:string)=>run(async()=>{
    const old=await current(id);
    if(!window.confirm('Excluir este sistema integrado? A conexão deixará de funcionar.'))return;
    const {data,error}=await supabase.from('sistemas_integrados').delete().eq('id',id).eq('unidade_id',old.unidade_id).eq('updated_at',old.updated_at).select('id').maybeSingle();
    if(error||data?.id!==id)throw Error('Exclusão não confirmada.');toast.success('Remoção confirmada.');await carregar();
  });
  const callAdmin=async(action:string,body:Record<string,unknown>)=>{
    const jwt=await confirmSession();
    const resp=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/integracao-admin?action=${action}`,{method:'POST',headers:{Authorization:`Bearer ${jwt}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result=await resp.json();if(!resp.ok||result?.ok!==true)throw Error('Resposta não confirmada.');return result;
  };
  const gerarTokenV2=(id:string)=>run(async()=>{
    await current(id);
    if(!window.confirm('Gerar novo token de entrada? O token anterior poderá deixar de funcionar.'))return;
    setGenerating(id);
    try{const r=await callAdmin('gerar-token',{sistema_id:id});if(typeof r.token!=='string'||!r.token||typeof r.prefix!=='string')throw Error('Token não confirmado.');
      setGeneratedToken({id,token:r.token});setEditing(null);toast.success('Token gerado.');await carregar();}
    finally{setGenerating(null);}
  });
  const testar=(id:string)=>run(async()=>{
    await current(id);if(!window.confirm('Executar teste real da integração salva?'))return;setTesting(id);
    try{await callAdmin('testar',{sistema_id:id});toast.success('Teste confirmado pelo serviço.');await carregar();}
    finally{setTesting(null);}
  });
  const copy=async(s:string)=>{try{await navigator.clipboard.writeText(s);toast.success('Copiado.');}catch{toast.error('Não foi possível copiar.');}};

  if (!isMaster) {
    return (
      <Card><CardContent className="p-6 text-sm text-muted-foreground">
        Apenas usuários Master podem gerenciar Sistemas Integrados.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" /> Identificador deste sistema
            </h4>
            <p className="text-xs text-muted-foreground">
              Forneça este identificador para o outro sistema reconhecer esta unidade.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white p-2 rounded border border-primary/20">
            <code className="text-sm font-bold text-primary">
              {"sistema-" + (import.meta.env.VITE_SUPABASE_URL || "").replace(/\W/g, "").slice(-12)}
            </code>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy("sistema-" + (import.meta.env.VITE_SUPABASE_URL || "").replace(/\W/g, "").slice(-12))}>
              <Copy className="w-3 h-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

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
          <Button disabled={busy||failed||loading} onClick={() => setEditing({ ...empty, unidade_id: userUnidade })} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Novo Sistema
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : failed ? <div role="alert" className="p-4 space-y-2"><p>Consulta ou operação não confirmada.</p><Button onClick={()=>void carregar()}>Atualizar sistemas</Button></div> : sistemas.length === 0 ? (
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
                      <Button size="sm" variant="outline" onClick={() => testar(s.id)} disabled={busy||failed}>
                        {testing === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => gerarTokenV2(s.id)} 
                        disabled={busy||failed}
                        title={s.token_entrada_prefix ? "Regenerar Token de Entrada" : "Gerar Token de Entrada"}
                      >
                        {generating === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy||failed} onClick={() => setEditing({...s,token_saida:''})}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy||failed} onClick={() => excluir(s.id)}>
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
      <Dialog open={!!editing} onOpenChange={o=>{if(!o&&!lock.current)setEditing(null);}}>
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
                  <div className="flex items-center gap-2">
                    <Input
                      value={editing.identificador || ''}
                      onChange={(e) => setEditing({ ...editing, identificador: e.target.value })}
                      placeholder="Ex.: cer-ii-oriximina"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-start gap-1">
                    <Info className="w-3 h-3 mt-0.5" />
                    Este deve ser o "Identificador deste sistema" que aparece no outro sistema. Recomendamos usar nomes padronizados (ex: cer-ii-oriximina).
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

              <div className="bg-amber-50/50 p-4 rounded-lg border border-amber-100 space-y-3">
                <Label className="flex items-center gap-1 text-amber-800">
                  <ShieldAlert className="w-4 h-4" /> Token de SAÍDA (Token do sistema externo)
                </Label>
                <Input
                  type="password"
                  placeholder={editing.id?'Em branco mantém o token salvo':'Informe o token'}
                  value={editing.token_saida || ''}
                  onChange={(e) => setEditing({ ...editing, token_saida: e.target.value })}
                  className="bg-white"
                />
                <p className="text-[11px] text-muted-foreground flex items-start gap-1">
                  <Info className="w-3 h-3 mt-0.5" />
                  Cole o <strong>Token de ENTRADA</strong> gerado no outro sistema. Este token permite que este sistema envie dados para ele.
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
                      disabled={busy||failed}
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
            <Button variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={busy||failed||saving}>
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

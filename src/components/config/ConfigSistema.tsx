import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdministrativeConfigSection } from '@/hooks/useProntuarioSettings';
import { useConfiguracao } from '@/hooks/useConfiguracao';
import { sameConfigSection } from '@/lib/configSectionGuard';
import { DEFAULT, readInstitutionalConfig, mergeInstitutionalEdits, validateInstitutionalEdits, type SistemaConfig } from '@/lib/adminInstitutionalSettings';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, Building2, Bell, Palette, Shield } from 'lucide-react';

const CONFIG_KEY = 'config_sistema';

const ConfigSistema: React.FC<{onDirtyChange?:(dirty:boolean)=>void}> = ({onDirtyChange}) => {
  const {user}=useAuth();
  const {load,save:writeSection}=useAdministrativeConfigSection(CONFIG_KEY,'ALTERAR_CONFIG_SISTEMA');
  const {syncPendingDrafts}=useConfiguracao();
  const [config,setConfig]=useState<SistemaConfig>(DEFAULT);
  const [confirmed,setConfirmed]=useState<SistemaConfig>(DEFAULT);
  const [loading,setLoading]=useState(true);
  const [loadFailed,setLoadFailed]=useState(false);
  const [saveState,setSaveState]=useState<'idle'|'saving'|'saved'|'error'>('idle');
  const lock=useRef(false),sequence=useRef(0);
  const dirty=!sameConfigSection(config,confirmed);
  const allowed=user?.role==='master'&&user.ativo===true&&user.usuario==='admin.sms';
  const loadConfig=useCallback(async()=>{
    const seq=++sequence.current;setLoading(true);setLoadFailed(false);setSaveState('idle');
    try{
      if(!allowed)throw Error('Escopo institucional não confirmado.');
      const next=readInstitutionalConfig(await load());
      if(seq!==sequence.current)return;setConfig(next);setConfirmed(next);
    }catch{if(seq===sequence.current)setLoadFailed(true);}
    finally{if(seq===sequence.current)setLoading(false);}
  },[allowed,load]);
  useEffect(()=>{void loadConfig();void syncPendingDrafts();return()=>{sequence.current++;};},[loadConfig,syncPendingDrafts]);
  useEffect(()=>{onDirtyChange?.(dirty);return()=>onDirtyChange?.(false);},[dirty,onDirtyChange]);
  useEffect(()=>{
    if(!dirty&&saveState!=='saving')return;
    const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[dirty,saveState]);
  const edit=(fn:(prev:SistemaConfig)=>SistemaConfig)=>{if(!lock.current&&saveState!=='error'){setConfig(fn);setSaveState('idle');}};
  const save=async()=>{
    if(lock.current||!allowed||loadFailed||loading||saveState==='error'||!dirty)return;
    const error=validateInstitutionalEdits(confirmed,config);if(error){toast.error(error);return;}
    const institutionalChanged=!sameConfigSection(config.instituicao,confirmed.instituicao);
    const complianceChanged=!sameConfigSection(config.conformidade,confirmed.conformidade);
    if(!window.confirm(institutionalChanged?'Salvar alterações institucionais? A marca pode refletir no login, menu e documentos que usam a marca institucional.':complianceChanged?'Salvar parâmetros de conformidade? Esta operação não executa exclusões ou anonimizações.':'Salvar alterações institucionais?'))return;
    lock.current=true;setSaveState('saving');
    try{
      if(!await writeSection(raw=>mergeInstitutionalEdits(raw,confirmed,config)))throw Error('Gravação não confirmada.');
      setConfirmed(config);setSaveState('saved');toast.success('Configurações institucionais confirmadas.');
    }catch{setSaveState('error');toast.error('Gravação não confirmada. Confira os valores antes de repetir.');}
    finally{lock.current=false;}
  };
  const reload=()=>{if(!lock.current&&(!dirty||window.confirm('Descartar alterações locais e consultar os valores salvos?')))void loadConfig();};
  if(loadFailed)return <Card className="config-admin-card"><CardContent className="p-4 space-y-2"><p role="alert">Não foi possível confirmar as configurações institucionais. Edição indisponível.</p><Button onClick={reload}>Tentar novamente</Button></CardContent></Card>;

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold">Configurações Institucionais</h3><p className="text-xs text-muted-foreground">Identidade, preferências e políticas administrativas • Master global</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={saveState==='saving'} onClick={reload}>Atualizar</Button><Button size="sm" disabled={!dirty||saveState==='saving'||saveState==='error'} onClick={()=>void save()}>{saveState==='saving'?'Salvando…':'Salvar alterações'}</Button></div>
        </div>
        <p role="status" className="text-sm text-muted-foreground">{saveState==='error'?'Gravação não confirmada. Rascunho mantido; atualize antes de repetir.':saveState==='saved'?'Gravação confirmada.':saveState==='saving'?'Salvando…':dirty?'Alterações locais não salvas.':'Configuração consultada.'}</p>
      </div>
      <fieldset disabled={saveState==='saving'||saveState==='error'} className="space-y-4 min-w-0">
      {/* 9.1 Informações da instituição */}
      <Card className="config-admin-card shadow-card border-0">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-primary" />
            <h3 className="font-semibold font-display text-foreground">Informações da Instituição</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Os campos de marca são utilizados por telas e documentos existentes. Nenhum modelo é editado aqui.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><Label>Nome da Instituição</Label><Input value={config.instituicao.nome} onChange={e => edit(p => ({ ...p, instituicao: { ...p.instituicao, nome: e.target.value } }))} /></div>
            <div className="sm:col-span-2"><Label>Nome do CER</Label><Input value={config.instituicao.cer} onChange={e => edit(p => ({ ...p, instituicao: { ...p.instituicao, cer: e.target.value } }))} /></div>
            <div><Label>CNPJ</Label><Input value={config.instituicao.cnpj} onChange={e => edit(p => ({ ...p, instituicao: { ...p.instituicao, cnpj: e.target.value } }))} /></div>
            <div><Label>Telefone</Label><Input value={config.instituicao.telefone} onChange={e => edit(p => ({ ...p, instituicao: { ...p.instituicao, telefone: e.target.value } }))} /></div>
            <div className="sm:col-span-2"><Label>Endereço</Label><Input value={config.instituicao.endereco} onChange={e => edit(p => ({ ...p, instituicao: { ...p.instituicao, endereco: e.target.value } }))} /></div>
            <div><Label>E-mail institucional</Label><Input value={config.instituicao.email} onChange={e => edit(p => ({ ...p, instituicao: { ...p.instituicao, email: e.target.value } }))} /></div>
            <div><Label>Nome curto (login e menu)</Label><Input value={config.instituicao.marcaTitulo || ''} onChange={e => edit(p => ({ ...p, instituicao: { ...p.instituicao, marcaTitulo: e.target.value } }))} placeholder="SMS Oriximiná" /></div>
            <div><Label>Subtítulo (login e menu)</Label><Input value={config.instituicao.marcaSubtitulo || ''} onChange={e => edit(p => ({ ...p, instituicao: { ...p.instituicao, marcaSubtitulo: e.target.value } }))} placeholder="Secretaria Municipal de Saúde" /></div>
            <div><Label>Cidade/UF nos documentos</Label><Input value={config.instituicao.marcaCidadeUf || ''} onChange={e => edit(p => ({ ...p, instituicao: { ...p.instituicao, marcaCidadeUf: e.target.value } }))} placeholder="Oriximiná — PA" /></div>
            <div><Label>Unidade nos carimbos</Label><Input value={config.instituicao.marcaUnidadeCarimbo || ''} onChange={e => edit(p => ({ ...p, instituicao: { ...p.instituicao, marcaUnidadeCarimbo: e.target.value } }))} placeholder="CER II — Oriximiná/PA" /></div>
            <div><Label>Prefeitura/Mantenedora (capas)</Label><Input value={config.instituicao.marcaMantenedora || ''} onChange={e => edit(p => ({ ...p, instituicao: { ...p.instituicao, marcaMantenedora: e.target.value } }))} placeholder="Prefeitura Municipal de Oriximiná — PA" /></div>
            <div><Label>Logo URL</Label><Input value={config.instituicao.logoUrl} onChange={e => edit(p => ({ ...p, instituicao: { ...p.instituicao, logoUrl: e.target.value } }))} placeholder="URL PNG/JPG" /></div>
          </div>
        </CardContent>
      </Card>

      {/* 9.2 Notificações */}
      <Card className="config-admin-card shadow-card border-0">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-primary" />
            <h3 className="font-semibold font-display text-foreground">Notificações do Sistema</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Preferências salvas; não representam confirmação de entrega ou execução de rotinas automáticas.</p>
          <div className="space-y-2">
            {([
              { key: 'notificarChegada', label: 'Notificar profissional quando paciente chegar' },
              { key: 'alertarFimCiclo', label: 'Alertar quando sessão próxima do fim do ciclo' },
              { key: 'alertarPtsVencer', label: 'Alertar quando PTS vencer' },
              { key: 'notificarTriagemPendente', label: 'Notificar triagem pendente antes do atendimento' },
              { key: 'resumoDiario', label: 'Resumo diário de atendimentos por e-mail' },
              { key: 'relatorioSemanal', label: 'Relatório semanal automático' },
            ] as const).map(item => (
              <div key={item.key} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                <span className="text-sm">{item.label}</span>
                <Switch checked={config.notificacoes[item.key]} disabled={saveState==="saving"||saveState==="error"} onCheckedChange={v => edit(p=>({ ...p, notificacoes: { ...p.notificacoes, [item.key]: v } }))} />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Label className="text-xs">Canal</Label>
            <Select value={config.notificacoes.canal} disabled={saveState==='saving'||saveState==='error'} onValueChange={v => edit(p=>({ ...p, notificacoes: { ...p.notificacoes, canal: v } }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sistema">Notificação no sistema</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="ambos">Ambos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 9.3 Backup */}
      <Card className="config-admin-card shadow-card border-0">
        <CardContent className="p-3 sm:p-4">
          <h3 className="font-semibold font-display text-foreground mb-4">Backup e Dados</h3>
          <p className="text-sm text-muted-foreground mb-3">A exportação JSON antiga não comprovava cobertura e não era um backup restaurável. Utilize os procedimentos protegidos da central de dados.</p>
          <Button variant="outline" className="w-full" asChild><Link to="/painel/configuracoes-avancadas?aba=dados"><Download className="w-4 h-4 mr-2"/>Abrir Gestão Operacional e Dados</Link></Button>
        </CardContent>
      </Card>

      {/* 9.4 Aparência */}
      <Card className="config-admin-card shadow-card border-0">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-5 h-5 text-primary" />
            <h3 className="font-semibold font-display text-foreground">Aparência</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Preferências institucionais cadastradas. O tema pessoal continua independente; esta tela não força alterações em todos os dispositivos.</p>
          <div className="rounded-lg border p-3 mb-3 flex items-center gap-3"><div className="w-10 h-10 rounded-lg border" style={{backgroundColor:/^#[0-9a-fA-F]{6}$/.test(config.aparencia.corPrimaria)?config.aparencia.corPrimaria:DEFAULT.aparencia.corPrimaria}}/><div><p className="text-sm font-medium">Prévia da cor selecionada</p><p className="text-xs text-muted-foreground">Amostra local — não altera o tema do sistema.</p></div></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tema</Label>
              <Select value={config.aparencia.tema} disabled={saveState==='saving'||saveState==='error'} onValueChange={v => edit(p=>({ ...p, aparencia: { ...p.aparencia, tema: v } }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="claro">Claro</SelectItem>
                  <SelectItem value="escuro">Escuro</SelectItem>
                  <SelectItem value="sistema">Sistema</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Cor primária institucional</Label>
              <div className="flex gap-2">
                <Input type="color" value={/^#[0-9a-fA-F]{6}$/.test(config.aparencia.corPrimaria)?config.aparencia.corPrimaria:DEFAULT.aparencia.corPrimaria} onChange={e => edit(p=>({ ...p, aparencia: { ...p.aparencia, corPrimaria: e.target.value } }))} className="w-12 h-9 p-0.5" />
                <Input value={config.aparencia.corPrimaria} onChange={e => edit(p => ({ ...p, aparencia: { ...p.aparencia, corPrimaria: e.target.value } }))} className="h-9 flex-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Tamanho da fonte</Label>
              <Select value={config.aparencia.tamanhoFonte} disabled={saveState==='saving'||saveState==='error'} onValueChange={v => edit(p=>({ ...p, aparencia: { ...p.aparencia, tamanhoFonte: v } }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pequeno">Pequeno</SelectItem>
                  <SelectItem value="medio">Médio</SelectItem>
                  <SelectItem value="grande">Grande</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 9.5 Conformidade LGPD */}
      <Card className="config-admin-card shadow-card border-0">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="font-semibold font-display text-foreground">Termos e Conformidade (LGPD)</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Parâmetros administrativos. Salvar esta seção não comprova conformidade legal nem executa retenção, exclusão ou anonimização. Valide a política com a equipe responsável.</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
              <span className="text-sm">Exibir aviso de LGPD no primeiro acesso</span>
              <Switch checked={config.conformidade.exibirAvisoLgpd} disabled={saveState==='saving'||saveState==='error'} onCheckedChange={v => edit(p=>({ ...p, conformidade: { ...p.conformidade, exibirAvisoLgpd: v } }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Retenção de dados (anos)</Label>
                <Input type="number" min={1} value={config.conformidade.retencaoDados} onChange={e => edit(p => ({ ...p, conformidade: { ...p.conformidade, retencaoDados: Number(e.target.value) } }))} className="h-9" />
                <p className="text-[10px] text-muted-foreground">Parâmetro cadastrado; não autoriza descarte.</p>
              </div>
              <div><Label className="text-xs">Anonimizar após inatividade (anos)</Label>
                <Input type="number" min={1} value={config.conformidade.anonimizarApos} onChange={e => edit(p => ({ ...p, conformidade: { ...p.conformidade, anonimizarApos: Number(e.target.value) } }))} className="h-9" />
              </div>
            </div>
            <div>
              <Label>Texto da Política de Privacidade</Label>
              <Textarea value={config.conformidade.lgpdTexto} onChange={e => edit(p => ({ ...p, conformidade: { ...p.conformidade, lgpdTexto: e.target.value } }))} className="min-h-[150px]" />
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={!dirty||saveState==="saving"} onClick={()=>{if(window.confirm("Descartar rascunho local?")){setConfig(confirmed);if(saveState!=="error")setSaveState("idle");}}}>Descartar rascunho</Button><Button disabled={!dirty||saveState==="saving"||saveState==="error"} onClick={()=>void save()}>Salvar alterações</Button></div>
      </fieldset>
    </div>
  );
};

export default ConfigSistema;

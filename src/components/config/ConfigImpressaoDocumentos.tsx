import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdministrativeConfigSection } from '@/hooks/useProntuarioSettings';
import { configObject } from '@/lib/configSectionGuard';
import { printSettingError, logoExtension, legacyPrintHeader } from '@/lib/adminPrintSettings';
import DOMPurify from 'dompurify';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload, ImageIcon, Trash2, Eye, FileText } from 'lucide-react';
import TemplateEditor from '@/components/TemplateEditor';
import CarimboConfig from '@/components/CarimboConfig';
import { toast } from 'sonner';
import { Slider } from '@/components/ui/slider';
import {
  invalidateDocumentConfigCache,
  buildDocumentShell,
  DEFAULT_CONFIG, type DocumentConfig, type LogoSlotConfig,
} from '@/lib/printLayout';

const CONFIG_KEY = 'config_impressao';

interface ImpressaoConfig extends DocumentConfig {
  receituario: { titulo: string; mostrarProntuario: boolean; mostrarConvenio: boolean; mostrarNascimento: boolean; mostrarAssinatura: boolean; rodape: string };
  solicitacaoExames: { titulo: string; mostrarCodigoSus: boolean; mostrarIndicacao: boolean; mostrarAssinatura: boolean; rodape: string };
  relatorioEvolucao: { habilitado: boolean; camposVisiveis: string[]; historicoSessoes: number };
  termoConsentimento: { habilitado: boolean; texto: string };
}

const DEFAULT: ImpressaoConfig = {
  ...DEFAULT_CONFIG,
  receituario: { titulo: 'RECEITUÁRIO MÉDICO', mostrarProntuario: true, mostrarConvenio: true, mostrarNascimento: false, mostrarAssinatura: true, rodape: '' },
  solicitacaoExames: { titulo: 'SOLICITAÇÃO DE EXAMES', mostrarCodigoSus: true, mostrarIndicacao: true, mostrarAssinatura: true, rodape: '' },
  relatorioEvolucao: { habilitado: true, camposVisiveis: ['subjetivo', 'objetivo', 'avaliacao', 'plano'], historicoSessoes: 5 },
  termoConsentimento: { habilitado: false, texto: '' },
};

const ConfigImpressaoDocumentos: React.FC = () => {
  const [config, setConfig] = useState<ImpressaoConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveState,setSaveState] = useState<'idle'|'draft'|'saving'|'saved'|'error'>('idle');
  const revision = useRef(0);
  const pendingWrites=useRef(0);
  const confirmed = useRef<ImpressaoConfig>(DEFAULT);
  const draft = useRef<ImpressaoConfig>(DEFAULT);
  const uploadLock = useRef(false);
  const {user} = useAuth();
  const {load,save:writeSection} = useAdministrativeConfigSection(CONFIG_KEY);
  const [uploading, setUploading] = useState<'esquerda' | 'central' | 'direita' | null>(null);
  const refLeft = useRef<HTMLInputElement>(null);
  const refCenter = useRef<HTMLInputElement>(null);
  const refRight = useRef<HTMLInputElement>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);setLoadFailed(false);setSaveState('idle');
    try {
    const raw = await load();
    const cfg = raw === undefined ? undefined : configObject(raw) as Partial<ImpressaoConfig> & {cabecalho?: Partial<ImpressaoConfig> & {logoUrl?:string}};
    let loaded: ImpressaoConfig = DEFAULT;
    if (cfg) {
      const headerOld: Partial<ImpressaoConfig> & {logoUrl?:string} = cfg.cabecalho ?? {};
      const centralLegado = cfg.mostrarLogoCentral ?? headerOld.mostrarLogoCentral ?? false;
      const lc: Partial<ImpressaoConfig['logosConfig']> = cfg.logosConfig || {};
      loaded = {
        ...DEFAULT,
        ...cfg,
        logoEsquerda: cfg.logoEsquerda ?? headerOld.logoEsquerda ?? headerOld.logoUrl ?? '',
        logoCentral: cfg.logoCentral ?? headerOld.logoCentral ?? '',
        logoDireita: cfg.logoDireita ?? headerOld.logoDireita ?? '',
        mostrarLogoCentral: centralLegado,
        logosConfig: {
          esquerda: { ...DEFAULT.logosConfig.esquerda, ...(lc.esquerda || {}) },
          central: { ...DEFAULT.logosConfig.central, ativo: centralLegado, ...(lc.central || {}) },
          direita: { ...DEFAULT.logosConfig.direita, ...(lc.direita || {}) },
        },
        linha1: cfg.linha1 ?? headerOld.linha1 ?? DEFAULT.linha1,
        linha2: cfg.linha2 ?? headerOld.linha2 ?? DEFAULT.linha2,
        linha3: cfg.linha3 ?? headerOld.linha3 ?? '',
        linha4: cfg.linha4 ?? headerOld.linha4 ?? '',
        tipografia: { ...DEFAULT.tipografia, ...(cfg.tipografia || {}) },
        margens: { ...DEFAULT.margens, ...(cfg.margens || {}) },
        receituario: {...DEFAULT.receituario,...cfg.receituario},
        solicitacaoExames: {...DEFAULT.solicitacaoExames,...cfg.solicitacaoExames},
        relatorioEvolucao: {...DEFAULT.relatorioEvolucao,...cfg.relatorioEvolucao},
        termoConsentimento: {...DEFAULT.termoConsentimento,...cfg.termoConsentimento},
      };
    }
    confirmed.current = loaded; draft.current = loaded; setConfig(loaded);
    } catch { setLoadFailed(true); }
    finally { setLoading(false); }
  }, [load]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const setDraft = (updated: ImpressaoConfig) => {
    draft.current=updated; setConfig(updated); setSaveState('draft'); revision.current++;
  };
  const save = async (updated: ImpressaoConfig):Promise<boolean> => {
    if(loadFailed||loading)return false;
    setDraft(updated);
    const sequence=revision.current;
    const validation=printSettingError(updated,confirmed.current);
    if(validation){setSaveState('error');toast.error(validation);return false;}
    pendingWrites.current++;setSaving(true);setSaveState('saving');
    let ok=false;
    try {
      ok=await writeSection(previous=>{
        const old=previous===undefined?{}:configObject(previous);
        const oldHeader=old.cabecalho&&typeof old.cabecalho==='object'&&!Array.isArray(old.cabecalho)?configObject(old.cabecalho):{};
        return {...old,...updated,cabecalho:legacyPrintHeader(updated,oldHeader)};
      });
      if(ok){confirmed.current=updated;invalidateDocumentConfigCache();}
    }catch(error){toast.error(error instanceof Error?error.message:'Gravação não confirmada.');}
    if(sequence===revision.current){setSaveState(ok?'saved':'error');if(ok)toast.success('Configuração salva');}
    pendingWrites.current--;setSaving(pendingWrites.current>0);
    return ok;
  };
  const update = <K extends keyof ImpressaoConfig>(key: K, value: ImpressaoConfig[K]) => {
    setDraft({...draft.current,[key]:value});
  };
  const updateNested = (group: 'tipografia' | 'margens' | 'receituario' | 'solicitacaoExames' | 'relatorioEvolucao' | 'termoConsentimento', field: string, value: string | number | boolean) => {
    setDraft({...draft.current,[group]:{...draft.current[group],[field]:value}});
  };
  const saveCurrent = () => save(draft.current);

  const uploadLogo = async (file: File, slot: 'esquerda' | 'central' | 'direita') => {
    if(uploadLock.current||pendingWrites.current>0||loadFailed||loading)return;
    const ext=logoExtension(file.type);
    if(!ext||!file.size||file.size>3*1024*1024){toast.error('Selecione PNG, JPG, WebP ou SVG de até 3MB.');return;}
    uploadLock.current=true;setUploading(slot);
    try {
      const {data:auth,error:authError}=await supabase.auth.getSession();
      if(authError||!user?.authUserId||auth.session?.user.id!==user.authUserId||user.role!=='master'||user.ativo!==true)throw Error('Sessão administrativa não confirmada.');
      const path = `logo-${slot}-${crypto.randomUUID()}.${ext}`;
      const content=ext==='svg'?new Blob([DOMPurify.sanitize(await file.text(),{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:['script','foreignObject'],FORBID_ATTR:['href','xlink:href']})],{type:file.type}):file;
      const { error: uploadError } = await supabase.storage
        .from('document-logos')
        .upload(path, content, { upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('document-logos').getPublicUrl(path);
      const url = urlData.publicUrl;
      const key = slot === 'esquerda' ? 'logoEsquerda' : slot === 'central' ? 'logoCentral' : 'logoDireita';
      const updated = {
        ...draft.current,
        [key]: url,
        ...(slot === 'central' ? { mostrarLogoCentral: true } : {}),
        logosConfig: {
          ...draft.current.logosConfig,
          [slot]: { ...draft.current.logosConfig[slot], ativo: true },
        },
      } as ImpressaoConfig;
      if(await save(updated))toast.success(`Logo ${slot} atualizada`);
      else toast.warning('Imagem enviada, mas vínculo não confirmado. O rascunho permanece nesta tela.');
    } catch (e: any) {
      toast.error('Erro no upload: ' + (e.message || ''));
    }
    uploadLock.current=false;setUploading(null);
  };

  const removeLogo = async (slot: 'esquerda' | 'central' | 'direita') => {
    const key = slot === 'esquerda' ? 'logoEsquerda' : slot === 'central' ? 'logoCentral' : 'logoDireita';
    const updated = { ...draft.current, [key]: '' } as ImpressaoConfig;
    if(await save(updated))toast.success('Logo removida da configuração');
  };

  // Monta o HTML do documento de amostra usando o MESMO shell
  // que todos os documentos do sistema usam — preview, impressão e PDF
  // saem idênticos.
  const buildSampleHtml = (cfg: DocumentConfig): string => {
    const body = `
      <div class="doc-content">
        <p>Atesto para os devidos fins que o(a) paciente <strong>João da Silva</strong>, portador(a) do CPF <strong>123.456.789-00</strong>, compareceu nesta unidade de saúde na data de hoje para consulta clínica, necessitando de <strong>3 (três)</strong> dias de afastamento de suas atividades laborais.</p>
        <p>Este é um exemplo de configuração visual. Não é um documento clínico válido.</p>
      </div>
      <div class="signature" style="margin-top:60px;">
        <div class="signature-line"></div>
        <div class="name">DRA. MARIA SANTOS</div>
        <div class="role">Fisioterapia</div>
        <div class="conselho">CREFITO 12345/PA</div>
      </div>`;
    return buildDocumentShell('ATESTADO MÉDICO (EXEMPLO)', body, cfg, {
      Paciente: 'João da Silva (exemplo)',
      CPF: '123.456.789-00',
      Data: new Date().toLocaleDateString('pt-BR'),
    });
  };

  const handlePreview = () => {
    const previewWindow = window.open('', '_blank');
    if (!previewWindow) {toast.error('Permita a abertura da janela de pré-visualização.');return;}
    previewWindow.opener=null;
    const doc=previewWindow.document;
    doc.title='Pré-visualização institucional A4';
    const frame=doc.createElement('iframe');
    frame.title='Pré-visualização A4';frame.setAttribute('sandbox','');
    frame.style.cssText='width:100%;height:98vh;border:0;background:white';
    frame.srcdoc=buildSampleHtml(draft.current);
    doc.body.replaceChildren(frame);
  };

  const updateSlot = (slot: 'esquerda' | 'central' | 'direita', patch: Partial<LogoSlotConfig>) => {
    const updated: ImpressaoConfig = {
      ...draft.current,
      logosConfig: {
        ...draft.current.logosConfig,
        [slot]: { ...draft.current.logosConfig[slot], ...patch },
      },
      // mantém compat com mostrarLogoCentral antigo
      ...(slot === 'central' && patch.ativo !== undefined ? { mostrarLogoCentral: patch.ativo } : {}),
    };
    save(updated);
  };

  const renderLogoSlot = ({
    label, value, slot, inputRef,
  }: { label: string; value: string; slot: 'esquerda' | 'central' | 'direita'; inputRef: React.RefObject<HTMLInputElement> }) => {
    const slotCfg = config.logosConfig[slot];
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[13px] font-bold">{label}</Label>
          <div className="flex items-center gap-1.5">
            <Switch checked={slotCfg.ativo} onCheckedChange={v => updateSlot(slot, { ativo: v })} />
            <span className="text-[11px] text-muted-foreground">{slotCfg.ativo ? 'Ativa' : 'Oculta'}</span>
          </div>
        </div>
        <div className={`border rounded-lg p-4 bg-muted/30 flex flex-col items-center gap-3 min-h-[200px] justify-center ${!slotCfg.ativo ? 'opacity-50' : ''}`}>
          {value ? (
            <img
              src={value}
              alt={`Logo ${slot}`}
              style={{
                height: `${Math.min(slotCfg.altura, 80)}px`,
                width: slotCfg.redonda ? `${Math.min(slotCfg.altura, 80)}px` : 'auto',
                maxWidth: '160px',
                objectFit: slotCfg.redonda ? 'cover' : 'contain',
                borderRadius: slotCfg.redonda ? '50%' : 0,
                aspectRatio: slotCfg.redonda ? '1 / 1' : 'auto',
              }}
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex flex-wrap gap-2 justify-center">
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
              onChange={e => { if (e.target.files?.[0]) uploadLogo(e.target.files[0], slot); }} />
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={!!uploading||saving} className="gap-1.5">
              {uploading === slot ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              {value ? 'Substituir' : 'Upload'}
            </Button>
            {value && (
              <Button variant="ghost" size="sm" onClick={() => removeLogo(slot)} className="text-destructive gap-1.5">
                <Trash2 className="w-3 h-3" /> Remover
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-2 px-1">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] text-muted-foreground">Tamanho</Label>
            <span className="text-[11px] font-medium tabular-nums">{slotCfg.altura}px</span>
          </div>
          <Slider
            min={30} max={140} step={2}
            value={[slotCfg.altura]}
            onValueChange={([v]) => setDraft({...draft.current,logosConfig:{...draft.current.logosConfig,[slot]:{...draft.current.logosConfig[slot],altura:v}}})}
            onValueCommit={([v]) => updateSlot(slot, { altura: v })}
          />
          <div className="flex items-center gap-2 pt-1">
            <Switch checked={slotCfg.redonda} onCheckedChange={v => updateSlot(slot, { redonda: v })} />
            <Label className="text-[11px]">Logo redonda (recorte circular)</Label>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-semibold">Padrão institucional de documentos</h3><p role="status" className="text-xs text-muted-foreground">{loading?'Carregando configuração…':loadFailed?'Leitura não confirmada. Edição do layout bloqueada.':saveState==='saving'?'Salvando…':saveState==='saved'?'Gravação confirmada':saveState==='error'?'Gravação não confirmada. Rascunho mantido nesta tela.':saveState==='draft'?'Alterações ainda não confirmadas':'Configuração carregada'}</p></div>
        <div className="flex flex-wrap gap-2">{!loadFailed&&!loading&&<Button size="sm" variant="outline" disabled={saving||!!uploading} onClick={saveCurrent}>Salvar configuração</Button>}{(loadFailed||saveState==='error')&&<Button size="sm" variant="outline" disabled={saving||!!uploading} onClick={()=>{if(loadFailed||window.confirm('Descartar o rascunho e recarregar?'))void loadConfig();}}>Recarregar configuração</Button>}</div>
      </div>
      <Tabs defaultValue="cabecalho" className="w-full">
        <TabsList className="config-admin-tabs w-full overflow-x-auto flex justify-start gap-1 h-auto bg-muted/40 p-1 rounded-lg">
          <TabsTrigger value="cabecalho">Cabeçalho & Logos</TabsTrigger>
          <TabsTrigger value="tipografia">Tipografia & Margens</TabsTrigger>
          <TabsTrigger value="rodape">Rodapé</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="modelos">Modelos</TabsTrigger>
          <TabsTrigger value="carimbo">Meu Carimbo</TabsTrigger>
        </TabsList>

        {/* ============== CABEÇALHO & LOGOS ============== */}
        <TabsContent value="cabecalho" className="space-y-5 mt-5">
          {loading||loadFailed ? <p role="status" className="text-sm text-muted-foreground p-4">{loading?'Carregando…':'Recarregue a configuração antes de editar o layout.'}</p> : <fieldset disabled={!!uploading} className="space-y-5 min-w-0">
          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4 space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-semibold font-display text-foreground">3 Logos do Cabeçalho Oficial</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cada logo tem ativação, tamanho independente (30–140px) e opção de recorte redondo. Quando há 1 logo, ela é centralizada; com 2 ou 3, são distribuídas igualmente. Este padrão é aplicado a todos os documentos do sistema (atestado, receituário, exames, prontuário, encaminhamento, relatórios, etc).
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handlePreview} className="gap-1.5">
                  <Eye className="w-4 h-4" /> Pré-visualizar A4
                </Button>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border p-3 bg-muted/30">
                <div>
                  <Label className="text-sm font-medium">Exibir logos no cabeçalho oficial</Label>
                  <p className="text-xs text-muted-foreground">Quando desativado, nenhuma logo (esquerda, central ou direita) aparecerá nos documentos impressos — apenas o bloco institucional em texto.</p>
                </div>
                <Switch
                  checked={config.mostrarLogos !== false}
                  onCheckedChange={v => save({ ...draft.current, mostrarLogos: v })}
                />
              </div>
              <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${config.mostrarLogos === false ? 'opacity-50 pointer-events-none' : ''}`}>
                {renderLogoSlot({label:'Logo Esquerda',value:config.logoEsquerda,slot:'esquerda',inputRef:refLeft})}
                {renderLogoSlot({label:'Logo Central',value:config.logoCentral,slot:'central',inputRef:refCenter})}
                {renderLogoSlot({label:'Logo Direita',value:config.logoDireita,slot:'direita',inputRef:refRight})}
              </div>
            </CardContent>
          </Card>


          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4 space-y-3">
              <h3 className="font-semibold font-display text-foreground">Bloco Institucional (até 4 linhas)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><Label>Linha 1 — Secretaria</Label><Input value={config.linha1} onChange={e => update('linha1', e.target.value)} onBlur={saveCurrent} /></div>
                <div><Label>Linha 2 — Unidade/Centro</Label><Input value={config.linha2} onChange={e => update('linha2', e.target.value)} onBlur={saveCurrent} /></div>
                <div><Label>Linha 3 — Subtítulo (opcional)</Label><Input value={config.linha3} onChange={e => update('linha3', e.target.value)} onBlur={saveCurrent} placeholder="Ex.: CER II - ORIXIMINÁ" /></div>
                <div><Label>Linha 4 — Endereço/Contato (opcional)</Label><Input value={config.linha4} onChange={e => update('linha4', e.target.value)} onBlur={saveCurrent} placeholder="Ex.: Rua X, nº 000 — (93) 0000-0000" /></div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Switch checked={config.mostrarLinhaDivisoria} onCheckedChange={v => save({ ...draft.current, mostrarLinhaDivisoria: v })} />
                <Label className="text-sm">Linha divisória abaixo do cabeçalho</Label>
              </div>
            </CardContent>
          </Card>

          {/* Preview A4 ao vivo — usa o MESMO shell de impressão para fidelidade total */}
          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold font-display text-foreground flex items-center gap-2"><FileText className="w-4 h-4" /> Preview do Documento (A4)</h3>
                <span className="text-[11px] text-muted-foreground">Amostra do layout atual</span>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 overflow-auto">
                <iframe
                  title="Preview institucional A4"
                  sandbox=""
                  srcDoc={buildSampleHtml(config)}
                  style={{ width: '210mm', minHeight: '297mm', border: '1px solid hsl(var(--border))', background: '#fff', display: 'block', margin: '0 auto' }}
                />
              </div>
            </CardContent>
          </Card>
        </fieldset>}
        </TabsContent>


        {/* ============== TIPOGRAFIA & MARGENS ============== */}
        <TabsContent value="tipografia" className="space-y-5 mt-5">
          {loading||loadFailed ? <p role="status" className="text-sm text-muted-foreground p-4">{loading?'Carregando…':'Recarregue a configuração antes de editar o layout.'}</p> : <fieldset disabled={!!uploading} className="space-y-5 min-w-0">
          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4 space-y-4">
              <h3 className="font-semibold font-display text-foreground">Tipografia</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <Label>Fonte</Label>
                  <Select value={config.tipografia.fonte} onValueChange={v => { updateNested('tipografia', 'fonte', v); save({ ...draft.current, tipografia: { ...draft.current.tipografia, fonte: v } }); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Arial">Arial</SelectItem>
                      <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                      <SelectItem value="Calibri">Calibri</SelectItem>
                      <SelectItem value="Inter">Inter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tamanho do corpo (pt)</Label>
                  <Select value={String(config.tipografia.tamanhoBase)} onValueChange={v => save({ ...draft.current, tipografia: { ...draft.current.tipografia, tamanhoBase: parseInt(v) } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[10, 11, 12, 13, 14].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tamanho do título (pt)</Label>
                  <Select value={String(config.tipografia.tamanhoTitulo)} onValueChange={v => save({ ...draft.current, tipografia: { ...draft.current.tipografia, tamanhoTitulo: parseInt(v) } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[12, 14, 16, 18, 20].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Espaçamento entre linhas</Label>
                  <Select value={String(config.tipografia.espacamento)} onValueChange={v => save({ ...draft.current, tipografia: { ...draft.current.tipografia, espacamento: parseFloat(v) } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Simples</SelectItem>
                      <SelectItem value="1.15">1,15</SelectItem>
                      <SelectItem value="1.5">1,5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Alinhamento do texto</Label>
                  <Select value={config.tipografia.alinhamento} onValueChange={v => save({ ...draft.current, tipografia: { ...draft.current.tipografia, alinhamento: v as any } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="justify">Justificado</SelectItem>
                      <SelectItem value="left">Esquerda</SelectItem>
                      <SelectItem value="center">Centralizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4 space-y-4">
              <h3 className="font-semibold font-display text-foreground">Margens A4 (mm)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(['superior', 'inferior', 'esquerda', 'direita'] as const).map(side => (
                  <div key={side}>
                    <Label className="capitalize">{side}</Label>
                    <Input type="number" min={5} max={50} value={config.margens[side]}
                      onChange={e => updateNested('margens', side, parseInt(e.target.value) || 20)}
                      onBlur={saveCurrent} />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Sugestão ABNT: superior 20, inferior 20, esquerda 25, direita 20.</p>
            </CardContent>
          </Card>
        </fieldset>}
        </TabsContent>

        {/* ============== RODAPÉ ============== */}
        <TabsContent value="rodape" className="space-y-5 mt-5">
          {loading||loadFailed ? <p role="status" className="text-sm text-muted-foreground p-4">{loading?'Carregando…':'Recarregue a configuração antes de editar o layout.'}</p> : <fieldset disabled={!!uploading} className="space-y-5 min-w-0">
          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold font-display text-foreground">Rodapé Institucional</h3>
                <div className="flex items-center gap-2">
                  <Switch checked={config.mostrarRodape} onCheckedChange={v => save({ ...draft.current, mostrarRodape: v })} />
                  <Label className="text-sm">Exibir rodapé</Label>
                </div>
              </div>
              <div><Label>Texto adicional do rodapé</Label><Input value={config.rodapeTexto} onChange={e => update('rodapeTexto', e.target.value)} onBlur={saveCurrent} placeholder="Ex.: CNES 1234567 · Telefone (93) 0000-0000" /></div>
              <div><Label>Endereço (linha final)</Label><Input value={config.rodapeEndereco} onChange={e => update('rodapeEndereco', e.target.value)} onBlur={saveCurrent} /></div>
            </CardContent>
          </Card>
        </fieldset>}
        </TabsContent>

        {/* ============== DOCUMENTOS (configs por tipo) ============== */}
        <TabsContent value="documentos" className="space-y-5 mt-5">
          {loading||loadFailed ? <p role="status" className="text-sm text-muted-foreground p-4">{loading?'Carregando…':'Recarregue a configuração antes de editar o layout.'}</p> : <fieldset disabled={!!uploading} className="space-y-5 min-w-0">
          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4 space-y-3">
              <h3 className="font-semibold font-display text-foreground">Receituário</h3>
              <div><Label>Título</Label><Input value={config.receituario.titulo} onChange={e => updateNested('receituario', 'titulo', e.target.value)} onBlur={saveCurrent} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { key: 'mostrarProntuario', label: 'Nº do prontuário' },
                  { key: 'mostrarConvenio', label: 'Convênio' },
                  { key: 'mostrarNascimento', label: 'Data de nascimento' },
                  { key: 'mostrarAssinatura', label: 'Campo de assinatura' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                    <span className="text-sm">{item.label}</span>
                    <Switch checked={(config.receituario as any)[item.key]} onCheckedChange={v => save({ ...draft.current, receituario: { ...draft.current.receituario, [item.key]: v } })} />
                  </div>
                ))}
              </div>
              <div><Label>Rodapé personalizado</Label><Input value={config.receituario.rodape} onChange={e => updateNested('receituario', 'rodape', e.target.value)} onBlur={saveCurrent} /></div>
            </CardContent>
          </Card>

          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4 space-y-3">
              <h3 className="font-semibold font-display text-foreground">Solicitação de Exames</h3>
              <div><Label>Título</Label><Input value={config.solicitacaoExames.titulo} onChange={e => updateNested('solicitacaoExames', 'titulo', e.target.value)} onBlur={saveCurrent} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { key: 'mostrarCodigoSus', label: 'Código SUS' },
                  { key: 'mostrarIndicacao', label: 'Indicação clínica' },
                  { key: 'mostrarAssinatura', label: 'Campo de assinatura' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                    <span className="text-sm">{item.label}</span>
                    <Switch checked={(config.solicitacaoExames as any)[item.key]} onCheckedChange={v => save({ ...draft.current, solicitacaoExames: { ...draft.current.solicitacaoExames, [item.key]: v } })} />
                  </div>
                ))}
              </div>
              <div><Label>Rodapé personalizado</Label><Input value={config.solicitacaoExames.rodape} onChange={e => updateNested('solicitacaoExames', 'rodape', e.target.value)} onBlur={saveCurrent} /></div>
            </CardContent>
          </Card>

          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold font-display text-foreground">Relatório de Evolução</h3>
                <Switch checked={config.relatorioEvolucao.habilitado} onCheckedChange={v => save({ ...draft.current, relatorioEvolucao: { ...draft.current.relatorioEvolucao, habilitado: v } })} />
              </div>
              <div>
                <Label>Histórico de quantas sessões</Label>
                <Input type="number" min={1} max={50} value={config.relatorioEvolucao.historicoSessoes} onChange={e => updateNested('relatorioEvolucao', 'historicoSessoes', parseInt(e.target.value) || 5)} onBlur={saveCurrent} className="w-24" />
              </div>
            </CardContent>
          </Card>

          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold font-display text-foreground">Termo de Consentimento</h3>
                  <p className="text-xs text-muted-foreground">Exigir na primeira consulta</p>
                </div>
                <Switch checked={config.termoConsentimento.habilitado} onCheckedChange={v => save({ ...draft.current, termoConsentimento: { ...draft.current.termoConsentimento, habilitado: v } })} />
              </div>
              {config.termoConsentimento.habilitado && (
                <div>
                  <Label>Texto do Termo</Label>
                  <Textarea value={config.termoConsentimento.texto} onChange={e => updateNested('termoConsentimento', 'texto', e.target.value)} onBlur={saveCurrent} className="min-h-[200px]" placeholder="Eu, paciente acima identificado, declaro que..." />
                </div>
              )}
            </CardContent>
          </Card>
        </fieldset>}
        </TabsContent>

        {/* ============== MODELOS ============== */}
        <TabsContent value="modelos" className="mt-5">
          <TemplateEditor />
        </TabsContent>

        {/* ============== CARIMBO PROFISSIONAL ============== */}
        <TabsContent value="carimbo" className="mt-5">
          <CarimboConfig />
        </TabsContent>
      </Tabs>

      {saving && <div className="fixed bottom-4 right-4 bg-card border shadow-lg rounded-lg px-3 py-2 text-xs flex items-center gap-2 z-50"><Loader2 className="w-3 h-3 animate-spin" /> Salvando...</div>}
      <Separator />
    </div>
  );
};

export default ConfigImpressaoDocumentos;

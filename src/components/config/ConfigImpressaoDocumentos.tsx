import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import ModelosDocumentos from '@/components/ModelosDocumentos';
import CarimboConfig from '@/components/CarimboConfig';
import { toast } from 'sonner';
import {
  invalidateDocumentConfigCache, loadDocumentConfig,
  docHeader, docFooter, buildInstitutionalCSS, docMeta,
  DEFAULT_CONFIG, type DocumentConfig,
} from '@/lib/printLayout';
import logoSmsFallback from '@/assets/logo-sms-oriximina.jpeg';
import logoCerFallback from '@/assets/logo-cer-ii.png';

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
  const [uploading, setUploading] = useState<'esquerda' | 'central' | 'direita' | null>(null);
  const refLeft = useRef<HTMLInputElement>(null);
  const refCenter = useRef<HTMLInputElement>(null);
  const refRight = useRef<HTMLInputElement>(null);

  const loadConfig = useCallback(async () => {
    const { data } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
    const cfg = (data?.configuracoes as any)?.[CONFIG_KEY];
    if (cfg) {
      // Backward compat: cabecalho.* antigo
      const headerOld = cfg.cabecalho || {};
      setConfig({
        ...DEFAULT,
        ...cfg,
        logoEsquerda: cfg.logoEsquerda ?? headerOld.logoEsquerda ?? headerOld.logoUrl ?? '',
        logoCentral: cfg.logoCentral ?? headerOld.logoCentral ?? '',
        logoDireita: cfg.logoDireita ?? headerOld.logoDireita ?? '',
        mostrarLogoCentral: cfg.mostrarLogoCentral ?? headerOld.mostrarLogoCentral ?? false,
        linha1: cfg.linha1 ?? headerOld.linha1 ?? DEFAULT.linha1,
        linha2: cfg.linha2 ?? headerOld.linha2 ?? DEFAULT.linha2,
        linha3: cfg.linha3 ?? headerOld.linha3 ?? '',
        linha4: cfg.linha4 ?? headerOld.linha4 ?? '',
        tipografia: { ...DEFAULT.tipografia, ...(cfg.tipografia || {}) },
        margens: { ...DEFAULT.margens, ...(cfg.margens || {}) },
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const save = async (updated: ImpressaoConfig) => {
    setSaving(true);
    try {
      const { data: existing } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
      const existingConfig = (existing?.configuracoes as any) || {};
      // Mantém cabecalho legado para retrocompatibilidade com leituras antigas
      const payload = {
        ...updated,
        cabecalho: {
          linha1: updated.linha1,
          linha2: updated.linha2,
          linha3: updated.linha3,
          linha4: updated.linha4,
          logoEsquerda: updated.logoEsquerda,
          logoCentral: updated.logoCentral,
          logoDireita: updated.logoDireita,
          mostrarLogoCentral: updated.mostrarLogoCentral,
        },
      };
      await supabase.from('system_config').upsert({
        id: 'default',
        configuracoes: { ...existingConfig, [CONFIG_KEY]: payload },
        updated_at: new Date().toISOString(),
      });
      setConfig(updated);
      invalidateDocumentConfigCache();
      toast.success('Configuração salva');
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + (e.message || ''));
    }
    setSaving(false);
  };

  const update = <K extends keyof ImpressaoConfig>(key: K, value: ImpressaoConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };
  const updateNested = (group: 'tipografia' | 'margens' | 'receituario' | 'solicitacaoExames' | 'relatorioEvolucao' | 'termoConsentimento', field: string, value: any) => {
    setConfig(prev => ({ ...prev, [group]: { ...(prev as any)[group], [field]: value } }));
  };
  const saveCurrent = () => save(config);

  const uploadLogo = async (file: File, slot: 'esquerda' | 'central' | 'direita') => {
    if (file.size > 3 * 1024 * 1024) { toast.error('Imagem deve ter no máximo 3MB'); return; }
    setUploading(slot);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `logo-${slot}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('document-logos')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('document-logos').getPublicUrl(path);
      const url = urlData.publicUrl;
      const key = slot === 'esquerda' ? 'logoEsquerda' : slot === 'central' ? 'logoCentral' : 'logoDireita';
      const updated = { ...config, [key]: url, ...(slot === 'central' ? { mostrarLogoCentral: true } : {}) } as ImpressaoConfig;
      await save(updated);
      toast.success(`Logo ${slot} atualizada`);
    } catch (e: any) {
      toast.error('Erro no upload: ' + (e.message || ''));
    }
    setUploading(null);
  };

  const removeLogo = async (slot: 'esquerda' | 'central' | 'direita') => {
    const key = slot === 'esquerda' ? 'logoEsquerda' : slot === 'central' ? 'logoCentral' : 'logoDireita';
    const updated = { ...config, [key]: '' } as ImpressaoConfig;
    await save(updated);
    toast.success('Logo removida');
  };

  const handlePreview = async () => {
    const cfg = await loadDocumentConfig();
    const previewWindow = window.open('', '_blank');
    if (!previewWindow) return;
    const css = buildInstitutionalCSS(cfg);
    const meta = docMeta({ Paciente: 'João da Silva (exemplo)', CPF: '123.456.789-00', Data: new Date().toLocaleDateString('pt-BR') });
    const body = `
      <div class="doc-content">
        <p>Atesto para os devidos fins que o(a) paciente <strong>João da Silva</strong>, portador(a) do CPF <strong>123.456.789-00</strong>, compareceu nesta unidade de saúde na data de hoje para consulta clínica, necessitando de <strong>3 (três)</strong> dias de afastamento de suas atividades laborais.</p>
        <p>Este documento é uma pré-visualização do layout institucional padrão.</p>
      </div>
      <div class="signature" style="margin-top:60px;">
        <div class="signature-line"></div>
        <div class="name">DRA. MARIA SANTOS</div>
        <div class="role">Fisioterapia</div>
        <div class="conselho">CREFITO 12345/PA</div>
      </div>
    `;
    previewWindow.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Pré-visualização</title>${css}</head><body>${docHeader('ATESTADO MÉDICO', cfg)}${meta}${body}${docFooter(cfg)}</body></html>`);
    previewWindow.document.close();
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  // Preview A4 (proporção 1:1.414, escala visual)
  const previewLogoLeft = config.logoEsquerda || (logoSmsFallback as string);
  const previewLogoRight = config.logoDireita || (logoCerFallback as string);

  const LogoSlot = ({
    label, value, slot, inputRef,
  }: { label: string; value: string; slot: 'esquerda' | 'central' | 'direita'; inputRef: React.RefObject<HTMLInputElement> }) => (
    <div className="space-y-2">
      <Label className="text-[13px] font-bold">{label}</Label>
      <div className="border rounded-lg p-4 bg-muted/30 flex flex-col items-center gap-3 min-h-[160px] justify-center">
        {value ? (
          <img src={value} alt={`Logo ${slot}`} className="max-h-20 max-w-[160px] object-contain" />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex flex-wrap gap-2 justify-center">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={e => { if (e.target.files?.[0]) uploadLogo(e.target.files[0], slot); }} />
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading === slot} className="gap-1.5">
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
    </div>
  );

  return (
    <div className="space-y-6">
      <Tabs defaultValue="cabecalho" className="w-full">
        <TabsList className="w-full overflow-x-auto flex justify-start gap-1 h-auto bg-muted/40 p-1 rounded-lg">
          <TabsTrigger value="cabecalho">Cabeçalho & Logos</TabsTrigger>
          <TabsTrigger value="tipografia">Tipografia & Margens</TabsTrigger>
          <TabsTrigger value="rodape">Rodapé</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="modelos">Modelos</TabsTrigger>
          <TabsTrigger value="carimbo">Meu Carimbo</TabsTrigger>
        </TabsList>

        {/* ============== CABEÇALHO & LOGOS ============== */}
        <TabsContent value="cabecalho" className="space-y-5 mt-5">
          <Card className="shadow-card border-0">
            <CardContent className="p-5 space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-semibold font-display text-foreground">3 Logos do Cabeçalho Oficial</h3>
                  <p className="text-xs text-muted-foreground mt-1">Esquerda · Central (acima do texto) · Direita. Imagens preservam proporção (object-fit: contain).</p>
                </div>
                <Button variant="outline" size="sm" onClick={handlePreview} className="gap-1.5">
                  <Eye className="w-4 h-4" /> Pré-visualizar A4
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <LogoSlot label="Logo Esquerda" value={config.logoEsquerda} slot="esquerda" inputRef={refLeft} />
                <LogoSlot label="Logo Central (acima do texto)" value={config.logoCentral} slot="central" inputRef={refCenter} />
                <LogoSlot label="Logo Direita" value={config.logoDireita} slot="direita" inputRef={refRight} />
              </div>
              <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-lg">
                <Switch checked={config.mostrarLogoCentral} onCheckedChange={v => save({ ...config, mostrarLogoCentral: v })} />
                <Label className="text-sm">Exibir logo central acima do texto institucional</Label>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card border-0">
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold font-display text-foreground">Bloco Institucional (até 4 linhas)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><Label>Linha 1 — Secretaria</Label><Input value={config.linha1} onChange={e => update('linha1', e.target.value)} onBlur={saveCurrent} /></div>
                <div><Label>Linha 2 — Unidade/Centro</Label><Input value={config.linha2} onChange={e => update('linha2', e.target.value)} onBlur={saveCurrent} /></div>
                <div><Label>Linha 3 — Subtítulo (opcional)</Label><Input value={config.linha3} onChange={e => update('linha3', e.target.value)} onBlur={saveCurrent} placeholder="Ex.: CER II - ORIXIMINÁ" /></div>
                <div><Label>Linha 4 — Endereço/Contato (opcional)</Label><Input value={config.linha4} onChange={e => update('linha4', e.target.value)} onBlur={saveCurrent} placeholder="Ex.: Rua X, nº 000 — (93) 0000-0000" /></div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Switch checked={config.mostrarLinhaDivisoria} onCheckedChange={v => save({ ...config, mostrarLinhaDivisoria: v })} />
                <Label className="text-sm">Linha divisória abaixo do cabeçalho</Label>
              </div>
            </CardContent>
          </Card>

          {/* Preview A4 ao vivo */}
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold font-display text-foreground flex items-center gap-2"><FileText className="w-4 h-4" /> Preview do Cabeçalho (A4)</h3>
                <span className="text-[11px] text-muted-foreground">Visualização aproximada</span>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 overflow-x-auto">
                <div className="mx-auto bg-white shadow-md border" style={{ width: '210mm', minHeight: '120mm', padding: `${config.margens.superior}mm ${config.margens.direita}mm ${config.margens.inferior}mm ${config.margens.esquerda}mm`, fontFamily: config.tipografia.fonte, fontSize: `${config.tipografia.tamanhoBase}pt`, lineHeight: config.tipografia.espacamento, color: '#1a1a1a' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottom: config.mostrarLinhaDivisoria ? '2px solid #0369a1' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <img src={previewLogoLeft} alt="esq" style={{ maxHeight: 70, maxWidth: 100, objectFit: 'contain' }} />
                    </div>
                    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      {config.mostrarLogoCentral && config.logoCentral && (
                        <img src={config.logoCentral} alt="central" style={{ maxHeight: 60, maxWidth: 180, objectFit: 'contain', marginBottom: 4 }} />
                      )}
                      <div style={{ fontWeight: 700, textTransform: 'uppercase', color: '#0c4a6e', letterSpacing: 0.5, fontSize: `${Math.max(config.tipografia.tamanhoBase + 1, 12)}pt`, lineHeight: 1.25 }}>{config.linha1}</div>
                      {config.linha2 && <div style={{ color: '#334155', fontSize: `${config.tipografia.tamanhoBase}pt` }}>{config.linha2}</div>}
                      {config.linha3 && <div style={{ color: '#475569', fontSize: `${Math.max(config.tipografia.tamanhoBase - 1, 9)}pt` }}>{config.linha3}</div>}
                      {config.linha4 && <div style={{ color: '#475569', fontSize: `${Math.max(config.tipografia.tamanhoBase - 1, 9)}pt` }}>{config.linha4}</div>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <img src={previewLogoRight} alt="dir" style={{ maxHeight: 70, maxWidth: 100, objectFit: 'contain' }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: `${config.tipografia.tamanhoTitulo}pt`, margin: '10px 0 14px', padding: '6px 0', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
                    TÍTULO DO DOCUMENTO
                  </div>
                  <div style={{ textAlign: config.tipografia.alinhamento as any, color: '#334155' }}>
                    Texto do corpo do documento aparece aqui no padrão configurado de fonte, tamanho e espaçamento. Use a aba "Tipografia & Margens" para ajustar.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============== TIPOGRAFIA & MARGENS ============== */}
        <TabsContent value="tipografia" className="space-y-5 mt-5">
          <Card className="shadow-card border-0">
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold font-display text-foreground">Tipografia</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <Label>Fonte</Label>
                  <Select value={config.tipografia.fonte} onValueChange={v => { updateNested('tipografia', 'fonte', v); save({ ...config, tipografia: { ...config.tipografia, fonte: v } }); }}>
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
                  <Select value={String(config.tipografia.tamanhoBase)} onValueChange={v => save({ ...config, tipografia: { ...config.tipografia, tamanhoBase: parseInt(v) } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[10, 11, 12, 13, 14].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tamanho do título (pt)</Label>
                  <Select value={String(config.tipografia.tamanhoTitulo)} onValueChange={v => save({ ...config, tipografia: { ...config.tipografia, tamanhoTitulo: parseInt(v) } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[12, 14, 16, 18, 20].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Espaçamento entre linhas</Label>
                  <Select value={String(config.tipografia.espacamento)} onValueChange={v => save({ ...config, tipografia: { ...config.tipografia, espacamento: parseFloat(v) } })}>
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
                  <Select value={config.tipografia.alinhamento} onValueChange={v => save({ ...config, tipografia: { ...config.tipografia, alinhamento: v as any } })}>
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

          <Card className="shadow-card border-0">
            <CardContent className="p-5 space-y-4">
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
        </TabsContent>

        {/* ============== RODAPÉ ============== */}
        <TabsContent value="rodape" className="space-y-5 mt-5">
          <Card className="shadow-card border-0">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold font-display text-foreground">Rodapé Institucional</h3>
                <div className="flex items-center gap-2">
                  <Switch checked={config.mostrarRodape} onCheckedChange={v => save({ ...config, mostrarRodape: v })} />
                  <Label className="text-sm">Exibir rodapé</Label>
                </div>
              </div>
              <div><Label>Texto adicional do rodapé</Label><Input value={config.rodapeTexto} onChange={e => update('rodapeTexto', e.target.value)} onBlur={saveCurrent} placeholder="Ex.: CNES 1234567 · Telefone (93) 0000-0000" /></div>
              <div><Label>Endereço (linha final)</Label><Input value={config.rodapeEndereco} onChange={e => update('rodapeEndereco', e.target.value)} onBlur={saveCurrent} /></div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============== DOCUMENTOS (configs por tipo) ============== */}
        <TabsContent value="documentos" className="space-y-5 mt-5">
          <Card className="shadow-card border-0">
            <CardContent className="p-5 space-y-3">
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
                    <Switch checked={(config.receituario as any)[item.key]} onCheckedChange={v => save({ ...config, receituario: { ...config.receituario, [item.key]: v } })} />
                  </div>
                ))}
              </div>
              <div><Label>Rodapé personalizado</Label><Input value={config.receituario.rodape} onChange={e => updateNested('receituario', 'rodape', e.target.value)} onBlur={saveCurrent} /></div>
            </CardContent>
          </Card>

          <Card className="shadow-card border-0">
            <CardContent className="p-5 space-y-3">
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
                    <Switch checked={(config.solicitacaoExames as any)[item.key]} onCheckedChange={v => save({ ...config, solicitacaoExames: { ...config.solicitacaoExames, [item.key]: v } })} />
                  </div>
                ))}
              </div>
              <div><Label>Rodapé personalizado</Label><Input value={config.solicitacaoExames.rodape} onChange={e => updateNested('solicitacaoExames', 'rodape', e.target.value)} onBlur={saveCurrent} /></div>
            </CardContent>
          </Card>

          <Card className="shadow-card border-0">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold font-display text-foreground">Relatório de Evolução</h3>
                <Switch checked={config.relatorioEvolucao.habilitado} onCheckedChange={v => save({ ...config, relatorioEvolucao: { ...config.relatorioEvolucao, habilitado: v } })} />
              </div>
              <div>
                <Label>Histórico de quantas sessões</Label>
                <Input type="number" min={1} max={50} value={config.relatorioEvolucao.historicoSessoes} onChange={e => updateNested('relatorioEvolucao', 'historicoSessoes', parseInt(e.target.value) || 5)} onBlur={saveCurrent} className="w-24" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card border-0">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold font-display text-foreground">Termo de Consentimento</h3>
                  <p className="text-xs text-muted-foreground">Exigir na primeira consulta</p>
                </div>
                <Switch checked={config.termoConsentimento.habilitado} onCheckedChange={v => save({ ...config, termoConsentimento: { ...config.termoConsentimento, habilitado: v } })} />
              </div>
              {config.termoConsentimento.habilitado && (
                <div>
                  <Label>Texto do Termo</Label>
                  <Textarea value={config.termoConsentimento.texto} onChange={e => updateNested('termoConsentimento', 'texto', e.target.value)} onBlur={saveCurrent} className="min-h-[200px]" placeholder="Eu, paciente acima identificado, declaro que..." />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============== MODELOS ============== */}
        <TabsContent value="modelos" className="mt-5">
          <ModelosDocumentos />
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

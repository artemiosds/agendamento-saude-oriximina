import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Loader2, Upload, ImageIcon, Trash2, Eye } from 'lucide-react';
import ModelosDocumentos from '@/components/ModelosDocumentos';
import CarimboConfig from '@/components/CarimboConfig';
import { toast } from 'sonner';
import { invalidateDocumentConfigCache, loadDocumentConfig, docHeader, docFooter, buildInstitutionalCSS, docMeta } from '@/lib/printLayout';

const CONFIG_KEY = 'config_impressao';

interface ImpressaoConfig {
  cabecalho: { linha1: string; linha2: string; logoUrl: string; logoEsquerda: string; logoDireita: string };
  receituario: { titulo: string; mostrarProntuario: boolean; mostrarConvenio: boolean; mostrarNascimento: boolean; mostrarAssinatura: boolean; rodape: string };
  solicitacaoExames: { titulo: string; mostrarCodigoSus: boolean; mostrarIndicacao: boolean; mostrarAssinatura: boolean; rodape: string };
  relatorioEvolucao: { habilitado: boolean; camposVisiveis: string[]; historicoSessoes: number };
  termoConsentimento: { habilitado: boolean; texto: string };
  rodapeTexto: string;
}

const DEFAULT: ImpressaoConfig = {
  cabecalho: {
    linha1: 'SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ',
    linha2: 'CENTRO ESPECIALIZADO EM REABILITAÇÃO NÍVEL II',
    logoUrl: '',
    logoEsquerda: '',
    logoDireita: '',
  },
  receituario: { titulo: 'RECEITUÁRIO MÉDICO', mostrarProntuario: true, mostrarConvenio: true, mostrarNascimento: false, mostrarAssinatura: true, rodape: '' },
  solicitacaoExames: { titulo: 'SOLICITAÇÃO DE EXAMES', mostrarCodigoSus: true, mostrarIndicacao: true, mostrarAssinatura: true, rodape: '' },
  relatorioEvolucao: { habilitado: true, camposVisiveis: ['subjetivo', 'objetivo', 'avaliacao', 'plano'], historicoSessoes: 5 },
  termoConsentimento: { habilitado: false, texto: '' },
  rodapeTexto: '',
};

const ConfigImpressaoDocumentos: React.FC = () => {
  const [config, setConfig] = useState<ImpressaoConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLeft, setUploadingLeft] = useState(false);
  const [uploadingRight, setUploadingRight] = useState(false);
  const fileInputLeftRef = useRef<HTMLInputElement>(null);
  const fileInputRightRef = useRef<HTMLInputElement>(null);

  const loadConfig = useCallback(async () => {
    const { data } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
    const cfg = data?.configuracoes as any;
    if (cfg?.[CONFIG_KEY]) setConfig({ ...DEFAULT, ...cfg[CONFIG_KEY], cabecalho: { ...DEFAULT.cabecalho, ...cfg[CONFIG_KEY].cabecalho } });
    setLoading(false);
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const save = async (updated: ImpressaoConfig) => {
    setSaving(true);
    const { data: existing } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
    const existingConfig = (existing?.configuracoes as any) || {};
    await supabase.from('system_config').upsert({
      id: 'default',
      configuracoes: { ...existingConfig, [CONFIG_KEY]: updated },
      updated_at: new Date().toISOString(),
    });
    setConfig(updated);
    invalidateDocumentConfigCache();
    setSaving(false);
    toast.success('Configuração de impressão salva');
  };

  const update = (path: string, value: any) => {
    const parts = path.split('.');
    const updated = { ...config };
    let obj: any = updated;
    for (let i = 0; i < parts.length - 1; i++) {
      obj[parts[i]] = { ...obj[parts[i]] };
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    setConfig(updated);
  };

  const saveField = () => save(config);

  const uploadLogo = async (file: File, side: 'esquerda' | 'direita') => {
    const setUploading = side === 'esquerda' ? setUploadingLeft : setUploadingRight;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `logo-${side}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('document-logos')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('document-logos').getPublicUrl(path);
      const url = urlData.publicUrl;
      const key = side === 'esquerda' ? 'logoEsquerda' : 'logoDireita';
      const updated = { ...config, cabecalho: { ...config.cabecalho, [key]: url } };
      await save(updated);
      toast.success(`Logo ${side === 'esquerda' ? 'esquerda' : 'direita'} atualizada`);
    } catch (e: any) {
      toast.error('Erro no upload: ' + (e.message || ''));
    }
    setUploading(false);
  };

  const removeLogo = async (side: 'esquerda' | 'direita') => {
    const key = side === 'esquerda' ? 'logoEsquerda' : 'logoDireita';
    const updated = { ...config, cabecalho: { ...config.cabecalho, [key]: '' } };
    await save(updated);
    toast.success('Logo removida');
  };

  const handlePreview = async () => {
    const cfg = await loadDocumentConfig();
    const previewWindow = window.open('', '_blank');
    if (!previewWindow) return;
    const css = buildInstitutionalCSS();
    const meta = docMeta({ Paciente: 'João da Silva', CPF: '123.456.789-00', Data: new Date().toLocaleDateString('pt-BR') });
    const body = `
      <div class="doc-content">
        <div class="content-block" style="margin-top:16px;">
          <p>Atesto para os devidos fins que o(a) paciente <strong>João da Silva</strong>, portador(a) do CPF <strong>123.456.789-00</strong>, compareceu nesta unidade de saúde na data de hoje para consulta médica, necessitando de <strong>3 (três)</strong> dias de afastamento de suas atividades laborais.</p>
          <br/>
          <p>Este documento é uma pré-visualização do layout padrão dos documentos clínicos gerados pelo sistema.</p>
        </div>
        <div class="signature" style="margin-top:60px;">
          <div class="signature-line"></div>
          <div class="name">Dr. Maria Santos</div>
          <div class="role">Fisioterapia — CREFITO-12 12345/PA</div>
        </div>
      </div>
    `;
    previewWindow.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Pré-visualização</title>${css}</head><body>${docHeader('ATESTADO MÉDICO', cfg)}${meta}${body}${docFooter(cfg)}</body></html>`);
    previewWindow.document.close();
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Logos */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold font-display text-foreground">Logos dos Documentos</h3>
            <Button variant="outline" size="sm" onClick={handlePreview} className="gap-1.5">
              <Eye className="w-4 h-4" /> Pré-visualizar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Configure as duas logos que aparecerão no cabeçalho de todos os documentos clínicos. Se não configuradas, serão usadas as logos padrão do sistema.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Logo esquerda */}
            <div className="space-y-3">
              <Label className="text-[13px] font-bold">Logo Esquerda (SMS Oriximiná)</Label>
              <div className="border rounded-lg p-4 bg-muted/30 flex flex-col items-center gap-3">
                {config.cabecalho.logoEsquerda ? (
                  <img src={config.cabecalho.logoEsquerda} alt="Logo esquerda" className="max-h-16 object-contain" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex gap-2">
                  <input ref={fileInputLeftRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                    onChange={e => { if (e.target.files?.[0]) uploadLogo(e.target.files[0], 'esquerda'); }} />
                  <Button variant="outline" size="sm" onClick={() => fileInputLeftRef.current?.click()} disabled={uploadingLeft} className="gap-1.5">
                    {uploadingLeft ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    Upload
                  </Button>
                  {config.cabecalho.logoEsquerda && (
                    <Button variant="ghost" size="sm" onClick={() => removeLogo('esquerda')} className="text-destructive gap-1.5">
                      <Trash2 className="w-3 h-3" /> Remover
                    </Button>
                  )}
                </div>
              </div>
            </div>
            {/* Logo direita */}
            <div className="space-y-3">
              <Label className="text-[13px] font-bold">Logo Direita (CER II)</Label>
              <div className="border rounded-lg p-4 bg-muted/30 flex flex-col items-center gap-3">
                {config.cabecalho.logoDireita ? (
                  <img src={config.cabecalho.logoDireita} alt="Logo direita" className="max-h-16 object-contain" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex gap-2">
                  <input ref={fileInputRightRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                    onChange={e => { if (e.target.files?.[0]) uploadLogo(e.target.files[0], 'direita'); }} />
                  <Button variant="outline" size="sm" onClick={() => fileInputRightRef.current?.click()} disabled={uploadingRight} className="gap-1.5">
                    {uploadingRight ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    Upload
                  </Button>
                  {config.cabecalho.logoDireita && (
                    <Button variant="ghost" size="sm" onClick={() => removeLogo('direita')} className="text-destructive gap-1.5">
                      <Trash2 className="w-3 h-3" /> Remover
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Header Text */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <h3 className="font-semibold font-display text-foreground mb-4">Cabeçalho dos Documentos</h3>
          <div className="space-y-3">
            <div><Label>Linha 1 (nome da secretaria)</Label><Input value={config.cabecalho.linha1} onChange={e => update('cabecalho.linha1', e.target.value)} onBlur={saveField} /></div>
            <div><Label>Linha 2 (nome da unidade)</Label><Input value={config.cabecalho.linha2} onChange={e => update('cabecalho.linha2', e.target.value)} onBlur={saveField} /></div>
            <div><Label>Texto do rodapé (opcional)</Label><Input value={config.rodapeTexto} onChange={e => update('rodapeTexto', e.target.value)} onBlur={saveField} placeholder="Ex: Rua Barjonas de Miranda, S/N" /></div>
          </div>
        </CardContent>
      </Card>

      {/* Receituário */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <h3 className="font-semibold font-display text-foreground mb-4">Receituário</h3>
          <div className="space-y-3">
            <div><Label>Título do documento</Label><Input value={config.receituario.titulo} onChange={e => update('receituario.titulo', e.target.value)} onBlur={saveField} /></div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'mostrarProntuario', label: 'Nº do prontuário' },
                { key: 'mostrarConvenio', label: 'Convênio' },
                { key: 'mostrarNascimento', label: 'Data de nascimento' },
                { key: 'mostrarAssinatura', label: 'Campo de assinatura' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                  <span className="text-sm">{item.label}</span>
                  <Switch
                    checked={(config.receituario as any)[item.key]}
                    onCheckedChange={v => { update(`receituario.${item.key}`, v); save({ ...config, receituario: { ...config.receituario, [item.key]: v } }); }}
                  />
                </div>
              ))}
            </div>
            <div><Label>Rodapé personalizado</Label><Input value={config.receituario.rodape} onChange={e => update('receituario.rodape', e.target.value)} onBlur={saveField} placeholder="Texto opcional no rodapé" /></div>
          </div>
        </CardContent>
      </Card>

      {/* Solicitação de Exames */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <h3 className="font-semibold font-display text-foreground mb-4">Solicitação de Exames</h3>
          <div className="space-y-3">
            <div><Label>Título do documento</Label><Input value={config.solicitacaoExames.titulo} onChange={e => update('solicitacaoExames.titulo', e.target.value)} onBlur={saveField} /></div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'mostrarCodigoSus', label: 'Código SUS' },
                { key: 'mostrarIndicacao', label: 'Indicação clínica' },
                { key: 'mostrarAssinatura', label: 'Campo de assinatura' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                  <span className="text-sm">{item.label}</span>
                  <Switch
                    checked={(config.solicitacaoExames as any)[item.key]}
                    onCheckedChange={v => { update(`solicitacaoExames.${item.key}`, v); save({ ...config, solicitacaoExames: { ...config.solicitacaoExames, [item.key]: v } }); }}
                  />
                </div>
              ))}
            </div>
            <div><Label>Rodapé personalizado</Label><Input value={config.solicitacaoExames.rodape} onChange={e => update('solicitacaoExames.rodape', e.target.value)} onBlur={saveField} /></div>
          </div>
        </CardContent>
      </Card>

      {/* Relatório de Evolução */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold font-display text-foreground">Relatório de Evolução</h3>
            <Switch checked={config.relatorioEvolucao.habilitado} onCheckedChange={v => save({ ...config, relatorioEvolucao: { ...config.relatorioEvolucao, habilitado: v } })} />
          </div>
          <div className="space-y-3">
            <div>
              <Label>Mostrar histórico de quantas sessões</Label>
              <Input type="number" min={1} max={50} value={config.relatorioEvolucao.historicoSessoes} onChange={e => update('relatorioEvolucao.historicoSessoes', parseInt(e.target.value) || 5)} onBlur={saveField} className="w-24" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Termo de Consentimento */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold font-display text-foreground">Termo de Consentimento</h3>
              <p className="text-xs text-muted-foreground">Exigir na primeira consulta</p>
            </div>
            <Switch checked={config.termoConsentimento.habilitado} onCheckedChange={v => save({ ...config, termoConsentimento: { ...config.termoConsentimento, habilitado: v } })} />
          </div>
          {config.termoConsentimento.habilitado && (
            <div>
              <Label>Texto do Termo</Label>
              <Textarea
                value={config.termoConsentimento.texto}
                onChange={e => update('termoConsentimento.texto', e.target.value)}
                onBlur={saveField}
                className="min-h-[200px]"
                placeholder="Eu, paciente acima identificado, declaro que..."
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <ModelosDocumentos />
      <CarimboConfig />
    </div>
  );
};

export default ConfigImpressaoDocumentos;

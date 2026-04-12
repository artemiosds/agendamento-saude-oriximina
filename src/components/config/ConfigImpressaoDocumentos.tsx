import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';
import ModelosDocumentos from '@/components/ModelosDocumentos';
import CarimboConfig from '@/components/CarimboConfig';
import { toast } from 'sonner';

const CONFIG_KEY = 'config_impressao';

interface ImpressaoConfig {
  cabecalho: { linha1: string; linha2: string; logoUrl: string };
  receituario: { titulo: string; mostrarProntuario: boolean; mostrarConvenio: boolean; mostrarNascimento: boolean; mostrarAssinatura: boolean; rodape: string };
  solicitacaoExames: { titulo: string; mostrarCodigoSus: boolean; mostrarIndicacao: boolean; mostrarAssinatura: boolean; rodape: string };
  relatorioEvolucao: { habilitado: boolean; camposVisiveis: string[]; historicoSessoes: number };
  termoConsentimento: { habilitado: boolean; texto: string };
}

const DEFAULT: ImpressaoConfig = {
  cabecalho: { linha1: 'Secretaria Municipal de Saúde de Oriximiná', linha2: 'Centro Especializado em Reabilitação Nível II', logoUrl: '' },
  receituario: { titulo: 'RECEITUÁRIO MÉDICO', mostrarProntuario: true, mostrarConvenio: true, mostrarNascimento: false, mostrarAssinatura: true, rodape: '' },
  solicitacaoExames: { titulo: 'SOLICITAÇÃO DE EXAMES', mostrarCodigoSus: true, mostrarIndicacao: true, mostrarAssinatura: true, rodape: '' },
  relatorioEvolucao: { habilitado: true, camposVisiveis: ['subjetivo', 'objetivo', 'avaliacao', 'plano'], historicoSessoes: 5 },
  termoConsentimento: { habilitado: false, texto: '' },
};

const ConfigImpressaoDocumentos: React.FC = () => {
  const [config, setConfig] = useState<ImpressaoConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    const { data } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
    const cfg = data?.configuracoes as any;
    if (cfg?.[CONFIG_KEY]) setConfig({ ...DEFAULT, ...cfg[CONFIG_KEY] });
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

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <h3 className="font-semibold font-display text-foreground mb-4">Cabeçalho dos Documentos</h3>
          <div className="space-y-3">
            <div><Label>Linha 1</Label><Input value={config.cabecalho.linha1} onChange={e => update('cabecalho.linha1', e.target.value)} onBlur={saveField} /></div>
            <div><Label>Linha 2</Label><Input value={config.cabecalho.linha2} onChange={e => update('cabecalho.linha2', e.target.value)} onBlur={saveField} /></div>
            <div>
              <Label>Logo (URL)</Label>
              <Input value={config.cabecalho.logoUrl} onChange={e => update('cabecalho.logoUrl', e.target.value)} onBlur={saveField} placeholder="URL da imagem PNG/JPG" />
              <p className="text-[10px] text-muted-foreground mt-1">Aparece no canto esquerdo do cabeçalho</p>
            </div>
          </div>
        </CardContent>
      </Card>

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

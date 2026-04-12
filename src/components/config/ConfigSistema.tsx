import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, Building2, Bell, Palette, Shield } from 'lucide-react';
import { toast } from 'sonner';

const CONFIG_KEY = 'config_sistema';

interface SistemaConfig {
  instituicao: { nome: string; cer: string; cnpj: string; endereco: string; telefone: string; email: string; logoUrl: string };
  notificacoes: {
    notificarChegada: boolean; alertarFimCiclo: boolean; alertarPtsVencer: boolean;
    notificarTriagemPendente: boolean; resumoDiario: boolean; relatorioSemanal: boolean;
    canal: string;
  };
  aparencia: { tema: string; corPrimaria: string; fonte: string; tamanhoFonte: string };
  conformidade: { lgpdTexto: string; exibirAvisoLgpd: boolean; retencaoDados: number; anonimizarApos: number };
}

const DEFAULT: SistemaConfig = {
  instituicao: {
    nome: 'Secretaria Municipal de Saúde de Oriximiná',
    cer: 'Centro Especializado em Reabilitação Nível II',
    cnpj: '', endereco: '', telefone: '', email: '', logoUrl: '',
  },
  notificacoes: {
    notificarChegada: true, alertarFimCiclo: true, alertarPtsVencer: true,
    notificarTriagemPendente: true, resumoDiario: false, relatorioSemanal: false,
    canal: 'ambos',
  },
  aparencia: { tema: 'sistema', corPrimaria: '#1B3A5C', fonte: 'Inter', tamanhoFonte: 'medio' },
  conformidade: {
    lgpdTexto: 'Este sistema coleta e processa dados pessoais de saúde em conformidade com a Lei Geral de Proteção de Dados (LGPD). Os dados são utilizados exclusivamente para fins de atendimento clínico e são armazenados de forma segura.',
    exibirAvisoLgpd: true, retencaoDados: 20, anonimizarApos: 25,
  },
};

const ConfigSistema: React.FC = () => {
  const { configuracoes, updateConfiguracoes } = useData();
  const [config, setConfig] = useState<SistemaConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);

  const loadConfig = useCallback(async () => {
    const { data } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
    const cfg = data?.configuracoes as any;
    if (cfg?.[CONFIG_KEY]) setConfig({ ...DEFAULT, ...cfg[CONFIG_KEY] });
    setLoading(false);
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const save = async (updated: SistemaConfig) => {
    const { data: existing } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
    const existingConfig = (existing?.configuracoes as any) || {};
    await supabase.from('system_config').upsert({
      id: 'default',
      configuracoes: { ...existingConfig, [CONFIG_KEY]: updated },
      updated_at: new Date().toISOString(),
    });
    setConfig(updated);
    toast.success('Configuração salva');
  };

  const exportAllData = async () => {
    toast.info('Exportação iniciada...');
    const tables = ['pacientes', 'agendamentos', 'prontuarios', 'funcionarios'];
    const results: Record<string, any[]> = {};
    await Promise.all(tables.map(async t => {
      const { data } = await supabase.from(t).select('*');
      results[t] = data || [];
    }));
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('Dados exportados com sucesso');
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* 9.1 Informações da instituição */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-primary" />
            <h3 className="font-semibold font-display text-foreground">Informações da Instituição</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><Label>Nome da Instituição</Label><Input value={config.instituicao.nome} onChange={e => setConfig(p => ({ ...p, instituicao: { ...p.instituicao, nome: e.target.value } }))} onBlur={() => save(config)} /></div>
            <div className="sm:col-span-2"><Label>Nome do CER</Label><Input value={config.instituicao.cer} onChange={e => setConfig(p => ({ ...p, instituicao: { ...p.instituicao, cer: e.target.value } }))} onBlur={() => save(config)} /></div>
            <div><Label>CNPJ</Label><Input value={config.instituicao.cnpj} onChange={e => setConfig(p => ({ ...p, instituicao: { ...p.instituicao, cnpj: e.target.value } }))} onBlur={() => save(config)} /></div>
            <div><Label>Telefone</Label><Input value={config.instituicao.telefone} onChange={e => setConfig(p => ({ ...p, instituicao: { ...p.instituicao, telefone: e.target.value } }))} onBlur={() => save(config)} /></div>
            <div className="sm:col-span-2"><Label>Endereço</Label><Input value={config.instituicao.endereco} onChange={e => setConfig(p => ({ ...p, instituicao: { ...p.instituicao, endereco: e.target.value } }))} onBlur={() => save(config)} /></div>
            <div><Label>E-mail institucional</Label><Input value={config.instituicao.email} onChange={e => setConfig(p => ({ ...p, instituicao: { ...p.instituicao, email: e.target.value } }))} onBlur={() => save(config)} /></div>
            <div><Label>Logo URL</Label><Input value={config.instituicao.logoUrl} onChange={e => setConfig(p => ({ ...p, instituicao: { ...p.instituicao, logoUrl: e.target.value } }))} onBlur={() => save(config)} placeholder="URL PNG/JPG" /></div>
          </div>
        </CardContent>
      </Card>

      {/* 9.2 Notificações */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-primary" />
            <h3 className="font-semibold font-display text-foreground">Notificações do Sistema</h3>
          </div>
          <div className="space-y-2">
            {[
              { key: 'notificarChegada', label: 'Notificar profissional quando paciente chegar' },
              { key: 'alertarFimCiclo', label: 'Alertar quando sessão próxima do fim do ciclo' },
              { key: 'alertarPtsVencer', label: 'Alertar quando PTS vencer' },
              { key: 'notificarTriagemPendente', label: 'Notificar triagem pendente antes do atendimento' },
              { key: 'resumoDiario', label: 'Resumo diário de atendimentos por e-mail' },
              { key: 'relatorioSemanal', label: 'Relatório semanal automático' },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                <span className="text-sm">{item.label}</span>
                <Switch checked={(config.notificacoes as any)[item.key]} onCheckedChange={v => save({ ...config, notificacoes: { ...config.notificacoes, [item.key]: v } })} />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Label className="text-xs">Canal</Label>
            <Select value={config.notificacoes.canal} onValueChange={v => save({ ...config, notificacoes: { ...config.notificacoes, canal: v } })}>
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
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <h3 className="font-semibold font-display text-foreground mb-4">Backup e Dados</h3>
          <Button variant="outline" className="w-full" onClick={exportAllData}>
            <Download className="w-4 h-4 mr-2" /> Exportar Todos os Dados (JSON)
          </Button>
        </CardContent>
      </Card>

      {/* 9.4 Aparência */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-5 h-5 text-primary" />
            <h3 className="font-semibold font-display text-foreground">Aparência</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tema</Label>
              <Select value={config.aparencia.tema} onValueChange={v => save({ ...config, aparencia: { ...config.aparencia, tema: v } })}>
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
                <Input type="color" value={config.aparencia.corPrimaria} onChange={e => save({ ...config, aparencia: { ...config.aparencia, corPrimaria: e.target.value } })} className="w-12 h-9 p-0.5" />
                <Input value={config.aparencia.corPrimaria} onChange={e => setConfig(p => ({ ...p, aparencia: { ...p.aparencia, corPrimaria: e.target.value } }))} onBlur={() => save(config)} className="h-9 flex-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Tamanho da fonte</Label>
              <Select value={config.aparencia.tamanhoFonte} onValueChange={v => save({ ...config, aparencia: { ...config.aparencia, tamanhoFonte: v } })}>
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
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="font-semibold font-display text-foreground">Termos e Conformidade (LGPD)</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
              <span className="text-sm">Exibir aviso de LGPD no primeiro acesso</span>
              <Switch checked={config.conformidade.exibirAvisoLgpd} onCheckedChange={v => save({ ...config, conformidade: { ...config.conformidade, exibirAvisoLgpd: v } })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Retenção de dados (anos)</Label>
                <Input type="number" min={1} value={config.conformidade.retencaoDados} onChange={e => setConfig(p => ({ ...p, conformidade: { ...p.conformidade, retencaoDados: parseInt(e.target.value) || 20 } }))} onBlur={() => save(config)} className="h-9" />
                <p className="text-[10px] text-muted-foreground">Padrão: 20 anos (CFM)</p>
              </div>
              <div><Label className="text-xs">Anonimizar após inatividade (anos)</Label>
                <Input type="number" min={1} value={config.conformidade.anonimizarApos} onChange={e => setConfig(p => ({ ...p, conformidade: { ...p.conformidade, anonimizarApos: parseInt(e.target.value) || 25 } }))} onBlur={() => save(config)} className="h-9" />
              </div>
            </div>
            <div>
              <Label>Texto da Política de Privacidade</Label>
              <Textarea value={config.conformidade.lgpdTexto} onChange={e => setConfig(p => ({ ...p, conformidade: { ...p.conformidade, lgpdTexto: e.target.value } }))} onBlur={() => save(config)} className="min-h-[150px]" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConfigSistema;

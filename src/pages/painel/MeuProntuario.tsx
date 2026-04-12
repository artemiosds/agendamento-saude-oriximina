import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProntuarioConfig, getDefaultConfig, TIPOS_PRONTUARIO, BlocoConfig, ProntuarioConfigData } from '@/hooks/useProntuarioConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  Eye, EyeOff, Star, Lock, ChevronUp, ChevronDown, GripVertical,
  Settings, Save, Loader2, CheckCircle, LayoutGrid, Printer, Palette,
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MeuProntuario: React.FC = () => {
  const { user } = useAuth();
  const [tipo, setTipo] = useState('sessao');
  const { config, loading, saving, saveConfig } = useProntuarioConfig(user?.id, tipo);
  const [localConfig, setLocalConfig] = useState<ProntuarioConfigData | null>(null);
  const [activeTab, setActiveTab] = useState<'blocos' | 'visual' | 'impressao'>('blocos');

  useEffect(() => {
    if (config) setLocalConfig(JSON.parse(JSON.stringify(config)));
  }, [config]);

  const persist = useCallback((updated: ProntuarioConfigData) => {
    setLocalConfig(updated);
    saveConfig(updated);
  }, [saveConfig]);

  const updateBloco = useCallback((blocoId: string, patch: Partial<BlocoConfig>) => {
    if (!localConfig) return;
    const updated = {
      ...localConfig,
      blocos: localConfig.blocos.map(b =>
        b.id === blocoId ? { ...b, ...patch } : b
      ),
    };
    persist(updated);
  }, [localConfig, persist]);

  const moveBloco = useCallback((blocoId: string, direction: -1 | 1) => {
    if (!localConfig) return;
    const blocos = [...localConfig.blocos].sort((a, b) => a.ordem - b.ordem);
    const idx = blocos.findIndex(b => b.id === blocoId);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= blocos.length) return;
    // Swap ordens
    const tmp = blocos[idx].ordem;
    blocos[idx] = { ...blocos[idx], ordem: blocos[newIdx].ordem };
    blocos[newIdx] = { ...blocos[newIdx], ordem: tmp };
    persist({ ...localConfig, blocos });
  }, [localConfig, persist]);

  const resetToDefault = useCallback(() => {
    const defaults = getDefaultConfig(tipo);
    persist(defaults);
    toast.success('Configuração restaurada ao padrão');
  }, [tipo, persist]);

  if (!user) return null;

  const sortedBlocos = localConfig
    ? [...localConfig.blocos].sort((a, b) => a.ordem - b.ordem)
    : [];

  const tabs = [
    { id: 'blocos' as const, label: 'Blocos', icon: LayoutGrid },
    { id: 'visual' as const, label: 'Visual', icon: Palette },
    { id: 'impressao' as const, label: 'Impressão', icon: Printer },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" />
            Meu Prontuário
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Personalize a estrutura e aparência do seu prontuário clínico
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saving ? (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Salvando...
            </Badge>
          ) : localConfig ? (
            <Badge variant="outline" className="gap-1 text-green-600">
              <CheckCircle className="w-3 h-3" /> Salvo
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Type selector */}
      <div className="flex flex-wrap gap-2">
        {TIPOS_PRONTUARIO.map(t => (
          <Button
            key={t.value}
            variant={tipo === t.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTipo(t.value)}
            className="gap-1.5"
          >
            {t.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </CardContent>
        </Card>
      ) : localConfig ? (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
          {/* Sidebar tabs */}
          <div className="flex lg:flex-col gap-2">
            {tabs.map(tab => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? 'default' : 'ghost'}
                className="justify-start gap-2"
                size="sm"
                onClick={() => setActiveTab(tab.id)}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </Button>
            ))}
            <Separator className="my-2 hidden lg:block" />
            <Button variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={resetToDefault}>
              Restaurar padrão
            </Button>
          </div>

          {/* Content */}
          <div className="space-y-4">
            {activeTab === 'blocos' && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-primary" />
                    Construtor de Blocos
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Configure quais seções aparecem no prontuário, a ordem e quais ficam expandidas por padrão.
                  </p>
                </CardHeader>
                <CardContent className="space-y-1">
                  {sortedBlocos.map((bloco, idx) => (
                    <div
                      key={bloco.id}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-all',
                        bloco.visivel
                          ? 'bg-card border-border/60 hover:border-primary/30'
                          : 'bg-muted/30 border-border/30 opacity-60'
                      )}
                    >
                      {/* Drag handle (visual only) */}
                      <GripVertical className="w-4 h-4 text-muted-foreground/50 shrink-0" />

                      {/* Label */}
                      <span className={cn(
                        'text-sm font-medium flex-1 truncate',
                        !bloco.visivel && 'line-through text-muted-foreground'
                      )}>
                        {bloco.label}
                      </span>

                      {/* Badges */}
                      {bloco.obrigatorio && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">OBR</Badge>
                      )}

                      {/* Controls */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Move up */}
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          disabled={idx === 0}
                          onClick={() => moveBloco(bloco.id, -1)}
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </Button>
                        {/* Move down */}
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          disabled={idx === sortedBlocos.length - 1}
                          onClick={() => moveBloco(bloco.id, 1)}
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </Button>

                        {/* Visible toggle */}
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          disabled={bloco.obrigatorio}
                          onClick={() => updateBloco(bloco.id, { visivel: !bloco.visivel })}
                          title={bloco.visivel ? 'Ocultar' : 'Mostrar'}
                        >
                          {bloco.visivel ? <Eye className="w-3.5 h-3.5 text-primary" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </Button>

                        {/* Favorito (expanded by default) */}
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => updateBloco(bloco.id, { favorito: !bloco.favorito })}
                          title={bloco.favorito ? 'Remover dos favoritos' : 'Marcar como favorito (expandido ao abrir)'}
                        >
                          <Star className={cn('w-3.5 h-3.5', bloco.favorito ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
                        </Button>

                        {/* Obrigatório lock */}
                        {bloco.obrigatorio && (
                          <Lock className="w-3.5 h-3.5 text-muted-foreground/50" />
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {activeTab === 'visual' && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Palette className="w-4 h-4 text-primary" />
                    Preferências Visuais
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label>Densidade</Label>
                    <Select
                      value={localConfig.ui.densidade}
                      onValueChange={(v: 'confortavel' | 'compacto') =>
                        persist({ ...localConfig, ui: { ...localConfig.ui, densidade: v } })
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="confortavel">Confortável — espaçamento generoso</SelectItem>
                        <SelectItem value="compacto">Compacto — mais campos por tela</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Animações</Label>
                      <p className="text-xs text-muted-foreground">Transições suaves ao expandir blocos</p>
                    </div>
                    <Switch
                      checked={localConfig.ui.animacoes}
                      onCheckedChange={(v) =>
                        persist({ ...localConfig, ui: { ...localConfig.ui, animacoes: v } })
                      }
                    />
                  </div>

                  <div className="space-y-3">
                    <Label>Layout</Label>
                    <Select
                      value={localConfig.layout}
                      onValueChange={(v: 'padrao' | 'compacto' | 'detalhado') =>
                        persist({ ...localConfig, layout: v })
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="padrao">Padrão</SelectItem>
                        <SelectItem value="compacto">Compacto</SelectItem>
                        <SelectItem value="detalhado">Detalhado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === 'impressao' && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Printer className="w-4 h-4 text-primary" />
                    Impressão
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Cabeçalho personalizado</Label>
                    <Textarea
                      rows={2}
                      value={localConfig.impressao.cabecalho}
                      onChange={(e) =>
                        persist({
                          ...localConfig,
                          impressao: { ...localConfig.impressao, cabecalho: e.target.value },
                        })
                      }
                      placeholder="Texto no topo de cada impressão..."
                    />
                  </div>
                  <div>
                    <Label>Rodapé personalizado</Label>
                    <Textarea
                      rows={2}
                      value={localConfig.impressao.rodape}
                      onChange={(e) =>
                        persist({
                          ...localConfig,
                          impressao: { ...localConfig.impressao, rodape: e.target.value },
                        })
                      }
                      placeholder="Texto no rodapé de cada impressão..."
                    />
                  </div>
                  <Separator />
                  <div className="space-y-3">
                    {[
                      { key: 'mostrar_profissional' as const, label: 'Mostrar nome do profissional' },
                      { key: 'mostrar_conselho' as const, label: 'Mostrar número do conselho' },
                      { key: 'mostrar_logo' as const, label: 'Mostrar logo da unidade' },
                    ].map(item => (
                      <div key={item.key} className="flex items-center justify-between">
                        <Label className="font-normal">{item.label}</Label>
                        <Switch
                          checked={localConfig.impressao[item.key]}
                          onCheckedChange={(v) =>
                            persist({
                              ...localConfig,
                              impressao: { ...localConfig.impressao, [item.key]: v },
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MeuProntuario;

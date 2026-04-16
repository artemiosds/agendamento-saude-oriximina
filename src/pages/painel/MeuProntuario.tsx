import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/integrations/supabase/client';
import { useProntuarioConfig, getDefaultConfig, mergeAdminAndProfConfig, normalizeProfissao, TIPOS_PRONTUARIO, BlocoConfig, ProntuarioConfigData } from '@/hooks/useProntuarioConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Eye, EyeOff, Star, Lock, ChevronUp, ChevronDown, GripVertical,
  Settings, Loader2, CheckCircle, LayoutGrid, Printer, Palette, ShieldAlert, Info,
  Pill, FlaskConical, Ruler, Stethoscope, Plus, Search, Pencil, Trash2, X, Stamp
} from 'lucide-react';
import { cn } from '@/lib/utils';
import CarimboConfig from '@/components/CarimboConfig';

// ── Escalas clínicas disponíveis ──
const ESCALAS_DISPONIVEIS = [
  { id: 'eva', nome: 'EVA — Escala Visual Analógica de Dor' },
  { id: 'mrc', nome: 'MRC — Força Muscular (0–5)' },
  { id: 'berg', nome: 'Berg — Equilíbrio' },
  { id: 'tinetti', nome: 'Tinetti — Mobilidade e Equilíbrio' },
  { id: 'ashworth', nome: 'Ashworth Modificada — Espasticidade' },
  { id: 'morse', nome: 'Morse Falls — Risco de Quedas' },
  { id: 'mmse', nome: 'MMSE — Mini Exame do Estado Mental' },
  { id: 'moca', nome: 'MoCA — Avaliação Cognitiva de Montreal' },
  { id: 'mif', nome: 'MIF — Medida de Independência Funcional' },
  { id: 'barthel', nome: 'Barthel — Atividades de Vida Diária' },
  { id: 'fois', nome: 'FOIS — Funcionalidade da Deglutição' },
  { id: 'eat10', nome: 'EAT-10 — Disfagia' },
  { id: 'imc', nome: 'IMC — Índice de Massa Corporal' },
];

type TabId = 'blocos' | 'visual' | 'impressao' | 'carimbo' | 'medicamentos' | 'exames' | 'escalas' | 'especialidade' | 'campos_extras';

interface CampoExtra {
  id: string;
  label: string;
  tipo: string;
  obrigatorio: boolean;
  posicao_bloco: string;
  ordem: number;
  opcoes?: string[];
  config_campo?: { min?: number; max?: number; cor_dinamica?: boolean };
  tipos_prontuario?: string[];
}

const MeuProntuario: React.FC = () => {
  const { user } = useAuth();
  const { funcionarios } = useData();
  const [tipo, setTipo] = useState('sessao');
  const { config, adminConfig, loading, saving, saveConfig } = useProntuarioConfig(user?.id, tipo);
  const [localConfig, setLocalConfig] = useState<ProntuarioConfigData | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('blocos');

  const meuFuncionario = funcionarios.find(f => f.id === user?.id);
  const profissao = meuFuncionario?.profissao;

  useEffect(() => {
    if (config) {
      const merged = mergeAdminAndProfConfig(adminConfig, profissao, JSON.parse(JSON.stringify(config)));
      setLocalConfig(merged);
    }
  }, [config, adminConfig, profissao]);

  const persist = useCallback((updated: ProntuarioConfigData) => {
    setLocalConfig(updated);
    saveConfig(updated);
  }, [saveConfig]);

  const updateBloco = useCallback((blocoId: string, patch: Partial<BlocoConfig>) => {
    if (!localConfig) return;
    const bloco = localConfig.blocos.find(b => b.id === blocoId);
    if (!bloco) return;
    if (bloco.admin_desabilitado && patch.visivel === true) {
      toast.error('Este campo foi desabilitado pelo Master');
      return;
    }
    if (bloco.admin_obrigatorio && patch.obrigatorio === false) {
      toast.error('Este campo foi marcado como obrigatório pelo Master');
      return;
    }
    const updated = {
      ...localConfig,
      blocos: localConfig.blocos.map(b => b.id === blocoId ? { ...b, ...patch } : b),
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
    const tmp = blocos[idx].ordem;
    blocos[idx] = { ...blocos[idx], ordem: blocos[newIdx].ordem };
    blocos[newIdx] = { ...blocos[newIdx], ordem: tmp };
    persist({ ...localConfig, blocos });
  }, [localConfig, persist]);

  const resetToDefault = useCallback(() => {
    const defaults = getDefaultConfig(tipo);
    const merged = mergeAdminAndProfConfig(adminConfig, profissao, defaults);
    persist(merged);
    toast.success('Configuração restaurada ao padrão');
  }, [tipo, persist, adminConfig, profissao]);

  if (!user) return null;

  const sortedBlocos = localConfig ? [...localConfig.blocos].sort((a, b) => a.ordem - b.ordem) : [];

  const tabs: { id: TabId; label: string; icon: React.ElementType; group?: number }[] = [
    { id: 'blocos', label: 'Blocos', icon: LayoutGrid, group: 1 },
    { id: 'visual', label: 'Visual', icon: Palette, group: 1 },
    { id: 'impressao', label: 'Impressão', icon: Printer, group: 1 },
    { id: 'medicamentos', label: 'Medicamentos', icon: Pill, group: 2 },
    { id: 'exames', label: 'Exames', icon: FlaskConical, group: 2 },
    { id: 'escalas', label: 'Escalas Clínicas', icon: Ruler, group: 2 },
    { id: 'especialidade', label: 'Campos Especialidade', icon: Stethoscope, group: 2 },
    { id: 'campos_extras', label: 'Campos Extras', icon: Plus, group: 2 },
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
            Personalize a estrutura do seu prontuário. Configurações do Master são respeitadas automaticamente.
          </p>
          {profissao && (
            <Badge variant="outline" className="mt-1 text-xs">Especialidade: {profissao}</Badge>
          )}
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

      {/* Info banner */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border/60 text-xs text-muted-foreground">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
        <div>
          <strong className="text-foreground">Hierarquia de configuração:</strong> O Master define o modelo base da sua especialidade.
          Você pode ocultar campos visíveis, reordenar e marcar favoritos. Campos desabilitados ou obrigatórios pelo Master são bloqueados.
        </div>
      </div>

      {/* Type selector */}
      <div className="flex flex-wrap gap-2">
        {TIPOS_PRONTUARIO.map(t => (
          <Button key={t.value} variant={tipo === t.value ? 'default' : 'outline'} size="sm" onClick={() => setTipo(t.value)} className="gap-1.5">
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
          {/* Sidebar */}
          <div className="flex lg:flex-col gap-2 flex-wrap">
            {tabs.filter(t => t.group === 1).map(tab => (
              <Button key={tab.id} variant={activeTab === tab.id ? 'default' : 'ghost'} className="justify-start gap-2" size="sm" onClick={() => setActiveTab(tab.id)}>
                <tab.icon className="w-4 h-4" />{tab.label}
              </Button>
            ))}
            <Separator className="my-2 hidden lg:block" />
            {tabs.filter(t => t.group === 2).map(tab => (
              <Button key={tab.id} variant={activeTab === tab.id ? 'default' : 'ghost'} className="justify-start gap-2" size="sm" onClick={() => setActiveTab(tab.id)}>
                <tab.icon className="w-4 h-4" />{tab.label}
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
              <BlocosTab sortedBlocos={sortedBlocos} updateBloco={updateBloco} moveBloco={moveBloco} />
            )}
            {activeTab === 'visual' && (
              <VisualTab localConfig={localConfig} persist={persist} />
            )}
            {activeTab === 'impressao' && (
              <ImpressaoTab localConfig={localConfig} persist={persist} />
            )}
            {activeTab === 'medicamentos' && (
              <MedicamentosTab profissionalId={user.id} localConfig={localConfig} persist={persist} />
            )}
            {activeTab === 'exames' && (
              <ExamesTab profissionalId={user.id} localConfig={localConfig} persist={persist} />
            )}
            {activeTab === 'escalas' && (
              <EscalasTab localConfig={localConfig} persist={persist} />
            )}
            {activeTab === 'especialidade' && (
              <EspecialidadeTab profissao={profissao} adminConfig={adminConfig} localConfig={localConfig} persist={persist} />
            )}
            {activeTab === 'campos_extras' && (
              <CamposExtrasTab localConfig={localConfig} persist={persist} tipo={tipo} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// TAB: Blocos (extracted from existing code)
// ═══════════════════════════════════════════════════════════════
function BlocosTab({ sortedBlocos, updateBloco, moveBloco }: {
  sortedBlocos: BlocoConfig[];
  updateBloco: (id: string, patch: Partial<BlocoConfig>) => void;
  moveBloco: (id: string, dir: -1 | 1) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-primary" /> Construtor de Blocos
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Configure quais seções aparecem no prontuário, a ordem e quais ficam expandidas por padrão.
          <br /><ShieldAlert className="w-3 h-3 inline mr-1" />Campos com <Lock className="w-3 h-3 inline" /> foram bloqueados pelo Master.
        </p>
      </CardHeader>
      <CardContent className="space-y-1">
        <TooltipProvider>
          {sortedBlocos.map((bloco, idx) => {
            const isAdminDisabled = !!bloco.admin_desabilitado;
            const isAdminRequired = !!bloco.admin_obrigatorio;
            return (
              <div key={bloco.id} className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-all',
                isAdminDisabled ? 'bg-muted/20 border-border/20 opacity-40'
                  : bloco.visivel ? 'bg-card border-border/60 hover:border-primary/30'
                    : 'bg-muted/30 border-border/30 opacity-60'
              )}>
                <GripVertical className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                <span className={cn('text-sm font-medium flex-1 truncate', (isAdminDisabled || !bloco.visivel) && 'line-through text-muted-foreground')}>
                  {bloco.label}
                </span>
                {isAdminDisabled && (
                  <Tooltip><TooltipTrigger>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0 gap-1 text-muted-foreground"><ShieldAlert className="w-3 h-3" /> Master</Badge>
                  </TooltipTrigger><TooltipContent>Desabilitado pelo Master</TooltipContent></Tooltip>
                )}
                {isAdminRequired && (
                  <Tooltip><TooltipTrigger>
                    <Badge variant="destructive" className="text-[9px] px-1.5 py-0 shrink-0 gap-1"><Lock className="w-3 h-3" /> OBR</Badge>
                  </TooltipTrigger><TooltipContent>Obrigatório pelo Master</TooltipContent></Tooltip>
                )}
                {bloco.obrigatorio && !isAdminRequired && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">OBR</Badge>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0 || isAdminDisabled} onClick={() => moveBloco(bloco.id, -1)}>
                    <ChevronUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === sortedBlocos.length - 1 || isAdminDisabled} onClick={() => moveBloco(bloco.id, 1)}>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isAdminDisabled || isAdminRequired} onClick={() => updateBloco(bloco.id, { visivel: !bloco.visivel })}>
                    {bloco.visivel ? <Eye className="w-3.5 h-3.5 text-primary" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isAdminDisabled} onClick={() => updateBloco(bloco.id, { favorito: !bloco.favorito })}>
                    <Star className={cn('w-3.5 h-3.5', bloco.favorito ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
                  </Button>
                </div>
              </div>
            );
          })}
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: Visual
// ═══════════════════════════════════════════════════════════════
function VisualTab({ localConfig, persist }: { localConfig: ProntuarioConfigData; persist: (c: ProntuarioConfigData) => void }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Palette className="w-4 h-4 text-primary" /> Preferências Visuais</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Densidade</Label>
          <Select value={localConfig.ui.densidade} onValueChange={(v: 'confortavel' | 'compacto') => persist({ ...localConfig, ui: { ...localConfig.ui, densidade: v } })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="confortavel">Confortável — espaçamento generoso</SelectItem>
              <SelectItem value="compacto">Compacto — mais campos por tela</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <div><Label>Animações</Label><p className="text-xs text-muted-foreground">Transições suaves ao expandir blocos</p></div>
          <Switch checked={localConfig.ui.animacoes} onCheckedChange={(v) => persist({ ...localConfig, ui: { ...localConfig.ui, animacoes: v } })} />
        </div>
        <div className="space-y-3">
          <Label>Layout</Label>
          <Select value={localConfig.layout} onValueChange={(v: 'padrao' | 'compacto' | 'detalhado') => persist({ ...localConfig, layout: v })}>
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
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: Impressão
// ═══════════════════════════════════════════════════════════════
function ImpressaoTab({ localConfig, persist }: { localConfig: ProntuarioConfigData; persist: (c: ProntuarioConfigData) => void }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Printer className="w-4 h-4 text-primary" /> Impressão</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Cabeçalho personalizado</Label>
          <Textarea rows={2} value={localConfig.impressao.cabecalho} onChange={(e) => persist({ ...localConfig, impressao: { ...localConfig.impressao, cabecalho: e.target.value } })} placeholder="Texto no topo de cada impressão..." />
        </div>
        <div>
          <Label>Rodapé personalizado</Label>
          <Textarea rows={2} value={localConfig.impressao.rodape} onChange={(e) => persist({ ...localConfig, impressao: { ...localConfig.impressao, rodape: e.target.value } })} placeholder="Texto no rodapé de cada impressão..." />
        </div>
        <Separator />
        <div className="space-y-3">
          {([
            { key: 'mostrar_profissional' as const, label: 'Mostrar nome do profissional' },
            { key: 'mostrar_conselho' as const, label: 'Mostrar número do conselho' },
            { key: 'mostrar_logo' as const, label: 'Mostrar logo da unidade' },
          ]).map(item => (
            <div key={item.key} className="flex items-center justify-between">
              <Label className="font-normal">{item.label}</Label>
              <Switch checked={localConfig.impressao[item.key]} onCheckedChange={(v) => persist({ ...localConfig, impressao: { ...localConfig.impressao, [item.key]: v } })} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: Medicamentos
// ═══════════════════════════════════════════════════════════════
function MedicamentosTab({ profissionalId, localConfig, persist }: {
  profissionalId: string; localConfig: ProntuarioConfigData; persist: (c: ProntuarioConfigData) => void;
}) {
  const [meds, setMeds] = useState<any[]>([]);
  const [loadingMeds, setLoadingMeds] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newMed, setNewMed] = useState({ nome: '', principio_ativo: '', classe_terapeutica: '', apresentacao: '', dosagem_padrao: '', via_padrao: 'oral' });

  useEffect(() => {
    const load = async () => {
      setLoadingMeds(true);
      const { data } = await supabase.from('medications').select('*').eq('ativo', true).or(`is_global.eq.true,profissional_id.eq.${profissionalId}`);
      setMeds(data || []);
      setLoadingMeds(false);
    };
    load();
  }, [profissionalId]);

  const catalogos = localConfig.catalogos?.medicamentos || { favoritos: [], desabilitados: [] };
  const filtered = useMemo(() => {
    if (!search) return meds;
    const s = search.toLowerCase();
    return meds.filter(m => m.nome?.toLowerCase().includes(s) || m.classe_terapeutica?.toLowerCase().includes(s) || m.principio_ativo?.toLowerCase().includes(s));
  }, [meds, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filtered.forEach(m => {
      const cls = m.classe_terapeutica || 'Outros';
      if (!groups[cls]) groups[cls] = [];
      groups[cls].push(m);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const toggleDesabilitado = (medId: string) => {
    const des = catalogos.desabilitados.includes(medId)
      ? catalogos.desabilitados.filter(id => id !== medId)
      : [...catalogos.desabilitados, medId];
    persist({ ...localConfig, catalogos: { ...localConfig.catalogos, medicamentos: { ...catalogos, desabilitados: des } } });
  };

  const toggleFavorito = (medId: string) => {
    const fav = catalogos.favoritos.includes(medId)
      ? catalogos.favoritos.filter(id => id !== medId)
      : [...catalogos.favoritos, medId];
    persist({ ...localConfig, catalogos: { ...localConfig.catalogos, medicamentos: { ...catalogos, favoritos: fav } } });
  };

  const handleAddMed = async () => {
    if (!newMed.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    const { error } = await supabase.from('medications').insert({
      nome: newMed.nome, principio_ativo: newMed.principio_ativo, classe_terapeutica: newMed.classe_terapeutica,
      apresentacao: newMed.apresentacao, dosagem_padrao: newMed.dosagem_padrao, via_padrao: newMed.via_padrao,
      profissional_id: profissionalId, is_global: false
    });
    if (error) { toast.error('Erro ao salvar medicamento'); return; }
    toast.success('Medicamento adicionado');
    setShowAdd(false);
    setNewMed({ nome: '', principio_ativo: '', classe_terapeutica: '', apresentacao: '', dosagem_padrao: '', via_padrao: 'oral' });
    const { data } = await supabase.from('medications').select('*').eq('ativo', true).or(`is_global.eq.true,profissional_id.eq.${profissionalId}`);
    setMeds(data || []);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Pill className="w-4 h-4 text-primary" /> Meu Catálogo de Medicamentos</CardTitle>
        <p className="text-xs text-muted-foreground">Configure quais medicamentos aparecem no seu prontuário</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar medicamento ou classe..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        {loadingMeds ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum medicamento encontrado</p>
        ) : (
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
            {grouped.map(([classe, items]) => (
              <div key={classe}>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{classe}</h4>
                <div className="space-y-1">
                  {items.map((med: any) => {
                    const isDesabilitado = catalogos.desabilitados.includes(med.id);
                    const isFavorito = catalogos.favoritos.includes(med.id);
                    const isMeu = !med.is_global && med.profissional_id === profissionalId;
                    return (
                      <div key={med.id} className={cn('flex items-center gap-3 rounded-lg px-3 py-2 border transition-all', isDesabilitado ? 'bg-muted/20 border-border/20 opacity-50' : 'bg-card border-border/60')}>
                        <Checkbox checked={!isDesabilitado} onCheckedChange={() => toggleDesabilitado(med.id)} />
                        <span className={cn('text-sm flex-1 truncate', isDesabilitado && 'line-through text-muted-foreground')}>
                          {med.nome} {med.dosagem_padrao && `${med.dosagem_padrao}`} {med.via_padrao && `— ${med.via_padrao}`}
                        </span>
                        {isMeu && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Meu</Badge>}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleFavorito(med.id)}>
                          <Star className={cn('w-3.5 h-3.5', isFavorito ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" /> Adicionar medicamento personalizado
        </Button>

        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Adicionar Medicamento</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome *</Label><Input value={newMed.nome} onChange={e => setNewMed({ ...newMed, nome: e.target.value })} /></div>
              <div><Label>Princípio ativo</Label><Input value={newMed.principio_ativo} onChange={e => setNewMed({ ...newMed, principio_ativo: e.target.value })} /></div>
              <div><Label>Classe terapêutica</Label><Input value={newMed.classe_terapeutica} onChange={e => setNewMed({ ...newMed, classe_terapeutica: e.target.value })} /></div>
              <div><Label>Apresentação</Label><Input value={newMed.apresentacao} onChange={e => setNewMed({ ...newMed, apresentacao: e.target.value })} /></div>
              <div><Label>Dosagem padrão</Label><Input value={newMed.dosagem_padrao} onChange={e => setNewMed({ ...newMed, dosagem_padrao: e.target.value })} /></div>
              <div>
                <Label>Via padrão</Label>
                <Select value={newMed.via_padrao} onValueChange={v => setNewMed({ ...newMed, via_padrao: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['oral', 'sublingual', 'tópica', 'intramuscular', 'intravenosa', 'retal', 'nasal', 'inalatória', 'ocular', 'auricular'].map(v => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancelar</Button>
              <Button onClick={handleAddMed}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: Exames
// ═══════════════════════════════════════════════════════════════
function ExamesTab({ profissionalId, localConfig, persist }: {
  profissionalId: string; localConfig: ProntuarioConfigData; persist: (c: ProntuarioConfigData) => void;
}) {
  const [exames, setExames] = useState<any[]>([]);
  const [loadingExames, setLoadingExames] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newExame, setNewExame] = useState({ nome: '', codigo_sus: '', categoria: '' });

  useEffect(() => {
    const load = async () => {
      setLoadingExames(true);
      const { data } = await supabase.from('exam_types').select('*').eq('ativo', true).or(`is_global.eq.true,profissional_id.eq.${profissionalId}`);
      setExames(data || []);
      setLoadingExames(false);
    };
    load();
  }, [profissionalId]);

  const catalogos = localConfig.catalogos?.exames || { favoritos: [], desabilitados: [] };
  const filtered = useMemo(() => {
    if (!search) return exames;
    const s = search.toLowerCase();
    return exames.filter(e => e.nome?.toLowerCase().includes(s) || e.codigo_sus?.toLowerCase().includes(s) || e.categoria?.toLowerCase().includes(s));
  }, [exames, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filtered.forEach(e => {
      const cat = e.categoria || 'Outros';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(e);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const toggleDesabilitado = (exId: string) => {
    const des = catalogos.desabilitados.includes(exId)
      ? catalogos.desabilitados.filter(id => id !== exId)
      : [...catalogos.desabilitados, exId];
    persist({ ...localConfig, catalogos: { ...localConfig.catalogos, exames: { ...catalogos, desabilitados: des } } });
  };

  const toggleFavorito = (exId: string) => {
    const fav = catalogos.favoritos.includes(exId)
      ? catalogos.favoritos.filter(id => id !== exId)
      : [...catalogos.favoritos, exId];
    persist({ ...localConfig, catalogos: { ...localConfig.catalogos, exames: { ...catalogos, favoritos: fav } } });
  };

  const handleAddExame = async () => {
    if (!newExame.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    const { error } = await supabase.from('exam_types').insert({
      nome: newExame.nome, codigo_sus: newExame.codigo_sus, categoria: newExame.categoria,
      profissional_id: profissionalId, is_global: false
    });
    if (error) { toast.error('Erro ao salvar exame'); return; }
    toast.success('Exame adicionado');
    setShowAdd(false);
    setNewExame({ nome: '', codigo_sus: '', categoria: '' });
    const { data } = await supabase.from('exam_types').select('*').eq('ativo', true).or(`is_global.eq.true,profissional_id.eq.${profissionalId}`);
    setExames(data || []);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><FlaskConical className="w-4 h-4 text-primary" /> Meu Catálogo de Exames</CardTitle>
        <p className="text-xs text-muted-foreground">Configure quais exames aparecem no seu prontuário</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar exame ou código SUS..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        {loadingExames ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum exame encontrado</p>
        ) : (
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
            {grouped.map(([cat, items]) => (
              <div key={cat}>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{cat}</h4>
                <div className="space-y-1">
                  {items.map((ex: any) => {
                    const isDesabilitado = catalogos.desabilitados.includes(ex.id);
                    const isFavorito = catalogos.favoritos.includes(ex.id);
                    const isMeu = !ex.is_global && ex.profissional_id === profissionalId;
                    return (
                      <div key={ex.id} className={cn('flex items-center gap-3 rounded-lg px-3 py-2 border transition-all', isDesabilitado ? 'bg-muted/20 border-border/20 opacity-50' : 'bg-card border-border/60')}>
                        <Checkbox checked={!isDesabilitado} onCheckedChange={() => toggleDesabilitado(ex.id)} />
                        <span className={cn('text-sm flex-1 truncate', isDesabilitado && 'line-through text-muted-foreground')}>
                          {ex.nome} {ex.codigo_sus && <span className="text-muted-foreground ml-1 text-xs">{ex.codigo_sus}</span>}
                        </span>
                        {isMeu && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Meu</Badge>}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleFavorito(ex.id)}>
                          <Star className={cn('w-3.5 h-3.5', isFavorito ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" /> Adicionar exame personalizado
        </Button>

        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Adicionar Exame</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome *</Label><Input value={newExame.nome} onChange={e => setNewExame({ ...newExame, nome: e.target.value })} /></div>
              <div><Label>Código SUS</Label><Input value={newExame.codigo_sus} onChange={e => setNewExame({ ...newExame, codigo_sus: e.target.value })} /></div>
              <div><Label>Categoria</Label><Input value={newExame.categoria} onChange={e => setNewExame({ ...newExame, categoria: e.target.value })} placeholder="Ex: Hematologia, Bioquímica..." /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancelar</Button>
              <Button onClick={handleAddExame}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: Escalas Clínicas
// ═══════════════════════════════════════════════════════════════
function EscalasTab({ localConfig, persist }: { localConfig: ProntuarioConfigData; persist: (c: ProntuarioConfigData) => void }) {
  const escalasAtivas: string[] = (localConfig as any).escalas_ativas || [];

  const toggleEscala = (id: string) => {
    const next = escalasAtivas.includes(id)
      ? escalasAtivas.filter(e => e !== id)
      : [...escalasAtivas, id];
    persist({ ...localConfig, escalas_ativas: next } as any);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Ruler className="w-4 h-4 text-primary" /> Minhas Escalas Clínicas</CardTitle>
        <p className="text-xs text-muted-foreground">Escolha quais escalas aparecem no seu prontuário</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {ESCALAS_DISPONIVEIS.map(escala => {
          const ativa = escalasAtivas.includes(escala.id);
          return (
            <div key={escala.id} className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-all', ativa ? 'bg-card border-border/60' : 'bg-muted/20 border-border/20 opacity-60')}>
              <Checkbox checked={ativa} onCheckedChange={() => toggleEscala(escala.id)} />
              <span className="text-sm flex-1">{escala.nome}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: Campos por Especialidade
// ═══════════════════════════════════════════════════════════════
interface CampoEspCustom {
  id: string; key: string; label: string; tipo: string;
  obrigatorio: boolean; habilitado: boolean; isCustom: true; order: number; opcoes?: string[];
}

function EspecialidadeTab({ profissao, adminConfig, localConfig, persist }: {
  profissao?: string; adminConfig: any; localConfig: ProntuarioConfigData; persist: (c: ProntuarioConfigData) => void;
}) {
  const [showAddField, setShowAddField] = useState(false);
  const [editingField, setEditingField] = useState<CampoEspCustom | null>(null);
  const [newField, setNewField] = useState({ label: '', tipo: 'textarea', opcoes: '' });

  const adminCampos = useMemo(() => {
    if (!adminConfig || !profissao) return [];
    const specialtyKey = normalizeProfissao(profissao);
    const esp = (adminConfig as any[]).find((e: any) => e.ativa && (e.key === specialtyKey || e.profissoes?.some((p: string) => p === specialtyKey)));
    return esp?.campos || [];
  }, [adminConfig, profissao]);

  const espConfig: Record<string, { visivel: boolean; favorito: boolean; ordem: number }> = (localConfig as any).campos_especialidade || {};
  const camposCustom: CampoEspCustom[] = (localConfig as any).campos_especialidade_custom || [];

  const updateCampoEsp = (campoKey: string, patch: Partial<{ visivel: boolean; favorito: boolean; ordem: number }>) => {
    const current = espConfig[campoKey] || { visivel: true, favorito: false, ordem: 0 };
    persist({ ...localConfig, campos_especialidade: { ...espConfig, [campoKey]: { ...current, ...patch } } } as any);
  };

  const allCampos = useMemo(() => {
    const admin = adminCampos.filter((c: any) => c.habilitado).map((c: any) => ({ ...c, isCustom: false }));
    const custom = camposCustom.map((c, i) => ({ ...c, isCustom: true, order: c.order ?? 100 + i }));
    return [...admin, ...custom];
  }, [adminCampos, camposCustom]);

  const sortedCampos = useMemo(() => {
    return [...allCampos].sort((a: any, b: any) => {
      const oa = espConfig[a.key]?.ordem ?? a.order ?? 0;
      const ob = espConfig[b.key]?.ordem ?? b.order ?? 0;
      return oa - ob;
    });
  }, [allCampos, espConfig]);

  const moveCampo = (campoKey: string, direction: -1 | 1) => {
    const idx = sortedCampos.findIndex((c: any) => c.key === campoKey);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= sortedCampos.length) return;
    const targetKey = sortedCampos[newIdx].key;
    const currentOrdem = espConfig[campoKey]?.ordem ?? sortedCampos[idx].order ?? idx;
    const targetOrdem = espConfig[targetKey]?.ordem ?? sortedCampos[newIdx].order ?? newIdx;
    persist({ ...localConfig, campos_especialidade: {
      ...espConfig,
      [campoKey]: { ...(espConfig[campoKey] || { visivel: true, favorito: false }), ordem: targetOrdem },
      [targetKey]: { ...(espConfig[targetKey] || { visivel: true, favorito: false }), ordem: currentOrdem },
    }} as any);
  };

  const addCustomField = () => {
    if (!newField.label.trim()) { toast.error('Nome do campo é obrigatório'); return; }
    const key = 'custom_' + Date.now();
    const campo: CampoEspCustom = {
      id: key, key, label: newField.label.trim(), tipo: newField.tipo,
      obrigatorio: false, habilitado: true, isCustom: true, order: allCampos.length + 1,
      opcoes: newField.tipo === 'select' ? newField.opcoes.split(',').map(o => o.trim()).filter(Boolean) : undefined,
    };
    persist({ ...localConfig, campos_especialidade_custom: [...camposCustom, campo] } as any);
    setNewField({ label: '', tipo: 'textarea', opcoes: '' }); setShowAddField(false);
    toast.success('Campo adicionado ao seu prontuário');
  };

  const updateCustomField = () => {
    if (!editingField) return;
    persist({ ...localConfig, campos_especialidade_custom: camposCustom.map(c => c.id === editingField.id ? editingField : c) } as any);
    setEditingField(null); toast.success('Campo atualizado');
  };

  const deleteCustomField = (id: string) => {
    persist({ ...localConfig, campos_especialidade_custom: camposCustom.filter(c => c.id !== id) } as any);
    toast.success('Campo removido');
  };

  if (!profissao) {
    return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhuma especialidade detectada no seu cadastro.</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Stethoscope className="w-4 h-4 text-primary" /> Campos da Minha Especialidade</CardTitle>
          <p className="text-xs text-muted-foreground">Especialidade detectada: <strong>{profissao}</strong> — Personalize e crie campos específicos</p>
        </CardHeader>
        <CardContent className="space-y-1">
          {sortedCampos.length === 0 ? (
            <div className="text-center py-6 space-y-2">
              <Info className="w-8 h-8 text-muted-foreground/50 mx-auto" />
              <p className="text-sm text-muted-foreground">Nenhum campo configurado ainda. Crie seus próprios campos abaixo.</p>
            </div>
          ) : (
            <TooltipProvider>
              {sortedCampos.map((campo: any, idx: number) => {
                const cfg = espConfig[campo.key] || { visivel: true, favorito: false, ordem: campo.order || idx };
                const isRequired = campo.obrigatorio && !campo.isCustom;
                const isCustom = campo.isCustom;
                return (
                  <div key={campo.key} className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-all',
                    cfg.visivel ? 'bg-card border-border/60 hover:border-primary/30' : 'bg-muted/30 border-border/30 opacity-60'
                  )}>
                    <GripVertical className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                    <span className={cn('text-sm font-medium flex-1 truncate', !cfg.visivel && 'line-through text-muted-foreground')}>{campo.label}</span>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">{campo.tipo}</Badge>
                    {isCustom && <Badge className="text-[9px] px-1.5 py-0 shrink-0 bg-blue-500/20 text-blue-400 border-blue-500/30">Meu</Badge>}
                    {isRequired && (
                      <Tooltip><TooltipTrigger>
                        <Badge variant="destructive" className="text-[9px] px-1.5 py-0 shrink-0 gap-1"><Lock className="w-3 h-3" /> OBR</Badge>
                      </TooltipTrigger><TooltipContent>Obrigatório pelo Master</TooltipContent></Tooltip>
                    )}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0} onClick={() => moveCampo(campo.key, -1)}><ChevronUp className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === sortedCampos.length - 1} onClick={() => moveCampo(campo.key, 1)}><ChevronDown className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isRequired} onClick={() => updateCampoEsp(campo.key, { visivel: !cfg.visivel })}>
                        {cfg.visivel ? <Eye className="w-3.5 h-3.5 text-primary" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateCampoEsp(campo.key, { favorito: !cfg.favorito })}>
                        <Star className={cn('w-3.5 h-3.5', cfg.favorito ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
                      </Button>
                      {isCustom && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingField(campo)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteCustomField(campo.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-3">
          {!showAddField ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAddField(true)}>
              <Plus className="w-3.5 h-3.5" /> Criar campo personalizado
            </Button>
          ) : (
            <div className="space-y-3 border rounded-lg p-3 bg-muted/20">
              <p className="text-sm font-semibold">Novo campo de especialidade</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Nome do campo</Label><Input value={newField.label} onChange={e => setNewField(p => ({ ...p, label: e.target.value }))} placeholder="Ex: Avaliação Respiratória" /></div>
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select value={newField.tipo} onValueChange={val => setNewField(p => ({ ...p, tipo: val }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="textarea">Texto longo</SelectItem>
                      <SelectItem value="text">Texto curto</SelectItem>
                      <SelectItem value="number">Número</SelectItem>
                      <SelectItem value="select">Lista (select)</SelectItem>
                      <SelectItem value="slider">Slider</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {newField.tipo === 'select' && (
                <div><Label className="text-xs">Opções (separadas por vírgula)</Label><Input value={newField.opcoes} onChange={e => setNewField(p => ({ ...p, opcoes: e.target.value }))} placeholder="Leve, Moderado, Grave" /></div>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={addCustomField} className="gap-1"><Plus className="w-3 h-3" /> Salvar</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddField(false)}>Cancelar</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {editingField && (
        <Dialog open={!!editingField} onOpenChange={() => setEditingField(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Editar Campo</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome do campo</Label><Input value={editingField.label} onChange={e => setEditingField({ ...editingField, label: e.target.value })} /></div>
              <div>
                <Label>Tipo</Label>
                <Select value={editingField.tipo} onValueChange={val => setEditingField({ ...editingField, tipo: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="textarea">Texto longo</SelectItem>
                    <SelectItem value="text">Texto curto</SelectItem>
                    <SelectItem value="number">Número</SelectItem>
                    <SelectItem value="select">Lista (select)</SelectItem>
                    <SelectItem value="slider">Slider</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editingField.tipo === 'select' && (
                <div><Label>Opções (separadas por vírgula)</Label><Input value={(editingField.opcoes || []).join(', ')} onChange={e => setEditingField({ ...editingField, opcoes: e.target.value.split(',').map(o => o.trim()).filter(Boolean) })} /></div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditingField(null)}>Cancelar</Button>
              <Button onClick={updateCustomField}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: Campos Extras
// ═══════════════════════════════════════════════════════════════
function CamposExtrasTab({ localConfig, persist, tipo }: {
  localConfig: ProntuarioConfigData; persist: (c: ProntuarioConfigData) => void; tipo: string;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const camposExtras: CampoExtra[] = (localConfig as any).campos_extras || [];

  const camposDoTipo = useMemo(() =>
    camposExtras.filter(c => !c.tipos_prontuario || c.tipos_prontuario.length === 0 || c.tipos_prontuario.includes(tipo)),
    [camposExtras, tipo]
  );

  const saveCampo = (campo: CampoExtra) => {
    let updated: CampoExtra[];
    const existing = camposExtras.findIndex(c => c.id === campo.id);
    if (existing >= 0) {
      updated = camposExtras.map(c => c.id === campo.id ? campo : c);
    } else {
      updated = [...camposExtras, campo];
    }
    persist({ ...localConfig, campos_extras: updated } as any);
    setShowAdd(false);
    setEditingId(null);
    toast.success('Campo salvo');
  };

  const deleteCampo = (id: string) => {
    const updated = camposExtras.filter(c => c.id !== id);
    persist({ ...localConfig, campos_extras: updated } as any);
    toast.success('Campo removido');
  };

  const editingCampo = editingId ? camposExtras.find(c => c.id === editingId) : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4 text-primary" /> Meus Campos Personalizados</CardTitle>
        <p className="text-xs text-muted-foreground">Crie campos exclusivos para o seu prontuário</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {camposDoTipo.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum campo personalizado criado ainda</p>
        ) : (
          <div className="space-y-1">
            {camposDoTipo.map(campo => (
              <div key={campo.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 border bg-card border-border/60">
                <span className="text-sm font-medium flex-1 truncate">{campo.label}</span>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0">{campo.tipo}</Badge>
                {campo.posicao_bloco && <span className="text-[10px] text-muted-foreground">Após: {campo.posicao_bloco}</span>}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingId(campo.id); setShowAdd(true); }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteCampo(campo.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setEditingId(null); setShowAdd(true); }}>
          <Plus className="w-3.5 h-3.5" /> Criar novo campo
        </Button>

        {showAdd && (
          <CampoExtraForm
            initial={editingCampo || undefined}
            blocos={localConfig.blocos}
            tipo={tipo}
            onSave={saveCampo}
            onCancel={() => { setShowAdd(false); setEditingId(null); }}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ── Campo Extra Form ──
function CampoExtraForm({ initial, blocos, tipo, onSave, onCancel }: {
  initial?: CampoExtra; blocos: BlocoConfig[]; tipo: string;
  onSave: (c: CampoExtra) => void; onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label || '');
  const [tipoCampo, setTipoCampo] = useState(initial?.tipo || 'texto');
  const [obrigatorio, setObrigatorio] = useState(initial?.obrigatorio || false);
  const [posicaoBloco, setPosicaoBloco] = useState(initial?.posicao_bloco || '');
  const [opcoes, setOpcoes] = useState<string[]>(initial?.opcoes || ['']);
  const [min, setMin] = useState(initial?.config_campo?.min ?? 0);
  const [max, setMax] = useState(initial?.config_campo?.max ?? 10);
  const [corDinamica, setCorDinamica] = useState(initial?.config_campo?.cor_dinamica ?? true);
  const [tiposProntuario, setTiposProntuario] = useState<string[]>(initial?.tipos_prontuario || [tipo]);

  const handleSave = () => {
    if (!label.trim()) { toast.error('Nome do campo é obrigatório'); return; }
    const campo: CampoExtra = {
      id: initial?.id || `extra_${Date.now()}`,
      label: label.trim(),
      tipo: tipoCampo,
      obrigatorio,
      posicao_bloco: posicaoBloco,
      ordem: initial?.ordem ?? 0,
      tipos_prontuario: tiposProntuario,
    };
    if (tipoCampo === 'select' || tipoCampo === 'checkbox') {
      campo.opcoes = opcoes.filter(o => o.trim());
    }
    if (tipoCampo === 'slider') {
      campo.config_campo = { min, max, cor_dinamica: corDinamica };
    }
    onSave(campo);
  };

  const TIPOS_CAMPO = [
    { value: 'texto', label: 'Texto curto' },
    { value: 'textarea', label: 'Texto longo' },
    { value: 'numero', label: 'Número' },
    { value: 'select', label: 'Lista (select)' },
    { value: 'checkbox', label: 'Múltipla escolha' },
    { value: 'data', label: 'Data' },
    { value: 'slider', label: 'Slider' },
    { value: 'boolean', label: 'Sim ou Não' },
  ];

  return (
    <Card className="border-primary/30">
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">{initial ? 'Editar Campo' : 'Novo Campo'}</h4>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel}><X className="w-4 h-4" /></Button>
        </div>

        <div><Label>Nome do campo *</Label><Input value={label} onChange={e => setLabel(e.target.value)} /></div>

        <div>
          <Label>Tipo</Label>
          <Select value={tipoCampo} onValueChange={setTipoCampo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS_CAMPO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {(tipoCampo === 'select' || tipoCampo === 'checkbox') && (
          <div className="space-y-2">
            <Label>Opções</Label>
            {opcoes.map((op, i) => (
              <div key={i} className="flex gap-2">
                <Input value={op} onChange={e => { const n = [...opcoes]; n[i] = e.target.value; setOpcoes(n); }} placeholder={`Opção ${i + 1}`} />
                {opcoes.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => setOpcoes(opcoes.filter((_, j) => j !== i))}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setOpcoes([...opcoes, ''])}>
              <Plus className="w-3 h-3 mr-1" /> Adicionar opção
            </Button>
          </div>
        )}

        {tipoCampo === 'slider' && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Mínimo</Label><Input type="number" value={min} onChange={e => setMin(Number(e.target.value))} /></div>
            <div><Label>Máximo</Label><Input type="number" value={max} onChange={e => setMax(Number(e.target.value))} /></div>
            <div className="col-span-2 flex items-center gap-2">
              <Checkbox checked={corDinamica} onCheckedChange={(v) => setCorDinamica(!!v)} />
              <Label className="font-normal text-sm">Cor dinâmica (verde → vermelho)</Label>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Checkbox checked={obrigatorio} onCheckedChange={(v) => setObrigatorio(!!v)} />
          <Label className="font-normal text-sm">Obrigatório</Label>
        </div>

        <div>
          <Label>Posição (após qual bloco)</Label>
          <Select value={posicaoBloco} onValueChange={setPosicaoBloco}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">No final</SelectItem>
              {blocos.filter(b => b.visivel).sort((a, b) => a.ordem - b.ordem).map(b => (
                <SelectItem key={b.id} value={b.id}>Após {b.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Aparece em</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {TIPOS_PRONTUARIO.map(t => (
              <label key={t.value} className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={tiposProntuario.includes(t.value)}
                  onCheckedChange={(v) => {
                    setTiposProntuario(v ? [...tiposProntuario, t.value] : tiposProntuario.filter(x => x !== t.value));
                  }}
                />
                {t.label.replace(/[🟢🔵🟡🔴🟣]\s*/, '')}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar campo</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default MeuProntuario;

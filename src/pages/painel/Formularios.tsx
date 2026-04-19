import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Save, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DynamicFormBuilder } from '@/components/forms/DynamicFormBuilder';
import { CANONICAL_SLUGS } from '@/types/formTemplate';
import { invalidateSlugMapCache } from '@/lib/formSlugMapping';

const SLUG_OPTIONS = [
  { slug: CANONICAL_SLUGS.INITIAL_EVAL, label: 'Avaliação Inicial' },
  { slug: CANONICAL_SLUGS.CONSULTA, label: 'Consulta' },
  { slug: CANONICAL_SLUGS.RETORNO, label: 'Retorno' },
  { slug: CANONICAL_SLUGS.SESSION, label: 'Sessão de Tratamento' },
];

const Formularios: React.FC = () => {
  const { user } = useAuth();
  const { unidades, funcionarios } = useData();
  const isMaster = user?.role === 'master';

  const [scope, setScope] = useState<'global' | 'unidade' | 'profissional'>('global');
  const [unidadeId, setUnidadeId] = useState<string>('');
  const [profissionalId, setProfissionalId] = useState<string>('');
  const [search, setSearch] = useState('');

  const profissionais = useMemo(
    () => (funcionarios ?? []).filter(f => f.role === 'profissional' && f.ativo),
    [funcionarios],
  );

  const filteredProfs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profissionais.slice(0, 30);
    return profissionais.filter(p => p.nome?.toLowerCase().includes(q)).slice(0, 30);
  }, [profissionais, search]);

  // Quando perfil não é master, força escopo no próprio profissional
  useEffect(() => {
    if (!isMaster && user) {
      setScope('profissional');
      setProfissionalId(user.id);
    }
  }, [isMaster, user]);

  const effectiveScope = useMemo(() => {
    if (scope === 'global') return { unidadeId: '', profissionalId: '' };
    if (scope === 'unidade') return { unidadeId, profissionalId: '' };
    return { unidadeId: '', profissionalId };
  }, [scope, unidadeId, profissionalId]);

  /* ----- Mapa Tipo de Agendamento → Slug (Master) ----- */
  const [tipoMap, setTipoMap] = useState<Record<string, string>>({});
  const [savingMap, setSavingMap] = useState(false);
  const [newTipo, setNewTipo] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('system_config')
        .select('configuracoes')
        .eq('id', 'default')
        .maybeSingle();
      const cfg = (data?.configuracoes as any) ?? {};
      setTipoMap(cfg.tipo_agendamento_to_slug ?? {});
    })();
  }, []);

  const saveTipoMap = async () => {
    setSavingMap(true);
    try {
      const { data: cur } = await supabase
        .from('system_config')
        .select('configuracoes')
        .eq('id', 'default')
        .maybeSingle();
      const cfg = (cur?.configuracoes as any) ?? {};
      const next = { ...cfg, tipo_agendamento_to_slug: tipoMap };
      const { error } = await supabase
        .from('system_config')
        .upsert({ id: 'default', configuracoes: next });
      if (error) throw error;
      invalidateSlugMapCache();
      toast.success('Mapeamento salvo');
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSavingMap(false);
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Editor de Prontuário (Formulários Dinâmicos)</h1>
        <p className="text-sm text-muted-foreground">
          Construa formulários customizados por escopo. A recepção continua usando o
          <strong> slug interno</strong> — o nome exibido pode ser alterado livremente.
        </p>
      </div>

      <Tabs defaultValue="builder">
        <TabsList>
          <TabsTrigger value="builder">Construtor</TabsTrigger>
          {isMaster && <TabsTrigger value="mapping">Vínculo Recepção</TabsTrigger>}
        </TabsList>

        <TabsContent value="builder" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Escopo do modelo</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="min-w-[200px]">
                  <Label>Escopo</Label>
                  <Select value={scope} onValueChange={v => setScope(v as any)} disabled={!isMaster}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {isMaster && <SelectItem value="global">Global (todas unidades)</SelectItem>}
                      {isMaster && <SelectItem value="unidade">Unidade específica</SelectItem>}
                      <SelectItem value="profissional">Profissional específico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {scope === 'unidade' && (
                  <div className="min-w-[220px]">
                    <Label>Unidade</Label>
                    <Select value={unidadeId} onValueChange={setUnidadeId}>
                      <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                      <SelectContent>
                        {(unidades ?? []).map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {scope === 'profissional' && isMaster && (
                  <div className="min-w-[260px]">
                    <Label>Profissional</Label>
                    <div className="relative">
                      <Search className="h-4 w-4 absolute left-2 top-3 text-muted-foreground" />
                      <Input
                        placeholder="Buscar profissional…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <Select value={profissionalId} onValueChange={setProfissionalId}>
                      <SelectTrigger className="mt-2"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {filteredProfs.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Hierarquia ao abrir um prontuário: <strong>Profissional → Unidade → Global</strong>.
                O sistema escolhe automaticamente o template mais específico disponível.
              </p>
            </CardContent>
          </Card>

          {((scope === 'unidade' && !unidadeId) || (scope === 'profissional' && !profissionalId)) ? (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground text-center">
                Selecione {scope === 'unidade' ? 'uma unidade' : 'um profissional'} para começar a editar.
              </CardContent>
            </Card>
          ) : (
            <DynamicFormBuilder
              availableSlugs={SLUG_OPTIONS}
              scope={effectiveScope}
            />
          )}
        </TabsContent>

        {isMaster && (
          <TabsContent value="mapping">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tipo de Agendamento → Formulário</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Quando a recepção marca um agendamento de um determinado tipo, o sistema abre
                  automaticamente o formulário correspondente. O slug é imutável; o nome exibido pode
                  mudar a qualquer momento.
                </p>
                <div className="space-y-2">
                  {Object.entries(tipoMap).map(([tipo, slug]) => (
                    <div key={tipo} className="flex gap-2 items-center">
                      <Input value={tipo} readOnly className="flex-1 bg-muted/30" />
                      <span className="text-muted-foreground">→</span>
                      <Select
                        value={slug}
                        onValueChange={v => setTipoMap(m => ({ ...m, [tipo]: v }))}
                      >
                        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SLUG_OPTIONS.map(o => (
                            <SelectItem key={o.slug} value={o.slug}>{o.label} ({o.slug})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTipoMap(m => {
                          const next = { ...m }; delete next[tipo]; return next;
                        })}
                      >
                        Remover
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 items-end pt-2 border-t">
                  <div className="flex-1">
                    <Label>Adicionar novo tipo</Label>
                    <Input
                      value={newTipo}
                      onChange={e => setNewTipo(e.target.value)}
                      placeholder="Ex.: Reavaliação Mensal"
                    />
                  </div>
                  <Button
                    onClick={() => {
                      if (!newTipo.trim()) return;
                      setTipoMap(m => ({ ...m, [newTipo.trim()]: CANONICAL_SLUGS.CONSULTA }));
                      setNewTipo('');
                    }}
                  >
                    Adicionar
                  </Button>
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={saveTipoMap} disabled={savingMap}>
                    {savingMap ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Salvar mapeamento
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default Formularios;

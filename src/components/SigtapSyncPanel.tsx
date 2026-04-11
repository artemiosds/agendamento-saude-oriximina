import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Clock, CheckCircle2, AlertCircle, Loader2, Database, XCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ALL_SPECIALTIES = [
  { key: 'fisioterapia', label: 'Fisioterapia' },
  { key: 'psicologia', label: 'Psicologia' },
  { key: 'fonoaudiologia', label: 'Fonoaudiologia' },
  { key: 'nutricao', label: 'Nutrição' },
  { key: 'terapia_ocupacional', label: 'Terapia Ocupacional' },
  { key: 'assistencia_social', label: 'Assistência Social' },
  { key: 'enfermagem', label: 'Enfermagem' },
  { key: 'medico', label: 'Médico' },
];

interface SyncResult {
  especialidade: string;
  procedimentos: number;
  cids: number;
  error?: string;
}

interface SyncHistory {
  id: string;
  tipo: string;
  competencia: string;
  total_procedimentos: number;
  total_cids: number;
  importado_em: string;
  detalhes: SyncResult[];
}

function formatErrorMessage(esp: string, error: string): string {
  const label = ALL_SPECIALTIES.find(s => s.key === esp)?.label || esp;
  if (error.includes('nenhum_procedimento')) {
    return `Nenhum procedimento encontrado para ${label}`;
  }
  if (error.includes('conexao_falha')) {
    return `Falha na conexão com DATASUS`;
  }
  if (error.includes('subgrupo_desconhecido')) {
    return `Subgrupo desconhecido para ${label}`;
  }
  if (error.includes('DATASUS:')) {
    return error;
  }
  return `Erro: ${error.substring(0, 100)}`;
}

const SigtapSyncPanel: React.FC = () => {
  const [selected, setSelected] = useState<Set<string>>(new Set(ALL_SPECIALTIES.map(s => s.key)));
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState<SyncResult[] | null>(null);
  const [history, setHistory] = useState<SyncHistory[]>([]);
  const [showResults, setShowResults] = useState(false);

  const loadHistory = useCallback(async () => {
    const { data } = await (supabase as any).from('pts_import_log')
      .select('*')
      .order('importado_em', { ascending: false })
      .limit(10);
    if (data) setHistory(data);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const toggleAll = () => {
    setSelected(selected.size === ALL_SPECIALTIES.length ? new Set() : new Set(ALL_SPECIALTIES.map(s => s.key)));
  };

  const toggleOne = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleSync = async () => {
    if (selected.size === 0) {
      toast.error('Selecione ao menos uma especialidade');
      return;
    }
    setSyncing(true);
    setResults(null);
    setShowResults(false);

    const specs = ALL_SPECIALTIES.filter(s => selected.has(s.key)).map(s => s.key);

    try {
      const { data, error } = await supabase.functions.invoke('sync-sigtap-datasus', {
        body: { especialidades: specs, tipo: 'sync_datasus_manual' },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro desconhecido');

      setResults(data.resultado);
      setShowResults(true);

      const successCount = data.resultado.filter((r: SyncResult) => !r.error).length;
      const failCount = data.resultado.filter((r: SyncResult) => !!r.error).length;

      if (failCount === 0) {
        toast.success(`Sincronização concluída! ${data.total_procedimentos} procedimentos, ${data.total_cids} CIDs`);
      } else if (successCount === 0) {
        toast.error('O servidor do DATASUS está temporariamente indisponível. Tente novamente em alguns minutos.');
      } else {
        toast.warning(`${successCount} especialidades sincronizadas. ${failCount} falharam — tente novamente.`);
      }

      loadHistory();
    } catch (err: any) {
      console.error('Sync error:', err);
      toast.error('Não foi possível conectar ao DATASUS. Verifique sua conexão e tente novamente.');
    } finally {
      setSyncing(false);
    }
  };

  const lastSync = history[0];

  const formatCompetencia = (c: string) => {
    if (!c || c.length < 6) return c;
    return `${c.substring(4, 6)}/${c.substring(0, 4)}`;
  };

  const getSpecLabel = (key: string) => ALL_SPECIALTIES.find(s => s.key === key)?.label || key;

  const renderResultIcon = (r: SyncResult) => {
    if (r.error) {
      if (r.error.includes('nenhum_procedimento')) return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      return <XCircle className="w-4 h-4 text-destructive" />;
    }
    return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  };

  const renderResultText = (r: SyncResult) => {
    if (r.error) {
      return <span className="text-xs text-destructive">{formatErrorMessage(r.especialidade, r.error)}</span>;
    }
    return <span className="text-muted-foreground">{r.procedimentos} proc. | {r.cids.toLocaleString('pt-BR')} CIDs</span>;
  };

  // Summary counts
  const successCount = results?.filter(r => !r.error).length || 0;
  const failCount = results?.filter(r => !!r.error).length || 0;
  const allFailed = results && results.length > 0 && successCount === 0;

  return (
    <div className="space-y-4">
      <Card className="shadow-card border-0 ring-2 ring-primary/20">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Sincronização Automática com DATASUS/SIGTAP</h3>
              <p className="text-xs text-muted-foreground">Fonte oficial: Ministério da Saúde</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Última sincronização: </span>
              <span className="font-medium">
                {lastSync ? new Date(lastSync.importado_em).toLocaleString('pt-BR') : 'Nunca'}
              </span>
            </div>
            {lastSync && (
              <>
                <div>
                  <span className="text-muted-foreground">Competência: </span>
                  <span className="font-medium">{formatCompetencia(lastSync.competencia)}</span>
                </div>
                <Badge variant="outline" className="text-green-600 border-green-300">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Sincronizado
                </Badge>
              </>
            )}
            {!lastSync && (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                <AlertCircle className="w-3 h-3 mr-1" /> Pendente
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Selecionar especialidades:</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ALL_SPECIALTIES.map(s => (
                <label key={s.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={selected.has(s.key)} onCheckedChange={() => toggleOne(s.key)} disabled={syncing} />
                  {s.label}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
              <Checkbox checked={selected.size === ALL_SPECIALTIES.length} onCheckedChange={toggleAll} disabled={syncing} />
              <span className="font-medium">Selecionar todas</span>
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSync} disabled={syncing || selected.size === 0} className="gradient-primary text-primary-foreground">
              {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
            </Button>
          </div>

          {syncing && (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium">Sincronizando com DATASUS...</p>
              <p className="text-xs text-muted-foreground">Aguarde, este processo pode levar alguns minutos.</p>
              <div className="space-y-1.5">
                {ALL_SPECIALTIES.filter(s => selected.has(s.key)).map(s => (
                  <div key={s.key} className="flex items-center gap-2 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span>{s.label}: processando...</span>
                  </div>
                ))}
              </div>
              <Progress value={50} className="h-2" />
            </div>
          )}

          {/* All failed fallback */}
          {showResults && allFailed && !syncing && (
            <div className="space-y-3 p-4 bg-destructive/5 rounded-lg border border-destructive/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <p className="text-sm font-semibold text-destructive">Sincronização falhou</p>
              </div>
              <p className="text-sm text-muted-foreground">
                O servidor do DATASUS está temporariamente indisponível. Tente novamente em alguns minutos.
                Os dados existentes no sistema não foram alterados.
              </p>
              <div className="space-y-1">
                {results!.map(r => (
                  <div key={r.especialidade} className="flex items-center gap-2 text-sm">
                    {renderResultIcon(r)}
                    <span className="min-w-[140px]">{getSpecLabel(r.especialidade)}:</span>
                    {renderResultText(r)}
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowResults(false)}>Fechar</Button>
            </div>
          )}

          {/* Partial or full success */}
          {showResults && results && !allFailed && !syncing && (
            <div className="space-y-3 p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                  {failCount === 0
                    ? 'Sincronização concluída!'
                    : `${successCount} especialidades sincronizadas. ${failCount} falharam.`}
                </p>
              </div>
              <div className="space-y-1">
                {results.map(r => (
                  <div key={r.especialidade} className="flex items-center gap-2 text-sm">
                    {renderResultIcon(r)}
                    <span className="min-w-[140px]">{getSpecLabel(r.especialidade)}:</span>
                    {renderResultText(r)}
                  </div>
                ))}
                <hr className="border-green-200 dark:border-green-700 my-2" />
                <div className="flex justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span>
                    {results.reduce((a, r) => a + r.procedimentos, 0)} procedimentos | {results.reduce((a, r) => a + r.cids, 0).toLocaleString('pt-BR')} CIDs
                  </span>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowResults(false)}>
                <CheckCircle2 className="w-3 h-3 mr-1" /> Fechar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card className="shadow-card border-0">
          <CardContent className="p-5">
            <h4 className="font-semibold text-sm mb-3">Histórico de sincronizações</h4>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Data/Hora</TableHead>
                    <TableHead className="text-xs">Competência</TableHead>
                    <TableHead className="text-xs">Procedimentos</TableHead>
                    <TableHead className="text-xs">CIDs</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs">{new Date(h.importado_em).toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-xs">{formatCompetencia(h.competencia)}</TableCell>
                      <TableCell className="text-xs">{h.total_procedimentos}</TableCell>
                      <TableCell className="text-xs">{h.total_cids.toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-xs">
                          {h.tipo.includes('manual') ? 'Manual' : 'Auto'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {h.total_procedimentos > 0
                          ? <Badge variant="outline" className="text-green-600 border-green-300 text-xs">✅</Badge>
                          : <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">⚠️</Badge>
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SigtapSyncPanel;

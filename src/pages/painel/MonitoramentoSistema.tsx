import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  Card, CardContent, CardHeader, CardTitle, CardDescription 
} from '@/components/ui/card';
import { 
  Tabs, TabsContent, TabsList, TabsTrigger 
} from '@/components/ui/tabs';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { 
  Button 
} from '@/components/ui/button';
import { 
  Badge 
} from '@/components/ui/badge';
import { 
  ScrollArea 
} from '@/components/ui/scroll-area';
import { 
  Alert, AlertDescription, AlertTitle 
} from '@/components/ui/alert';
import { 
  Input 
} from '@/components/ui/input';
import { 
  Label 
} from '@/components/ui/label';
import {
  Activity, Database, HardDrive, Server, ShieldAlert, 
  RefreshCw, Download, Trash2, AlertTriangle, CheckCircle2,
  Info, Globe, Network, Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { z } from 'zod';

const TABLES = [
  { name: 'pacientes', date: 'criado_em' },
  { name: 'agendamentos', date: 'criado_em' },
  { name: 'atendimentos', date: 'criado_em' },
  { name: 'treatment_cycles', date: 'created_at' },
  { name: 'treatment_sessions', date: 'created_at' },
  { name: 'fila_espera', date: 'criado_em' },
  { name: 'funcionarios', date: 'criado_em' },
  { name: 'unidades', date: 'criado_em' },
  { name: 'action_logs', date: 'created_at' },
  { name: 'notification_logs', date: 'criado_em' },
  { name: 'system_config', date: null },
] as const;

// A missing metric must not be coerced from null, empty string or boolean to zero.
const measuredNumber=z.union([z.number(),z.string().regex(/^\d+$/)]).transform(Number).pipe(z.number().finite().int().nonnegative());
const usageSchema = z.object({
  checked_at: z.string(),
  database_bytes: measuredNumber,
  buckets: z.array(z.object({
    name: z.string(),
    file_count: measuredNumber,
    used_bytes: measuredNumber,
    unknown_size_count: measuredNumber,
  })),
});

const quotaStorageKey = 'sms-monitoramento-limite-storage-gb-v1';
const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes.toLocaleString('pt-BR')} B`;
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4);
  return `${(bytes / 1024 ** unit).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${['B', 'KB', 'MB', 'GB', 'TB'][unit]}`;
};

interface TableStats {
  name: string;
  count: number | null;
  recent7d: number | null;
  recent30d: number | null;
  error?: string;
}

interface StorageStats {
  bucket: string;
  fileCount: number;
  usedBytes: number;
  unknownSizeCount: number;
}

const MonitoramentoSistema: React.FC<{embedded?:boolean}> = ({embedded=false}) => {
  const { user, isGlobalAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('visao_geral');
  
  const [dbStats, setDbStats] = useState<TableStats[]>([]);
  const [storageStats, setStorageStats] = useState<StorageStats[]>([]);
  const [alerts, setAlerts] = useState<Array<{ id: string; title: string; description: string | null; severity: string }>>([]);
  const [alertsError, setAlertsError] = useState<string | null>("Alertas ainda não consultados.");
  const [storageError, setStorageError] = useState<string | null>("Armazenamento ainda não consultado.");
  const [systemStatus, setSystemStatus] = useState<'verificado' | 'parcial' | 'erro'>('parcial');
  const [databaseBytes, setDatabaseBytes] = useState<number | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [refreshDurationMs, setRefreshDurationMs] = useState<number | null>(null);
  const [quotaGB, setQuotaGB] = useState<number | null>(() => {
    try {
      const stored = localStorage.getItem(quotaStorageKey);
      const parsed = stored ? Number(stored) : null;
      return parsed && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    } catch { return null; }
  });
  const [quotaInput, setQuotaInput] = useState(() => String(quotaGB ?? ''));

  const isMaster = user?.role?.toLowerCase().trim() === 'master';

  const fetchStats = useCallback(async () => {
    setRefreshing(true);
    const started = performance.now();
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const statsPromises = TABLES.map(async ({ name, date }): Promise<TableStats> => {
        try {
          const base = supabase.from(name);
          const [total, recent7, recent30] = await Promise.all([
            base.select('id', { count: 'exact', head: true }),
            date ? base.select('id', { count: 'exact', head: true }).gte(date, sevenDaysAgo) : Promise.resolve(null),
            date ? base.select('id', { count: 'exact', head: true }).gte(date, thirtyDaysAgo) : Promise.resolve(null),
          ]);
          const error = total.error || recent7?.error || recent30?.error;
          return {
            name,
            count: total.error ? null : total.count,
            recent7d: recent7?.error ? null : recent7?.count ?? null,
            recent30d: recent30?.error ? null : recent30?.count ?? null,
            error: error?.message,
          };
        } catch (error) {
          return { name, count: null, recent7d: null, recent30d: null, error: error instanceof Error ? error.message : 'Consulta indisponível.' };
        }
      });

      const [results, alertResult, usageResult] = await Promise.all([
        Promise.all(statsPromises),
        isMaster
          ? supabase.from('system_monitoring_alerts').select('id,title,description,severity').eq('resolved', false).order('created_at', { ascending: false })
          : Promise.resolve(null),
        isGlobalAdmin ? (async () => {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !session) throw new Error('Sessão expirada. Entre novamente para consultar o armazenamento.');
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/get_system_monitoring_usage`, {
            method: 'POST',
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: '{}',
          });
          if (!response.ok) throw new Error(response.status === 404 ? 'Medidor de armazenamento ainda não disponível neste ambiente.' : `Consulta de armazenamento indisponível (${response.status}).`);
          return usageSchema.parse(await response.json());
        })().then(data => ({ data, error: null as string | null }))
          .catch(error => ({ data: null, error: error instanceof Error ? error.message : 'Falha ao medir o armazenamento.' }))
          : Promise.resolve({ data: null, error: 'Visão global de armazenamento disponível apenas para o Master Global.' }),
      ]);
      setDbStats(results);
      setAlerts(alertResult?.error ? [] : alertResult?.data ?? []);
      setAlertsError(isMaster ? alertResult?.error?.message ?? (!alertResult?.data ? 'Consulta de alertas não confirmada.' : null) : 'Alertas restritos ao perfil Master.');
      setStorageError(usageResult.error);
      setStorageStats(usageResult.data?.buckets.map(bucket => ({
        bucket: bucket.name,
        fileCount: bucket.file_count,
        usedBytes: bucket.used_bytes,
        unknownSizeCount: bucket.unknown_size_count,
      })) ?? []);
      setDatabaseBytes(usageResult.data?.database_bytes ?? null);
      setLastCheck(new Date());
      const successful = results.filter(result => result.count !== null).length;
      const incomplete=results.some((result,index)=>!!result.error||result.count===null||(TABLES[index].date!==null&&(result.recent7d===null||result.recent30d===null)));
      setSystemStatus(successful === 0 ? "erro" : incomplete || !!usageResult.error || !usageResult.data || usageResult.data.buckets.some(bucket=>bucket.unknown_size_count>0) || !isMaster || !!alertResult?.error || !alertResult?.data ? "parcial" : "verificado");
    } catch (err) {
      console.error('Error fetching system stats:', err);
      toast.error('Erro ao atualizar dados de monitoramento');
      setDbStats([]);setStorageStats([]);setAlerts([]);setDatabaseBytes(null);setLastCheck(null);
      setStorageError('Consulta indisponível.');setAlertsError('Consulta indisponível.');
      setSystemStatus('erro');
    } finally {
      setRefreshDurationMs(Math.round(performance.now() - started));
      setRefreshing(false);
      setLoading(false);
    }
  }, [isMaster, isGlobalAdmin]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const storageBytes = storageStats.reduce((sum, bucket) => sum + bucket.usedBytes, 0);
  const unknownSizeCount = storageStats.reduce((sum, bucket) => sum + bucket.unknownSizeCount, 0);
  const checkedTables = dbStats.filter(table => table.count !== null).length;
  const hasStorageUsage = !!lastCheck && databaseBytes!==null && !storageError;
  const quotaBytes = quotaGB === null ? null : quotaGB * 1024 ** 3;

  const saveQuota = () => {
    const next = Number(quotaInput.replace(',', '.'));
    if (!Number.isFinite(next) || next <= 0 || next > 1_000_000) {
      toast.error('Informe um limite de referência válido em GB.');
      return;
    }
    try {
      localStorage.setItem(quotaStorageKey, String(next));
      setQuotaGB(next);
      toast.success('Referência salva somente neste navegador.');
    } catch { toast.error('Não foi possível salvar a referência neste navegador.'); }
  };

  const exportReport = () => {
    const lines = [
      ['Tipo', 'Item', 'Total', '7 dias', '30 dias', 'Status'],
      ...dbStats.map(table => ['Tabela', table.name, table.count ?? 'Indisponível', table.recent7d ?? 'N/D', table.recent30d ?? 'N/D', table.error ? 'Falha' : 'Consultado']),
      ...storageStats.map(bucket => ['Storage', bucket.bucket, bucket.fileCount, '', '', `${bucket.usedBytes} bytes`]),
    ];
    const csv = lines.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `monitoramento_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          {embedded?<h2 className="text-xl font-bold font-display text-foreground flex items-center gap-2"><Activity className="w-5 h-5 text-primary" aria-hidden="true"/>Monitoramento do Sistema</h2>:
          <h1 className="text-2xl font-bold font-display text-foreground flex items-center gap-2"><Activity className="w-6 h-6 text-primary" aria-hidden="true"/>Monitoramento do Sistema</h1>}
          <p className="text-muted-foreground text-sm">
            Acompanhe o uso do banco de dados, armazenamento, arquivos e saúde geral da aplicação.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchStats} 
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar análise
          </Button>
          <Button variant="outline" size="sm" onClick={exportReport} disabled={dbStats.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Exportar relatório
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              systemStatus === 'verificado' ? 'bg-emerald-100 text-emerald-600' :
              systemStatus === 'parcial' ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'
            }`}>
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Status</p>
              <p className="text-lg font-bold capitalize">{systemStatus === 'parcial' ? 'Dados parciais' : systemStatus === 'erro' ? 'Consulta indisponível' : 'Consultado'}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Banco de Dados</p>
              <p className="text-lg font-bold">{checkedTables}/{TABLES.length} tabelas</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Storage</p>
              <p className="text-lg font-bold">{hasStorageUsage ? `${storageStats.length} buckets` : 'Não verificado'}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Tamanho do banco</p>
              <p className="text-lg font-bold">{databaseBytes !== null ? formatBytes(databaseBytes) : 'Não medido'}</p>
              <p className="text-xs text-muted-foreground">Banco de dados</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              alerts.length > 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
            }`}>
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Alertas</p>
              <p className="text-lg font-bold">{alertsError ? 'Não verificado' : `${alerts.length} ativos`}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <ScrollArea className="w-full">
          <TabsList className="inline-flex w-auto bg-muted p-1 rounded-lg mb-4">
            <TabsTrigger value="visao_geral" className="gap-2"><Info className="w-4 h-4" /> Visão Geral</TabsTrigger>
            <TabsTrigger value="banco_dados" className="gap-2"><Database className="w-4 h-4" /> Banco de Dados</TabsTrigger>
            <TabsTrigger value="arquivos" className="gap-2"><HardDrive className="w-4 h-4" /> Arquivos e Storage</TabsTrigger>
            <TabsTrigger value="desempenho" className="gap-2"><Activity className="w-4 h-4" /> Desempenho</TabsTrigger>
            <TabsTrigger value="hospedagem" className="gap-2"><Globe className="w-4 h-4" /> Ambiente</TabsTrigger>
            <TabsTrigger value="supabase" className="gap-2"><Network className="w-4 h-4" /> Conexões</TabsTrigger>
            {isMaster && (
              <TabsTrigger value="limpeza" className="gap-2"><Trash2 className="w-4 h-4" /> Retenção</TabsTrigger>
            )}
          </TabsList>
        </ScrollArea>

        <TabsContent value="visao_geral" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-warning" />
                  Alertas do Sistema
                </CardTitle>
                <CardDescription>Pendências e recomendações técnicas</CardDescription>
              </CardHeader>
              <CardContent>
                {alertsError ? (
                  <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Alertas não verificados</AlertTitle><AlertDescription>{alertsError}</AlertDescription></Alert>
                ) : alerts.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3 opacity-20" />
                    <p>Nenhum alerta ativo retornado pela consulta.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {alerts.map((alert) => (
                      <Alert key={alert.id} variant={alert.severity === 'critico' ? 'destructive' : 'default'}>
                        <AlertTitle>{alert.title}</AlertTitle>
                        <AlertDescription>{alert.description}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-primary" />
                  Últimas Atividades de Auditoria
                </CardTitle>
                <CardDescription>Resumo dos últimos logs importantes</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Acesse a aba 'Logs & Auditoria' no menu Administração para ver o histórico completo.</p>
                <Button variant="link" className="p-0 h-auto mt-4" onClick={() => window.location.href='/painel/auditoria'}>
                  Ver todos os logs →
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="banco_dados">
          <Card>
            <CardHeader>
              <CardTitle>Estatísticas das Tabelas</CardTitle>
              <CardDescription>Contagens reais dos registros visíveis ao seu perfil. Períodos móveis de 7 e 30 dias.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
              <Table className="min-w-[620px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tabela</TableHead>
                    <TableHead className="text-right">Registros Totais</TableHead>
                    <TableHead className="text-right">Últimos 7 dias</TableHead>
                    <TableHead className="text-right">Últimos 30 dias</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dbStats.map((table) => (
                    <TableRow key={table.name}>
                      <TableCell className="font-medium">{table.name}</TableCell>
                      <TableCell className="text-right">{table.count?.toLocaleString('pt-BR') ?? '—'}</TableCell>
                      <TableCell className="text-right">{table.recent7d?.toLocaleString('pt-BR') ?? '—'}</TableCell>
                      <TableCell className="text-right">{table.recent30d?.toLocaleString('pt-BR') ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={table.error ? 'destructive' : 'outline'} title={table.error}>
                          {table.error ? 'Falha na consulta' : 'Consultado'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="arquivos">
          <div className="space-y-4">
            {storageError ? (
              <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Uso do Storage não verificado</AlertTitle><AlertDescription>{storageError}</AlertDescription></Alert>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Arquivos armazenados</p><p className="text-2xl font-bold">{storageStats.reduce((total, bucket) => total + bucket.fileCount, 0).toLocaleString('pt-BR')}</p></CardContent></Card>
                  <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Espaço usado em arquivos</p><p className="text-2xl font-bold">{formatBytes(storageBytes)}</p></CardContent></Card>
                  <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Espaço restante estimado</p><p className="text-2xl font-bold">{quotaBytes === null || unknownSizeCount > 0 ? 'Não calculável' : formatBytes(Math.max(0, quotaBytes - storageBytes))}</p></CardContent></Card>
                </div>
                {unknownSizeCount > 0 && <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Medição incompleta</AlertTitle><AlertDescription>{unknownSizeCount} arquivo(s) sem tamanho informado nos metadados. O total pode ser maior.</AlertDescription></Alert>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {storageStats.map((s) => (
                    <Card key={s.bucket}>
                      <CardHeader className="pb-2"><CardTitle className="text-base break-all">{s.bucket}</CardTitle></CardHeader>
                      <CardContent className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold">{formatBytes(s.usedBytes)}</span>
                        <span className="text-sm text-muted-foreground">{s.fileCount.toLocaleString('pt-BR')} arquivo(s)</span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
            {isGlobalAdmin && (
              <Card><CardHeader><CardTitle className="text-base">Referência para estimar o espaço restante</CardTitle><CardDescription>O Lovable Cloud não informa o limite contratado à aplicação. Consulte o limite no painel do provedor e informe-o aqui; este valor fica apenas neste navegador e não altera seu plano.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                    <div className="w-full sm:max-w-52 space-y-1"><Label htmlFor="storage-quota">Limite de arquivos informado (GB)</Label><Input id="storage-quota" type="number" min="0.001" step="any" inputMode="decimal" value={quotaInput} onChange={event => setQuotaInput(event.target.value)} placeholder="Ex.: 10" /></div>
                    <Button type="button" variant="outline" onClick={saveQuota}>Salvar referência</Button>
                  </div>
                  {quotaBytes !== null && hasStorageUsage && unknownSizeCount === 0 && <p className="text-sm text-muted-foreground">Uso estimado da referência: {Math.round(storageBytes / quotaBytes * 100)}%. Saldo estimado: {formatBytes(Math.max(0, quotaBytes - storageBytes))}. Confira a cota e o uso faturável no Lovable Cloud; esta medição representa os arquivos atuais, não o consumo médio de cobrança.</p>}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="desempenho">
          <Card>
            <CardHeader>
              <CardTitle>Monitoramento de Desempenho</CardTitle>
              <CardDescription>Medidas desta consulta no seu navegador, sem inferir a saúde de outros serviços.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Duração da atualização</p>
                  <p className="text-2xl font-bold">{refreshDurationMs === null ? '—' : `${refreshDurationMs.toLocaleString('pt-BR')} ms`}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Tabelas consultadas</p>
                  <p className="text-2xl font-bold">{checkedTables}/{TABLES.length}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Falhas nesta atualização</p>
                  <p className="text-2xl font-bold">{dbStats.filter(table => table.error).length + Number(Boolean(isGlobalAdmin && storageError)) + Number(Boolean(isMaster && alertsError))}</p>
                </div>
              </div>
              
              <Alert>
                <Info className="w-4 h-4" />
                <AlertTitle>Recomendação</AlertTitle>
                <AlertDescription>O tempo acima mede apenas as consultas desta página. Histórico de disponibilidade, erros em 24 horas e desempenho de todos os usuários exigem telemetria própria; não são inferidos daqui.</AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hospedagem">
          <Card>
            <CardHeader>
              <CardTitle>Ambiente da aplicação</CardTitle>
              <CardDescription>Informações verificáveis nesta sessão</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Backend configurado</Label>
                  <Input value="Lovable Cloud" disabled />
                </div>
                <div className="space-y-2">
                  <Label>Estado da consulta</Label>
                  <Input value={systemStatus === 'verificado' ? 'Consultado' : 'Dados parciais ou indisponíveis'} disabled />
                </div>
                <div className="space-y-2">
                  <Label>URL Pública</Label>
                  <Input value={window.location.origin} disabled />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Limites contratados e faturamento devem ser conferidos no painel oficial do Lovable Cloud. Nenhuma chave secreta é exibida nesta página.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="supabase">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="w-5 h-5 text-primary" />
                Estado das consultas
              </CardTitle>
              <CardDescription>Somente serviços consultados nesta página recebem um resultado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 border rounded-lg text-center">
                  <p className="text-xs text-muted-foreground uppercase">Database</p>
                  <p className="text-sm font-bold">{checkedTables > 0 ? 'Consulta respondeu' : 'Não verificado'}</p>
                </div>
                <div className="p-3 border rounded-lg text-center">
                  <p className="text-xs text-muted-foreground uppercase">Auth</p>
                  <p className="text-sm font-bold">Sessão ativa</p>
                </div>
                <div className="p-3 border rounded-lg text-center">
                  <p className="text-xs text-muted-foreground uppercase">Storage</p>
                  <p className="text-sm font-bold">{hasStorageUsage ? 'Consulta respondeu' : 'Não verificado'}</p>
                </div>
                <div className="p-3 border rounded-lg text-center">
                  <p className="text-xs text-muted-foreground uppercase">Realtime</p>
                  <p className="text-sm font-bold">Não verificado</p>
                </div>
              </div>
              <Button variant="outline" className="w-full md:w-auto" onClick={fetchStats} disabled={refreshing}>Repetir consultas disponíveis</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="limpeza">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-destructive/20">
              <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                  <Trash2 className="w-5 h-5" />
                  Limpeza de Logs Antigos
                </CardTitle>
                <CardDescription>Revisão antes de qualquer política de retenção</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">A exclusão automática está indisponível. Para preservar a auditoria, é preciso definir previamente quais logs são descartáveis, apresentar uma prévia da quantidade e validar uma rotina de limpeza com autorização no servidor.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-primary" />
                  Arquivos Órfãos
                </CardTitle>
                <CardDescription>Identificar anexos sem vínculo no banco</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">A identificação de arquivos órfãos exige conferir os vínculos de cada módulo. Nenhum arquivo é excluído por esta página.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="text-center py-4 border-t">
        <p className="text-xs text-muted-foreground">
          Última consulta: {lastCheck ? format(lastCheck, "HH:mm:ss 'em' dd/MM/yyyy", { locale: ptBR }) : 'ainda não concluída'}
        </p>
      </div>
    </div>
  );
};

export default MonitoramentoSistema;

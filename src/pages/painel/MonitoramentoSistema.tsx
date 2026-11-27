import React, { useState, useEffect, useCallback, useRef } from 'react';
import {monitorCount,monitorCoverage,monitorCacheFresh,monitorPeriodStatus,monitorPool} from '@/lib/monitoringEngine';
import {auditCsvCell} from '@/lib/auditSecurity';
import {storageDiagnosis,growthDiagnosis,inspectTreatmentLinks,LINK_SAMPLE_LIMIT} from '@/lib/monitoringIntegrity';
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
  periodError?:string;
  periodChecked?:boolean;
  durationMs?:number;
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
  const summaryRequest=useRef<AbortController|null>(null);
  const periodRequest=useRef<AbortController|null>(null);
  const linkRequest=useRef<AbortController|null>(null);
  const [linkLoading,setLinkLoading]=useState(false);
  const [linkError,setLinkError]=useState<string|null>(null);
  const [linkResult,setLinkResult]=useState<(ReturnType<typeof inspectTreatmentLinks>&{checkedAt:string})|null>(null);
  const [storageCheckedAt,setStorageCheckedAt]=useState<string|null>(null);
  const periodCache=useRef<number|null>(null);
  const [periodCheckedAt,setPeriodCheckedAt]=useState<number|null>(null);
  const [periodLoading,setPeriodLoading]=useState(false);
  const [periodError,setPeriodError]=useState<string|null>(null);
  
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
      return parsed && Number.isFinite(parsed) && parsed >= 0.001 && parsed <= 1_000_000 ? parsed : null;
    } catch { return null; }
  });
  const [quotaInput, setQuotaInput] = useState(() => String(quotaGB ?? ''));

  const isMaster = user?.role?.toLowerCase().trim() === 'master';

  const fetchStats = useCallback(async () => {
    if(summaryRequest.current)return;
    linkRequest.current?.abort();linkRequest.current=null;setLinkLoading(false);setLinkError(null);setLinkResult(null);setStorageCheckedAt(null);
    periodRequest.current?.abort();periodRequest.current=null;periodCache.current=null;
    setPeriodCheckedAt(null);setPeriodLoading(false);setPeriodError(null);
    setDbStats([]);setStorageStats([]);setAlerts([]);setDatabaseBytes(null);setLastCheck(null);setRefreshDurationMs(null);
    setStorageError('Consulta em andamento.');setAlertsError('Consulta em andamento.');setSystemStatus('parcial');
    const controller=new AbortController();summaryRequest.current=controller;
    const signal=controller.signal,current=()=>summaryRequest.current===controller;
    const timeout=setTimeout(()=>controller.abort(),45_000);
    setRefreshing(true);const started=performance.now();
    try{
      const results=await monitorPool(TABLES,async ({name}):Promise<TableStats>=>{
        const begin=performance.now();
        try{
          const total=await supabase.from(name).select('id',{count:'exact',head:true}).abortSignal(signal);
          const count=monitorCount(total);
          return {name,count,recent7d:null,recent30d:null,error:count===null?(total.error?.message||'Contagem não confirmada.'):undefined,durationMs:Math.round(performance.now()-begin)};
        }catch{return {name,count:null,recent7d:null,recent30d:null,error:'Consulta indisponível.',durationMs:Math.round(performance.now()-begin)};}
      },signal);
      const [alertResult,usageResult]=await Promise.all([
        isMaster?(async()=>{
          try{
            const result=await supabase.from('system_monitoring_alerts').select('id,title,description,severity',{count:'exact'}).eq('resolved',false).order('created_at',{ascending:false}).limit(100).abortSignal(signal);
            return {data:result.error?null:result.data,error:result.error?.message||(!result.data||result.count===null?'Consulta de alertas não confirmada.':result.count!==result.data.length?'Lista parcial de alertas (limite de 100).':null)};
          }catch{return {data:null,error:'Consulta de alertas indisponível.'};}
        })():Promise.resolve({data:null,error:'Alertas restritos ao perfil Master.'}),
        isGlobalAdmin?(async()=>{
          try{
            const {data:{session},error:sessionError}=await supabase.auth.getSession();
            if(sessionError||!session||signal.aborted)throw Error('Sessão não confirmada para consultar armazenamento.');
            const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/get_system_monitoring_usage`,{
              method:'POST',signal,headers:{apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:'{}',
            });
            if(!response.ok)throw Error(response.status===404?'Medidor de armazenamento ainda não disponível neste ambiente.':`Consulta de armazenamento indisponível (${response.status}).`);
            const data=usageSchema.parse(await response.json());
            if(!Number.isFinite(Date.parse(data.checked_at))||!Number.isSafeInteger(data.database_bytes)||!storageDiagnosis(data.buckets.map(b=>({bucket:b.name,fileCount:b.file_count,usedBytes:b.used_bytes,unknownSizeCount:b.unknown_size_count})),null).consistent)throw Error('Medição de armazenamento inconsistente.');
            return {data,error:null as string|null};
          }catch(error){return {data:null,error:error instanceof Error?error.message:'Falha ao medir o armazenamento.'};}
        })():Promise.resolve({data:null,error:'Visão global de armazenamento disponível apenas para o Master Global.'}),
      ]);
      if(!current()||signal.aborted)throw Error('Consulta cancelada.');
      setDbStats(results);setAlerts(alertResult.data??[]);setAlertsError(alertResult.error);
      setStorageError(usageResult.error);
      setStorageStats(usageResult.data?.buckets.map(bucket=>({bucket:bucket.name,fileCount:bucket.file_count,usedBytes:bucket.used_bytes,unknownSizeCount:bucket.unknown_size_count}))??[]);
      setDatabaseBytes(usageResult.data?.database_bytes??null);setStorageCheckedAt(usageResult.data?.checked_at??null);setLastCheck(new Date());
      setSystemStatus(monitorCoverage(results,TABLES.length,!isMaster||!isGlobalAdmin||!!alertResult.error||!!usageResult.error||!usageResult.data||usageResult.data.buckets.some(b=>b.unknown_size_count>0)));
    }catch{
      if(!current())return;
      setDbStats([]);setStorageStats([]);setAlerts([]);setDatabaseBytes(null);setLastCheck(null);
      setStorageError('Consulta indisponível.');setAlertsError('Consulta indisponível.');setStorageCheckedAt(null);setSystemStatus('erro');
      toast.error(signal.aborted?'Tempo limite da consulta atingido.':'Erro ao atualizar dados de monitoramento');
    }finally{
      clearTimeout(timeout);
      if(current()){summaryRequest.current=null;setRefreshDurationMs(Math.round(performance.now()-started));setRefreshing(false);setLoading(false);}
    }
  },[isMaster,isGlobalAdmin]);

  useEffect(()=>{
    void fetchStats();
    return ()=>{const previous=summaryRequest.current;summaryRequest.current=null;previous?.abort();const detail=periodRequest.current;periodRequest.current=null;detail?.abort();periodCache.current=null;const link=linkRequest.current;linkRequest.current=null;link?.abort();};
  },[fetchStats]);

  const fetchPeriods=useCallback(async(force=false)=>{
    if(summaryRequest.current||periodRequest.current||(!force&&monitorCacheFresh(periodCache.current,Date.now())))return;
    const controller=new AbortController();periodRequest.current=controller;
    const signal=controller.signal,current=()=>periodRequest.current===controller;
    const timeout=setTimeout(()=>controller.abort(),45_000);
    setPeriodLoading(true);setPeriodError(null);periodCache.current=null;setPeriodCheckedAt(null);
    setDbStats(rows=>rows.map(row=>({...row,recent7d:null,recent30d:null,periodError:undefined,periodChecked:false})));
    const cutoff=new Date(),seven=new Date(cutoff.getTime()-7*86400000).toISOString(),thirty=new Date(cutoff.getTime()-30*86400000).toISOString();
    try{
      const measured=await monitorPool(TABLES.filter(table=>table.date!==null),async ({name,date})=>{
        let recent7d:number|null=null,recent30d:number|null=null;
        try{
          if(!date)throw Error('Sem campo temporal.');
          recent7d=monitorCount(await supabase.from(name).select('id',{head:true,count:'exact'}).gte(date,seven).lte(date,cutoff.toISOString()).abortSignal(signal));
          if(!signal.aborted)recent30d=monitorCount(await supabase.from(name).select('id',{head:true,count:'exact'}).gte(date,thirty).lte(date,cutoff.toISOString()).abortSignal(signal));
        }catch{/* Unavailable counts stay null. */}
        const periodError=recent7d===null||recent30d===null||recent7d>recent30d?'Contagens do período não confirmadas.':undefined;
        return {name,recent7d,recent30d,periodError,periodChecked:true};
      },signal);
      if(!current()||signal.aborted)throw Error('Consulta cancelada.');
      const byName=new Map<string,(typeof measured)[number]>(measured.map(row=>[row.name,row]));
      setDbStats(rows=>rows.map(row=>({...row,...byName.get(row.name)})));
      if(measured.some(row=>row.periodError))setPeriodError('Há períodos com dados incompletos. Atualize os períodos para tentar novamente.');
      periodCache.current=Date.now();setPeriodCheckedAt(periodCache.current);
    }catch{
      if(current())setPeriodError(signal.aborted?'Tempo limite da consulta de períodos atingido.':'Períodos indisponíveis.');
    }finally{
      clearTimeout(timeout);if(current()){periodRequest.current=null;setPeriodLoading(false);}
    }
  },[]);

  useEffect(()=>{
    if(activeTab!=='banco_dados'||refreshing||!lastCheck)return;
    void fetchPeriods();
    return ()=>{const previous=periodRequest.current;if(previous){periodRequest.current=null;previous.abort();setPeriodLoading(false);}};
  },[activeTab,refreshing,lastCheck,fetchPeriods]);

  const storageBytes = storageStats.reduce((sum, bucket) => sum + bucket.usedBytes, 0);
  const unknownSizeCount = storageStats.reduce((sum, bucket) => sum + bucket.unknownSizeCount, 0);
  const checkedTables = dbStats.filter(table => table.count !== null).length;
  const hasStorageUsage = !!lastCheck && databaseBytes!==null && !storageError;
  const quotaBytes = quotaGB === null ? null : quotaGB * 1024 ** 3;

  const storage=storageDiagnosis(storageStats,quotaBytes);
  const growth=growthDiagnosis(dbStats);
  const canInspectLinks=isGlobalAdmin&&isMaster&&user?.ativo===true;
  const checkLinks=async()=>{
    if(!canInspectLinks||summaryRequest.current||periodRequest.current||linkRequest.current)return;
    const controller=new AbortController();linkRequest.current=controller;
    const signal=controller.signal,current=()=>linkRequest.current===controller;
    const timeout=setTimeout(()=>controller.abort(),30_000);
    setLinkLoading(true);setLinkResult(null);setLinkError(null);
    try{
      const {data,error}=await supabase.from('treatment_sessions').select('id,cycle_id,patient_id').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(LINK_SAMPLE_LIMIT).abortSignal(signal);
      if(error||!data||signal.aborted)throw Error('Amostra de sessões indisponível.');
      const ids=[...new Set(data.map(row=>row.cycle_id).filter(Boolean))];
      const cycles=ids.length?await supabase.from('treatment_cycles').select('id,patient_id').in('id',ids).limit(LINK_SAMPLE_LIMIT).abortSignal(signal):{data:[],error:null};
      if(cycles.error||!cycles.data||signal.aborted)throw Error('Consulta de ciclos indisponível.');
      const result=inspectTreatmentLinks(data,cycles.data);
      if(current())setLinkResult({...result,checkedAt:new Date().toISOString()});
    }catch{if(current())setLinkError(signal.aborted?'Tempo limite da conferência atingido.':'Conferência amostral indisponível. Nenhuma conclusão emitida.');}
    finally{clearTimeout(timeout);if(current()){linkRequest.current=null;setLinkLoading(false);}}
  };
  useEffect(()=>{
    if(activeTab==='limpeza'&&canInspectLinks)return;
    const previous=linkRequest.current;linkRequest.current=null;previous?.abort();
    setLinkLoading(false);setLinkResult(null);setLinkError(null);
  },[activeTab,canInspectLinks]);

  const saveQuota = () => {
    const next = Number(quotaInput.replace(',', '.'));
    if (!Number.isFinite(next) || next < 0.001 || next > 1_000_000) {
      toast.error('Informe uma referência entre 0,001 e 1.000.000 GB.');
      return;
    }
    try {
      localStorage.setItem(quotaStorageKey, String(next));
      setQuotaGB(next);
      toast.success('Referência salva somente neste navegador.');
    } catch { toast.error('Não foi possível salvar a referência neste navegador.'); }
  };

  const exportReport = () => {
    if(summaryRequest.current||periodRequest.current||linkRequest.current||!dbStats.length)return;
    const lines = [
      ['Tipo', 'Item', 'Total', '7 dias', '30 dias', 'Status', 'Períodos'],
      ['Consulta geral',lastCheck?.toISOString()??'Não concluída','','','',systemStatus,''],
      ['Consulta de períodos',periodCheckedAt===null?'Não concluída':new Date(periodCheckedAt).toISOString(),'','','',periodError??(periodCheckedAt===null?'Sob demanda':'Consulte status por tabela'),''],
      ...dbStats.map(table => ['Tabela', table.name, table.count ?? 'Indisponível', table.recent7d ?? 'N/D', table.recent30d ?? 'N/D', table.error ? 'Falha' : 'Consultado',monitorPeriodStatus(table,TABLES.some(t=>t.name===table.name&&t.date!==null))]),
      ['Alertas','Consulta',alertsError?'Não confirmado':alerts.length,'','',alertsError??'Consultado',''],
      ['Banco','Tamanho em bytes',databaseBytes??'Não medido','','',storageError??'Consultado',''],
      ['Storage','Medição',storageCheckedAt??'Não medido','','',storageError??(storage.complete?'Metadados completos':'Medição parcial'),''],
      ['Storage','Referência local em bytes',isGlobalAdmin?(quotaBytes??'Não informada'):'Restrita','','','Não é cota validada pelo provedor',''],
      ['Storage','Saldo estimado em bytes',hasStorageUsage?storage.remaining??'Não calculável':'Não medido','','','Arquivos atuais; não faturamento',''],
      ['Crescimento','Registros recentes','','','','Não equivale a crescimento líquido',''],
      ...storageStats.map(bucket => ['Storage', bucket.bucket, bucket.fileCount, '', '', `${bucket.usedBytes} bytes medidos`,`${bucket.unknownSizeCount} sem tamanho informado`]),
    ];
    const csv = lines.map(row => row.map(auditCsvCell).join(';')).join('\r\n');
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
    <div className="clinical-hub space-y-3 min-w-0">
      <div className="clinical-premium p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          {embedded?<h2 className="text-xl font-bold font-display text-foreground flex items-center gap-2"><Activity className="w-5 h-5 text-primary" aria-hidden="true"/>Monitoramento do Sistema</h2>:
          <h1 className="text-2xl font-bold font-display text-foreground flex items-center gap-2"><Activity className="w-6 h-6 text-primary" aria-hidden="true"/>Monitoramento do Sistema</h1>}
          <p className="text-muted-foreground text-sm">
            Acompanhe as medições disponíveis nesta sessão. O diagnóstico não equivale à disponibilidade global do sistema.
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
          <Button variant="outline" size="sm" onClick={exportReport} disabled={refreshing||periodLoading||linkLoading||dbStats.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Exportar relatório
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-2">
        <Card className="clinical-premium min-w-0">
          <CardContent className="p-3 flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center ${
              systemStatus === 'verificado' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
              systemStatus === 'parcial' ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
            }`}>
              <Zap className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">Status</p>
              <p className="text-base sm:text-lg font-bold tabular-nums break-words">{systemStatus === 'parcial' ? 'Dados parciais' : systemStatus === 'erro' ? 'Consulta indisponível' : 'Consultado'}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="clinical-premium min-w-0">
          <CardContent className="p-3 flex items-center gap-2.5 min-w-0">
            <div className="clinical-dock-icon clinical-tone-blue shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">Banco de Dados</p>
              <p className="text-base sm:text-lg font-bold tabular-nums break-words">{refreshing?'Consultando…':checkedTables+'/'+TABLES.length+' tabelas'}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="clinical-premium min-w-0">
          <CardContent className="p-3 flex items-center gap-2.5 min-w-0">
            <div className="clinical-dock-icon clinical-tone-violet shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">Storage</p>
              <p className="text-base sm:text-lg font-bold tabular-nums break-words">{hasStorageUsage ? `${storageStats.length} buckets` : 'Não verificado'}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="clinical-premium min-w-0">
          <CardContent className="p-3 flex items-center gap-2.5 min-w-0">
            <div className="clinical-dock-icon clinical-tone-slate shrink-0">
              <Server className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">Tamanho do banco</p>
              <p className="text-base sm:text-lg font-bold tabular-nums break-words">{databaseBytes !== null ? formatBytes(databaseBytes) : 'Não medido'}</p>
              <p className="text-xs text-muted-foreground">Banco de dados</p>
            </div>
          </CardContent>
        </Card>

        <Card className="clinical-premium min-w-0">
          <CardContent className="p-3 flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center ${
              alertsError ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300' : alerts.length > 0 ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
            }`}>
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">Alertas</p>
              <p className="text-base sm:text-lg font-bold tabular-nums break-words">{alertsError ? (alerts.length>0?alerts.length+' retornados · parcial':'Não verificado') : `${alerts.length} ativos`}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="clinical-premium p-2 min-w-0">
          <TabsList className="clinical-dock flex h-auto w-full flex-wrap justify-start gap-1 p-1">
            <TabsTrigger value="visao_geral" className="gap-1.5 min-h-10 h-auto whitespace-normal text-xs sm:text-sm"><Info className="w-4 h-4" /> Visão Geral</TabsTrigger>
            <TabsTrigger value="banco_dados" className="gap-1.5 min-h-10 h-auto whitespace-normal text-xs sm:text-sm"><Database className="w-4 h-4" /> Banco de Dados</TabsTrigger>
            <TabsTrigger value="arquivos" className="gap-1.5 min-h-10 h-auto whitespace-normal text-xs sm:text-sm"><HardDrive className="w-4 h-4" /> Arquivos e Storage</TabsTrigger>
            <TabsTrigger value="desempenho" className="gap-1.5 min-h-10 h-auto whitespace-normal text-xs sm:text-sm"><Activity className="w-4 h-4" /> Desempenho</TabsTrigger>
            <TabsTrigger value="hospedagem" className="gap-1.5 min-h-10 h-auto whitespace-normal text-xs sm:text-sm"><Globe className="w-4 h-4" /> Ambiente</TabsTrigger>
            <TabsTrigger value="supabase" className="gap-1.5 min-h-10 h-auto whitespace-normal text-xs sm:text-sm"><Network className="w-4 h-4" /> Conexões</TabsTrigger>
            {isMaster && (
              <TabsTrigger value="limpeza" className="gap-1.5 min-h-10 h-auto whitespace-normal text-xs sm:text-sm"><Trash2 className="w-4 h-4" /> Retenção</TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="visao_geral" className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="clinical-premium min-w-0">
              <CardHeader className="p-3 sm:p-4">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-warning" />
                  Alertas do Sistema
                </CardTitle>
                <CardDescription>Pendências e recomendações técnicas</CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0">
                {alertsError&&<Alert className="mb-2"><AlertTriangle className="h-4 w-4" /><AlertTitle>Consulta de alertas não integral</AlertTitle><AlertDescription>{alertsError}</AlertDescription></Alert>}
                {!alertsError&&alerts.length === 0 ? (
                  <div className="clinical-inset rounded-xl border py-6 px-3 text-center text-muted-foreground">
                    <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                    <p>Nenhum alerta ativo retornado pela consulta.</p>
                  </div>
                ) : alerts.length>0?(
                  <div className="space-y-3">
                    {alerts.map((alert) => (
                      <Alert key={alert.id} variant={alert.severity === 'critico' ? 'destructive' : 'default'}>
                        <AlertTitle>{alert.title}</AlertTitle>
                        <AlertDescription>{alert.description}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                ):null}
              </CardContent>
            </Card>

            <Card className="clinical-premium min-w-0">
              <CardHeader className="p-3 sm:p-4">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-primary" />
                  Logs &amp; Auditoria
                </CardTitle>
                <CardDescription>Acesso ao histórico de eventos registrados</CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0">
                <p className="text-sm text-muted-foreground">Os eventos estão na central de Logs &amp; Auditoria, com as permissões próprias. Nenhum evento individual é carregado nesta visão.</p>
                <Button variant="link" className="p-0 h-auto mt-4" onClick={() => window.location.href='/painel/auditoria'}>
                  Ver todos os logs →
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="banco_dados" className="space-y-3">
          <Card className="clinical-premium min-w-0">
            <CardHeader className="p-3 sm:p-4">
              <CardTitle>Estatísticas das Tabelas</CardTitle>
              <CardDescription>Contagens dos registros visíveis ao seu perfil. Períodos móveis de 7 e 30 dias carregados sob demanda.</CardDescription>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <p role="status" className="text-xs text-muted-foreground">{periodLoading?'Consultando períodos…':periodCheckedAt!==null?'Períodos consultados em '+format(new Date(periodCheckedAt),'dd/MM/yyyy HH:mm:ss'):'Períodos não consultados'}</p>
                <Button size="sm" variant="outline" onClick={()=>void fetchPeriods(true)} disabled={refreshing||periodLoading||!lastCheck}>Atualizar períodos</Button>
              </div>
              {periodError&&<Alert className="mb-3"><AlertTriangle className="h-4 w-4"/><AlertTitle>Períodos incompletos</AlertTitle><AlertDescription>{periodError}</AlertDescription></Alert>}
              <div className="overflow-x-auto rounded-lg border">
              <Table className="min-w-[620px]">
                <TableHeader className="clinical-inset">
                  <TableRow>
                    <TableHead>Tabela</TableHead>
                    <TableHead className="text-right tabular-nums">Registros Totais</TableHead>
                    <TableHead className="text-right tabular-nums">Últimos 7 dias</TableHead>
                    <TableHead className="text-right tabular-nums">Últimos 30 dias</TableHead>
                    <TableHead>Status total</TableHead><TableHead>Períodos</TableHead><TableHead className="text-right">Tempo (total)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dbStats.map((table) => (
                    <TableRow key={table.name}>
                      <TableCell className="font-medium break-words">{table.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{table.count?.toLocaleString('pt-BR') ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{table.recent7d?.toLocaleString('pt-BR') ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{table.recent30d?.toLocaleString('pt-BR') ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={table.error ? 'destructive' : 'outline'} title={table.error}>
                          {table.error ? 'Falha na consulta' : 'Consultado'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs" title={table.periodError}>{monitorPeriodStatus(table,TABLES.some(t=>t.name===table.name&&t.date!==null))}</TableCell>
                      <TableCell className="text-right tabular-nums">{table.durationMs===undefined?'—':table.durationMs+' ms'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
          <Card className="clinical-premium min-w-0">
            <CardHeader className="p-3 sm:p-4"><CardTitle className="text-base font-display">Volume recente de registros</CardTitle><CardDescription>Classificação pelos últimos 30 dias entre as tabelas com contagens coerentes. Não mede crescimento líquido nem espaço em disco.</CardDescription></CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 space-y-2">
              {growth.inconsistent>0&&<Alert><AlertTriangle className="h-4 w-4"/><AlertDescription>{growth.inconsistent} tabela(s) com contagens de momentos diferentes potencialmente divergentes; excluídas da classificação.</AlertDescription></Alert>}
              {growth.ranked.length===0?<p className="text-sm text-muted-foreground">{periodLoading?'Consultando períodos…':'Nenhum período coerente disponível para classificação.'}</p>:growth.ranked.map(row=><div key={row.name} className="clinical-inset rounded-lg border p-2.5 space-y-1"><div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{row.name}</strong><span className="tabular-nums">{row.recent30d.toLocaleString('pt-BR')} em 30 dias · {row.recent7d.toLocaleString('pt-BR')} em 7 dias</span></div><div className="h-2 rounded-full bg-muted overflow-hidden" aria-hidden="true"><div className="h-full rounded-full bg-primary" style={{width:row.share+'%'}}/></div><p className="text-xs text-muted-foreground">{row.share.toLocaleString('pt-BR',{maximumFractionDigits:1})}% dos registros atualmente visíveis, conforme contagens consultadas.</p></div>)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="arquivos">
          <div className="space-y-3">
            {storageError ? (
              <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Uso do Storage não verificado</AlertTitle><AlertDescription>{storageError}</AlertDescription></Alert>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Card className="clinical-premium min-w-0"><CardContent className="p-3"><p className="text-sm text-muted-foreground">Arquivos armazenados</p><p className="text-xl sm:text-2xl font-bold tabular-nums break-words">{storageStats.reduce((total, bucket) => total + bucket.fileCount, 0).toLocaleString('pt-BR')}</p></CardContent></Card>
                  <Card className="clinical-premium min-w-0"><CardContent className="p-3"><p className="text-sm text-muted-foreground">Espaço usado em arquivos</p><p className="text-xl sm:text-2xl font-bold tabular-nums break-words">{formatBytes(storageBytes)}</p></CardContent></Card>
                  <Card className="clinical-premium min-w-0"><CardContent className="p-3"><p className="text-sm text-muted-foreground">Espaço restante estimado</p><p className="text-xl sm:text-2xl font-bold tabular-nums break-words">{storage.remaining===null?'Não calculável':formatBytes(storage.remaining)}</p></CardContent></Card>
                </div>
                {storageCheckedAt&&<p className="text-xs text-muted-foreground">Medição do servidor: {new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Santarem',dateStyle:'short',timeStyle:'medium'}).format(new Date(storageCheckedAt))} · espaço medido nos metadados.</p>}
                {storage.percent!==null&&<Card className="clinical-premium"><CardContent className="p-3 space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Uso da referência local</strong><span className="font-semibold tabular-nums">{storage.complete?'':'Pelo menos '}{storage.percent.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</span></div><div className="h-2.5 rounded-full bg-muted overflow-hidden" aria-hidden="true"><div className={'h-full rounded-full '+(storage.level==='critical'||storage.level==='exceeded'?'bg-destructive':storage.level==='attention'?'bg-amber-500':'bg-primary')} style={{width:Math.min(100,storage.percent)+'%'}}/></div><p className="text-xs text-muted-foreground">{storage.level==='exceeded'?'Referência atingida ou excedida.':storage.level==='critical'?'Atenção prioritária: pelo menos 90% da referência.':storage.level==='attention'?'Atenção: pelo menos 75% da referência.':storage.level==='partial'?'Medição incompleta: não é possível confirmar capacidade restante.':'Abaixo da faixa de atenção da referência local.'} Limite informado manualmente, não validado pelo provedor.</p></CardContent></Card>}
                {unknownSizeCount > 0 && <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Medição incompleta</AlertTitle><AlertDescription>{unknownSizeCount} arquivo(s) sem tamanho informado nos metadados. O total pode ser maior.</AlertDescription></Alert>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {storage.ranked.map((s) => (
                    <Card key={s.bucket} className="clinical-premium min-w-0">
                      <CardHeader className="p-3 pb-2"><CardTitle className="text-sm font-display break-all">{s.bucket}</CardTitle></CardHeader>
                      <CardContent className="space-y-2 p-3 pt-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-semibold tabular-nums">{formatBytes(s.usedBytes)}</span>
                        <span className="text-xs text-muted-foreground">{s.fileCount.toLocaleString('pt-BR')} arquivo(s)</span></div>
                        {storageBytes>0&&<div><div className="h-2 rounded-full bg-muted overflow-hidden" aria-hidden="true"><div className="h-full rounded-full bg-primary" style={{width:Math.min(100,Math.max(0,s.usedBytes/storageBytes*100))+'%'}}/></div><p className="mt-1 text-[11px] text-muted-foreground">{(s.usedBytes/storageBytes*100).toLocaleString('pt-BR',{maximumFractionDigits:1})}% do espaço medido</p></div>}
                        {s.unknownSizeCount>0&&<p className="text-xs text-amber-700 dark:text-amber-300">{s.unknownSizeCount.toLocaleString('pt-BR')} arquivo(s) sem tamanho informado</p>}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
            {isGlobalAdmin && (
              <Card className="clinical-premium min-w-0"><CardHeader className="p-3 sm:p-4"><CardTitle className="text-base">Referência para estimar o espaço restante</CardTitle><CardDescription>O Lovable Cloud não informa o limite contratado à aplicação. Consulte o limite no painel do provedor e informe-o aqui; este valor fica apenas neste navegador e não altera seu plano.</CardDescription></CardHeader>
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
          <Card className="clinical-premium min-w-0">
            <CardHeader className="p-3 sm:p-4">
              <CardTitle>Monitoramento de Desempenho</CardTitle>
              <CardDescription>Medidas desta consulta no seu navegador, sem inferir a saúde de outros serviços.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-3 sm:p-4 pt-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="clinical-inset p-3 border rounded-xl min-w-0">
                  <p className="text-sm text-muted-foreground mb-1">Duração da consulta geral</p>
                  <p className="text-xl sm:text-2xl font-bold tabular-nums break-words">{refreshDurationMs === null ? '—' : `${refreshDurationMs.toLocaleString('pt-BR')} ms`}</p>
                </div>
                <div className="clinical-inset p-3 border rounded-xl min-w-0">
                  <p className="text-sm text-muted-foreground mb-1">Tabelas consultadas</p>
                  <p className="text-xl sm:text-2xl font-bold tabular-nums break-words">{checkedTables}/{TABLES.length}</p>
                </div>
                <div className="clinical-inset p-3 border rounded-xl min-w-0">
                  <p className="text-sm text-muted-foreground mb-1">Falhas na consulta geral</p>
                  <p className="text-xl sm:text-2xl font-bold tabular-nums break-words">{refreshing||!lastCheck?'—':dbStats.filter(table => table.error).length + Number(Boolean(isGlobalAdmin && storageError)) + Number(Boolean(isMaster && alertsError))}</p>
                </div>
              </div>
              
              <Alert>
                <Info className="w-4 h-4" />
                <AlertTitle>Recomendação</AlertTitle>
                <AlertDescription>O tempo acima mede apenas a consulta geral desta página; os períodos são consultados separadamente. Histórico de disponibilidade, erros em 24 horas e desempenho de todos os usuários exigem telemetria própria; não são inferidos daqui.</AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hospedagem">
          <Card className="clinical-premium min-w-0">
            <CardHeader className="p-3 sm:p-4">
              <CardTitle>Ambiente da aplicação</CardTitle>
              <CardDescription>Informações verificáveis nesta sessão</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-3 sm:p-4 pt-0">
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
          <Card className="clinical-premium min-w-0">
            <CardHeader className="p-3 sm:p-4">
              <CardTitle className="flex items-center gap-2">
                <Network className="w-5 h-5 text-primary" />
                Estado das consultas
              </CardTitle>
              <CardDescription>Somente serviços consultados nesta página recebem um resultado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-2">
                <div className="clinical-inset p-3 border rounded-xl text-left min-w-0">
                  <p className="text-xs text-muted-foreground uppercase">Database</p>
                  <p className="text-sm font-bold">{refreshing?'Consultando':checkedTables===TABLES.length?'Consultas confirmadas':checkedTables>0?'Consultas parciais':'Não verificado'}</p>
                </div>
                <div className="clinical-inset p-3 border rounded-xl text-left min-w-0">
                  <p className="text-xs text-muted-foreground uppercase">Auth</p>
                  <p className="text-sm font-bold">Sessão da aplicação · não testada</p>
                </div>
                <div className="clinical-inset p-3 border rounded-xl text-left min-w-0">
                  <p className="text-xs text-muted-foreground uppercase">Storage</p>
                  <p className="text-sm font-bold">{hasStorageUsage ? 'Consulta respondeu' : 'Não verificado'}</p>
                </div>
                <div className="clinical-inset p-3 border rounded-xl text-left min-w-0">
                  <p className="text-xs text-muted-foreground uppercase">Realtime</p>
                  <p className="text-sm font-bold">Não verificado</p>
                </div>
              </div>
              <Button variant="outline" className="w-full md:w-auto" onClick={fetchStats} disabled={refreshing}>Repetir consultas disponíveis</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="limpeza" className="space-y-3">
          {canInspectLinks&&<Card className="clinical-premium min-w-0"><CardHeader className="p-3 sm:p-4"><CardTitle className="text-base font-display">Conferência de vínculos de tratamento</CardTitle><CardDescription>Amostra de até {LINK_SAMPLE_LIMIT} sessões mais recentes visíveis à sessão atual. Compara identificadores de paciente e ciclo, sem carregar nomes ou dados clínicos.</CardDescription></CardHeader><CardContent className="p-3 sm:p-4 pt-0 space-y-3">
            <Button variant="outline" size="sm" onClick={()=>void checkLinks()} disabled={refreshing||periodLoading||linkLoading}>{linkLoading?'Conferindo…':'Conferir vínculos da amostra'}</Button>
            {linkError&&<Alert><AlertTriangle className="h-4 w-4"/><AlertDescription>{linkError}</AlertDescription></Alert>}
            {linkResult&&<><p className="text-xs text-muted-foreground">Amostra: {linkResult.sample} sessões · {new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Santarem',dateStyle:'short',timeStyle:'medium'}).format(new Date(linkResult.checkedAt))}</p><div className="grid grid-cols-2 lg:grid-cols-4 gap-2">{[{label:'Vínculos coerentes',value:linkResult.confirmed},{label:'Ciclo não localizado no escopo',value:linkResult.missing},{label:'Paciente divergente',value:linkResult.mismatch},{label:'Identificador incompleto',value:linkResult.incomplete}].map(r=><div key={r.label} className="clinical-inset rounded-lg border p-2.5"><p className="text-xl font-bold tabular-nums">{r.value}</p><p className="text-xs text-muted-foreground">{r.label}</p></div>)}</div></>}
            <p className="text-xs text-muted-foreground">Resultado amostral, não auditoria integral. Ciclo não localizado pode estar fora do escopo de leitura; não comprova registro órfão. Nenhuma correção automática.</p>
          </CardContent></Card>}
          <Card className="clinical-premium"><CardHeader className="p-3 sm:p-4"><CardTitle className="text-base font-display">Retenção e integridade de arquivos</CardTitle><CardDescription>Diagnóstico agregado da medição disponível.</CardDescription></CardHeader><CardContent className="p-3 sm:p-4 pt-0 space-y-2"><p className="text-sm">Eventos de auditoria visíveis: {dbStats.find(t=>t.name==='action_logs')?.count?.toLocaleString('pt-BR')??'Não verificado'}</p><p className="text-sm">Arquivos sem tamanho informado: {hasStorageUsage?unknownSizeCount.toLocaleString('pt-BR'):'Não verificado'}</p><p className="text-xs text-muted-foreground">Metadados sem tamanho não comprovam arquivo corrompido ou órfão. Inventário integral e política de retenção dependem de conferência autorizada; nenhum arquivo ou log é removido.</p></CardContent></Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="clinical-premium border-destructive/30 min-w-0">
              <CardHeader className="p-3 sm:p-4">
                <CardTitle className="text-destructive flex items-center gap-2">
                  <Trash2 className="w-5 h-5" />
                  Limpeza de Logs Antigos
                </CardTitle>
                <CardDescription>Revisão antes de qualquer política de retenção</CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0">
                <p className="text-sm text-muted-foreground">A exclusão automática está indisponível. Para preservar a auditoria, é preciso definir previamente quais logs são descartáveis, apresentar uma prévia da quantidade e validar uma rotina de limpeza com autorização no servidor.</p>
              </CardContent>
            </Card>

            <Card className="clinical-premium min-w-0">
              <CardHeader className="p-3 sm:p-4">
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-primary" />
                  Arquivos Órfãos
                </CardTitle>
                <CardDescription>Identificar anexos sem vínculo no banco</CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0">
                <p className="text-sm text-muted-foreground">A identificação de arquivos órfãos exige conferir os vínculos de cada módulo. Nenhum arquivo é excluído por esta página.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="clinical-premium text-center py-2 px-3">
        <p className="text-xs text-muted-foreground">
          Última consulta geral: {lastCheck ? format(lastCheck, "HH:mm:ss 'em' dd/MM/yyyy", { locale: ptBR }) : 'ainda não concluída'}
        </p>
      </div>
    </div>
  );
};

export default MonitoramentoSistema;

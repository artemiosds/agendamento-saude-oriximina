import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, CheckCircle2, AlertCircle, Loader2, Database, XCircle, AlertTriangle } from 'lucide-react';
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

const SPECIALTY_MAP = [
  { grupo: '03', subgrupo: '05', especialidade: 'fisioterapia' },
  { grupo: '03', subgrupo: '06', especialidade: 'fisioterapia' },
  { grupo: '03', subgrupo: '07', especialidade: 'nutricao' },
  { grupo: '03', subgrupo: '08', especialidade: 'psicologia' },
  { grupo: '03', subgrupo: '09', especialidade: 'terapia_ocupacional' },
  { grupo: '03', subgrupo: '10', especialidade: 'fonoaudiologia' },
  { grupo: '03', subgrupo: '11', especialidade: 'assistencia_social' },
  { grupo: '03', subgrupo: '01', especialidade: 'enfermagem' },
  { grupo: '03', subgrupo: '02', especialidade: 'medico' },
];

const DATASUS_URL = 'https://servicos.saude.gov.br/sigtap/ProcedimentoService/v1';

const CORS_PROXIES = [
  { name: 'corsproxy.io', buildUrl: (u: string) => `https://corsproxy.io/?url=${encodeURIComponent(u)}` },
  { name: 'allorigins.win', buildUrl: (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
  { name: 'thingproxy', buildUrl: (u: string) => `https://thingproxy.freeboard.io/fetch/${u}` },
];

function getCompetencia(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function buildSoapPesquisar(grupo: string, subgrupo: string, competencia: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope 
  xmlns:soap="http://www.w3.org/2003/05/soap-envelope" 
  xmlns:proc="http://servicos.saude.gov.br/sigtap/v1/procedimentoservice" 
  xmlns:grup="http://servicos.saude.gov.br/schema/sigtap/procedimento/nivelagregacao/v1/grupo" 
  xmlns:sub="http://servicos.saude.gov.br/schema/sigtap/procedimento/nivelagregacao/v1/subgrupo" 
  xmlns:com="http://servicos.saude.gov.br/schema/corporativo/v1/competencia" 
  xmlns:pag="http://servicos.saude.gov.br/wsdl/mensageria/v1/paginacao">
  <soap:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken 
        wsu:Id="Id-0001334008436683-000000002c4a1908-1" 
        xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
        <wsse:Username>SIGTAP.PUBLICO</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">sigtap#2015public</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    <proc:requestPesquisarProcedimentos>
      <grup:codigoGrupo>${grupo}</grup:codigoGrupo>
      <sub:codigoSubgrupo>${subgrupo}</sub:codigoSubgrupo>
      <com:competencia>${competencia}</com:competencia>
      <pag:Paginacao>
        <pag:registroInicial>01</pag:registroInicial>
        <pag:quantidadeRegistros>100</pag:quantidadeRegistros>
        <pag:totalRegistros>100</pag:totalRegistros>
      </pag:Paginacao>
    </proc:requestPesquisarProcedimentos>
  </soap:Body>
</soap:Envelope>`;
}

function buildSoapDetalhar(codigoProcedimento: string, competencia: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope 
  xmlns:soap="http://www.w3.org/2003/05/soap-envelope" 
  xmlns:proc="http://servicos.saude.gov.br/sigtap/v1/procedimentoservice" 
  xmlns:proc1="http://servicos.saude.gov.br/schema/sigtap/procedimento/v1/procedimento" 
  xmlns:com="http://servicos.saude.gov.br/schema/corporativo/v1/competencia" 
  xmlns:det="http://servicos.saude.gov.br/wsdl/mensageria/sigtap/v1/detalheadicional" 
  xmlns:pag="http://servicos.saude.gov.br/wsdl/mensageria/v1/paginacao">
  <soap:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken 
        wsu:Id="Id-0001334008436683-000000002c4a1908-1" 
        xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
        <wsse:Username>SIGTAP.PUBLICO</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">sigtap#2015public</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    <proc:requestDetalharProcedimento>
      <proc1:codigoProcedimento>${codigoProcedimento}</proc1:codigoProcedimento>
      <com:competencia>${competencia}</com:competencia>
      <proc:DetalhesAdicionais>
        <det:DetalheAdicional>
          <det:categoriaDetalheAdicional>CIDS</det:categoriaDetalheAdicional>
          <det:Paginacao>
            <pag:registroInicial>1</pag:registroInicial>
            <pag:quantidadeRegistros>999</pag:quantidadeRegistros>
            <pag:totalRegistros>999</pag:totalRegistros>
          </det:Paginacao>
        </det:DetalheAdicional>
      </proc:DetalhesAdicionais>
    </proc:requestDetalharProcedimento>
  </soap:Body>
</soap:Envelope>`;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface ProcInfo { codigo: string; nome: string; }
interface CidInfo { codigo: string; descricao: string; }

function parseCodigosNomes(xmlText: string): ProcInfo[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const results: ProcInfo[] = [];
  const codigos = doc.getElementsByTagNameNS('*', 'codigoProcedimento');
  const nomes = doc.getElementsByTagNameNS('*', 'nomeProcedimento');

  // Fallback to generic names
  const codigosArr = codigos.length > 0 ? codigos : doc.getElementsByTagNameNS('*', 'codigo');
  const nomesArr = nomes.length > 0 ? nomes : doc.getElementsByTagNameNS('*', 'nome');

  for (let i = 0; i < codigosArr.length; i++) {
    const codigo = codigosArr[i]?.textContent?.trim();
    const nome = nomesArr[i]?.textContent?.trim();
    if (codigo && nome && /^\d{10}$/.test(codigo)) {
      results.push({ codigo, nome });
    }
  }
  return results;
}

function parseCids(xmlText: string): CidInfo[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const cids: CidInfo[] = [];

  // Try codigoCid / nomeCid (case variations)
  const cidEls = doc.getElementsByTagNameNS('*', 'codigoCid');
  const descEls = doc.getElementsByTagNameNS('*', 'nomeCid');

  if (cidEls.length === 0) {
    // Try codigoCID / nomeCID
    const cidEls2 = doc.getElementsByTagNameNS('*', 'codigoCID');
    const descEls2 = doc.getElementsByTagNameNS('*', 'nomeCID');
    for (let i = 0; i < cidEls2.length; i++) {
      const codigo = cidEls2[i]?.textContent?.trim();
      const descricao = descEls2[i]?.textContent?.trim() || '';
      if (codigo) cids.push({ codigo, descricao });
    }
    return cids;
  }

  for (let i = 0; i < cidEls.length; i++) {
    const codigo = cidEls[i]?.textContent?.trim();
    const descricao = descEls[i]?.textContent?.trim() || '';
    if (codigo) cids.push({ codigo, descricao });
  }
  return cids;
}

function hasFault(xmlText: string): string | null {
  if (!xmlText.includes('Fault') && !xmlText.includes('fault')) return null;
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const faults = doc.getElementsByTagNameNS('*', 'Text');
  if (faults.length > 0) return faults[0]?.textContent?.trim() || 'Erro DATASUS';
  const faultStr = doc.getElementsByTagNameNS('*', 'faultstring');
  if (faultStr.length > 0) return faultStr[0]?.textContent?.trim() || 'Erro DATASUS';
  return 'Erro desconhecido do DATASUS';
}

interface SyncResult {
  especialidade: string;
  procedimentos: number;
  cids: number;
  error?: string;
}

interface SpecProgress {
  especialidade: string;
  label: string;
  status: 'waiting' | 'fetching' | 'done' | 'error' | 'warning';
  procedimentos: number;
  cids: number;
  message: string;
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

const SigtapSyncPanel: React.FC = () => {
  const [selected, setSelected] = useState<Set<string>>(new Set(ALL_SPECIALTIES.map(s => s.key)));
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState<SyncResult[] | null>(null);
  const [history, setHistory] = useState<SyncHistory[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [progress, setProgress] = useState<SpecProgress[]>([]);
  const [progressPct, setProgressPct] = useState(0);
  const [activeProxy, setActiveProxy] = useState<string>('');
  const cancelledRef = useRef(false);

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

  // Try each CORS proxy in order until one works
  async function callDatasus(soapBody: string): Promise<string> {
    let lastError: Error | null = null;

    for (const proxy of CORS_PROXIES) {
      try {
        const url = proxy.buildUrl(DATASUS_URL);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45000);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/soap+xml;charset=UTF-8',
            'x-requested-with': 'XMLHttpRequest',
          },
          body: soapBody,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();
        if (!text || text.length < 50) {
          throw new Error('Resposta vazia do proxy');
        }

        setActiveProxy(proxy.name);
        return text;
      } catch (err: any) {
        lastError = err;
        console.warn(`[SIGTAP] Proxy ${proxy.name} falhou:`, err.message);
        continue;
      }
    }

    throw new Error(`Todos os proxies falharam. Último erro: ${lastError?.message}`);
  }

  const handleSync = async () => {
    if (selected.size === 0) {
      toast.error('Selecione ao menos uma especialidade');
      return;
    }

    cancelledRef.current = false;
    setSyncing(true);
    setResults(null);
    setShowResults(false);
    setActiveProxy('');

    const competencia = getCompetencia();
    const selectedSpecs = ALL_SPECIALTIES.filter(s => selected.has(s.key));

    // Group subgroups by specialty
    const specSubgroups: Record<string, typeof SPECIALTY_MAP> = {};
    for (const m of SPECIALTY_MAP) {
      if (!selected.has(m.especialidade)) continue;
      if (!specSubgroups[m.especialidade]) specSubgroups[m.especialidade] = [];
      specSubgroups[m.especialidade].push(m);
    }

    // Init progress
    const initProgress: SpecProgress[] = selectedSpecs.map(s => ({
      especialidade: s.key,
      label: s.label,
      status: 'waiting',
      procedimentos: 0,
      cids: 0,
      message: 'Aguardando...',
    }));
    setProgress(initProgress);

    const finalResults: SyncResult[] = [];
    let completedCount = 0;
    const totalSpecs = selectedSpecs.length;

    for (const spec of selectedSpecs) {
      if (cancelledRef.current) break;

      const subgroups = specSubgroups[spec.key] || [];
      
      // Update progress: fetching
      setProgress(prev => prev.map(p =>
        p.especialidade === spec.key
          ? { ...p, status: 'fetching', message: `Buscando subgrupo${subgroups.length > 1 ? 's' : ''} ${subgroups.map(s => s.subgrupo).join(', ')}...` }
          : p
      ));

      try {
        let allProcs: ProcInfo[] = [];

        for (const sg of subgroups) {
          if (cancelledRef.current) break;

          setProgress(prev => prev.map(p =>
            p.especialidade === spec.key
              ? { ...p, message: `Buscando subgrupo ${sg.subgrupo}...${activeProxy ? ` (via ${activeProxy})` : ''}` }
              : p
          ));

          const pesquisarXml = buildSoapPesquisar(sg.grupo, sg.subgrupo, competencia);
          const pesquisarResponse = await callDatasus(pesquisarXml);

          const fault = hasFault(pesquisarResponse);
          if (fault) {
            console.warn(`[SIGTAP] Fault ${spec.key}/${sg.subgrupo}:`, fault);
            continue;
          }

          const procs = parseCodigosNomes(pesquisarResponse);
          allProcs.push(...procs);

          await sleep(800);
        }

        // Deduplicate
        const uniqueMap = new Map<string, ProcInfo>();
        for (const p of allProcs) uniqueMap.set(p.codigo, p);
        allProcs = Array.from(uniqueMap.values());

        if (allProcs.length === 0) {
          setProgress(prev => prev.map(p =>
            p.especialidade === spec.key
              ? { ...p, status: 'warning', message: `Nenhum procedimento encontrado` }
              : p
          ));
          finalResults.push({ especialidade: spec.key, procedimentos: 0, cids: 0, error: 'nenhum_procedimento' });
          completedCount++;
          setProgressPct(Math.round((completedCount / totalSpecs) * 100));
          continue;
        }

        // Upsert procedures to DB
        for (const proc of allProcs) {
          await supabase.from('sigtap_procedimentos').upsert({
            codigo: proc.codigo,
            nome: proc.nome,
            especialidade: spec.key,
            ativo: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'codigo' });
        }

        // Fetch CIDs for each procedure
        let totalCids = 0;
        for (let i = 0; i < allProcs.length; i++) {
          if (cancelledRef.current) break;
          const proc = allProcs[i];

          setProgress(prev => prev.map(p =>
            p.especialidade === spec.key
              ? { ...p, message: `CIDs: ${proc.codigo} (${i + 1}/${allProcs.length})${activeProxy ? ` via ${activeProxy}` : ''}`, procedimentos: allProcs.length }
              : p
          ));

          try {
            const detalharXml = buildSoapDetalhar(proc.codigo, competencia);
            const detalharResponse = await callDatasus(detalharXml);

            const fault = hasFault(detalharResponse);
            if (fault) {
              console.warn(`[SIGTAP] CID fault ${proc.codigo}:`, fault);
              await sleep(800);
              continue;
            }

            const cids = parseCids(detalharResponse);

            if (cids.length > 0) {
              // Batch upsert CIDs
              const cidsToInsert = cids.map(c => ({
                procedimento_codigo: proc.codigo,
                cid_codigo: c.codigo,
                cid_descricao: c.descricao,
              }));

              await supabase.from('sigtap_procedimento_cids')
                .upsert(cidsToInsert, { onConflict: 'procedimento_codigo,cid_codigo', ignoreDuplicates: true });

              totalCids += cids.length;
            }

            // Update procedure CID count
            await supabase.from('sigtap_procedimentos')
              .update({ total_cids: cids.length })
              .eq('codigo', proc.codigo);
          } catch (cidErr: any) {
            console.warn(`[SIGTAP] CID error ${proc.codigo}:`, cidErr.message);
          }

          await sleep(800);
        }

        setProgress(prev => prev.map(p =>
          p.especialidade === spec.key
            ? { ...p, status: 'done', procedimentos: allProcs.length, cids: totalCids, message: `${allProcs.length} proc. | ${totalCids.toLocaleString('pt-BR')} CIDs` }
            : p
        ));
        finalResults.push({ especialidade: spec.key, procedimentos: allProcs.length, cids: totalCids });

      } catch (err: any) {
        console.error(`[SIGTAP] Error ${spec.key}:`, err);
        setProgress(prev => prev.map(p =>
          p.especialidade === spec.key
            ? { ...p, status: 'error', message: `Falha na conexão com DATASUS` }
            : p
        ));
        finalResults.push({ especialidade: spec.key, procedimentos: 0, cids: 0, error: 'conexao_falha' });
      }

      completedCount++;
      setProgressPct(Math.round((completedCount / totalSpecs) * 100));
      await sleep(500);
    }

    // Log sync to database
    const grandTotalProcs = finalResults.reduce((a, r) => a + r.procedimentos, 0);
    const grandTotalCids = finalResults.reduce((a, r) => a + r.cids, 0);

    await (supabase as any).from('pts_import_log').insert({
      tipo: 'sync_datasus_manual',
      especialidade: 'todas',
      total_procedimentos: grandTotalProcs,
      total_cids: grandTotalCids,
      competencia,
      detalhes: finalResults,
    });

    setResults(finalResults);
    setShowResults(true);
    setSyncing(false);

    const successCount = finalResults.filter(r => !r.error).length;
    const failCount = finalResults.filter(r => !!r.error).length;

    if (failCount === 0 && successCount > 0) {
      toast.success(`Sincronização concluída! ${grandTotalProcs} procedimentos, ${grandTotalCids.toLocaleString('pt-BR')} CIDs`);
    } else if (successCount === 0) {
      toast.error('O servidor do DATASUS está temporariamente indisponível. Tente novamente em alguns minutos.');
    } else {
      toast.warning(`${successCount} especialidades sincronizadas. ${failCount} falharam — tente novamente.`);
    }

    loadHistory();
  };

  const lastSync = history[0];

  const formatCompetencia = (c: string) => {
    if (!c || c.length < 6) return c;
    return `${c.substring(4, 6)}/${c.substring(0, 4)}`;
  };

  const getSpecLabel = (key: string) => ALL_SPECIALTIES.find(s => s.key === key)?.label || key;

  const renderProgressIcon = (p: SpecProgress) => {
    switch (p.status) {
      case 'done': return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />;
      case 'error': return <XCircle className="w-4 h-4 text-destructive shrink-0" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
      case 'fetching': return <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />;
      default: return <span className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />;
    }
  };

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
              <h3 className="font-semibold text-base">Sincronização com DATASUS/SIGTAP</h3>
              <p className="text-xs text-muted-foreground">Fonte oficial: Ministério da Saúde — execução via navegador</p>
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
            {syncing && (
              <Button variant="outline" size="sm" onClick={() => { cancelledRef.current = true; }}>
                Cancelar
              </Button>
            )}
          </div>

          {/* Real-time progress */}
          {syncing && progress.length > 0 && (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Sincronizando com DATASUS...</p>
                {activeProxy && (
                  <Badge variant="secondary" className="text-xs">
                    Proxy: {activeProxy}
                  </Badge>
                )}
              </div>
              <div className="space-y-1.5">
                {progress.map(p => (
                  <div key={p.especialidade} className="flex items-center gap-2 text-sm">
                    {renderProgressIcon(p)}
                    <span className="min-w-[140px] font-medium">{p.label}:</span>
                    <span className="text-muted-foreground text-xs">{p.message}</span>
                  </div>
                ))}
              </div>
              <Progress value={progressPct} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">{progressPct}%</p>
            </div>
          )}

          {/* All failed */}
          {showResults && allFailed && !syncing && (
            <div className="space-y-3 p-4 bg-destructive/5 rounded-lg border border-destructive/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <p className="text-sm font-semibold text-destructive">Sincronização falhou</p>
              </div>
              <p className="text-sm text-muted-foreground">
                O servidor do DATASUS está temporariamente indisponível ou todos os proxies falharam.
                Os dados existentes no sistema não foram alterados.
              </p>
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
                    {r.error
                      ? (r.error.includes('nenhum') ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <XCircle className="w-4 h-4 text-destructive" />)
                      : <CheckCircle2 className="w-4 h-4 text-green-500" />
                    }
                    <span className="min-w-[140px]">{getSpecLabel(r.especialidade)}:</span>
                    {r.error
                      ? <span className="text-xs text-destructive">{r.error.includes('nenhum') ? 'Nenhum procedimento' : 'Falha na conexão'}</span>
                      : <span className="text-muted-foreground">{r.procedimentos} proc. | {r.cids.toLocaleString('pt-BR')} CIDs</span>
                    }
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

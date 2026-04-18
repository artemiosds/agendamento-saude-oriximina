import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Download, FileArchive, CheckCircle2, XCircle, AlertTriangle,
  Loader2, ExternalLink, Upload, Github, Cloud,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Mapeamento grupo+subgrupo SIGTAP → especialidade interna
// Chave = "GGSS" (4 dígitos do início do código SIGTAP)
const SUBGROUP_SPECIALTY_MAP: Record<string, string> = {
  // Grupo 03 — Procedimentos clínicos
  '0301': 'enfermagem',
  '0302': 'medico',
  '0303': 'odontologia',
  '0304': 'odontologia',
  '0305': 'fisioterapia',
  '0306': 'fisioterapia',
  '0307': 'nutricao',
  '0308': 'psicologia',
  '0309': 'terapia_ocupacional',
  '0310': 'fonoaudiologia',
  '0311': 'assistencia_social',
  '0312': 'farmacia',
  '0313': 'farmacia',
  '0314': 'biomedicina',
  '0315': 'educacao_fisica',
  '0316': 'podologia',
  '0317': 'optometria',
  '0318': 'saude_coletiva',
  '0319': 'outros',
  // Grupo 04 — Procedimentos cirúrgicos (odontologia inclusa)
  '0414': 'odontologia',
};

const SPECIALTY_OPTIONS = [
  { key: 'enfermagem', label: 'Enfermagem', subgrupos: '03.01' },
  { key: 'medico', label: 'Médico', subgrupos: '03.02' },
  { key: 'odontologia', label: 'Odontologia', subgrupos: '03.03, 03.04, 04.14' },
  { key: 'fisioterapia', label: 'Fisioterapia', subgrupos: '03.05, 03.06' },
  { key: 'nutricao', label: 'Nutrição', subgrupos: '03.07' },
  { key: 'psicologia', label: 'Psicologia', subgrupos: '03.08' },
  { key: 'terapia_ocupacional', label: 'Terapia Ocupacional', subgrupos: '03.09' },
  { key: 'fonoaudiologia', label: 'Fonoaudiologia', subgrupos: '03.10' },
  { key: 'assistencia_social', label: 'Assistência Social', subgrupos: '03.11' },
  { key: 'farmacia', label: 'Farmácia', subgrupos: '03.12, 03.13' },
  { key: 'biomedicina', label: 'Biomedicina', subgrupos: '03.14' },
  { key: 'educacao_fisica', label: 'Educação Física', subgrupos: '03.15' },
  { key: 'podologia', label: 'Podologia', subgrupos: '03.16' },
  { key: 'optometria', label: 'Optometria', subgrupos: '03.17' },
  { key: 'saude_coletiva', label: 'Saúde Coletiva', subgrupos: '03.18' },
];

const GITHUB_REPO = 'RenatoKR/SIGTAP';
const GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_REPO}/contents/tabelas`;

interface GitHubFile {
  name: string;
  download_url: string;
  size: number;
  competencia: string; // YYYYMM extracted from filename
  label: string; // "Abril/2026"
}

interface SpecResult {
  especialidade: string;
  label: string;
  procedimentos: number;
  cids: number;
}

type Step = 'idle' | 'downloading' | 'processing' | 'saving' | 'done' | 'error';
type Source = 'github' | 'upload';

interface LogEntry {
  icon: 'ok' | 'warn' | 'error' | 'info';
  text: string;
}

// SIGTAP layouts (fixed-width, 1-indexed positions converted to 0-indexed slice)
// tb_procedimento.txt: CO_PROCEDIMENTO 1-10, NO_PROCEDIMENTO 11-260
const PROC_LAYOUT = { codigo: [0, 10], nome: [10, 260] };
// tb_cid.txt: CO_CID 1-4, NO_CID 5-104
const CID_LAYOUT = { codigo: [0, 4], descricao: [4, 104] };
// rl_procedimento_cid.txt: CO_PROCEDIMENTO 1-10, CO_CID 11-14
const RL_PROC_CID_LAYOUT = { proc: [0, 10], cid: [10, 14] };

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function competenciaLabel(comp: string): string {
  if (comp.length !== 6) return comp;
  const y = comp.substring(0, 4);
  const m = parseInt(comp.substring(4, 6), 10);
  return `${MONTH_NAMES[m - 1] || m}/${y}`;
}

// Decode latin-1 (ISO-8859-1) bytes to UTF-8 string
function decodeLatin1(bytes: Uint8Array): string {
  // Browsers support TextDecoder('iso-8859-1')
  return new TextDecoder('iso-8859-1').decode(bytes);
}

const SigtapZipImport: React.FC = () => {
  const [source, setSource] = useState<Source>('github');
  const [selected, setSelected] = useState<Set<string>>(new Set(SPECIALTY_OPTIONS.map(s => s.key)));
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progressPct, setProgressPct] = useState(0);
  const [downloadPct, setDownloadPct] = useState(0);
  const [specResults, setSpecResults] = useState<SpecResult[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [githubFiles, setGithubFiles] = useState<GitHubFile[]>([]);
  const [selectedComp, setSelectedComp] = useState<string>('');
  const [loadingGithub, setLoadingGithub] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addLog = (icon: LogEntry['icon'], text: string) => {
    setLogs(prev => [...prev, { icon, text }]);
  };

  // Fetch list of available competências from GitHub
  useEffect(() => {
    if (source !== 'github') return;
    let cancelled = false;
    (async () => {
      setLoadingGithub(true);
      try {
        const resp = await fetch(GITHUB_API_BASE);
        if (!resp.ok) throw new Error(`GitHub HTTP ${resp.status}`);
        const data: any[] = await resp.json();
        const files: GitHubFile[] = data
          .filter((f: any) => /TabelaUnificada_(\d{6})/.test(f.name) && f.name.endsWith('.zip'))
          .map((f: any) => {
            const m = f.name.match(/TabelaUnificada_(\d{6})/);
            const comp = m ? m[1] : '';
            return {
              name: f.name,
              download_url: f.download_url,
              size: f.size,
              competencia: comp,
              label: competenciaLabel(comp),
            };
          })
          .sort((a, b) => b.competencia.localeCompare(a.competencia));
        if (!cancelled) {
          setGithubFiles(files);
          if (files.length > 0 && !selectedComp) {
            setSelectedComp(files[0].competencia);
          }
        }
      } catch (err: any) {
        console.error('[SIGTAP] GitHub list error:', err);
        if (!cancelled) {
          setGithubFiles([]);
        }
      } finally {
        if (!cancelled) setLoadingGithub(false);
      }
    })();
    return () => { cancelled = true; };
  }, [source]);

  const toggleOne = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(prev =>
      prev.size === SPECIALTY_OPTIONS.length ? new Set() : new Set(SPECIALTY_OPTIONS.map(s => s.key))
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  // Download GitHub ZIP with progress
  async function downloadGithubZip(url: string): Promise<Uint8Array> {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Falha ao baixar do GitHub: HTTP ${resp.status}`);
    const total = Number(resp.headers.get('content-length') || 0);
    if (!resp.body) {
      const buf = await resp.arrayBuffer();
      return new Uint8Array(buf);
    }
    const reader = resp.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total > 0) setDownloadPct(Math.round((received / total) * 100));
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }

  const runImport = async (zipBytes: Uint8Array, competencia: string) => {
    setStep('processing');
    addLog('info', 'Lendo arquivo ZIP...');

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(zipBytes);
    } catch (e: any) {
      throw new Error('Arquivo inválido. Verifique se é um ZIP do SIGTAP.');
    }
    addLog('ok', 'ZIP carregado');

    const allFiles = Object.keys(zip.files);

    // Locate required files (case-insensitive, may be inside subdirs)
    const findFile = (pattern: RegExp) =>
      allFiles.find(f => pattern.test(f.toLowerCase().split('/').pop() || ''));

    const procFile = findFile(/^tb_procedimento\.txt$/);
    const cidLinkFile = findFile(/^rl_procedimento_cid\.txt$/);
    const cidDescFile = findFile(/^tb_cid\.txt$/);

    if (!procFile) {
      throw new Error('Arquivo tb_procedimento.txt não encontrado no ZIP. Verifique se baixou a Tabela Unificada do SIGTAP.');
    }
    addLog('ok', 'tb_procedimento.txt localizado');
    if (cidLinkFile) addLog('ok', 'rl_procedimento_cid.txt localizado');
    else addLog('warn', 'rl_procedimento_cid.txt não encontrado — vínculos CID não serão importados');
    if (cidDescFile) addLog('ok', 'tb_cid.txt localizado');
    else addLog('warn', 'tb_cid.txt não encontrado — descrições de CID indisponíveis');

    // ============= Parse PROCEDIMENTOS (fixed-width, latin-1) =============
    addLog('info', 'Lendo procedimentos...');
    const procBytes = await zip.files[procFile].async('uint8array');
    const procText = decodeLatin1(procBytes);
    const procLines = procText.split(/\r?\n/);

    interface ProcRow { codigo: string; nome: string; especialidade: string; subgrupo: string; }
    const procedures: ProcRow[] = [];

    for (const line of procLines) {
      if (line.length < 260) continue;
      const codigo = line.substring(PROC_LAYOUT.codigo[0], PROC_LAYOUT.codigo[1]).trim();
      const nome = line.substring(PROC_LAYOUT.nome[0], PROC_LAYOUT.nome[1]).trim();
      if (!/^\d{10}$/.test(codigo) || !nome) continue;

      // Codigo SIGTAP: GG SS FF NNNN — grupo (2) + subgrupo (2) + forma (2) + sequencial (4)
      const grupo = codigo.substring(0, 2);
      const subgrupo = codigo.substring(2, 4);
      if (grupo !== SELECTED_GROUP) continue;

      const especialidade = SUBGROUP_SPECIALTY_MAP[subgrupo];
      if (!especialidade) continue;
      if (!selected.has(especialidade)) continue;

      procedures.push({ codigo, nome, especialidade, subgrupo });
    }

    addLog('info', `📋 ${procedures.length.toLocaleString('pt-BR')} procedimentos filtrados`);

    if (procedures.length === 0) {
      throw new Error('Nenhum procedimento encontrado para as especialidades selecionadas. Verifique os filtros.');
    }

    // ============= Parse CID descriptions (fixed-width, latin-1) =============
    const cidDescMap = new Map<string, string>();
    if (cidDescFile) {
      const cidBytes = await zip.files[cidDescFile].async('uint8array');
      const cidText = decodeLatin1(cidBytes);
      const cidLines = cidText.split(/\r?\n/);
      for (const line of cidLines) {
        if (line.length < 104) continue;
        const codigo = line.substring(CID_LAYOUT.codigo[0], CID_LAYOUT.codigo[1]).trim();
        const descricao = line.substring(CID_LAYOUT.descricao[0], CID_LAYOUT.descricao[1]).trim();
        if (codigo && descricao) cidDescMap.set(codigo, descricao);
      }
      addLog('ok', `📚 ${cidDescMap.size.toLocaleString('pt-BR')} CIDs catalogados`);
    }

    // ============= Parse PROC↔CID relations (fixed-width) =============
    interface CidLink { procedimento_codigo: string; cid_codigo: string; cid_descricao: string; }
    const cidLinks: CidLink[] = [];
    if (cidLinkFile) {
      const linkBytes = await zip.files[cidLinkFile].async('uint8array');
      const linkText = decodeLatin1(linkBytes);
      const linkLines = linkText.split(/\r?\n/);
      const procedureCodes = new Set(procedures.map(p => p.codigo));
      for (const line of linkLines) {
        if (line.length < 14) continue;
        const procCodigo = line.substring(RL_PROC_CID_LAYOUT.proc[0], RL_PROC_CID_LAYOUT.proc[1]).trim();
        const cidCodigo = line.substring(RL_PROC_CID_LAYOUT.cid[0], RL_PROC_CID_LAYOUT.cid[1]).trim();
        if (!/^\d{10}$/.test(procCodigo) || !cidCodigo) continue;
        if (!procedureCodes.has(procCodigo)) continue;
        cidLinks.push({
          procedimento_codigo: procCodigo,
          cid_codigo: cidCodigo,
          cid_descricao: cidDescMap.get(cidCodigo) || '',
        });
      }
      addLog('info', `🔗 ${cidLinks.length.toLocaleString('pt-BR')} vínculos procedimento↔CID`);
    }

    // ============= Save to database (upsert in batches) =============
    setStep('saving');
    addLog('info', 'Salvando no banco de dados...');

    const totalOps = procedures.length + cidLinks.length;
    let done = 0;

    // Procedures: batch 200
    const PROC_BATCH = 200;
    for (let i = 0; i < procedures.length; i += PROC_BATCH) {
      const batch = procedures.slice(i, i + PROC_BATCH);
      const { error } = await supabase.from('sigtap_procedimentos').upsert(
        batch.map(p => ({
          codigo: p.codigo,
          nome: p.nome,
          especialidade: p.especialidade,
          ativo: true,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'codigo' }
      );
      if (error) console.warn('[SIGTAP] proc upsert:', error.message);
      done += batch.length;
      setProgressPct(Math.round((done / totalOps) * 100));
    }
    addLog('ok', `${procedures.length.toLocaleString('pt-BR')} procedimentos salvos`);

    // CID links: batch 500
    if (cidLinks.length > 0) {
      const CID_BATCH = 500;
      for (let i = 0; i < cidLinks.length; i += CID_BATCH) {
        const batch = cidLinks.slice(i, i + CID_BATCH);
        const { error } = await supabase.from('sigtap_procedimento_cids').upsert(
          batch,
          { onConflict: 'procedimento_codigo,cid_codigo' }
        );
        if (error) console.warn('[SIGTAP] cid upsert:', error.message);
        done += batch.length;
        setProgressPct(Math.round((done / totalOps) * 100));
      }
      addLog('ok', `${cidLinks.length.toLocaleString('pt-BR')} vínculos CID salvos`);
    }

    // Update total_cids per procedure
    const cidCountMap = new Map<string, number>();
    for (const cl of cidLinks) {
      cidCountMap.set(cl.procedimento_codigo, (cidCountMap.get(cl.procedimento_codigo) || 0) + 1);
    }
    // Fire-and-forget per procedure (limited subset only — those with CIDs)
    const updatePromises = Array.from(cidCountMap.entries()).map(([codigo, count]) =>
      supabase.from('sigtap_procedimentos').update({ total_cids: count }).eq('codigo', codigo)
    );
    // Run in chunks to avoid flooding
    for (let i = 0; i < updatePromises.length; i += 50) {
      await Promise.all(updatePromises.slice(i, i + 50));
    }

    // Build per-specialty results
    const resultsMap = new Map<string, SpecResult>();
    for (const p of procedures) {
      const opt = SPECIALTY_OPTIONS.find(o => o.key === p.especialidade);
      const r = resultsMap.get(p.especialidade) || {
        especialidade: p.especialidade,
        label: opt?.label || p.especialidade,
        procedimentos: 0,
        cids: 0,
      };
      r.procedimentos++;
      resultsMap.set(p.especialidade, r);
    }
    for (const cl of cidLinks) {
      const proc = procedures.find(p => p.codigo === cl.procedimento_codigo);
      if (proc) {
        const r = resultsMap.get(proc.especialidade);
        if (r) r.cids++;
      }
    }
    const finalResults = Array.from(resultsMap.values());
    setSpecResults(finalResults);

    // Log import
    await (supabase as any).from('pts_import_log').insert({
      tipo: source === 'github' ? 'import_github' : 'import_zip_upload',
      especialidade: finalResults.map(r => r.especialidade).join(', '),
      total_procedimentos: procedures.length,
      total_cids: cidLinks.length,
      competencia,
      detalhes: finalResults,
    });

    setProgressPct(100);
    setStep('done');
    toast.success(`Importação concluída! ${procedures.length.toLocaleString('pt-BR')} procedimentos, ${cidLinks.length.toLocaleString('pt-BR')} vínculos CID`);
  };

  const handleStart = async () => {
    if (selected.size === 0) {
      toast.error('Selecione ao menos uma especialidade');
      return;
    }

    setLogs([]);
    setProgressPct(0);
    setDownloadPct(0);
    setSpecResults([]);
    setErrorMsg('');

    try {
      let zipBytes: Uint8Array;
      let competencia: string;

      if (source === 'github') {
        const ghFile = githubFiles.find(f => f.competencia === selectedComp);
        if (!ghFile) {
          toast.error('Selecione uma competência');
          return;
        }
        setStep('downloading');
        addLog('info', `Baixando ${ghFile.name} do GitHub...`);
        zipBytes = await downloadGithubZip(ghFile.download_url);
        addLog('ok', `Download concluído (${(zipBytes.length / 1024 / 1024).toFixed(1)} MB)`);
        competencia = ghFile.competencia;
      } else {
        if (!file) {
          toast.error('Selecione um arquivo ZIP');
          return;
        }
        setStep('processing');
        const buf = await file.arrayBuffer();
        zipBytes = new Uint8Array(buf);
        // Try to extract competencia from filename
        const m = file.name.match(/(\d{6})/);
        competencia = m ? m[1] : `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      }

      await runImport(zipBytes, competencia);
    } catch (err: any) {
      console.error('[SIGTAP IMPORT]', err);
      setErrorMsg(err.message || 'Erro desconhecido');
      setStep('error');
      addLog('error', err.message || 'Erro desconhecido');
      toast.error(err.message || 'Erro ao processar arquivo');
    }
  };

  const reset = () => {
    setStep('idle');
    setFile(null);
    setLogs([]);
    setProgressPct(0);
    setDownloadPct(0);
    setSpecResults([]);
    setErrorMsg('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const totalProcs = specResults.reduce((a, r) => a + r.procedimentos, 0);
  const totalCids = specResults.reduce((a, r) => a + r.cids, 0);

  const isProcessing = step === 'downloading' || step === 'processing' || step === 'saving';
  const canStart = source === 'github' ? !!selectedComp && !loadingGithub : !!file;

  return (
    <Card className="shadow-card border-0 ring-2 ring-primary/20">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Download className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Importar Tabela SIGTAP</h3>
            <p className="text-xs text-muted-foreground">Procedimentos do SUS + vínculos CID-10</p>
          </div>
        </div>

        {step === 'idle' && (
          <Tabs value={source} onValueChange={(v) => setSource(v as Source)} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="github" className="gap-2">
                <Github className="w-4 h-4" /> Repositório GitHub
              </TabsTrigger>
              <TabsTrigger value="upload" className="gap-2">
                <Upload className="w-4 h-4" /> Upload de ZIP
              </TabsTrigger>
            </TabsList>

            {/* ===== GITHUB SOURCE ===== */}
            <TabsContent value="github" className="space-y-4 mt-4">
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <p className="font-medium flex items-center gap-1.5">
                  <Cloud className="w-4 h-4" /> Fonte: <code className="text-xs">{GITHUB_REPO}</code>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tabelas Unificadas do SIGTAP/DATASUS hospedadas no GitHub. Sempre disponível, sem depender da API do DATASUS.
                </p>
                <a
                  href={`https://github.com/${GITHUB_REPO}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary text-xs font-medium mt-1.5 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> Abrir repositório
                </a>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Competência (mês de referência):</label>
                {loadingGithub ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted/30 rounded">
                    <Loader2 className="w-4 h-4 animate-spin" /> Buscando arquivos disponíveis...
                  </div>
                ) : githubFiles.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-destructive p-3 bg-destructive/5 rounded border border-destructive/20">
                    <AlertTriangle className="w-4 h-4" /> Não foi possível carregar a lista do GitHub. Use a aba "Upload de ZIP".
                  </div>
                ) : (
                  <Select value={selectedComp} onValueChange={setSelectedComp}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a competência" />
                    </SelectTrigger>
                    <SelectContent>
                      {githubFiles.map(f => (
                        <SelectItem key={f.competencia} value={f.competencia}>
                          {f.label} <span className="text-xs text-muted-foreground ml-2">({(f.size / 1024 / 1024).toFixed(1)} MB)</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </TabsContent>

            {/* ===== UPLOAD SOURCE ===== */}
            <TabsContent value="upload" className="space-y-4 mt-4">
              <div className="p-3 bg-muted/50 rounded-lg text-xs space-y-1">
                <p className="font-medium text-sm">Como obter o ZIP oficial:</p>
                <ol className="list-decimal list-inside text-muted-foreground space-y-0.5">
                  <li>Acesse <strong>sigtap.datasus.gov.br</strong></li>
                  <li>Vá em "Arquivos" → "Download"</li>
                  <li>Baixe a Tabela Unificada da competência desejada</li>
                </ol>
                <a
                  href="http://sigtap.datasus.gov.br"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary font-medium mt-1 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> Abrir DATASUS
                </a>
              </div>

              <div
                className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
              >
                <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={handleFileChange} />
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileArchive className="w-5 h-5 text-primary" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <Badge variant="secondary" className="text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB</Badge>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload className="w-8 h-8 mx-auto text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">Clique ou arraste o ZIP do SIGTAP aqui</p>
                    <p className="text-xs text-muted-foreground/60">Aceita: .zip da Tabela Unificada</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}

        {/* Specialty filter (visible in both tabs while idle) */}
        {step === 'idle' && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-sm font-medium">Filtrar especialidades a importar:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {SPECIALTY_OPTIONS.map(s => (
                <label key={s.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={selected.has(s.key)} onCheckedChange={() => toggleOne(s.key)} />
                  <span>{s.label}</span>
                  <span className="text-xs text-muted-foreground">(subgrupo{s.subgrupos.includes(',') ? 's' : ''} {s.subgrupos})</span>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={selected.size === SPECIALTY_OPTIONS.length} onCheckedChange={toggleAll} />
              <span className="font-medium">Selecionar todas</span>
            </label>
          </div>
        )}

        {step === 'idle' && (
          <Button onClick={handleStart} disabled={!canStart || selected.size === 0} className="w-full gradient-primary text-primary-foreground">
            <Download className="w-4 h-4 mr-2" />
            {source === 'github' ? 'Baixar do GitHub e Importar' : 'Processar ZIP e Importar'}
          </Button>
        )}

        {/* Downloading */}
        {step === 'downloading' && (
          <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <p className="text-sm font-medium">Baixando do GitHub...</p>
            </div>
            <Progress value={downloadPct} className="h-2" />
            <p className="text-xs text-muted-foreground text-right">{downloadPct}%</p>
          </div>
        )}

        {/* Processing / Saving */}
        {(step === 'processing' || step === 'saving') && (
          <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <p className="text-sm font-medium">
                {step === 'processing' ? 'Processando arquivos SIGTAP...' : 'Salvando no banco de dados...'}
              </p>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {logs.map((l, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {l.icon === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                  {l.icon === 'warn' && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                  {l.icon === 'error' && <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                  {l.icon === 'info' && <span className="w-3.5 h-3.5 shrink-0 text-center">ℹ️</span>}
                  <span className="text-muted-foreground">{l.text}</span>
                </div>
              ))}
            </div>
            {step === 'saving' && (
              <>
                <Progress value={progressPct} className="h-2" />
                <p className="text-xs text-muted-foreground text-right">{progressPct}%</p>
              </>
            )}
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div className="space-y-3 p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <p className="text-sm font-semibold text-green-700 dark:text-green-400">Importação concluída!</p>
            </div>
            <div className="space-y-1">
              {specResults.map(r => (
                <div key={r.especialidade} className="flex items-center justify-between text-sm">
                  <span>{r.label}:</span>
                  <span className="text-muted-foreground">{r.procedimentos} proc | {r.cids.toLocaleString('pt-BR')} CIDs</span>
                </div>
              ))}
              <hr className="border-green-200 dark:border-green-700 my-2" />
              <div className="flex justify-between text-sm font-semibold">
                <span>Total:</span>
                <span>{totalProcs} procedimentos | {totalCids.toLocaleString('pt-BR')} CIDs</span>
              </div>
            </div>
            <p className="text-xs text-green-600 dark:text-green-400">
              ✅ Procedimentos e CIDs disponíveis para busca em prontuários, tratamentos e relatórios.
            </p>
            <Button variant="outline" size="sm" onClick={reset}>
              <CheckCircle2 className="w-3 h-3 mr-1" /> Nova importação
            </Button>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="space-y-3 p-4 bg-destructive/5 rounded-lg border border-destructive/20">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-destructive" />
              <p className="text-sm font-semibold text-destructive">Falha na importação</p>
            </div>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <p className="text-xs text-muted-foreground">
              Os dados existentes no sistema <strong>não foram alterados</strong>.
            </p>
            <Button variant="outline" size="sm" onClick={reset}>Tentar novamente</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SigtapZipImport;

import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Download, FileArchive, CheckCircle2, XCircle, AlertTriangle,
  Loader2, ExternalLink, Upload,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const SUBGROUP_SPECIALTY_MAP: Record<string, string> = {
  '01': 'enfermagem',
  '02': 'medico',
  '05': 'fisioterapia',
  '06': 'fisioterapia',
  '07': 'nutricao',
  '08': 'psicologia',
  '09': 'terapia_ocupacional',
  '10': 'fonoaudiologia',
  '11': 'assistencia_social',
};

const SELECTED_GROUP = '03';

const SPECIALTY_OPTIONS = [
  { key: 'fisioterapia', label: 'Fisioterapia', subgrupos: '05, 06' },
  { key: 'psicologia', label: 'Psicologia', subgrupos: '08' },
  { key: 'fonoaudiologia', label: 'Fonoaudiologia', subgrupos: '10' },
  { key: 'nutricao', label: 'Nutrição', subgrupos: '07' },
  { key: 'terapia_ocupacional', label: 'Terapia Ocupacional', subgrupos: '09' },
  { key: 'assistencia_social', label: 'Assistência Social', subgrupos: '11' },
  { key: 'enfermagem', label: 'Enfermagem', subgrupos: '01' },
  { key: 'medico', label: 'Médico', subgrupos: '02' },
];

interface SpecResult {
  especialidade: string;
  label: string;
  procedimentos: number;
  cids: number;
}

type Step = 'idle' | 'processing' | 'saving' | 'done' | 'error';

interface LogEntry {
  icon: 'ok' | 'warn' | 'error' | 'info';
  text: string;
}

const SigtapZipImport: React.FC = () => {
  const [selected, setSelected] = useState<Set<string>>(new Set(SPECIALTY_OPTIONS.map(s => s.key)));
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progressPct, setProgressPct] = useState(0);
  const [specResults, setSpecResults] = useState<SpecResult[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addLog = (icon: LogEntry['icon'], text: string) => {
    setLogs(prev => [...prev, { icon, text }]);
  };

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

  const handleImport = async () => {
    if (!file) return;
    if (selected.size === 0) { toast.error('Selecione ao menos uma especialidade'); return; }

    setStep('processing');
    setLogs([]);
    setProgressPct(0);
    setSpecResults([]);
    setErrorMsg('');

    try {
      addLog('info', 'Carregando arquivo ZIP...');
      const zip = await JSZip.loadAsync(file);
      addLog('ok', 'ZIP carregado');

      const files = Object.keys(zip.files);

      const procFile = files.find(f => f.toLowerCase().includes('tb_procedimento') && f.toLowerCase().endsWith('.txt'));
      const cidLinkFile = files.find(f => f.toLowerCase().includes('rl_procedimento_cid') && f.toLowerCase().endsWith('.txt'));
      const cidDescFile = files.find(f => f.toLowerCase().includes('tb_cid') && f.toLowerCase().endsWith('.txt'));

      if (!procFile) {
        throw new Error('Arquivo tb_procedimento.txt não encontrado no ZIP. Verifique se baixou o arquivo correto do DATASUS.');
      }
      addLog('ok', 'tb_procedimento.txt encontrado');

      if (cidLinkFile) addLog('ok', 'rl_procedimento_cid.txt encontrado');
      else addLog('warn', 'rl_procedimento_cid.txt não encontrado — CIDs não serão importados');

      if (cidDescFile) addLog('ok', 'tb_cid.txt encontrado');
      else addLog('warn', 'tb_cid.txt não encontrado — descrições de CID indisponíveis');

      // Parse procedures
      const procContent = await zip.files[procFile].async('string');
      const procLines = procContent.split('\n').filter(l => l.trim());

      interface ProcRow { codigo: string; nome: string; especialidade: string; subgrupo: string; }
      const procedures: ProcRow[] = [];

      for (const line of procLines) {
        const cols = line.split('|');
        if (cols.length < 4) continue;
        const codigo = cols[0]?.trim();
        const nome = cols[1]?.trim();
        const grupo = cols[2]?.trim();
        const subgrupo = cols[3]?.trim();
        if (!codigo || !nome || grupo !== SELECTED_GROUP) continue;
        if (codigo.length < 10) continue;
        const especialidade = SUBGROUP_SPECIALTY_MAP[subgrupo];
        if (!especialidade) continue;
        if (!selected.has(especialidade)) continue;
        procedures.push({ codigo, nome, especialidade, subgrupo });
      }

      addLog('info', `📋 Procedimentos encontrados: ${procedures.length}`);

      if (procedures.length === 0) {
        throw new Error('Nenhum procedimento do grupo 03 encontrado para as especialidades selecionadas.');
      }

      // Parse CID descriptions
      const cidDescMap: Record<string, string> = {};
      if (cidDescFile) {
        const cidContent = await zip.files[cidDescFile].async('string');
        const cidLines = cidContent.split('\n').filter(l => l.trim());
        for (const line of cidLines) {
          const cols = line.split('|');
          const codigo = cols[0]?.trim();
          const descricao = cols[1]?.trim();
          if (codigo && descricao) cidDescMap[codigo] = descricao;
        }
      }

      // Parse CID links
      interface CidLink { procedimento_codigo: string; cid_codigo: string; cid_descricao: string; }
      const cidLinks: CidLink[] = [];
      if (cidLinkFile) {
        const cidLinkContent = await zip.files[cidLinkFile].async('string');
        const cidLinkLines = cidLinkContent.split('\n').filter(l => l.trim());
        const procedureCodes = new Set(procedures.map(p => p.codigo));
        for (const line of cidLinkLines) {
          const cols = line.split('|');
          const procCodigo = cols[0]?.trim();
          const cidCodigo = cols[1]?.trim();
          if (!procCodigo || !cidCodigo) continue;
          if (!procedureCodes.has(procCodigo)) continue;
          cidLinks.push({
            procedimento_codigo: procCodigo,
            cid_codigo: cidCodigo,
            cid_descricao: cidDescMap[cidCodigo] || '',
          });
        }
      }

      addLog('info', `🔗 CIDs vinculados: ${cidLinks.length.toLocaleString('pt-BR')}`);

      // Save to database
      setStep('saving');
      addLog('info', 'Salvando no banco de dados...');

      // Save procedures in batches of 50
      const procBatches: ProcRow[][] = [];
      for (let i = 0; i < procedures.length; i += 50) {
        procBatches.push(procedures.slice(i, i + 50));
      }

      let savedProcs = 0;
      for (const batch of procBatches) {
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
        if (error) console.warn('Upsert proc error:', error.message);
        savedProcs += batch.length;
        setProgressPct(Math.round((savedProcs / (procedures.length + cidLinks.length)) * 100));
      }

      // Save CID links in batches of 100
      if (cidLinks.length > 0) {
        const cidBatches: CidLink[][] = [];
        for (let i = 0; i < cidLinks.length; i += 100) {
          cidBatches.push(cidLinks.slice(i, i + 100));
        }

        let savedCids = 0;
        for (const batch of cidBatches) {
          const { error } = await supabase.from('sigtap_procedimento_cids').upsert(
            batch,
            { onConflict: 'procedimento_codigo,cid_codigo' }
          );
          if (error) console.warn('Upsert CID error:', error.message);
          savedCids += batch.length;
          setProgressPct(Math.round(((procedures.length + savedCids) / (procedures.length + cidLinks.length)) * 100));
        }
      }

      // Update total_cids per procedure
      const cidCountMap: Record<string, number> = {};
      for (const cl of cidLinks) {
        cidCountMap[cl.procedimento_codigo] = (cidCountMap[cl.procedimento_codigo] || 0) + 1;
      }
      for (const [codigo, count] of Object.entries(cidCountMap)) {
        await supabase.from('sigtap_procedimentos').update({ total_cids: count }).eq('codigo', codigo);
      }

      // Build results per specialty
      const resultsMap: Record<string, SpecResult> = {};
      for (const p of procedures) {
        if (!resultsMap[p.especialidade]) {
          const opt = SPECIALTY_OPTIONS.find(o => o.key === p.especialidade);
          resultsMap[p.especialidade] = { especialidade: p.especialidade, label: opt?.label || p.especialidade, procedimentos: 0, cids: 0 };
        }
        resultsMap[p.especialidade].procedimentos++;
      }
      for (const cl of cidLinks) {
        const proc = procedures.find(p => p.codigo === cl.procedimento_codigo);
        if (proc && resultsMap[proc.especialidade]) {
          resultsMap[proc.especialidade].cids++;
        }
      }
      const finalResults = Object.values(resultsMap);
      setSpecResults(finalResults);

      // Log import
      await supabase.from('pts_import_log').insert({
        tipo: 'import_zip_datasus',
        especialidade: finalResults.map(r => r.especialidade).join(', '),
        total_procedimentos: procedures.length,
        total_cids: cidLinks.length,
        competencia: `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`,
      });

      setProgressPct(100);
      setStep('done');
      toast.success(`Importação concluída! ${procedures.length} procedimentos, ${cidLinks.length.toLocaleString('pt-BR')} CIDs`);

    } catch (err: any) {
      console.error('[SIGTAP ZIP]', err);
      setErrorMsg(err.message || 'Erro desconhecido');
      setStep('error');
      toast.error(err.message || 'Erro ao processar arquivo');
    }
  };

  const reset = () => {
    setStep('idle');
    setFile(null);
    setLogs([]);
    setProgressPct(0);
    setSpecResults([]);
    setErrorMsg('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const totalProcs = specResults.reduce((a, r) => a + r.procedimentos, 0);
  const totalCids = specResults.reduce((a, r) => a + r.cids, 0);

  return (
    <Card className="shadow-card border-0 ring-2 ring-amber-500/20">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Download className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-base">📥 Importar Tabela SIGTAP (Arquivo Oficial)</h3>
            <p className="text-xs text-muted-foreground">Garantido — funciona sempre, sem depender de rede</p>
          </div>
        </div>

        {/* Instructions */}
        <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
          <p className="font-medium">Como obter o arquivo:</p>
          <ol className="list-decimal list-inside text-muted-foreground space-y-0.5 text-xs">
            <li>Acesse: <strong>sigtap.datasus.gov.br</strong></li>
            <li>Clique em "Arquivos" → "Download"</li>
            <li>Selecione a competência atual ({String(new Date().getMonth() + 1).padStart(2, '0')}/{new Date().getFullYear()})</li>
            <li>Baixe o arquivo ZIP</li>
            <li>Importe abaixo</li>
          </ol>
          <a
            href="http://sigtap.datasus.gov.br"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary text-xs font-medium mt-1 hover:underline"
          >
            <ExternalLink className="w-3 h-3" /> Abrir DATASUS
          </a>
        </div>

        {step === 'idle' && (
          <>
            {/* File upload */}
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
                  <p className="text-xs text-muted-foreground/60">Aceita: .zip contendo tb_procedimento.txt</p>
                </div>
              )}
            </div>

            {/* Specialty checkboxes */}
            <div className="space-y-2">
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

            <Button onClick={handleImport} disabled={!file || selected.size === 0} className="w-full">
              🚀 Processar e Importar
            </Button>
          </>
        )}

        {/* Processing / Saving */}
        {(step === 'processing' || step === 'saving') && (
          <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <p className="text-sm font-medium">
                {step === 'processing' ? 'Processando arquivo SIGTAP...' : 'Salvando no banco...'}
              </p>
            </div>
            <div className="space-y-1">
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
            <div className="text-xs text-green-600 dark:text-green-400 space-y-0.5">
              <p>✅ PTS habilitado para todas as especialidades acima</p>
              <p>✅ Profissionais já podem usar agora</p>
            </div>
            <Button variant="outline" size="sm" onClick={reset}>
              <CheckCircle2 className="w-3 h-3 mr-1" /> Fechar
            </Button>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="space-y-3 p-4 bg-destructive/5 rounded-lg border border-destructive/20">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-destructive" />
              <p className="text-sm font-semibold text-destructive">Erro na importação</p>
            </div>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <p className="text-xs text-muted-foreground">
              Certifique-se de baixar o ZIP correto em{' '}
              <a href="http://sigtap.datasus.gov.br" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                sigtap.datasus.gov.br
              </a>{' '}
              → Arquivos → Download. O arquivo deve conter tb_procedimento.txt
            </p>
            <Button variant="outline" size="sm" onClick={reset}>Tentar novamente</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SigtapZipImport;

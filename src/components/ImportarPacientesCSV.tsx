import React, { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Upload, FileText, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
  errorRows: { linha: number; nome: string; telefone: string; motivo: string }[];
}

type Step = 'upload' | 'preview' | 'importing' | 'result';

interface ParsedRow {
  nome: string;
  cpf: string;
  cns: string;
  telefone: string;
  data_nascimento: string;
  email: string;
  endereco: string;
}

// CPF validation
function isValidCPF(cpf: string): boolean {
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleaned)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cleaned[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== parseInt(cleaned[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cleaned[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  return rest === parseInt(cleaned[10]);
}

function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function cleanCPF(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

function capitalizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function parseDate(dateStr: string): string | null {
  // DD/MM/AAAA
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
  if (d.getFullYear() !== parseInt(yyyy) || d.getMonth() !== parseInt(mm) - 1 || d.getDate() !== parseInt(dd)) return null;
  if (d > new Date()) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows = lines.slice(1).map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  });
  return { headers, rows };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ImportarPacientesCSV: React.FC<Props> = ({ open, onOpenChange }) => {
  const { refreshPacientes, logAction } = useData();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, imported: 0, skipped: 0, errors: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const reset = useCallback(() => {
    setStep('upload');
    setParsedRows([]);
    setProgress({ current: 0, total: 0, imported: 0, skipped: 0, errors: 0 });
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const handleClose = (v: boolean) => {
    if (step === 'importing') return; // block close during import
    if (!v) reset();
    onOpenChange(v);
  };

  const downloadTemplate = () => {
    const content = `nome,cpf,cns,telefone,data_nascimento,email,endereco\nMaria da Silva Santos,123.456.789-00,898000000000006,(93) 99999-0001,15/03/1985,maria@email.com,Rua das Flores 123\nJoão Pedro Oliveira,,,(93) 99999-0002,,,\nFrancisca Costa,987.654.321-00,898000000000007,(93) 99999-0003,22/07/1990,,`;
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_pacientes.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const processFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Apenas arquivos .csv são aceitos.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);

      const requiredHeaders = ['nome', 'telefone'];
      const missing = requiredHeaders.filter(h => !headers.includes(h));
      if (missing.length > 0) {
        toast.error(`Cabeçalho inválido. Colunas obrigatórias ausentes: ${missing.join(', ')}`);
        return;
      }

      if (rows.length > 500) {
        toast.error('Máximo de 500 linhas por importação.');
        return;
      }

      const iNome = headers.indexOf('nome');
      const iCpf = headers.indexOf('cpf');
      const iCns = headers.indexOf('cns');
      const iTel = headers.indexOf('telefone');
      const iDn = headers.indexOf('data_nascimento');
      const iEmail = headers.indexOf('email');
      const iEnd = headers.indexOf('endereco');

      const parsed: ParsedRow[] = rows.map(r => ({
        nome: r[iNome] || '',
        cpf: r[iCpf] || '',
        cns: iCns >= 0 ? (r[iCns] || '') : '',
        telefone: r[iTel] || '',
        data_nascimento: r[iDn] || '',
        email: iEmail >= 0 ? (r[iEmail] || '') : '',
        endereco: iEnd >= 0 ? (r[iEnd] || '') : '',
      }));

      setParsedRows(parsed);
      setStep('preview');
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const startImport = async () => {
    setStep('importing');
    const total = parsedRows.length;
    const state = { current: 0, total, imported: 0, skipped: 0, errors: 0 };
    setProgress({ ...state });
    const errorRows: ImportResult['errorRows'] = [];

    // Load existing patients for duplicate check
    const { data: existingPatients } = await supabase.from('pacientes').select('cpf,cns,telefone,nome,data_nascimento');
    const existingCpfs = new Set((existingPatients || []).filter(p => p.cpf).map(p => p.cpf.replace(/\D/g, '')));
    const existingCns = new Set((existingPatients || []).filter(p => p.cns).map(p => p.cns.replace(/\D/g, '')));
    const existingPhones = new Set((existingPatients || []).map(p => p.telefone.replace(/\D/g, '')));
    const existingNameDob = new Set((existingPatients || []).map(p => `${p.nome.toLowerCase().trim()}|${p.data_nascimento || ''}`));

    for (let i = 0; i < total; i++) {
      const row = parsedRows[i];
      const lineNum = i + 2; // +2 because line 1 is header, array is 0-indexed
      state.current = i + 1;

      // Clean data
      const nome = capitalizeName(row.nome);
      const cpfClean = cleanCPF(row.cpf);
      const cnsClean = (row.cns || '').replace(/\D/g, '');
      const phoneClean = cleanPhone(row.telefone);
      const emailClean = (row.email || '').trim().toLowerCase();
      const endereco = (row.endereco || '').trim();

      // Validate required
      if (!nome || nome.length < 3 || /^\d+$/.test(nome.replace(/\s/g, ''))) {
        errorRows.push({ linha: lineNum, nome: row.nome, telefone: row.telefone, motivo: 'Nome obrigatório não informado ou inválido (mín. 3 caracteres)' });
        state.errors++;
        setProgress({ ...state });
        continue;
      }

      if (!phoneClean || phoneClean.length < 8) {
        errorRows.push({ linha: lineNum, nome, telefone: row.telefone, motivo: 'Telefone obrigatório ou inválido (mín. 8 dígitos)' });
        state.errors++;
        setProgress({ ...state });
        continue;
      }

      // Optional CPF validation
      if (cpfClean && !isValidCPF(cpfClean)) {
        errorRows.push({ linha: lineNum, nome, telefone: row.telefone, motivo: 'CPF inválido' });
        state.errors++;
        setProgress({ ...state });
        continue;
      }

      // Optional date validation
      let dataNascFormatted = '';
      if (row.data_nascimento.trim()) {
        const parsed = parseDate(row.data_nascimento.trim());
        if (!parsed) {
          errorRows.push({ linha: lineNum, nome, telefone: row.telefone, motivo: 'Data de nascimento em formato inválido (use DD/MM/AAAA)' });
          state.errors++;
          setProgress({ ...state });
          continue;
        }
        dataNascFormatted = parsed;
      }

      // Optional email validation
      if (emailClean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
        errorRows.push({ linha: lineNum, nome, telefone: row.telefone, motivo: 'E-mail inválido' });
        state.errors++;
        setProgress({ ...state });
        continue;
      }

      // Duplicate checks
      if (cpfClean && existingCpfs.has(cpfClean)) {
        errorRows.push({ linha: lineNum, nome, telefone: row.telefone, motivo: 'CPF já cadastrado' });
        state.skipped++;
        setProgress({ ...state });
        continue;
      }
      if (cnsClean && existingCns.has(cnsClean)) {
        errorRows.push({ linha: lineNum, nome, telefone: row.telefone, motivo: 'CNS já cadastrado' });
        state.skipped++;
        setProgress({ ...state });
        continue;
      }
      if (existingPhones.has(phoneClean)) {
        errorRows.push({ linha: lineNum, nome, telefone: row.telefone, motivo: 'Telefone já cadastrado' });
        state.skipped++;
        setProgress({ ...state });
        continue;
      }
      const nameKey = `${nome.toLowerCase().trim()}|${dataNascFormatted}`;
      if (dataNascFormatted && existingNameDob.has(nameKey)) {
        errorRows.push({ linha: lineNum, nome, telefone: row.telefone, motivo: 'Paciente já cadastrado (nome + data nasc.)' });
        state.skipped++;
        setProgress({ ...state });
        continue;
      }

      // Insert
      const id = `p${Date.now()}${i}`;
      const { error } = await supabase.from('pacientes').insert({
        id,
        nome,
        cpf: cpfClean,
        cns: cnsClean,
        telefone: phoneClean,
        data_nascimento: dataNascFormatted,
        email: emailClean,
        endereco,
      });

      if (error) {
        errorRows.push({ linha: lineNum, nome, telefone: row.telefone, motivo: `Erro ao salvar: ${error.message}` });
        state.errors++;
      } else {
        state.imported++;
        // Add to dedup sets for subsequent rows
        if (cpfClean) existingCpfs.add(cpfClean);
        if (cnsClean) existingCns.add(cnsClean);
        existingPhones.add(phoneClean);
        existingNameDob.add(nameKey);
      }
      setProgress({ ...state });
    }

    const finalResult: ImportResult = { imported: state.imported, skipped: state.skipped, errors: state.errors, errorRows };
    setResult(finalResult);
    setStep('result');

    await refreshPacientes();
    await logAction({
      acao: 'importar_csv',
      entidade: 'paciente',
      detalhes: { total, importados: state.imported, ignorados: state.skipped, erros: state.errors },
      user,
      modulo: 'pacientes',
    });
  };

  const downloadErrorReport = () => {
    if (!result || result.errorRows.length === 0) return;
    const header = 'linha,nome,telefone,motivo_erro';
    const lines = result.errorRows.map(r => `${r.linha},"${r.nome}","${r.telefone}","${r.motivo}"`);
    const content = [header, ...lines].join('\n');
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'relatorio_erros_importacao.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Importar Pacientes</DialogTitle>
        </DialogHeader>

        {/* STEP: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            <Button variant="outline" onClick={downloadTemplate} className="w-full">
              <FileText className="w-4 h-4 mr-2" /> Baixar modelo CSV
            </Button>

            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Arraste o arquivo CSV aqui ou clique para selecionar</p>
              <p className="text-xs text-muted-foreground mt-1">Apenas arquivos .csv — máximo 500 linhas</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            </div>
          </div>
        )}

        {/* STEP: Preview */}
        {step === 'preview' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground font-medium">{parsedRows.length} pacientes encontrados no arquivo</p>

            <div className="border rounded-lg overflow-x-auto max-h-60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>CNS</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Nasc.</TableHead>
                    <TableHead>E-mail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.slice(0, 5).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{r.nome}</TableCell>
                      <TableCell className="text-xs">{r.cpf}</TableCell>
                      <TableCell className="text-xs">{r.cns}</TableCell>
                      <TableCell className="text-xs">{r.telefone}</TableCell>
                      <TableCell className="text-xs">{r.data_nascimento}</TableCell>
                      <TableCell className="text-xs">{r.email}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsedRows.length > 5 && <p className="text-xs text-muted-foreground">... e mais {parsedRows.length - 5} linhas</p>}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={reset}>Cancelar</Button>
              <Button onClick={startImport} className="bg-green-600 hover:bg-green-700 text-white">Confirmar importação</Button>
            </div>
          </div>
        )}

        {/* STEP: Importing */}
        {step === 'importing' && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-center text-muted-foreground">Importando pacientes... {progress.current} de {progress.total}</p>
            <Progress value={(progress.current / progress.total) * 100} className="h-3" />
            <div className="flex justify-center gap-4 text-xs">
              <span className="flex items-center gap-1 text-green-600"><CheckCircle className="w-3.5 h-3.5" /> {progress.imported} importados</span>
              <span className="flex items-center gap-1 text-yellow-600"><AlertTriangle className="w-3.5 h-3.5" /> {progress.skipped} ignorados</span>
              <span className="flex items-center gap-1 text-destructive"><XCircle className="w-3.5 h-3.5" /> {progress.errors} com erro</span>
            </div>
          </div>
        )}

        {/* STEP: Result */}
        {step === 'result' && result && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">{result.imported} pacientes importados com sucesso</span>
              </div>
              <div className="flex items-center gap-2 text-yellow-600">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-medium">{result.skipped} pacientes ignorados (já existiam)</span>
              </div>
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="w-5 h-5" />
                <span className="font-medium">{result.errors} linhas com erro</span>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              {result.errorRows.length > 0 && (
                <Button variant="outline" onClick={downloadErrorReport}>
                  <Download className="w-4 h-4 mr-2" /> Baixar relatório de erros
                </Button>
              )}
              <Button onClick={() => handleClose(false)}>Fechar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ImportarPacientesCSV;

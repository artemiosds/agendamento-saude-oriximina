import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Copy, FileText, Loader2, Printer, Search, X, CalendarDays, ShieldCheck, Layers, ChevronRight, ListChecks } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { buildSigtapConsultationPrint, escapeSigtapPrintText, formatSigtapValue as formatValue, sigtapRuleStatus as statusText } from '@/lib/sigtapConsultationPrint';
import { instrumentoRotulo } from '@/lib/sigtapInstruments';
import { resolveProfessionalCboReliable } from '@/lib/sigtapClinicalValidation';
import { cboStatusForCompetence, filterSigtapRows, formatSigtapCode, formatSigtapCompetence, normalizeCidCode, requiresCidForCompetence, type SigtapConsultationCatalog, type SigtapConsultationFilter, type SigtapConsultationRow } from '@/lib/sigtapConsultation';
import { BackButton } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

const PAGE_SIZE = 20;
const LOAD_SIZE = 500;
const filterOptions: { key: SigtapConsultationFilter; label: string }[] = [
  { key: 'exige_cid', label: 'Exige CID' },
  { key: 'classificacao', label: 'Exige classificação' },
  { key: 'bpa_c', label: 'BPA-C' },
  { key: 'bpa_i', label: 'BPA-I' },
  { key: 'raas', label: 'RAAS' },
];

function currentCompetence(): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${parts.find((part) => part.type === 'year')?.value}${parts.find((part) => part.type === 'month')?.value}`;
}

interface CboOption { codigo: string; descricao: string }
interface ProcedureDetail { cids: { cid_codigo: string; cid_descricao: string | null }[]; total: number }

async function copyProcedureCode(code: string) {
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    // Fallback for browsers that deny access to the asynchronous clipboard.
    const previous = document.activeElement;
    const field = document.createElement('textarea');
    field.value = code;
    field.readOnly = true;
    field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.append(field);
    try {
      field.select();
      if (!document.execCommand?.('copy')) throw new Error('Clipboard unavailable');
    } finally {
      field.remove();
      if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
    }
  }
}

function CboPicker({ value, options, disabled, onChange }: {
  value: string; options: CboOption[]; disabled: boolean; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const matches = useMemo(() => {
    if (!open) return [];
    const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const terms = normalize(term).split(/\s+/);
    return options.filter(({ codigo, descricao }) => {
      const label = normalize(codigo + ' ' + descricao);
      return terms.every(part => label.includes(part) || (/^\d+[.-]\d+$/.test(part) && codigo.includes(part.replace(/\D/g, ''))));
    });
  }, [open, options, term]);
  const select = (code: string) => {
    onChange(code);
    setOpen(false);
    setTerm('');
  };
  return <div>
    <Label htmlFor="sigtap-cbo">Filtrar por cargo/CBO</Label>
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setTerm(''); }}>
      <PopoverTrigger asChild>
        <Button id="sigtap-cbo" type="button" variant="outline" role="combobox" aria-expanded={open}
          aria-label="Pesquisar cargo ou CBO" disabled={disabled} className="w-full justify-between gap-2 font-normal">
          <span className="min-w-0 truncate">{value ? `${value} · ${options.find(option => option.codigo === value)?.descricao || 'CBO selecionado'}` : 'Todos os cargos/CBOs'}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(90vw,360px)] p-0">
        <Command shouldFilter={false} onKeyDown={event => { if (event.key === 'Enter') event.stopPropagation(); }}>
          <CommandInput value={term} onValueChange={setTerm} placeholder="Buscar por código ou cargo" aria-label="Buscar por código ou nome do cargo" />
          <CommandList>
            <CommandGroup>
              <CommandItem value="all" onSelect={() => select('')}>
                <Check className={`mr-2 h-4 w-4 ${!value ? 'opacity-100' : 'opacity-0'}`} />Todos os cargos/CBOs
              </CommandItem>
              {matches.slice(0, 40).map(option => <CommandItem key={option.codigo} value={option.codigo} onSelect={() => select(option.codigo)}>
                <Check className={`mr-2 h-4 w-4 shrink-0 ${value === option.codigo ? 'opacity-100' : 'opacity-0'}`} />
                <span className="truncate">{option.codigo} · {option.descricao}</span>
              </CommandItem>)}
            </CommandGroup>
            {matches.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum CBO encontrado.</p>}
            {matches.length > 40 && <p className="px-3 py-2 text-xs text-muted-foreground">Mostrando 40 de {matches.length}. Digite para refinar.</p>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </div>;
}

export default function ConsultaSigtap() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const location = useLocation();
  const shortcutCode: unknown = location.state?.sigtapCode;
  const appliedShortcut = useRef('');
  const [rows, setRows] = useState<SigtapConsultationRow[]>([]);
  const [cbos, setCbos] = useState<CboOption[]>([]);
  const [catalog, setCatalog] = useState<SigtapConsultationCatalog | null>(null);
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(true);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [error, setError] = useState('');
  const [cboError, setCboError] = useState('');
  const [rulesError, setRulesError] = useState('');
  const termInput = useRef<HTMLInputElement>(null);
  const [draftCbo, setDraftCbo] = useState('');
  const cidInput = useRef<HTMLInputElement>(null);
  const [detectedCbo, setDetectedCbo] = useState<{ userId: string; code: string } | null>(null);
  const ownCbo = user?.role === 'profissional' && detectedCbo?.userId === user.id ? detectedCbo.code : '';
  const [applied, setApplied] = useState({ term: '', cbo: '', cid: '', cidCodes: null as ReadonlySet<string> | null });
  const [cidLoading, setCidLoading] = useState(false);
  const [cidError, setCidError] = useState('');
  const [filters, setFilters] = useState<ReadonlySet<SigtapConsultationFilter>>(new Set());
  const [sort, setSort] = useState('default');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SigtapConsultationRow | null>(null);
  const [detail, setDetail] = useState<ProcedureDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  const [copiedCode, setCopiedCode] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  const copyAttempt = useRef(0);
  const [printing, setPrinting] = useState(false);
  const searchRequest = useRef<AbortController>();
  const mounted = useRef(false);
  const currentUser = useRef(user);
  currentUser.current = user;
  const competence = useMemo(currentCompetence, []);

  useEffect(() => {
    const loadRequest = new AbortController();
    const { signal } = loadRequest;
    const load = async () => {
      try {
        const all: SigtapConsultationRow[] = [];
        for (let start = 0; ; start += LOAD_SIZE) {
          const { data, error: queryError } = await supabase.from('sigtap_procedimentos')
            .select('codigo,nome,descricao,valor').eq('ativo', true)
            .order('codigo').abortSignal(signal).range(start, start + LOAD_SIZE - 1);
          if (signal.aborted) return;
          if (queryError) throw queryError;
          all.push(...(data || []));
          if (!data || data.length < LOAD_SIZE) break;
        }
        setRows(all);
      } catch (cause) {
        if (signal.aborted) return;
        console.error('[ConsultaSigtap] catálogo local:', cause);
        setError('Não foi possível carregar os procedimentos. Reabra a página para tentar novamente.');
      } finally { if (!signal.aborted) setLoading(false); }
    };
    void load();
    const loadCbos = async () => {
      const options: CboOption[] = [];
      for (let start = 0; ; start += LOAD_SIZE) {
        const { data, error: queryError } = await supabase.from('cbo_codigos')
          .select('codigo,descricao').eq('ativo', true).order('descricao').order('codigo')
          .abortSignal(signal).range(start, start + LOAD_SIZE - 1);
        if (signal.aborted) return;
        if (queryError) {
          setCboError('Não foi possível carregar os nomes dos CBOs. Reabra a página para tentar novamente.');
          return;
        }
        options.push(...(data || []));
        if (!data || data.length < LOAD_SIZE) break;
      }
      setCbos(options);
    };
    void loadCbos();

    let worker: Worker | undefined;
    const failedRules = (cause: unknown) => {
      if (signal.aborted) return;
      console.error('[ConsultaSigtap] regras oficiais:', cause);
      setRulesError('Não foi possível conferir as regras oficiais. A busca por código, nome e CID continua disponível.');
      setRulesLoading(false);
      worker?.terminate();
    };
    try {
      worker = new Worker(new URL('../../workers/sigtapConsultationCatalog.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<{ catalog?: SigtapConsultationCatalog; reference?: string; error?: string }>) => {
        if (signal.aborted) return;
        if (!event.data.catalog) { failedRules(event.data.error); return; }
        setCatalog(event.data.catalog);
        setReference(event.data.reference || '');
        setRulesLoading(false);
        worker?.terminate();
      };
      worker.onerror = (event) => failedRules(event.message);
      worker.onmessageerror = failedRules;
      worker.postMessage(competence);
    } catch (cause) {
      failedRules(cause);
    }
    return () => { loadRequest.abort(); worker?.terminate(); };
  }, [competence]);

  useEffect(() => {
    let cancelled = false;
    const staff = currentUser.current;
    if (staff?.role !== 'profissional' || !staff.id) return;
    void resolveProfessionalCboReliable(staff, staff.id).then((code) => {
      if (!cancelled) setDetectedCbo({ userId: staff.id, code });
    });
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      searchRequest.current?.abort();
      clearTimeout(copyTimer.current);
    };
  }, []);

  useEffect(() => {
    if (loading || typeof shortcutCode !== 'string' || !/^\d{10}$/.test(shortcutCode)) return;
    const shortcutKey = location.key + ':' + shortcutCode;
    if (appliedShortcut.current === shortcutKey) return;
    appliedShortcut.current = shortcutKey;

    searchRequest.current?.abort();
    if (termInput.current) termInput.current.value = shortcutCode;
    if (cidInput.current) cidInput.current.value = '';
    setDraftCbo('');
    setCidLoading(false);
    setCidError('');
    setFilters(new Set());
    setSort('default');
    setPage(1);
    setApplied({ term: shortcutCode, cbo: '', cid: '', cidCodes: null });
    setSelected(rows.find(row => row.codigo === shortcutCode) ?? null);
  }, [loading, location.key, rows, shortcutCode]);

  const search = async () => {
    searchRequest.current?.abort();
    const term = termInput.current?.value.trim() ?? '';
    const cid = normalizeCidCode(cidInput.current?.value ?? '');
    setCidError('');
    if (cid && !/^[A-Z][0-9]{2}[A-Z0-9]?$/.test(cid)) {
      setCidLoading(false);
      setCidError('Informe um CID válido, como F32 ou M54.5.');
      return;
    }
    const request = new AbortController();
    searchRequest.current = request;
    const { signal } = request;
    setCidLoading(Boolean(cid));
    try {
      let cidCodes: ReadonlySet<string> | null = null;
      if (cid) {
        const variants = cid.length === 4 ? [cid, `${cid.slice(0, 3)}.${cid.slice(3)}`] : [cid];
        const codes = new Set<string>();
        for (let start = 0; ; start += LOAD_SIZE) {
          const { data, error: queryError } = await supabase.from('sigtap_procedimento_cids')
            .select('procedimento_codigo').in('cid_codigo', variants).order('procedimento_codigo')
            .abortSignal(signal).range(start, start + LOAD_SIZE - 1);
          if (signal.aborted) return;
          if (queryError) throw queryError;
          data?.forEach((item) => codes.add(item.procedimento_codigo));
          if (!data || data.length < LOAD_SIZE) break;
        }
        cidCodes = codes;
      }
      setApplied({ term, cbo: draftCbo, cid, cidCodes });
      setPage(1);
    } catch (cause) {
      if (signal.aborted) return;
      console.error('[ConsultaSigtap] filtro CID:', cause);
      setCidError('Não foi possível pesquisar este CID. Os resultados anteriores foram preservados.');
    } finally { if (!signal.aborted) setCidLoading(false); }
  };

  const clear = () => {
    searchRequest.current?.abort();
    if (termInput.current) termInput.current.value = '';
    if (cidInput.current) cidInput.current.value = '';
    setDraftCbo('');
    setApplied({ term: '', cbo: '', cid: '', cidCodes: null });
    setFilters(new Set()); setCidError(''); setCidLoading(false); setSort('default'); setPage(1);
  };

  const ownCboApplied = Boolean(ownCbo && applied.cbo === ownCbo);
  const toggleOwnCbo = () => {
    searchRequest.current?.abort();
    const cbo = ownCboApplied ? '' : ownCbo;
    setCidLoading(false);
    setCidError('');
    setDraftCbo(cbo);
    setApplied(current => ({ ...current, cbo }));
    setPage(1);
  };

  const copy = async (code: string) => {
    const attempt = ++copyAttempt.current;
    try {
      await copyProcedureCode(code);
      if (!mounted.current || attempt !== copyAttempt.current) return;
      setCopiedCode(code);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedCode(''), 2000);
      toast.success('Código copiado para a área de transferência!');
    } catch {
      if (mounted.current && attempt === copyAttempt.current) toast.error('O navegador não permitiu copiar. Abra os detalhes para selecionar o código.');
    }
  };

  const filtered = useMemo(() => {
    const found = filterSigtapRows(rows, applied.term, applied.cbo, applied.cidCodes, filters, catalog, ownCboApplied);
    if (sort === 'default') return found;
    return found.sort((a, b) => a.valor === b.valor ? 0 : a.valor === null ? 1 : b.valor === null ? -1
      : sort === 'asc' ? a.valor - b.valor : b.valor - a.valor);
  }, [rows, applied, filters, catalog, sort, ownCboApplied]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasValues = useMemo(() => rows.some((row) => row.valor !== null), [rows]);

  const printPage = async () => {
    setPrinting(true);
    try {
      const cboName = cbos.find(option => option.codigo === applied.cbo)?.descricao;
      const activeFilters = [
        applied.term && `Busca ${applied.term}`,
        applied.cbo && `CBO ${applied.cbo}${cboName ? ' · ' + cboName : ''}`,
        applied.cid && `CID ${applied.cid}`,
        ...filterOptions.filter(({ key }) => filters.has(key)).map(({ label }) => label),
        sort !== 'default' && (sort === 'asc' ? 'Menor valor primeiro' : 'Maior valor primeiro'),
      ].filter(Boolean);
      const { openPrintDocument } = await import('@/lib/printLayout');
      if (!mounted.current) return;
      await openPrintDocument('Guia rápido de procedimentos SIGTAP', buildSigtapConsultationPrint(visible, catalog, reference, competence), {
        'Competência consultada': formatSigtapCompetence(competence),
        'Referência das regras': reference ? formatSigtapCompetence(reference) : 'Não confirmada',
        'Filtros aplicados': escapeSigtapPrintText(activeFilters.join(' · ') || 'Todos os procedimentos'),
        'Resultados impressos': `Página ${page} de ${pages} · ${visible.length} de ${filtered.length} resultados`,
      });
    } catch {
      if (mounted.current) toast.error('Não foi possível abrir a impressão.');
    } finally {
      if (mounted.current) setPrinting(false);
    }
  };

  useEffect(() => {
    setDetail(null); setDetailError('');
    if (!selected) return;
    const request = new AbortController();
    void supabase.from('sigtap_procedimento_cids')
      .select('cid_codigo,cid_descricao', { count: 'exact' })
      .eq('procedimento_codigo', selected.codigo).order('cid_codigo').abortSignal(request.signal).limit(100)
      .then(({ data, count, error: queryError }) => {
        if (request.signal.aborted) return;
        if (queryError) { setDetailError('Não foi possível consultar os CIDs relacionados.'); return; }
        setDetail({ cids: data || [], total: count || 0 });
      });
    return () => request.abort();
  }, [selected]);

  const toggleFilter = (key: SigtapConsultationFilter) => {
    setFilters((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setPage(1);
  };

  const badges = (row: SigtapConsultationRow) => {
    const rule = catalog?.get(row.codigo);
    return <div className="flex flex-wrap gap-1">
      {rule ? [...rule.instrumentos].sort().map((code) => <Badge key={code} variant="secondary" title={instrumentoRotulo([code])}>
        {code === '01' ? 'BPA-C' : code === '02' ? 'BPA-I' : ['08','09'].includes(code) ? 'RAAS' : code === '10' ? 'e-SUS APS' : ['03','04','05'].includes(code) ? 'AIH' : ['06','07'].includes(code) ? 'APAC' : `Instrumento ${code}`}
      </Badge>) : <Badge variant="outline">Não confirmado</Badge>}
    </div>;
  };

  const cidBadge = (row: SigtapConsultationRow) => {
    const required = requiresCidForCompetence(catalog?.get(row.codigo), reference, competence);
    return <Badge variant={required === true ? 'destructive' : 'outline'}>{statusText(required)}</Badge>;
  };

  const cboLabel = (row: SigtapConsultationRow) => {
    const rule = catalog?.get(row.codigo);
    switch (cboStatusForCompetence(rule, reference, competence, applied.cbo)) {
      case 'relacionado': return 'CBO relacionado';
      case 'nao_relacionado': return 'CBO não relacionado';
      case 'nao_exige': return 'Não exige CBO';
      case 'lista_disponivel': {
        const quantity = rule?.cbos.size ?? 0;
        return quantity === 1 ? '1 CBO relacionado' : `${quantity} CBOs relacionados`;
      }
      case 'nao_confirmado': return 'Não confirmado para este mês';
    }
  };

  const codeActions = (row: SigtapConsultationRow) => {
    const code = formatSigtapCode(row.codigo);
    const copied = copiedCode === row.codigo;
    const Icon = copied ? Check : Copy;
    return <div className="flex items-center gap-1 whitespace-nowrap">
      <button type="button" className="select-text whitespace-nowrap text-left font-mono text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:underline"
        onClick={(event) => { event.stopPropagation(); setSelected(row); }}>{code}</button>
      <Button type="button" variant="ghost" size="sm" className={`clinical-record-action h-9 shrink-0 px-2 ${copied ? 'text-primary' : 'text-muted-foreground'}`}
        aria-label={`${copied ? 'Código copiado' : 'Copiar código'} ${code}`} title={copied ? 'Código copiado' : 'Copiar código'}
        onClick={(event) => { event.stopPropagation(); void copy(row.codigo); }}>
        <Icon className="h-4 w-4" aria-hidden="true" /><span className="hidden xl:inline text-xs">{copied ? "Copiado" : "Copiar"}</span>
      </Button>
    </div>;
  };

  return <div className="space-y-3 min-w-0 pb-8">
    <header className="clinical-hub-hero flex flex-wrap items-center gap-3">
      <span className="clinical-patient-avatar flex items-center justify-center shrink-0"><FileText className="h-5 w-5" aria-hidden="true" /></span>
      <div className="min-w-[9rem] flex-1">
        <p className="clinical-hub-eyebrow">Gestão de procedimentos SUS</p>
        <h1 className="clinical-hub-name text-xl font-bold font-display">Procedimentos do SIGTAP</h1>
        <p className="clinical-patient-sub text-xs mt-1">Consulte códigos, instrumentos e exigências antes de registrar o atendimento.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <BackButton className="m-0 text-white hover:text-white hover:bg-white/10" />
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Button type="button" className="clinical-hub-new gap-2" disabled={!visible.length || loading || printing || cidLoading}
            onClick={() => void printPage()} aria-describedby="sigtap-print-scope">
            {printing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Printer className="h-4 w-4" aria-hidden="true" />}
            Imprimir Tabela (A4)
          </Button>
          <span id="sigtap-print-scope" className="clinical-patient-sub text-[10px]">Imprime a página exibida.</span>
        </div>
      </div>
    </header>
    <section aria-label="Referência do catálogo SIGTAP" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {[
        {label:"Competência atual", value:formatSigtapCompetence(competence), Icon:CalendarDays, tone:"clinical-tone-blue"},
        {label:"Referência das regras", value:reference ? formatSigtapCompetence(reference) : rulesLoading ? "Carregando…" : "Não confirmada", Icon:ShieldCheck, tone:"clinical-tone-teal"},
        {label:"Procedimentos ativos no catálogo", value:loading || error ? "—" : rows.length.toLocaleString("pt-BR"), Icon:Layers, tone:"clinical-tone-violet"},
      ].map(({label,value,Icon,tone}) => <div key={label} className="clinical-premium p-2.5 flex items-center gap-2.5 min-w-0">
        <span className={"clinical-dock-icon "+tone}><Icon className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0"><p className="clinical-field-label text-xs font-semibold">{label}</p><p className="text-lg font-bold tabular-nums break-words text-[var(--cp-blue)]">{value}</p></div>
      </div>)}
    </section>
    <Card className="clinical-premium"><CardContent className="space-y-3 p-3">
      <div className="flex items-center gap-2"><span className="clinical-dock-icon clinical-tone-blue"><Search className="h-4 w-4" /></span><div><h2 className="text-sm font-semibold">Consulta de procedimentos</h2><p className="text-xs text-muted-foreground">Pesquisa por código, descrição, CBO e CID</p></div></div>
      {ownCbo && <div className="clinical-inset flex flex-col items-start gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <p className="break-words font-medium"><span className="text-muted-foreground">Seu CBO detectado </span>
            <strong className="text-primary">{ownCbo}</strong>{' · '}{cbos.find(option => option.codigo === ownCbo)?.descricao || user?.cargo || user?.profissao || 'Cargo não informado'}
          </p>
          {!reference && <p className="text-xs text-muted-foreground">{rulesLoading ? 'Conferindo compatibilidade no SIGTAP…' : 'Compatibilidade indisponível nesta sessão.'}</p>}
          {ownCboApplied && <p className="text-xs text-muted-foreground">Exibe vínculos confirmados e procedimentos que dispensam CBO na referência consultada.</p>}
        </div>
        <Button type="button" size="sm" variant={ownCboApplied ? 'outline' : 'default'} aria-pressed={ownCboApplied}
          disabled={!ownCboApplied && (!catalog || !reference || loading)} className={`clinical-record-action h-auto min-h-9 max-w-full whitespace-normal text-left ${ownCboApplied ? "" : "clinical-action-main"}`}
          onClick={toggleOwnCbo}>{ownCboApplied ? 'Exibir todos os procedimentos' : 'Ver apenas procedimentos da minha profissão'}</Button>
      </div>}
      <form onSubmit={(event) => { event.preventDefault(); if (!loading) void search(); }}>
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:items-end ${hasValues
        ? 'xl:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'
        : 'xl:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_auto]'}`}>
        <div className="min-w-0"><Label htmlFor="sigtap-search">Pesquisar por código ou descrição</Label><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" /><Input id="sigtap-search" ref={termInput} placeholder="Código ou nome do procedimento" className="pl-9" /></div></div>
        <CboPicker options={cbos} value={draftCbo} onChange={setDraftCbo} disabled={!catalog} />
        <div><Label htmlFor="sigtap-cid">Filtrar por CID</Label><Input id="sigtap-cid" ref={cidInput} placeholder="Ex.: F32, M54.5" /></div>
        {hasValues && <div><Label htmlFor="sigtap-sort">Ordenar por valor</Label><Select value={sort} onValueChange={(value) => { setSort(value); setPage(1); }}><SelectTrigger id="sigtap-sort"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">Padrão</SelectItem><SelectItem value="asc">Menor valor</SelectItem><SelectItem value="desc">Maior valor</SelectItem></SelectContent></Select></div>}
        <div className="flex gap-2"><Button type="submit" className="clinical-record-action clinical-action-main" disabled={cidLoading || loading}><Search className="mr-1 h-4 w-4" />Buscar</Button><Button type="button" variant="outline" className="clinical-record-action" onClick={clear} aria-label="Limpar filtros"><X className="mr-1 h-4 w-4" />Limpar</Button></div>
      </div>
      </form>
      <div className="flex flex-wrap items-center gap-2">{filterOptions.map((option) => <Button key={option.key} size="sm" variant={filters.has(option.key) ? 'default' : 'outline'} aria-pressed={filters.has(option.key)} disabled={!catalog || (option.key === 'exige_cid' && reference !== competence)} onClick={() => toggleFilter(option.key)} className={`clinical-record-action rounded-lg ${filters.has(option.key) ? "clinical-action-main" : ""}`}>{option.label}</Button>)}<span className="ml-auto text-sm text-muted-foreground" role="status">{loading ? 'Carregando…' : `${filtered.length} resultado(s)`}</span></div>
      {cidError && <p role="alert" className="text-sm text-destructive">{cidError}</p>}
      {cboError && <p role="alert" className="text-sm text-muted-foreground">{cboError}</p>}
      {rulesLoading && <p role="status" className="text-sm text-muted-foreground">Conferindo as regras do SIGTAP…</p>}
      {rulesError && <p role="alert" className="text-sm text-muted-foreground">{rulesError}</p>}
      {reference && reference !== competence && <p className="text-xs text-muted-foreground">
        Os filtros de CBO, instrumentos e classificação usam a referência acima. As relações de CBO e a exigência de CID não estão confirmadas para o mês atual.
      </p>}
      <p className="text-xs text-muted-foreground">“Exige CID” indica o atributo complementar 048 na competência consultada. “Não” significa que esse atributo não consta no procedimento; confira também as regras do instrumento de registro antes de lançar a produção.</p>
      {!hasValues && !loading && !error && <p className="text-xs text-muted-foreground">O catálogo local não informa valores.</p>}
    </CardContent></Card>
    {error ? <Card className="clinical-premium"><CardContent className="pt-5 text-sm text-destructive" role="alert">{error}</CardContent></Card> : loading ? <div className="flex items-center gap-2 p-6 text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />Carregando procedimentos…</div> : <>
      <div className="flex items-center justify-between gap-2 px-1"><h2 className="font-semibold text-sm">Procedimentos encontrados</h2><span className="text-xs text-muted-foreground">{visible.length} nesta página · {filtered.length} resultados</span></div>
      {!isMobile ? <div className="clinical-premium overflow-hidden"><div className="overflow-x-auto"><Table><TableHeader className="clinical-inset"><TableRow><TableHead>Código</TableHead><TableHead>Descrição</TableHead><TableHead>Tipo</TableHead>{hasValues && <TableHead>Valor</TableHead>}<TableHead>CBO</TableHead><TableHead>Exige CID</TableHead><TableHead>Exige classificação</TableHead></TableRow></TableHeader><TableBody>
        {visible.map((row) => { const rule = catalog?.get(row.codigo); return <TableRow key={row.codigo} className="cursor-pointer" onClick={() => setSelected(row)}><TableCell className="whitespace-nowrap">{codeActions(row)}</TableCell><TableCell className="min-w-[12rem] max-w-sm whitespace-normal font-medium">{row.nome}</TableCell><TableCell>{badges(row)}</TableCell>{hasValues && <TableCell className="whitespace-nowrap">{formatValue(row.valor)}</TableCell>}<TableCell className="text-xs clinical-field-label">{cboLabel(row)}</TableCell><TableCell>{cidBadge(row)}</TableCell><TableCell><Badge variant="outline">{rule ? statusText(rule.servicosClassificacoes.size > 0) : 'Não confirmado'}</Badge></TableCell></TableRow>; })}
      </TableBody></Table></div></div> :
      <div className="space-y-2">{visible.map((row) => <article key={row.codigo} onClick={() => setSelected(row)}
        className="clinical-premium cursor-pointer overflow-hidden p-3 space-y-2">
        {codeActions(row)}
        <h2 className="font-semibold text-sm">{row.nome}</h2>
        <div className="mt-2">{badges(row)}</div>
        <div className="clinical-inset rounded-lg border p-2 space-y-1"><p className="text-xs clinical-field-label">CBO · {cboLabel(row)}</p>
        <p className="mt-1 text-xs text-muted-foreground">Exige CID: {statusText(requiresCidForCompetence(catalog?.get(row.codigo), reference, competence))}
          {hasValues && ` · Valor: ${formatValue(row.valor)}`}</p><p className="text-xs text-muted-foreground">Exige classificação: {catalog?.get(row.codigo) ? statusText((catalog.get(row.codigo)?.servicosClassificacoes.size ?? 0) > 0) : "Não confirmado"}</p></div>
        <Button type="button" size="sm" className="clinical-record-action clinical-action-main w-full" onClick={(event) => { event.stopPropagation(); setSelected(row); }}>Ver detalhes <ChevronRight className="h-4 w-4" /></Button>
      </article>)}</div>}
      {visible.length === 0 && <Card className="clinical-premium"><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum procedimento corresponde aos filtros informados.</CardContent></Card>}
      <div className="clinical-premium p-2.5 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Página {page} de {pages}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</Button></div></div>
    </>}
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="clinical-premium max-h-[85vh] max-w-2xl overflow-y-auto"><DialogHeader className="clinical-hub-hero text-left pr-8"><p className="clinical-hub-eyebrow">Ficha técnica do procedimento</p><DialogTitle className="clinical-hub-name flex select-text items-center gap-2"><FileText className="h-5 w-5" />{selected ? formatSigtapCode(selected.codigo) : 'Procedimento'}</DialogTitle><DialogDescription className="clinical-patient-sub">{selected?.nome}</DialogDescription></DialogHeader>{selected && (() => {
      const rule = catalog?.get(selected.codigo);
      return <div className="space-y-3 text-sm"><p className="clinical-inset border rounded-lg p-3 text-muted-foreground">{selected.descricao || 'Sem descrição adicional no cadastro.'}</p><div className="grid grid-cols-1 gap-2 sm:grid-cols-2 [&>div]:bg-[var(--cp-inset)] [&>div]:rounded-lg [&>div]:border [&>div]:p-3 [&_strong]:text-xs [&_strong]:font-semibold [&_p]:break-words"><div><strong>Instrumentos de registro</strong><p>{rule ? instrumentoRotulo([...rule.instrumentos]) : 'Não confirmado'}</p></div>{hasValues && <div><strong>Valor</strong><p>{formatValue(selected.valor)}</p></div>}<div><strong>Exige CID na competência atual</strong><p>{statusText(requiresCidForCompetence(rule, reference, competence))}</p>{reference && reference !== competence && <p className="text-xs text-muted-foreground">Em {formatSigtapCompetence(reference)}: {statusText(requiresCidForCompetence(rule, reference, reference))}</p>}</div><div><strong>Serviço/classificação</strong><p>{rule ? rule.servicosClassificacoes.size ? [...rule.servicosClassificacoes].sort().join(', ') : 'Nenhuma relação listada' : 'Não confirmado'}</p></div><div><strong>{applied.cbo ? `CBO ${applied.cbo} no mês atual` : 'CBO no mês atual'}</strong><p>{cboLabel(selected)}</p>{!!rule?.cbos.size && <p className="mt-1 break-words text-xs text-muted-foreground">Relações em {formatSigtapCompetence(reference)} · {[...rule.cbos].sort().join(', ')}</p>}</div><div><strong>Referência consultada</strong><p>{reference ? formatSigtapCompetence(reference) : 'Não confirmada'}</p></div></div>
        <div className="clinical-inset rounded-lg border p-3"><div className="flex items-center gap-2 mb-2"><span className="clinical-dock-icon clinical-tone-violet"><ListChecks className="h-4 w-4" /></span><strong>CIDs relacionados</strong></div>{detailError ? <p role="alert" className="text-destructive">{detailError}</p> : !detail ? <p className="text-muted-foreground">Carregando…</p> : detail.total === 0 ? <p className="text-muted-foreground">Nenhum CID relacionado cadastrado.</p> : <><p className="text-xs text-muted-foreground">{detail.total > detail.cids.length ? `Primeiros ${detail.cids.length} de ${detail.total}` : `${detail.total} CID(s)`}. Esta relação não determina, por si só, a exigência de CID.</p><div className="mt-2 max-h-48 overflow-y-auto rounded border bg-card divide-y [&>p]:py-1.5 p-2">{detail.cids.map((cid) => <p key={cid.cid_codigo}><span className="font-mono">{cid.cid_codigo}</span> · {cid.cid_descricao || 'Sem descrição'}</p>)}</div></>}</div>
        <Button type="button" variant="outline" className="clinical-record-action w-full" onClick={() => void copy(selected.codigo)}><Copy className="h-4 w-4" />{copiedCode === selected.codigo ? "Código copiado" : "Copiar código SIGTAP"}</Button>
      </div>;
    })()}</DialogContent></Dialog>
  </div>;
}

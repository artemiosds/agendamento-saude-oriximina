import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Loader2, Search, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { loadBpaSigtapCatalog, getCompetenciaReferenciaCatalogo, avaliarCboSigtap, type BpaSigtapCatalog } from '@/lib/bpaSigtapCatalog';
import { instrumentoRotulo } from '@/lib/sigtapInstruments';
import { resolveProfessionalCboReliable } from '@/lib/sigtapClinicalValidation';
import { filterSigtapRows, formatSigtapCode, normalizeCidCode, requiresCid, type SigtapConsultationFilter, type SigtapConsultationRow } from '@/lib/sigtapConsultation';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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

const statusText = (value: boolean | null) => value === null ? 'Não confirmado' : value ? 'Sim' : 'Não';
const formatValue = (value: number | null) => value === null
  ? 'Não informado'
  : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface CboOption { codigo: string; descricao: string }
interface ProcedureDetail { cids: { cid_codigo: string; cid_descricao: string | null }[]; total: number }

export default function ConsultaSigtap() {
  const { user } = useAuth();
  const [rows, setRows] = useState<SigtapConsultationRow[]>([]);
  const [cbos, setCbos] = useState<CboOption[]>([]);
  const [catalog, setCatalog] = useState<BpaSigtapCatalog | null>(null);
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(true);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [error, setError] = useState('');
  const [cboError, setCboError] = useState('');
  const [rulesError, setRulesError] = useState('');
  const [draftTerm, setDraftTerm] = useState('');
  const [draftCbo, setDraftCbo] = useState('');
  const [draftCid, setDraftCid] = useState('');
  const [applied, setApplied] = useState({ term: '', cbo: '', cidCodes: null as ReadonlySet<string> | null });
  const [cidLoading, setCidLoading] = useState(false);
  const [cidError, setCidError] = useState('');
  const [filters, setFilters] = useState<ReadonlySet<SigtapConsultationFilter>>(new Set());
  const [sort, setSort] = useState('default');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SigtapConsultationRow | null>(null);
  const [detail, setDetail] = useState<ProcedureDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  const searchId = useRef(0);
  const currentUser = useRef(user);
  currentUser.current = user;
  const competence = useMemo(currentCompetence, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const all: SigtapConsultationRow[] = [];
        for (let start = 0; ; start += LOAD_SIZE) {
          const { data, error: queryError } = await supabase.from('sigtap_procedimentos')
            .select('codigo,nome,descricao,origem,valor').eq('ativo', true)
            .order('codigo').range(start, start + LOAD_SIZE - 1);
          if (queryError) throw queryError;
          all.push(...(data || []));
          if (!data || data.length < LOAD_SIZE) break;
        }
        if (!cancelled) setRows(all);
      } catch (cause) {
        console.error('[ConsultaSigtap] catálogo local:', cause);
        if (!cancelled) setError('Não foi possível carregar os procedimentos. Reabra a página para tentar novamente.');
      } finally { if (!cancelled) setLoading(false); }
    };
    void load();
    void supabase.from('cbo_codigos').select('codigo,descricao').eq('ativo', true).order('descricao')
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) setCboError('Não foi possível carregar os nomes dos CBOs. Reabra a página para tentar novamente.');
        else setCbos(data || []);
      });
    void loadBpaSigtapCatalog(competence)
      .then((rules) => {
        if (cancelled) return;
        setCatalog(rules);
        setReference(getCompetenciaReferenciaCatalogo(rules) || competence);
      })
      .catch((cause) => {
        console.error('[ConsultaSigtap] regras oficiais:', cause);
        if (!cancelled) setRulesError('Não foi possível conferir as regras oficiais. O filtro CBO e os selos de instrumentos e exigências estão indisponíveis; a busca por código, nome e CID continua funcionando.');
      })
      .finally(() => { if (!cancelled) setRulesLoading(false); });
    return () => { cancelled = true; };
  }, [competence]);

  useEffect(() => {
    let cancelled = false;
    const staff = currentUser.current;
    if (staff?.role !== 'profissional' || !staff.id) return;
    void resolveProfessionalCboReliable(staff, staff.id).then((cbo) => {
      if (!cancelled && cbo) { setDraftCbo(cbo); setApplied((current) => ({ ...current, cbo })); }
    });
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  const search = async () => {
    const requestId = ++searchId.current;
    const cid = normalizeCidCode(draftCid);
    setCidError('');
    if (cid && !/^[A-Z][0-9]{2}[A-Z0-9]?$/.test(cid)) {
      setCidError('Informe um CID válido, como F32 ou M54.5.');
      return;
    }
    setCidLoading(Boolean(cid));
    try {
      let cidCodes: ReadonlySet<string> | null = null;
      if (cid) {
        const variants = [cid, cid.length === 4 ? `${cid.slice(0, 3)}.${cid.slice(3)}` : cid];
        const codes = new Set<string>();
        for (let start = 0; ; start += LOAD_SIZE) {
          const { data, error: queryError } = await supabase.from('sigtap_procedimento_cids')
            .select('procedimento_codigo').in('cid_codigo', variants)
            .order('procedimento_codigo').range(start, start + LOAD_SIZE - 1);
          if (queryError) throw queryError;
          data?.forEach((item) => codes.add(item.procedimento_codigo));
          if (!data || data.length < LOAD_SIZE) break;
        }
        cidCodes = codes;
      }
      if (requestId === searchId.current) {
        setApplied({ term: draftTerm, cbo: draftCbo, cidCodes });
        setPage(1);
      }
    } catch (cause) {
      console.error('[ConsultaSigtap] filtro CID:', cause);
      if (requestId === searchId.current) setCidError('Não foi possível pesquisar este CID. Os resultados anteriores foram preservados.');
    } finally { if (requestId === searchId.current) setCidLoading(false); }
  };

  const clear = () => {
    searchId.current++;
    setDraftTerm(''); setDraftCbo(''); setDraftCid(''); setApplied({ term: '', cbo: '', cidCodes: null });
    setFilters(new Set()); setCidError(''); setCidLoading(false); setSort('default'); setPage(1);
  };

  const filtered = useMemo(() => {
    const found = filterSigtapRows(rows, applied.term, applied.cbo, applied.cidCodes, filters, catalog);
    if (sort === 'default') return found;
    return [...found].sort((a, b) => a.valor === null ? 1 : b.valor === null ? -1
      : sort === 'asc' ? a.valor - b.valor : b.valor - a.valor);
  }, [rows, applied, filters, catalog, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasValues = rows.some((row) => row.valor !== null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null); setDetailError('');
    if (!selected) return;
    void supabase.from('sigtap_procedimento_cids')
      .select('cid_codigo,cid_descricao', { count: 'exact' })
      .eq('procedimento_codigo', selected.codigo).order('cid_codigo').limit(100)
      .then(({ data, count, error: queryError }) => {
        if (cancelled) return;
        if (queryError) { setDetailError('Não foi possível consultar os CIDs relacionados.'); return; }
        setDetail({ cids: data || [], total: count || 0 });
      });
    return () => { cancelled = true; };
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
    const required = requiresCid(catalog?.get(row.codigo));
    return <Badge variant={required === true ? 'destructive' : 'outline'}>{statusText(required)}</Badge>;
  };

  return <div className="space-y-4 pb-8">
    <PageHeader title="Procedimentos do SIGTAP" subtitle="Consulte códigos, instrumentos e exigências antes de registrar o atendimento." back />
    <Card><CardContent className="space-y-4 pt-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
        <div><Label htmlFor="sigtap-search">Pesquisar por código ou descrição</Label><Input id="sigtap-search" placeholder="Código ou nome do procedimento" value={draftTerm} onChange={(e) => setDraftTerm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void search(); }} /></div>
        <div><Label htmlFor="sigtap-cbo">Filtrar por cargo/CBO</Label><Select value={draftCbo || 'all'} onValueChange={(value) => setDraftCbo(value === 'all' ? '' : value)} disabled={!catalog}><SelectTrigger id="sigtap-cbo"><SelectValue placeholder="Todos os CBOs" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os CBOs</SelectItem>{cbos.map((option) => <SelectItem key={option.codigo} value={option.codigo}>{option.codigo} · {option.descricao}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="sigtap-cid">Filtrar por CID</Label><Input id="sigtap-cid" placeholder="Ex.: F32, M54.5" value={draftCid} onChange={(e) => setDraftCid(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void search(); }} /></div>
        <div><Label htmlFor="sigtap-sort">Ordenar por valor</Label><Select value={sort} onValueChange={(value) => { setSort(value); setPage(1); }} disabled={!hasValues}><SelectTrigger id="sigtap-sort"><SelectValue placeholder="Não informado" /></SelectTrigger><SelectContent><SelectItem value="default">Padrão</SelectItem><SelectItem value="asc">Menor valor</SelectItem><SelectItem value="desc">Maior valor</SelectItem></SelectContent></Select></div>
        <div className="flex gap-2"><Button onClick={() => void search()} disabled={cidLoading || loading}><Search className="mr-1 h-4 w-4" />Buscar</Button><Button variant="outline" onClick={clear} aria-label="Limpar filtros"><X className="mr-1 h-4 w-4" />Limpar</Button></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{filterOptions.map((option) => <Button key={option.key} size="sm" variant={filters.has(option.key) ? 'default' : 'outline'} aria-pressed={filters.has(option.key)} disabled={!catalog} onClick={() => toggleFilter(option.key)} className="rounded-full">{option.label}</Button>)}<span className="ml-auto text-sm text-muted-foreground" role="status">{loading ? 'Carregando…' : `${filtered.length} resultado(s)`}</span></div>
      {cidError && <p role="alert" className="text-sm text-destructive">{cidError}</p>}
      {cboError && <p role="alert" className="text-sm text-amber-700">{cboError}</p>}
      {rulesLoading && <p role="status" className="text-sm text-muted-foreground">Conferindo as regras do SIGTAP…</p>}
      {rulesError && <p role="alert" className="text-sm text-amber-700">{rulesError}</p>}
      {reference && reference !== competence && <p className="text-xs text-amber-700">Regras consultadas na referência {reference}; a referência atual ainda não estava disponível.</p>}
      {!hasValues && !loading && <p className="text-xs text-muted-foreground">Valores não estão preenchidos no catálogo local; a ordenação por valor está indisponível.</p>}
    </CardContent></Card>
    {error ? <Card><CardContent className="pt-5 text-sm text-destructive" role="alert">{error}</CardContent></Card> : loading ? <div className="flex items-center gap-2 p-6 text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />Carregando procedimentos…</div> : <>
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block"><Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Descrição</TableHead><TableHead>Tipo</TableHead><TableHead>Valor</TableHead><TableHead>CBO</TableHead><TableHead>Exige CID</TableHead><TableHead>Exige classificação</TableHead></TableRow></TableHeader><TableBody>
        {visible.map((row) => { const rule = catalog?.get(row.codigo); return <TableRow key={row.codigo} className="cursor-pointer" onClick={() => setSelected(row)}><TableCell><button className="text-left font-mono font-semibold text-primary underline-offset-2 hover:underline focus-visible:underline" onClick={() => setSelected(row)}>{formatSigtapCode(row.codigo)}</button><span className="block text-xs text-muted-foreground">Ver detalhes</span></TableCell><TableCell className="max-w-xs whitespace-normal font-medium">{row.nome}</TableCell><TableCell>{badges(row)}</TableCell><TableCell className="whitespace-nowrap">{formatValue(row.valor)}</TableCell><TableCell>{!rule ? 'Não confirmado' : applied.cbo ? 'Compatível' : rule.cbos.size ? `${rule.cbos.size} CBO(s)` : rule.detalhes?.has('021') ? 'Não exige' : 'Sem restrição listada'}</TableCell><TableCell>{cidBadge(row)}</TableCell><TableCell><Badge variant="outline">{rule ? statusText(rule.servicosClassificacoes.size > 0) : 'Não confirmado'}</Badge></TableCell></TableRow>; })}
      </TableBody></Table></div>
      <div className="space-y-2 md:hidden">{visible.map((row) => { const rule = catalog?.get(row.codigo); return <button key={row.codigo} onClick={() => setSelected(row)} className="w-full rounded-lg border bg-card p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="font-mono text-sm font-semibold text-primary">{formatSigtapCode(row.codigo)}</span><span className="mt-1 block font-medium">{row.nome}</span><span className="mt-2 block">{badges(row)}</span><span className="mt-2 block text-xs text-muted-foreground">Exige CID: {statusText(requiresCid(rule))} · Valor: {formatValue(row.valor)}</span></button>; })}</div>
      {visible.length === 0 && <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum procedimento corresponde aos filtros informados.</CardContent></Card>}
      <div className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Página {page} de {pages}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</Button></div></div>
    </>}
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />{selected ? formatSigtapCode(selected.codigo) : 'Procedimento'}</DialogTitle><DialogDescription>{selected?.nome}</DialogDescription></DialogHeader>{selected && (() => {
      const rule = catalog?.get(selected.codigo);
      return <div className="space-y-4 text-sm"><p className="text-muted-foreground">{selected.descricao || 'Sem descrição adicional no cadastro.'}</p><div className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-2"><div><strong>Instrumentos de registro</strong><p>{rule ? instrumentoRotulo([...rule.instrumentos]) : 'Não confirmado'}</p></div><div><strong>Valor</strong><p>{formatValue(selected.valor)}</p></div><div><strong>Exige CID</strong><p>{statusText(requiresCid(rule))}</p></div><div><strong>Serviço/classificação</strong><p>{rule ? rule.servicosClassificacoes.size ? [...rule.servicosClassificacoes].sort().join(', ') : 'Nenhuma relação listada' : 'Não confirmado'}</p></div><div><strong>CBOs relacionados</strong><p className="break-words">{rule ? rule.cbos.size ? [...rule.cbos].sort().join(', ') : rule.detalhes?.has('021') ? 'Não exige CBO' : 'Sem restrição listada' : 'Não confirmado'}</p></div><div><strong>Referência consultada</strong><p>{reference || 'Não confirmada'}</p></div></div>
        {applied.cbo && rule && <p className="rounded-md bg-muted p-3">CBO {applied.cbo}: {avaliarCboSigtap(rule, applied.cbo) === 'incompativel' ? 'não relacionado a este procedimento' : 'compatível conforme a relação disponível'}.</p>}
        <div><strong>CIDs relacionados</strong>{detailError ? <p role="alert" className="text-destructive">{detailError}</p> : !detail ? <p className="text-muted-foreground">Carregando…</p> : detail.total === 0 ? <p className="text-muted-foreground">Nenhum CID relacionado cadastrado.</p> : <><p className="text-xs text-muted-foreground">{detail.total > detail.cids.length ? `Primeiros ${detail.cids.length} de ${detail.total}` : `${detail.total} CID(s)`}. Esta relação não determina, por si só, a exigência de CID.</p><div className="mt-2 max-h-40 overflow-y-auto rounded border p-2">{detail.cids.map((cid) => <p key={cid.cid_codigo}><span className="font-mono">{cid.cid_codigo}</span> · {cid.cid_descricao || 'Sem descrição'}</p>)}</div></>}</div>
      </div>;
    })()}</DialogContent></Dialog>
  </div>;
}

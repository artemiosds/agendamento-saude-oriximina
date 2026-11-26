import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import DOMPurify from 'dompurify';
import { useAuth } from '@/contexts/AuthContext';
import { useOperacional } from '@/contexts/OperacionalContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { Printer, Download, Search, ClipboardList, Send, Inbox, Loader2, CheckCircle, RefreshCw, Mail, ChevronRight, RotateCcw, SlidersHorizontal, CalendarClock, Building2, Stethoscope, UserRound } from 'lucide-react';
import ModalVerEncaminhamento from '@/components/ModalVerEncaminhamento';
import { listarEncaminhamentos, invalidarCacheEncaminhamentos, type EncaminhamentoData } from '@/services/encaminhamentoService';
import { buildDocumentShell, loadDocumentConfig, openPrintDocument } from '@/lib/printLayout';
import { receivedReferralBody, referralFields, referralDate } from '@/lib/encaminhamentoDocument';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { EmptyState, LoadingState } from '@/components/EmptyState';

const ITEMS_PER_PAGE = 20;
const DOCUMENT_COLUMNS = 'id,tipo_documento,paciente_id,paciente_nome,profissional_id,profissional_nome,status,created_at,unidade_id';
const DOCUMENT_TYPES = ['Encaminhamento', 'encaminhamento', 'Guia de Encaminhamento', 'guia de encaminhamento'];

interface DocEncaminhamento {
  id: string;
  tipo_documento: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  status: string;
  created_at: string;
  unidade_id: string;
}

interface DocumentDetail extends DocEncaminhamento {
  conteudo_html: string;
  campos_formulario: Record<string, unknown>;
  documentBody: string;
  previewHtml: string;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  assinado: { label: 'Assinado', className: 'bg-blue-100 text-blue-800' },
  agendado: { label: 'Agendado', className: 'bg-green-100 text-green-800' },
  realizado: { label: 'Realizado', className: 'bg-emerald-100 text-emerald-800' },
  cancelado: { label: 'Cancelado', className: 'bg-red-100 text-red-800' },
  rascunho: { label: 'Rascunho', className: 'bg-yellow-100 text-yellow-800' },
};

const Encaminhamentos: React.FC = () => {
  const { user } = useAuth();
  const { funcionarios, unidades } = useOperacional();
  const queryClient = useQueryClient();
  const isMasterOrGestao = user?.role === 'master' || user?.role === 'gestao' || user?.role === 'coordenador';
  const isGlobal = user?.usuario === 'admin.sms';
  const scopeKey = JSON.stringify([user?.authUserId, user?.id, user?.role, user?.unidadeId, isGlobal]);
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;

  // Recebidos (storage-based)
  const [selectedEnc, setSelectedEnc] = useState<EncaminhamentoData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Enviados (documentos_gerados)
  const [previewDoc, setPreviewDoc] = useState<DocumentDetail | null>(null);
  const [openingDoc, setOpeningDoc] = useState<string | null>(null);
  const detailRequest = useRef(0);

  // Filters
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [buscaPaciente, setBuscaPaciente] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [filtroProfDestino, setFiltroProfDestino] = useState('');
  const [filtroStatusEnviados, setFiltroStatusEnviados] = useState('todos');
  const [buscaEnviados, setBuscaEnviados] = useState('');

  const [activeTab, setActiveTab] = useState('recebidos');
  const [page, setPage] = useState(1);
  const [pageEnv, setPageEnv] = useState(1);

  const receivedQuery = useQuery({
    queryKey: ['encaminhamentos', 'recebidos', scopeKey],
    queryFn: () => listarEncaminhamentos(isMasterOrGestao ? undefined : user!.id, scopeKey),
    enabled: !!user?.id,
    staleTime: 3 * 60 * 1000,
    gcTime: 3 * 60 * 1000,
    placeholderData: () => undefined,
  });
  const sentQuery = useQuery({
    queryKey: ['encaminhamentos', 'enviados', scopeKey],
    queryFn: async ({ signal }) => {
      if (!isGlobal && !user?.unidadeId) throw new Error('Usuário sem unidade vinculada.');
      const rows: DocEncaminhamento[] = [];
      for (let offset = 0; ; offset += 500) {
        let query = supabase.from('documentos_gerados').select(DOCUMENT_COLUMNS)
          .in('tipo_documento', DOCUMENT_TYPES)
          .order('created_at', { ascending: false }).order('id', { ascending: false })
          .range(offset, offset + 499).abortSignal(signal);
        if (!isGlobal) query = query.eq('unidade_id', user!.unidadeId);
        if (!isMasterOrGestao) query = query.eq('profissional_id', user!.id);
        const { data, error } = await query;
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < 500) return rows;
      }
    },
    enabled: !!user?.id,
    staleTime: 3 * 60 * 1000,
    gcTime: 3 * 60 * 1000,
    placeholderData: () => undefined,
  });

  // JSON snapshots can store the unit ID or its historical display name.
  // Unknown units are not exposed to users scoped to a unit.
  const encaminhamentos = useMemo(() => {
    const records = receivedQuery.data || [];
    if (isGlobal) return records;
    if (!user?.unidadeId) return [];
    const normalize = (s: string) => s.trim().toLocaleLowerCase('pt-BR');
    const unit = unidades.find(u => u.id === user.unidadeId);
    const aliases = [user.unidadeId, unit?.nome, unit?.nomeExibicao].filter(Boolean).map(s => normalize(s!));
    return records.filter(record => {
      if (record.unidade) return aliases.includes(normalize(record.unidade));
      return funcionarios.some(f => f.id === record.profissional_origem_id && f.unidadeId === user.unidadeId);
    });
  }, [receivedQuery.data, isGlobal, user?.unidadeId, unidades, funcionarios]);
  const enviados = useMemo(() => sentQuery.data || [], [sentQuery.data]);
  const loadingRecebidos = receivedQuery.isLoading;
  const loadingEnviados = sentQuery.isLoading;
  const fetching = receivedQuery.isFetching || sentQuery.isFetching;
  const { refetch: refetchRecebidos } = receivedQuery;
  const fetchRecebidos = useCallback(() => { void refetchRecebidos(); }, [refetchRecebidos]);
  const refresh = () => {
    invalidarCacheEncaminhamentos();
    void queryClient.invalidateQueries({ queryKey: ['encaminhamentos', 'detalhe', scopeKey] });
    void Promise.all([receivedQuery.refetch(), sentQuery.refetch()]);
  };

  useEffect(() => {
    detailRequest.current++;
    setPreviewDoc(null);
    setOpeningDoc(null);
    setSelectedEnc(null);
    setModalOpen(false);
    setPage(1);
    setPageEnv(1);
  }, [scopeKey]);
  useEffect(() => () => { detailRequest.current++; }, []);

  const naoLidos = useMemo(() => encaminhamentos.filter(e => e.status === 'recebido').length, [encaminhamentos]);

  // Filtered recebidos
  const filteredRecebidos = useMemo(() => {
    let list = [...encaminhamentos];
    if (filtroStatus !== 'todos') list = list.filter(e => e.status === filtroStatus);
    if (buscaPaciente.trim()) {
      const q = buscaPaciente.toLowerCase().trim();
      list = list.filter(e => e.paciente_nome.toLowerCase().includes(q));
    }
    if (dataInicio) list = list.filter(e => e.data_geracao >= dataInicio);
    if (dataFim) list = list.filter(e => e.data_geracao <= dataFim + 'T23:59:59');
    if (filtroProfDestino) list = list.filter(e => e.profissional_destino_id === filtroProfDestino);
    list.sort((a, b) => b.data_geracao.localeCompare(a.data_geracao) || a.id.localeCompare(b.id));
    return list;
  }, [encaminhamentos, filtroStatus, buscaPaciente, dataInicio, dataFim, filtroProfDestino]);

  // Filtered enviados
  const filteredEnviados = useMemo(() => {
    let list = [...enviados];
    if (filtroStatusEnviados !== 'todos') list = list.filter(e => e.status === filtroStatusEnviados);
    if (buscaEnviados.trim()) {
      const q = buscaEnviados.toLowerCase().trim();
      list = list.filter(e => e.paciente_nome.toLowerCase().includes(q));
    }
    return list;
  }, [enviados, filtroStatusEnviados, buscaEnviados]);

  const totalPagesRec = Math.max(1, Math.ceil(filteredRecebidos.length / ITEMS_PER_PAGE));
  const currentPageRec = Math.min(page, totalPagesRec);
  const paginatedRec = filteredRecebidos.slice((currentPageRec - 1) * ITEMS_PER_PAGE, currentPageRec * ITEMS_PER_PAGE);

  const totalPagesEnv = Math.max(1, Math.ceil(filteredEnviados.length / ITEMS_PER_PAGE));
  const currentPageEnv = Math.min(pageEnv, totalPagesEnv);
  const paginatedEnv = filteredEnviados.slice((currentPageEnv - 1) * ITEMS_PER_PAGE, currentPageEnv * ITEMS_PER_PAGE);
  useEffect(() => { setPage(p => Math.min(p, totalPagesRec)); }, [totalPagesRec]);
  useEffect(() => { setPageEnv(p => Math.min(p, totalPagesEnv)); }, [totalPagesEnv]);

  const handleVer = (enc: EncaminhamentoData) => { setSelectedEnc(enc); setModalOpen(true); };

  const handlePrintRecebido = async (enc: EncaminhamentoData) => {
    try {
      await openPrintDocument(enc.tipo_documento || 'Encaminhamento', receivedReferralBody(enc), undefined,
        { linha1: 'SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ' });
    } catch { toast.error('Não foi possível preparar a impressão.'); }
  };

  const openSentDocument = async (doc: DocEncaminhamento, print = false) => {
    const requestId = ++detailRequest.current;
    const scope = scopeKey;
    setOpeningDoc(doc.id);
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: ['encaminhamentos', 'detalhe', scopeKey, doc.id],
        staleTime: 3 * 60 * 1000,
        gcTime: 3 * 60 * 1000,
        queryFn: async (): Promise<DocumentDetail> => {
          if (!isGlobal && !user?.unidadeId) throw new Error('Unidade indisponível.');
          let query = supabase.from('documentos_gerados')
            .select(`${DOCUMENT_COLUMNS},conteudo_html,campos_formulario`).eq('id', doc.id)
            .in('tipo_documento', DOCUMENT_TYPES);
          if (!isGlobal) query = query.eq('unidade_id', user!.unidadeId);
          if (!isMasterOrGestao) query = query.eq('profissional_id', user!.id);
          const { data, error } = await query.single();
          if (error || !data) throw error || new Error('Documento indisponível.');
          if (scopeRef.current !== scope) throw new Error('Escopo de acesso alterado.');
          const full = data as unknown as DocumentDetail;
          const fields = full.campos_formulario || {};
          const { data: patient } = await supabase.from('pacientes').select('cpf,cns,data_nascimento').eq('id', full.paciente_id).maybeSingle();
          const author = funcionarios.find(f => f.id === full.profissional_id);
          const value = (key: string, fallback?: string | null) => String(fields[key] || fields[`paciente_${key}`] || fallback || 'Não informado');
          const identification = referralFields({ Paciente: full.paciente_nome,
            CPF: value('cpf', patient?.cpf), 'Cartão SUS': value('cns', patient?.cns),
            Nascimento: referralDate(value('data_nascimento', patient?.data_nascimento)),
            Especialidade: value('especialidade_destino'), Emissão: referralDate(full.created_at) });
          // Preserve the original signed HTML and its signature. Supplement only identification;
          // current registration data never replaces or regenerates the original signature.
          const professional = referralFields({ 'Profissional emissor': full.profissional_nome,
            'Registro cadastral do conselho': [author?.tipoConselho, author?.numeroConselho, author?.ufConselho].filter(Boolean).join(' ') });
          const documentBody = DOMPurify.sanitize(`${identification}<section class="section"><h3 class="section-title">Documento original / justificativa clínica</h3><div class="section-content">${full.conteudo_html}</div></section>${professional}`);
          const config = await loadDocumentConfig();
          return { ...full, documentBody, previewHtml: buildDocumentShell(full.tipo_documento, documentBody,
            { ...config, linha1: 'SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ' }) };
        },
      });
      if (scopeRef.current !== scope || requestId !== detailRequest.current) return;
      if (print) await openPrintDocument(detail.tipo_documento, detail.documentBody, undefined,
        { linha1: 'SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ' });
      else setPreviewDoc(detail);
    } catch { if (scopeRef.current === scope && requestId === detailRequest.current) toast.error('Não foi possível abrir o documento. Tente atualizar.'); }
    finally { if (scopeRef.current === scope && requestId === detailRequest.current) setOpeningDoc(null); }
  };

  const exportCSV = () => {
    const headers = ['Data', 'Paciente', 'CPF', 'Origem', 'Especialidade', 'CID', 'Status'];
    const rows = filteredRecebidos.map(e => [
      new Date(e.data_geracao).toLocaleDateString('pt-BR'), e.paciente_nome, e.paciente_cpf,
      e.profissional_origem_nome, e.especialidade_destino, e.paciente_cid, e.status,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `encaminhamentos_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const profissionais = useMemo(() => funcionarios.filter(f => f.ativo && (isGlobal || f.unidadeId === user?.unidadeId) && (f.role === 'profissional' || f.role === 'master')), [funcionarios, isGlobal, user?.unidadeId]);
  const funcionariosMap = useMemo(() => new Map(funcionarios.map(f => [f.id, f])), [funcionarios]);
  const unidadesMap = useMemo(() => new Map(unidades.map(u => [u.id, u.nomeExibicao || u.nome])), [unidades]);
  const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const clearReceived = () => { setFiltroStatus('todos'); setBuscaPaciente(''); setDataInicio(''); setDataFim(''); setFiltroProfDestino(''); setPage(1); };
  const clearSent = () => { setFiltroStatusEnviados('todos'); setBuscaEnviados(''); setPageEnv(1); };
  const selectIndicator = (tab: string, status: string) => {
    setActiveTab(tab);
    if (tab === 'recebidos') { clearReceived(); setFiltroStatus(status); }
    else { clearSent(); setFiltroStatusEnviados(status); }
  };

  const Pagination = ({ currentPage, total, onPage }: { currentPage: number; total: number; onPage: (p: number) => void }) => (
    total > 1 ? (
      <div className="flex items-center justify-center gap-2 pt-2">
        <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => onPage(currentPage - 1)}>Anterior</Button>
        <span className="text-sm text-muted-foreground">Página {currentPage} de {total}</span>
        <Button size="sm" variant="outline" disabled={currentPage >= total} onClick={() => onPage(currentPage + 1)}>Próxima</Button>
      </div>
    ) : null
  );

  return (
    <div className="space-y-3 min-w-0">
      <header className="clinical-hub-hero flex flex-wrap items-center gap-3">
        <span className="clinical-patient-avatar flex items-center justify-center shrink-0"><ClipboardList className="w-5 h-5" /></span>
        <div className="flex-1 min-w-[9rem]">
          <p className="clinical-hub-eyebrow">Acompanhamento assistencial</p>
          <h1 className="clinical-hub-name text-xl font-bold font-display">Encaminhamentos</h1>
          <p className="clinical-patient-sub text-xs mt-1">Referência clínica e continuidade do cuidado · {ITEMS_PER_PAGE} documentos por página</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full lg:w-auto lg:justify-end">
          <Button type="button" variant="outline" onClick={refresh} disabled={fetching} className="min-h-10 h-auto whitespace-normal border-white/40 bg-[#19465e] text-white hover:bg-[#245b70] hover:text-white shadow-none focus-visible:ring-white focus-visible:ring-offset-0"><RefreshCw className={cn("w-4 h-4", fetching && "animate-spin")} /> Atualizar</Button>
          <Button type="button" onClick={exportCSV} disabled={loadingRecebidos || !!receivedQuery.error} className="clinical-hub-new min-h-10 h-auto whitespace-normal font-semibold"><Download className="w-4 h-4" /> Exportar recebidos (CSV)</Button>
        </div>
      </header>
      <section className="grid grid-cols-2 gap-2 xl:grid-cols-4" aria-label="Indicadores documentais">
        {[
          { title: 'Recebidos', value: encaminhamentos.length, icon: Inbox, loading: loadingRecebidos, error: receivedQuery.error, tab: 'recebidos', status: 'todos', tone: 'clinical-tone-blue' },
          { title: 'Aguardando leitura', value: naoLidos, icon: Mail, loading: loadingRecebidos, error: receivedQuery.error, tab: 'recebidos', status: 'recebido', tone: 'clinical-tone-slate' },
          { title: 'Já lidos', value: encaminhamentos.filter(e => e.status === 'lido').length, icon: CheckCircle, loading: loadingRecebidos, error: receivedQuery.error, tab: 'recebidos', status: 'lido', tone: 'clinical-tone-teal' },
          { title: 'Enviados', value: enviados.length, icon: Send, loading: loadingEnviados, error: sentQuery.error, tab: 'enviados', status: 'todos', tone: 'clinical-tone-violet' },
        ].map(item => {
          const selected = activeTab === item.tab && (item.tab === 'recebidos' ? filtroStatus : filtroStatusEnviados) === item.status;
          return <button key={item.title} type="button" aria-pressed={selected} onClick={() => selectIndicator(item.tab, item.status)} className={cn("clinical-premium flex items-center gap-2.5 p-3 text-left min-w-0 focus-visible:ring-2 focus-visible:ring-primary", selected && "ring-2 ring-primary/60")}>
            <span className={cn("clinical-dock-icon", item.tone)}><item.icon className="w-4 h-4" /></span>
            <span className="flex-1 min-w-0"><span className="block clinical-field-label text-xs font-semibold">{item.title}</span><span className="block text-xl font-bold tabular-nums text-[var(--cp-blue)]">{item.loading ? '…' : item.error ? '—' : item.value}</span></span>
            <ChevronRight className="w-4 h-4 shrink-0 clinical-field-label" />
          </button>;
        })}
      </section>
      <p className="text-xs text-muted-foreground px-1">Indicadores do seu escopo antes dos filtros. Selecione um indicador para consultar os documentos correspondentes.</p>
      {(receivedQuery.error || sentQuery.error) && <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">Não foi possível carregar {receivedQuery.error ? 'os recebidos' : ''}{receivedQuery.error && sentQuery.error ? ' e ' : ''}{sentQuery.error ? 'os enviados' : ''}. Os indicadores podem estar desatualizados. Tente Atualizar.</div>}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid h-10 w-full grid-cols-2 sm:w-96">
          <TabsTrigger value="recebidos" className="gap-1.5">
            <Inbox className="w-4 h-4" /> Recebidos {naoLidos > 0 && `(${naoLidos})`}
          </TabsTrigger>
          <TabsTrigger value="enviados" className="gap-1.5">
            <Send className="w-4 h-4" /> Enviados ({enviados.length})
          </TabsTrigger>
        </TabsList>

        {/* ─── RECEBIDOS TAB ─── */}
        <TabsContent value="recebidos" className="mt-3 space-y-3">
          <Card className="clinical-premium">
            <CardContent className="p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-bold"><SlidersHorizontal className="w-4 h-4 text-[var(--cp-blue)]" /> Filtros assistenciais</h2><Button type="button" size="sm" variant="outline" className="clinical-record-action" onClick={clearReceived}><RotateCcw className="w-4 h-4" /> Limpar filtros</Button></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <Label className="text-xs font-semibold clinical-field-label">Status</Label>
                  <Select value={filtroStatus} onValueChange={(v) => { setFiltroStatus(v); setPage(1); }}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="recebido">Não lidos</SelectItem>
                      <SelectItem value="lido">Lidos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold clinical-field-label">Buscar paciente</Label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <DebouncedInput aria-label="Buscar paciente nos recebidos" debounceMs={350} placeholder="Nome..." value={buscaPaciente} onChange={e => { setBuscaPaciente(e.target.value); setPage(1); }} className="pl-9 h-9" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold clinical-field-label">Data início</Label>
                  <Input type="date" value={dataInicio} onChange={e => { setDataInicio(e.target.value); setPage(1); }} className="h-9" />
                </div>
                <div>
                  <Label className="text-xs font-semibold clinical-field-label">Data fim</Label>
                  <Input type="date" value={dataFim} onChange={e => { setDataFim(e.target.value); setPage(1); }} className="h-9" />
                </div>
                {isMasterOrGestao && (
                  <div>
                    <Label className="text-xs font-semibold clinical-field-label">Profissional destino</Label>
                    <Select value={filtroProfDestino || "__all__"} onValueChange={(v) => { setFiltroProfDestino(v === '__all__' ? '' : v); setPage(1); }}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todos</SelectItem>
                        {profissionais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">{[["todos","Todos"],["recebido","Não lidos"],["lido","Lidos"]].map(([value,label]) => <Button key={value} type="button" size="sm" variant={filtroStatus === value ? "secondary" : "outline"} aria-pressed={filtroStatus === value} onClick={() => { setFiltroStatus(value); setPage(1); }}>{label}</Button>)}</div>
            </CardContent>
          </Card>

          {loadingRecebidos ? (
            <Card><CardContent className="p-0"><LoadingState label="Carregando encaminhamentos..." /></CardContent></Card>
          ) : paginatedRec.length === 0 ? (
            <Card><CardContent className="p-0"><EmptyState icon={<ClipboardList className="w-8 h-8 text-muted-foreground/50" />} title="Nenhum encaminhamento" description="Não há encaminhamentos recebidos no momento." /></CardContent></Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground px-1"><span>Exibindo {(currentPageRec - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPageRec * ITEMS_PER_PAGE, filteredRecebidos.length)} de <strong>{filteredRecebidos.length}</strong> documentos recebidos</span><span>Página {currentPageRec} de {totalPagesRec}</span></div>
              <div className="space-y-2">
                {paginatedRec.map(enc => <Card key={enc.id} className="clinical-premium">
                  <CardContent className="p-3 space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <span aria-hidden="true" className="clinical-dock-icon clinical-tone-blue treatment-avatar">{initials(enc.paciente_nome)}</span>
                      <div className="flex-1 min-w-0"><p className="font-semibold text-sm sm:text-base break-words [overflow-wrap:anywhere]">{enc.paciente_nome}</p><p className="clinical-record-type font-semibold text-xs break-words">{enc.especialidade_destino || 'Especialidade não informada'}</p><p className="text-xs clinical-field-label flex flex-wrap items-center gap-1"><Building2 className="w-3.5 h-3.5" />{unidadesMap.get(enc.unidade) || enc.unidade || 'Unidade não informada'} · {enc.tipo_documento || 'Encaminhamento'}</p></div>
                      <Badge className={cn("border text-xs whitespace-normal shrink-0 max-w-[40%] text-center", enc.status === 'recebido' ? 'bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-950 dark:text-sky-200' : 'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200')}>{enc.status === 'recebido' ? 'Não lido' : 'Lido'}</Badge>
                    </div>
                    <div className="clinical-inset rounded-lg border p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="flex items-start gap-2 min-w-0"><span className="clinical-dock-icon clinical-tone-blue"><Stethoscope className="w-4 h-4" /></span><div className="min-w-0"><p className="clinical-field-label text-[10px] font-semibold uppercase">Profissional solicitante</p><p className="font-semibold text-sm break-words">{enc.profissional_origem_nome || 'Não informado'}</p><p className="text-xs clinical-field-label break-words">{enc.profissional_origem_profissao}</p></div></div>
                      <div className="flex items-start gap-2 min-w-0"><span className="clinical-dock-icon clinical-tone-teal"><UserRound className="w-4 h-4" /></span><div className="min-w-0"><p className="clinical-field-label text-[10px] font-semibold uppercase">Profissional destinatário</p><p className="font-semibold text-sm break-words">{funcionariosMap.get(enc.profissional_destino_id)?.nome || 'Destinatário não identificado no cadastro'}</p><p className="text-xs clinical-field-label break-words">{enc.especialidade_destino || 'Especialidade não informada'}</p></div></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="clinical-field-label text-xs flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Emissão: {referralDate(enc.data_geracao)}</span>
                      {enc.data_leitura && <span className="clinical-field-label text-xs">· Lido em {referralDate(enc.data_leitura)}</span>}
                      <div className="ml-auto flex flex-wrap items-center gap-1.5">
                        <Button type="button" size="sm" variant="outline" className="clinical-record-action" onClick={() => void handlePrintRecebido(enc)} aria-label={`Imprimir encaminhamento de ${enc.paciente_nome}`}><Printer className="w-4 h-4" /> Imprimir</Button>
                        <Button type="button" size="sm" className="clinical-record-action clinical-action-main" onClick={() => handleVer(enc)}>Ver encaminhamento <ChevronRight className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>)}
              </div>
            </>
          )}
          <Pagination currentPage={currentPageRec} total={totalPagesRec} onPage={setPage} />
        </TabsContent>

        {/* ─── ENVIADOS TAB ─── */}
        <TabsContent value="enviados" className="mt-3 space-y-3">
          <Card className="clinical-premium">
            <CardContent className="p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-bold"><SlidersHorizontal className="w-4 h-4 text-[var(--cp-blue)]" /> Filtros de emissão</h2><Button type="button" size="sm" variant="outline" className="clinical-record-action" onClick={clearSent}><RotateCcw className="w-4 h-4" /> Limpar filtros</Button></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold clinical-field-label">Status</Label>
                  <Select value={filtroStatusEnviados} onValueChange={(v) => { setFiltroStatusEnviados(v); setPageEnv(1); }}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="assinado">Assinado</SelectItem>
                      <SelectItem value="rascunho">Rascunho</SelectItem>
                      <SelectItem value="agendado">Agendado</SelectItem>
                      <SelectItem value="realizado">Realizado</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold clinical-field-label">Buscar paciente</Label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <DebouncedInput aria-label="Buscar paciente nos enviados" debounceMs={350} placeholder="Nome..." value={buscaEnviados} onChange={e => { setBuscaEnviados(e.target.value); setPageEnv(1); }} className="pl-9 h-9" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {loadingEnviados ? (
            <Card><CardContent className="p-0"><LoadingState label="Carregando enviados..." /></CardContent></Card>
          ) : (
            paginatedEnv.length === 0 ? <Card className="clinical-premium"><CardContent className="p-0"><EmptyState icon={<Send className="w-8 h-8 text-muted-foreground/50" />} title="Nenhum encaminhamento enviado" description="Nenhum documento encontrado nos filtros atuais." /></CardContent></Card> : <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground px-1"><span>Exibindo {(currentPageEnv - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPageEnv * ITEMS_PER_PAGE, filteredEnviados.length)} de <strong>{filteredEnviados.length}</strong> documentos enviados</span><span>Página {currentPageEnv} de {totalPagesEnv}</span></div>
              <div className="space-y-2">
                {paginatedEnv.map(doc => {
                  const statusInfo = STATUS_BADGE[doc.status] || { label: doc.status, className: '' };
                  return <Card key={doc.id} className="clinical-premium"><CardContent className="p-3 space-y-2.5">
                    <div className="flex items-start gap-2.5"><span aria-hidden="true" className="clinical-dock-icon clinical-tone-blue treatment-avatar">{initials(doc.paciente_nome)}</span><div className="flex-1 min-w-0"><p className="font-semibold text-sm sm:text-base break-words [overflow-wrap:anywhere]">{doc.paciente_nome}</p><p className="clinical-record-type font-semibold text-xs break-words">{doc.tipo_documento}</p><p className="text-xs clinical-field-label break-words">{unidadesMap.get(doc.unidade_id) || 'Unidade não identificada'}</p></div><Badge variant="outline" className={cn("text-xs whitespace-normal shrink-0 max-w-[40%] text-center", statusInfo.className)}>{statusInfo.label}</Badge></div>
                    <div className="clinical-inset rounded-lg border p-2.5 flex items-start gap-2"><span className="clinical-dock-icon clinical-tone-blue"><Stethoscope className="w-4 h-4" /></span><div className="min-w-0"><p className="clinical-field-label text-[10px] font-semibold uppercase">Profissional emissor</p><p className="font-semibold text-sm break-words">{doc.profissional_nome || 'Não informado'}</p><p className="text-xs clinical-field-label">Emissão: {referralDate(doc.created_at)}</p></div></div>
                    <div className="flex flex-wrap items-center gap-2"><span className="text-xs clinical-field-label">Documento emitido</span><div className="ml-auto flex flex-wrap items-center gap-1.5">
                      <Button type="button" size="sm" variant="outline" className="clinical-record-action" disabled={!!openingDoc} onClick={() => void openSentDocument(doc, true)} aria-label={`Imprimir encaminhamento de ${doc.paciente_nome}`}><Printer className="w-4 h-4" /> Imprimir</Button>
                      <Button type="button" size="sm" className="clinical-record-action clinical-action-main" disabled={!!openingDoc} onClick={() => void openSentDocument(doc)} aria-label={`Ver encaminhamento de ${doc.paciente_nome}`}>{openingDoc === doc.id && <Loader2 className="w-4 h-4 animate-spin" />} Ver encaminhamento <ChevronRight className="w-4 h-4" /></Button>
                    </div></div>
                  </CardContent></Card>;
                })}
              </div>
            </>
          )}
          <Pagination currentPage={currentPageEnv} total={totalPagesEnv} onPage={setPageEnv} />
        </TabsContent>
      </Tabs>

      {/* Recebidos modal */}
      <ModalVerEncaminhamento open={modalOpen} onOpenChange={setModalOpen} encaminhamento={selectedEnc} onStatusChange={fetchRecebidos} />

      {/* Preview enviado */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="w-[96vw] max-w-4xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader className="clinical-hub-hero pr-8"><p className="clinical-hub-eyebrow">Documento emitido</p>
            <DialogTitle className="clinical-hub-name font-display break-words">{previewDoc?.paciente_nome}</DialogTitle><p className="clinical-patient-sub text-xs">{previewDoc?.tipo_documento} · {previewDoc?.profissional_nome}</p>
            <DialogDescription className="sr-only">Visualização do documento</DialogDescription>
          </DialogHeader>
          {previewDoc && (
            <iframe title={`Documento de ${previewDoc.paciente_nome}`} sandbox="" srcDoc={previewDoc.previewHtml} className="h-[65vh] w-full rounded-xl border bg-white" />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDoc(null)}>Fechar</Button>
            {previewDoc && <Button onClick={() => void openSentDocument(previewDoc, true)} disabled={!!openingDoc} className="gap-1.5 bg-[#075f66] text-white hover:bg-[#064d53] hover:text-white"><Printer className="w-4 h-4" /> Imprimir</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Encaminhamentos;

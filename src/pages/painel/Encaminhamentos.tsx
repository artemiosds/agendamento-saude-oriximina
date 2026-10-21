import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { Eye, Printer, Download, Search, ClipboardList, Send, Inbox, Loader2, CheckCircle, RefreshCw, Mail } from 'lucide-react';
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

  const profissionais = funcionarios.filter(f => f.ativo && (isGlobal || f.unidadeId === user?.unidadeId) && (f.role === 'profissional' || f.role === 'master'));

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
    <div className="space-y-6 [--referral-blue:#2A6F97]">
      <PageHeader
        title="Encaminhamentos"
        subtitle="Documentos enviados e recebidos · consulta, leitura e impressão"
        actions={
          <>
            {naoLidos > 0 && <Badge variant="destructive" className="text-xs">{naoLidos} não lido{naoLidos > 1 ? 's' : ''}</Badge>}
            <Button variant="outline" onClick={refresh} disabled={fetching} className="gap-2 border-[#2A6F97]/30 text-[#2A6F97]">
              <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
            <Button variant="outline" onClick={exportCSV} disabled={loadingRecebidos || !!receivedQuery.error} className="gap-1.5">
              <Download className="w-4 h-4" /> Exportar CSV
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores documentais">
        {[
          { title: 'Total de Recebidos', value: encaminhamentos.length, icon: Inbox, loading: loadingRecebidos, error: receivedQuery.error },
          { title: 'Aguardando Leitura (Não Lidos)', value: naoLidos, icon: Mail, loading: loadingRecebidos, error: receivedQuery.error },
          { title: 'Já Lidos', value: encaminhamentos.filter(e => e.status === 'lido').length, icon: CheckCircle, loading: loadingRecebidos, error: receivedQuery.error },
          { title: 'Total de Enviados', value: enviados.length, icon: Send, loading: loadingEnviados, error: sentQuery.error },
        ].map(item => <Card key={item.title} className="rounded-2xl border-[#2A6F97]/15 shadow-sm"><CardContent className="flex items-center gap-4 p-5">
          <span className="rounded-xl bg-[#2A6F97]/10 p-3 text-[#2A6F97]"><item.icon className="h-6 w-6" /></span>
          <div><p className="text-sm text-muted-foreground">{item.title}</p><p className="mt-1 text-2xl font-bold tabular-nums text-[#2A6F97]">{item.loading ? '…' : item.error ? '—' : item.value}</p></div>
        </CardContent></Card>)}
      </div>
      <p className="text-xs text-muted-foreground">Indicadores dos documentos disponíveis no seu escopo de acesso, antes dos filtros. Use Atualizar para buscar novos documentos.</p>
      {(receivedQuery.error || sentQuery.error) && <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">Não foi possível carregar {receivedQuery.error ? 'os recebidos' : ''}{receivedQuery.error && sentQuery.error ? ' e ' : ''}{sentQuery.error ? 'os enviados' : ''}. Os indicadores podem estar desatualizados. Tente Atualizar.</div>}

      <Tabs defaultValue="recebidos" className="w-full">
        <TabsList className="grid h-12 w-full grid-cols-2 sm:w-96">
          <TabsTrigger value="recebidos" className="gap-1.5">
            <Inbox className="w-4 h-4" /> Recebidos {naoLidos > 0 && `(${naoLidos})`}
          </TabsTrigger>
          <TabsTrigger value="enviados" className="gap-1.5">
            <Send className="w-4 h-4" /> Enviados ({enviados.length})
          </TabsTrigger>
        </TabsList>

        {/* ─── RECEBIDOS TAB ─── */}
        <TabsContent value="recebidos" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <Label className="text-xs font-medium">Status</Label>
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
                  <Label className="text-xs font-medium">Buscar paciente</Label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <DebouncedInput aria-label="Buscar paciente nos recebidos" debounceMs={350} placeholder="Nome..." value={buscaPaciente} onChange={e => { setBuscaPaciente(e.target.value); setPage(1); }} className="pl-9 h-9" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium">Data início</Label>
                  <Input type="date" value={dataInicio} onChange={e => { setDataInicio(e.target.value); setPage(1); }} className="h-9" />
                </div>
                <div>
                  <Label className="text-xs font-medium">Data fim</Label>
                  <Input type="date" value={dataFim} onChange={e => { setDataFim(e.target.value); setPage(1); }} className="h-9" />
                </div>
                {isMasterOrGestao && (
                  <div>
                    <Label className="text-xs font-medium">Profissional destino</Label>
                    <Select value={filtroProfDestino} onValueChange={(v) => { setFiltroProfDestino(v === '__all__' ? '' : v); setPage(1); }}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todos</SelectItem>
                        {profissionais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {loadingRecebidos ? (
            <Card><CardContent className="p-0"><LoadingState label="Carregando encaminhamentos..." /></CardContent></Card>
          ) : paginatedRec.length === 0 ? (
            <Card><CardContent className="p-0"><EmptyState icon={<ClipboardList className="w-8 h-8 text-muted-foreground/50" />} title="Nenhum encaminhamento" description="Não há encaminhamentos recebidos no momento." /></CardContent></Card>
          ) : (
            <Card className="overflow-hidden rounded-2xl border-[#2A6F97]/15"><CardContent className="p-0"><div className="overflow-x-auto">
              <Table className="min-w-[740px]">
                <TableHeader className="bg-[#2A6F97]/5"><TableRow><TableHead>Emissão</TableHead><TableHead>Paciente</TableHead><TableHead>Profissional de origem</TableHead><TableHead>Especialidade</TableHead><TableHead>Leitura</TableHead><TableHead className="text-right">Documento</TableHead></TableRow></TableHeader>
                <TableBody>{paginatedRec.map(enc => <TableRow key={enc.id}>
                  <TableCell className="whitespace-nowrap">{referralDate(enc.data_geracao)}</TableCell>
                  <TableCell className="font-medium">{enc.paciente_nome}</TableCell><TableCell>{enc.profissional_origem_nome}</TableCell>
                  <TableCell>{enc.especialidade_destino || 'Não informada'}</TableCell>
                  <TableCell><Badge className={enc.status === 'recebido' ? 'bg-[#2A6F97] text-white' : 'bg-emerald-100 text-emerald-800'}>{enc.status === 'recebido' ? 'Não lido' : 'Lido'}</Badge></TableCell>
                  <TableCell><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => handleVer(enc)} className="gap-1"><Eye className="h-4 w-4" /> Ver</Button><Button size="sm" variant="outline" onClick={() => void handlePrintRecebido(enc)} aria-label={`Imprimir encaminhamento de ${enc.paciente_nome}`}><Printer className="h-4 w-4" /></Button></div></TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </div></CardContent></Card>
          )}
          <Pagination currentPage={currentPageRec} total={totalPagesRec} onPage={setPage} />
        </TabsContent>

        {/* ─── ENVIADOS TAB ─── */}
        <TabsContent value="enviados" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-medium">Status</Label>
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
                  <Label className="text-xs font-medium">Buscar paciente</Label>
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
            <Card className="overflow-hidden rounded-2xl border-[#2A6F97]/15">
              <CardContent className="p-0">
                <div className="overflow-auto">
                  <Table className="min-w-[740px]">
                    <TableHeader className="bg-[#2A6F97]/5">
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Paciente</TableHead>
                        <TableHead>Profissional emissor</TableHead>
                        <TableHead>Tipo de documento</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedEnv.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum encaminhamento enviado</TableCell></TableRow>
                      ) : (
                        paginatedEnv.map(doc => {
                          const statusInfo = STATUS_BADGE[doc.status] || { label: doc.status, className: '' };
                          return (
                            <TableRow key={doc.id}>
                              <TableCell className="text-xs">{new Date(doc.created_at).toLocaleDateString('pt-BR')}</TableCell>
                              <TableCell className="text-xs font-medium">{doc.paciente_nome}</TableCell>
                              <TableCell className="text-sm">{doc.profissional_nome}</TableCell>
                              <TableCell className="text-sm">{doc.tipo_documento}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-xs ${statusInfo.className}`}>{statusInfo.label}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" variant="outline" disabled={!!openingDoc} onClick={() => void openSentDocument(doc)} aria-label={`Ver encaminhamento de ${doc.paciente_nome}`} className="gap-1">{openingDoc === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Ver</Button>
                                  <Button size="sm" variant="outline" disabled={!!openingDoc} onClick={() => void openSentDocument(doc, true)} aria-label={`Imprimir encaminhamento de ${doc.paciente_nome}`}><Printer className="h-4 w-4" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
          <Pagination currentPage={currentPageEnv} total={totalPagesEnv} onPage={setPageEnv} />
        </TabsContent>
      </Tabs>

      {/* Recebidos modal */}
      <ModalVerEncaminhamento open={modalOpen} onOpenChange={setModalOpen} encaminhamento={selectedEnc} onStatusChange={fetchRecebidos} />

      {/* Preview enviado */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewDoc?.tipo_documento} — {previewDoc?.paciente_nome}</DialogTitle>
            <DialogDescription className="sr-only">Visualização do documento</DialogDescription>
          </DialogHeader>
          {previewDoc && (
            <iframe title={`Documento de ${previewDoc.paciente_nome}`} sandbox="" srcDoc={previewDoc.previewHtml} className="h-[65vh] w-full rounded-xl border bg-white" />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDoc(null)}>Fechar</Button>
            {previewDoc && <Button onClick={() => void openSentDocument(previewDoc, true)} disabled={!!openingDoc} className="gap-1.5 bg-[#2A6F97] hover:bg-[#225a7b]"><Printer className="w-4 h-4" /> Imprimir</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Encaminhamentos;

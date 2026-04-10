import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Eye, Printer, Download, Search, ClipboardList, Send, Inbox, Loader2, CheckCircle, XCircle } from 'lucide-react';
import ModalVerEncaminhamento from '@/components/ModalVerEncaminhamento';
import { listarEncaminhamentos, type EncaminhamentoData } from '@/services/encaminhamentoService';
import { openPrintDocument } from '@/lib/printLayout';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 20;

interface DocEncaminhamento {
  id: string;
  tipo_documento: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  status: string;
  created_at: string;
  conteudo_html: string;
  campos_formulario: Record<string, unknown>;
  unidade_id: string;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  assinado: { label: 'Aguardando', className: 'bg-blue-100 text-blue-800' },
  agendado: { label: 'Agendado', className: 'bg-green-100 text-green-800' },
  realizado: { label: 'Realizado', className: 'bg-emerald-100 text-emerald-800' },
  cancelado: { label: 'Cancelado', className: 'bg-red-100 text-red-800' },
  rascunho: { label: 'Rascunho', className: 'bg-yellow-100 text-yellow-800' },
};

const Encaminhamentos: React.FC = () => {
  const { user } = useAuth();
  const { funcionarios } = useData();

  // Recebidos (storage-based)
  const [encaminhamentos, setEncaminhamentos] = useState<EncaminhamentoData[]>([]);
  const [loadingRecebidos, setLoadingRecebidos] = useState(true);
  const [selectedEnc, setSelectedEnc] = useState<EncaminhamentoData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Enviados (documentos_gerados)
  const [enviados, setEnviados] = useState<DocEncaminhamento[]>([]);
  const [loadingEnviados, setLoadingEnviados] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<DocEncaminhamento | null>(null);

  // Filters
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [buscaPaciente, setBuscaPaciente] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [filtroProfOrigem, setFiltroProfOrigem] = useState('');
  const [filtroProfDestino, setFiltroProfDestino] = useState('');
  const [filtroStatusEnviados, setFiltroStatusEnviados] = useState('todos');
  const [buscaEnviados, setBuscaEnviados] = useState('');

  const [page, setPage] = useState(1);
  const [pageEnv, setPageEnv] = useState(1);

  const isMasterOrGestao = user?.role === 'master' || user?.role === 'gestao' || user?.role === 'coordenador';

  // Fetch recebidos
  const fetchRecebidos = useCallback(async () => {
    setLoadingRecebidos(true);
    try {
      const profId = isMasterOrGestao ? (filtroProfDestino || undefined) : user?.id;
      const data = await listarEncaminhamentos(profId);
      setEncaminhamentos(data);
    } catch (err) { console.error(err); }
    setLoadingRecebidos(false);
  }, [user?.id, isMasterOrGestao, filtroProfDestino]);

  // Fetch enviados
  const fetchEnviados = useCallback(async () => {
    setLoadingEnviados(true);
    try {
      let query = supabase
        .from('documentos_gerados')
        .select('*')
        .in('tipo_documento', ['Encaminhamento', 'encaminhamento', 'Guia de Encaminhamento', 'guia de encaminhamento'])
        .order('created_at', { ascending: false });

      if (!isMasterOrGestao) {
        query = query.eq('profissional_id', user?.id || '');
      }

      const { data } = await query;
      setEnviados((data as unknown as DocEncaminhamento[]) || []);
    } catch (err) { console.error(err); }
    setLoadingEnviados(false);
  }, [user?.id, isMasterOrGestao]);

  useEffect(() => {
    if (user?.id) { fetchRecebidos(); fetchEnviados(); }
  }, [user?.id, fetchRecebidos, fetchEnviados]);

  // Poll recebidos
  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(fetchRecebidos, 30000);
    return () => clearInterval(interval);
  }, [user?.id, fetchRecebidos]);

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
    if (filtroProfOrigem) list = list.filter(e => e.profissional_origem_id === filtroProfOrigem);
    list.sort((a, b) => new Date(b.data_geracao).getTime() - new Date(a.data_geracao).getTime());
    return list;
  }, [encaminhamentos, filtroStatus, buscaPaciente, dataInicio, dataFim, filtroProfOrigem]);

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
  const paginatedRec = filteredRecebidos.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const totalPagesEnv = Math.max(1, Math.ceil(filteredEnviados.length / ITEMS_PER_PAGE));
  const paginatedEnv = filteredEnviados.slice((pageEnv - 1) * ITEMS_PER_PAGE, pageEnv * ITEMS_PER_PAGE);

  const handleVer = (enc: EncaminhamentoData) => { setSelectedEnc(enc); setModalOpen(true); };

  const handlePrintRecebido = (enc: EncaminhamentoData) => {
    const html = enc.conteudo_documento.replace(/\n/g, '<br/>');
    const body = `<div class="content-block" style="margin-top:20px;"><div style="font-size:14px;line-height:1.8;white-space:pre-wrap;">${html}</div></div>
      <div class="signature"><div class="signature-line"></div><div class="name">${enc.profissional_origem_nome}</div><div class="role">${enc.profissional_origem_profissao} — ${enc.profissional_origem_conselho}</div></div>`;
    openPrintDocument(enc.tipo_documento || 'Encaminhamento', body, {
      'Paciente': enc.paciente_nome, 'CPF': enc.paciente_cpf, 'Data': new Date(enc.data_geracao).toLocaleDateString('pt-BR'),
    });
  };

  const handlePrintEnviado = (doc: DocEncaminhamento) => {
    openPrintDocument(doc.tipo_documento, doc.conteudo_html, {
      'Paciente': doc.paciente_nome, 'Data': new Date(doc.created_at).toLocaleDateString('pt-BR'),
    });
  };

  const handleUpdateStatusEnviado = async (doc: DocEncaminhamento, newStatus: string) => {
    const { error } = await supabase
      .from('documentos_gerados')
      .update({ status: newStatus })
      .eq('id', doc.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(`Status atualizado para: ${STATUS_BADGE[newStatus]?.label || newStatus}`);
    fetchEnviados();
  };

  const exportCSV = () => {
    const headers = ['Data', 'Paciente', 'CPF', 'Origem', 'Especialidade', 'CID', 'Status'];
    const rows = filteredRecebidos.map(e => [
      new Date(e.data_geracao).toLocaleDateString('pt-BR'), e.paciente_nome, e.paciente_cpf,
      e.profissional_origem_nome, e.especialidade_destino, e.paciente_cid, e.status,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `encaminhamentos_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const profissionais = funcionarios.filter(f => f.ativo && (f.role === 'profissional' || f.role === 'master'));

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            📋 Encaminhamentos
            {naoLidos > 0 && <Badge variant="destructive" className="text-xs">{naoLidos} não lido{naoLidos > 1 ? 's' : ''}</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie encaminhamentos enviados e recebidos</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
          <Download className="w-4 h-4" /> Exportar CSV
        </Button>
      </div>

      <Tabs defaultValue="recebidos" className="w-full">
        <TabsList>
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
                    <Input placeholder="Nome..." value={buscaPaciente} onChange={e => { setBuscaPaciente(e.target.value); setPage(1); }} className="pl-9 h-9" />
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
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : paginatedRec.length === 0 ? (
            <Card><CardContent className="flex flex-col items-center justify-center py-12"><ClipboardList className="w-12 h-12 text-muted-foreground/40 mb-3" /><p className="text-muted-foreground text-sm">Nenhum encaminhamento encontrado</p></CardContent></Card>
          ) : (
            paginatedRec.map(enc => {
              const dt = new Date(enc.data_geracao);
              return (
                <Card key={enc.id} className={enc.status === 'recebido' ? 'border-l-4 border-l-blue-500' : ''}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          {enc.status === 'recebido' ? (
                            <Badge className="bg-blue-500 text-white text-[10px]">🔵 NÃO LIDO</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">✅ Lido</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">{dt.toLocaleDateString('pt-BR')} às {dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-sm font-semibold">{enc.paciente_nome}</p>
                        <p className="text-xs text-muted-foreground">Encaminhado por: <strong>{enc.profissional_origem_nome}</strong></p>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                          <span>Especialidade: <strong>{enc.especialidade_destino}</strong></span>
                          {enc.paciente_cid && <span>CID: <strong>{enc.paciente_cid}</strong></span>}
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => handleVer(enc)} className="gap-1"><Eye className="w-3.5 h-3.5" /> Ver</Button>
                        <Button size="sm" variant="outline" onClick={() => handlePrintRecebido(enc)} className="gap-1"><Printer className="w-3.5 h-3.5" /> Imprimir</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
          <Pagination currentPage={page} total={totalPagesRec} onPage={setPage} />
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
                      <SelectItem value="assinado">Aguardando</SelectItem>
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
                    <Input placeholder="Nome..." value={buscaEnviados} onChange={e => { setBuscaEnviados(e.target.value); setPageEnv(1); }} className="pl-9 h-9" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {loadingEnviados ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Paciente</TableHead>
                        <TableHead>Especialidade</TableHead>
                        <TableHead>Prioridade</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedEnv.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum encaminhamento enviado</TableCell></TableRow>
                      ) : (
                        paginatedEnv.map(doc => {
                          const campos = doc.campos_formulario || {};
                          const statusInfo = STATUS_BADGE[doc.status] || { label: doc.status, className: '' };
                          return (
                            <TableRow key={doc.id}>
                              <TableCell className="text-xs">{new Date(doc.created_at).toLocaleDateString('pt-BR')}</TableCell>
                              <TableCell className="text-xs font-medium">{doc.paciente_nome}</TableCell>
                              <TableCell className="text-xs">{(campos as any).especialidade_destino || '—'}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px] capitalize">{(campos as any).prioridade || 'eletivo'}</Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] ${statusInfo.className}`}>{statusInfo.label}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" variant="ghost" onClick={() => setPreviewDoc(doc)} title="Ver"><Eye className="w-3.5 h-3.5" /></Button>
                                  <Button size="sm" variant="ghost" onClick={() => handlePrintEnviado(doc)} title="Imprimir"><Printer className="w-3.5 h-3.5" /></Button>
                                  {doc.status === 'assinado' && (
                                    <>
                                      <Button size="sm" variant="ghost" className="text-green-600" onClick={() => handleUpdateStatusEnviado(doc, 'agendado')} title="Marcar agendado"><CheckCircle className="w-3.5 h-3.5" /></Button>
                                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleUpdateStatusEnviado(doc, 'cancelado')} title="Cancelar"><XCircle className="w-3.5 h-3.5" /></Button>
                                    </>
                                  )}
                                  {doc.status === 'agendado' && (
                                    <Button size="sm" variant="ghost" className="text-emerald-600" onClick={() => handleUpdateStatusEnviado(doc, 'realizado')} title="Marcar realizado"><CheckCircle className="w-3.5 h-3.5" /></Button>
                                  )}
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
          <Pagination currentPage={pageEnv} total={totalPagesEnv} onPage={setPageEnv} />
        </TabsContent>
      </Tabs>

      {/* Recebidos modal */}
      <ModalVerEncaminhamento open={modalOpen} onOpenChange={setModalOpen} encaminhamento={selectedEnc} onStatusChange={fetchRecebidos} />

      {/* Preview enviado */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewDoc?.tipo_documento} — {previewDoc?.paciente_nome}</DialogTitle>
            <DialogDescription className="sr-only">Visualização do documento</DialogDescription>
          </DialogHeader>
          {previewDoc && (
            <div className="border rounded-lg p-5 bg-white">
              <div dangerouslySetInnerHTML={{ __html: previewDoc.conteudo_html }} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDoc(null)}>Fechar</Button>
            {previewDoc && <Button onClick={() => handlePrintEnviado(previewDoc)} className="gap-1.5"><Printer className="w-4 h-4" /> Imprimir</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Encaminhamentos;

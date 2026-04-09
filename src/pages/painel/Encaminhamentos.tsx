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
import { Separator } from '@/components/ui/separator';
import { Eye, Printer, Download, Search, ClipboardList } from 'lucide-react';
import ModalVerEncaminhamento from '@/components/ModalVerEncaminhamento';
import { listarEncaminhamentos, type EncaminhamentoData } from '@/services/encaminhamentoService';
import { openPrintDocument } from '@/lib/printLayout';
import { supabase } from '@/integrations/supabase/client';

const ITEMS_PER_PAGE = 20;

const Encaminhamentos: React.FC = () => {
  const { user } = useAuth();
  const { funcionarios } = useData();
  const [encaminhamentos, setEncaminhamentos] = useState<EncaminhamentoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEnc, setSelectedEnc] = useState<EncaminhamentoData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Filters
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'recebido' | 'lido'>('todos');
  const [buscaPaciente, setBuscaPaciente] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [filtroProfOrigem, setFiltroProfOrigem] = useState('');

  // Pagination
  const [page, setPage] = useState(1);

  const isMasterOrGestao = user?.role === 'master' || user?.role === 'gestao' || user?.role === 'coordenador';
  const [filtroProfDestino, setFiltroProfDestino] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const profId = isMasterOrGestao ? (filtroProfDestino || undefined) : user?.id;
      const data = await listarEncaminhamentos(profId);
      setEncaminhamentos(data);
    } catch (err) {
      console.error('Erro ao buscar encaminhamentos:', err);
    }
    setLoading(false);
  }, [user?.id, isMasterOrGestao, filtroProfDestino]);

  useEffect(() => {
    if (user?.id) fetchData();
  }, [user?.id, fetchData]);

  // Realtime: listen to storage changes by polling (storage doesn't support realtime natively)
  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(() => {
      fetchData();
    }, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [user?.id, fetchData]);

  const naoLidos = useMemo(() => encaminhamentos.filter(e => e.status === 'recebido').length, [encaminhamentos]);

  const filtered = useMemo(() => {
    let list = [...encaminhamentos];

    if (filtroStatus !== 'todos') {
      list = list.filter(e => e.status === filtroStatus);
    }

    if (buscaPaciente.trim()) {
      const q = buscaPaciente.toLowerCase().trim();
      list = list.filter(e => e.paciente_nome.toLowerCase().includes(q));
    }

    if (dataInicio) {
      list = list.filter(e => e.data_geracao >= dataInicio);
    }
    if (dataFim) {
      const fim = dataFim + 'T23:59:59';
      list = list.filter(e => e.data_geracao <= fim);
    }

    if (filtroProfOrigem) {
      list = list.filter(e => e.profissional_origem_id === filtroProfOrigem);
    }

    list.sort((a, b) => new Date(b.data_geracao).getTime() - new Date(a.data_geracao).getTime());
    return list;
  }, [encaminhamentos, filtroStatus, buscaPaciente, dataInicio, dataFim, filtroProfOrigem]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const handleVer = (enc: EncaminhamentoData) => {
    setSelectedEnc(enc);
    setModalOpen(true);
  };

  const handlePrintDirect = (enc: EncaminhamentoData) => {
    const html = enc.conteudo_documento.replace(/\n/g, '<br/>');
    const rodape = user ? `Impresso por: ${user.nome} — ${user.role} — ${new Date().toLocaleString('pt-BR')}` : '';
    const body = `
      <div class="content-block" style="margin-top:20px;">
        <div style="font-size:14px;line-height:1.8;white-space:pre-wrap;">${html}</div>
      </div>
      <div class="signature">
        <div class="signature-line"></div>
        <div class="name">${enc.profissional_origem_nome}</div>
        <div class="role">${enc.profissional_origem_profissao} — ${enc.profissional_origem_conselho}</div>
      </div>
      <div style="margin-top:20px; font-size:10px; color:#94a3b8;">
        ${rodape ? `<p>${rodape}</p>` : ''}
      </div>
    `;
    openPrintDocument(enc.tipo_documento || 'Encaminhamento', body, {
      'Paciente': enc.paciente_nome,
      'CPF': enc.paciente_cpf,
      'Data': new Date(enc.data_geracao).toLocaleDateString('pt-BR'),
    });
  };

  const exportCSV = () => {
    const headers = ['Data', 'Paciente', 'CPF', 'Origem', 'Especialidade', 'CID', 'Status'];
    const rows = filtered.map(e => [
      new Date(e.data_geracao).toLocaleDateString('pt-BR'),
      e.paciente_nome,
      e.paciente_cpf,
      e.profissional_origem_nome,
      e.especialidade_destino,
      e.paciente_cid,
      e.status,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `encaminhamentos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const profissionais = funcionarios.filter(f => f.ativo && (f.role === 'profissional' || f.role === 'master'));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            📋 Encaminhamentos Recebidos
            {naoLidos > 0 && (
              <Badge variant="destructive" className="text-xs">{naoLidos} não lido{naoLidos > 1 ? 's' : ''}</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Documentos de encaminhamento recebidos</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
          <Download className="w-4 h-4" /> Exportar CSV
        </Button>
      </div>

      <Tabs defaultValue="fila" className="w-full">
        <TabsList>
          <TabsTrigger value="fila">
            Fila {naoLidos > 0 && `(${naoLidos})`}
          </TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        {/* ─── FILTERS ─── */}
        <Card className="mt-4">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <Label className="text-xs font-medium">Status</Label>
                <Select value={filtroStatus} onValueChange={(v) => { setFiltroStatus(v as any); setPage(1); }}>
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
                  <Input
                    placeholder="Nome..."
                    value={buscaPaciente}
                    onChange={e => { setBuscaPaciente(e.target.value); setPage(1); }}
                    className="pl-9 h-9"
                  />
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
                      {profissionais.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ─── FILA TAB ─── */}
        <TabsContent value="fila" className="mt-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : paginated.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <ClipboardList className="w-12 h-12 text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground text-sm">Nenhum encaminhamento encontrado</p>
              </CardContent>
            </Card>
          ) : (
            paginated.map(enc => {
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
                          <span className="text-xs text-muted-foreground">
                            {dt.toLocaleDateString('pt-BR')} às {dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm font-semibold">{enc.paciente_nome}</p>
                        <p className="text-xs text-muted-foreground">
                          Encaminhado por: <strong>{enc.profissional_origem_nome}</strong>
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                          <span>Especialidade: <strong>{enc.especialidade_destino}</strong></span>
                          {enc.paciente_cid && <span>CID: <strong>{enc.paciente_cid}</strong></span>}
                        </div>
                        {enc.observacao && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            Observação: {enc.observacao}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => handleVer(enc)} className="gap-1">
                          <Eye className="w-3.5 h-3.5" /> Ver
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handlePrintDirect(enc)} className="gap-1">
                          <Printer className="w-3.5 h-3.5" /> Imprimir
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
            </div>
          )}
        </TabsContent>

        {/* ─── HISTÓRICO TAB ─── */}
        <TabsContent value="historico" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>CID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Nenhum registro encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginated.map(enc => (
                        <TableRow key={enc.id}>
                          <TableCell className="text-xs">{new Date(enc.data_geracao).toLocaleDateString('pt-BR')}</TableCell>
                          <TableCell className="text-xs font-medium">{enc.paciente_nome}</TableCell>
                          <TableCell className="text-xs">{enc.profissional_origem_nome}</TableCell>
                          <TableCell className="text-xs">{enc.paciente_cid || '—'}</TableCell>
                          <TableCell>
                            {enc.status === 'recebido' ? (
                              <Badge className="bg-blue-500 text-white text-[10px]">Não lido</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">Lido</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => handleVer(enc)} aria-label="Ver encaminhamento">
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handlePrintDirect(enc)} aria-label="Imprimir encaminhamento">
                                <Printer className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
            </div>
          )}

          {/* Filtro profissional origem (histórico) */}
          <Card className="mt-4">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-medium">Profissional de origem</Label>
                  <Select value={filtroProfOrigem} onValueChange={(v) => { setFiltroProfOrigem(v === '__all__' ? '' : v); setPage(1); }}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {profissionais.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ModalVerEncaminhamento
        open={modalOpen}
        onOpenChange={setModalOpen}
        encaminhamento={selectedEnc}
        onStatusChange={fetchData}
      />
    </div>
  );
};

export default Encaminhamentos;

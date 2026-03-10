import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Download, FileText, ChevronLeft, ChevronRight, RefreshCw, Filter, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface LogEntry {
  id: string;
  acao: string;
  entidade: string;
  entidade_id: string;
  user_id: string;
  user_nome: string;
  role: string;
  unidade_id: string;
  modulo: string;
  status: string;
  erro: string;
  ip: string;
  detalhes: Record<string, unknown>;
  created_at: string;
}

const ITEMS_PER_PAGE = 25;

const moduloLabels: Record<string, string> = {
  '': 'Todos',
  pacientes: 'Pacientes',
  agendamento: 'Agendamentos',
  fila_espera: 'Fila de Espera',
  atendimento: 'Atendimento',
  prontuario: 'Prontuário',
  funcionarios: 'Funcionários',
  disponibilidade: 'Disponibilidade',
  bloqueio: 'Bloqueios',
  configuracoes: 'Configurações',
  notificacao: 'Notificações',
  integracao: 'Integrações',
  auth: 'Autenticação',
  relatorio: 'Relatórios',
  portal: 'Portal Paciente',
};

const acaoLabels: Record<string, string> = {
  criar: 'Criação',
  editar: 'Edição',
  excluir: 'Exclusão',
  cancelar: 'Cancelamento',
  login: 'Login',
  logout: 'Logout',
  login_erro: 'Login (erro)',
  status_change: 'Alteração Status',
  confirmar_chegada: 'Confirmar Chegada',
  iniciar_atendimento: 'Iniciar Atendimento',
  finalizar_atendimento: 'Finalizar Atendimento',
  vaga_liberada: 'Vaga Liberada',
  fila_chamada: 'Fila - Chamada',
  fila_encaixe: 'Fila - Encaixe',
  exportar: 'Exportação',
  imprimir: 'Impressão',
  envio_email: 'Envio E-mail',
  envio_webhook: 'Envio Webhook',
  portal_acesso: 'Acesso Portal',
};

const statusBadge: Record<string, string> = {
  sucesso: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  erro: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  tentativa: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};

const Auditoria: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterModulo, setFilterModulo] = useState('');
  const [filterAcao, setFilterAcao] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterUnidade, setFilterUnidade] = useState('');

  const canAccess = hasPermission(['master', 'coordenador', 'gestao']);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('action_logs' as any)
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

      if (filterDateFrom) query = query.gte('created_at', `${filterDateFrom}T00:00:00`);
      if (filterDateTo) query = query.lte('created_at', `${filterDateTo}T23:59:59`);
      if (filterUser) query = query.ilike('user_nome', `%${filterUser}%`);
      if (filterRole) query = query.eq('role', filterRole);
      if (filterModulo) query = query.eq('modulo', filterModulo);
      if (filterAcao) query = query.eq('acao', filterAcao);
      if (filterStatus) query = query.eq('status', filterStatus);
      if (filterUnidade) query = query.eq('unidade_id', filterUnidade);
      if (search) {
        query = query.or(`user_nome.ilike.%${search}%,acao.ilike.%${search}%,entidade.ilike.%${search}%,entidade_id.ilike.%${search}%`);
      }

      // Coordenador: only their unit
      if (user?.role === 'coordenador' && user.unidadeId) {
        query = query.eq('unidade_id', user.unidadeId);
      }

      const { data, count, error } = await query;
      if (error) throw error;
      setLogs((data as unknown as LogEntry[]) || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error('Error loading logs:', err);
      toast.error('Erro ao carregar logs.');
    } finally {
      setLoading(false);
    }
  }, [page, filterDateFrom, filterDateTo, filterUser, filterRole, filterModulo, filterAcao, filterStatus, filterUnidade, search, user]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const clearFilters = () => {
    setFilterDateFrom(''); setFilterDateTo(''); setFilterUser(''); setFilterRole('');
    setFilterModulo(''); setFilterAcao(''); setFilterStatus(''); setFilterUnidade('');
    setSearch(''); setPage(0);
  };

  const exportCSV = () => {
    if (!logs.length) return;
    const headers = ['Data/Hora', 'Usuário', 'Perfil', 'Ação', 'Módulo', 'Entidade', 'ID Registro', 'Status', 'Erro', 'Detalhes'];
    const rows = logs.map(l => [
      format(new Date(l.created_at), 'dd/MM/yyyy HH:mm:ss'),
      l.user_nome,
      l.role,
      acaoLabels[l.acao] || l.acao,
      moduloLabels[l.modulo] || l.modulo || l.entidade,
      l.entidade,
      l.entidade_id,
      l.status,
      l.erro || '',
      JSON.stringify(l.detalhes),
    ]);
    const csv = [headers.join(';'), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado com sucesso!');
  };

  const exportPDF = () => {
    if (!logs.length) return;
    const tableRows = logs.map(l => `
      <tr>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${format(new Date(l.created_at), 'dd/MM/yy HH:mm')}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${l.user_nome}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${l.role}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${acaoLabels[l.acao] || l.acao}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${moduloLabels[l.modulo] || l.modulo || l.entidade}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${l.status}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis">${l.erro || '-'}</td>
      </tr>
    `).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Auditoria</title></head><body style="font-family:Arial,sans-serif;padding:20px">
      <h2 style="text-align:center;margin-bottom:4px">SMS Oriximiná - Relatório de Auditoria</h2>
      <p style="text-align:center;font-size:12px;color:#666">Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
      <p style="font-size:12px;margin:12px 0">Total de registros: <strong>${totalCount}</strong> (exibindo ${logs.length})</p>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f0f0f0">
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">Data/Hora</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">Usuário</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">Perfil</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">Ação</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">Módulo</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">Status</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">Erro</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
    toast.success('PDF gerado para impressão!');
  };

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Você não tem permissão para acessar esta página.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Logs & Auditoria</h1>
          <p className="text-sm text-muted-foreground">{totalCount} registros encontrados</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { setPage(0); loadLogs(); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4 mr-1" /> Filtros
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1" /> Excel/CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF}>
            <FileText className="w-4 h-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por usuário, ação, entidade..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="pl-10"
        />
      </div>

      {/* Filters */}
      {showFilters && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Data Início</label>
                <Input type="date" value={filterDateFrom} onChange={(e) => { setFilterDateFrom(e.target.value); setPage(0); }} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Data Fim</label>
                <Input type="date" value={filterDateTo} onChange={(e) => { setFilterDateTo(e.target.value); setPage(0); }} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Usuário</label>
                <Input placeholder="Nome do usuário" value={filterUser} onChange={(e) => { setFilterUser(e.target.value); setPage(0); }} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Perfil</label>
                <Select value={filterRole} onValueChange={(v) => { setFilterRole(v === '_all' ? '' : v); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Todos</SelectItem>
                    <SelectItem value="master">Master</SelectItem>
                    <SelectItem value="coordenador">Coordenador</SelectItem>
                    <SelectItem value="recepcao">Recepção</SelectItem>
                    <SelectItem value="profissional">Profissional</SelectItem>
                    <SelectItem value="gestao">Gestão</SelectItem>
                    <SelectItem value="sistema">Sistema</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Módulo</label>
                <Select value={filterModulo} onValueChange={(v) => { setFilterModulo(v === '_all' ? '' : v); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Todos</SelectItem>
                    {Object.entries(moduloLabels).filter(([k]) => k).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Ação</label>
                <Select value={filterAcao} onValueChange={(v) => { setFilterAcao(v === '_all' ? '' : v); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Todas</SelectItem>
                    {Object.entries(acaoLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v === '_all' ? '' : v); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Todos</SelectItem>
                    <SelectItem value="sucesso">Sucesso</SelectItem>
                    <SelectItem value="erro">Erro</SelectItem>
                    <SelectItem value="tentativa">Tentativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full">
                  <X className="w-4 h-4 mr-1" /> Limpar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">Nenhum registro encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Data/Hora</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Módulo</TableHead>
                    <TableHead>Registro</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {format(new Date(log.created_at), 'dd/MM/yy HH:mm:ss')}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{log.user_nome || 'Sistema'}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{log.role}</Badge></TableCell>
                      <TableCell className="text-sm">{acaoLabels[log.acao] || log.acao}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{moduloLabels[log.modulo] || log.modulo || log.entidade}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground max-w-[120px] truncate" title={log.entidade_id}>
                        {log.entidade_id ? `${log.entidade_id.substring(0, 12)}...` : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${statusBadge[log.status] || 'bg-muted text-muted-foreground'}`}>
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px]">
                        {log.erro ? (
                          <span className="text-destructive" title={log.erro}>{log.erro.substring(0, 60)}{log.erro.length > 60 ? '...' : ''}</span>
                        ) : (
                          <span className="text-muted-foreground">
                            {Object.keys(log.detalhes || {}).length > 0 
                              ? Object.entries(log.detalhes).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(', ')
                              : '-'}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page + 1} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Auditoria;

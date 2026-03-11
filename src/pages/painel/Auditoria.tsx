import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Download, FileText, ChevronLeft, ChevronRight, RefreshCw, Filter, X, Eye, BarChart3, User } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { openPrintDocument } from '@/lib/printLayout';

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
  login_sucesso: 'Login Sucesso',
  login_falha: 'Login Falha',
  logout: 'Logout',
  sessao_expirada: 'Sessão Expirada',
  login_erro: 'Login (erro)',
  status_change: 'Alteração Status',
  confirmar_chegada: 'Confirmar Chegada',
  iniciar_atendimento: 'Iniciar Atendimento',
  atendimento_iniciado: 'Atendimento Iniciado',
  atendimento_finalizado: 'Atendimento Finalizado',
  finalizar_atendimento: 'Finalizar Atendimento',
  prontuario_visualizado: 'Prontuário Visualizado',
  prontuario_criado: 'Prontuário Criado',
  prontuario_editado: 'Prontuário Editado',
  prontuario_exportado_pdf: 'Prontuário Exportado PDF',
  paciente_chamado: 'Paciente Chamado',
  paciente_rechamado: 'Paciente Rechamado',
  vaga_liberada: 'Vaga Liberada',
  fila_chamada: 'Fila - Chamada',
  fila_encaixe: 'Fila - Encaixe',
  exportar: 'Exportação',
  imprimir: 'Impressão',
  envio_email: 'Envio E-mail',
  envio_webhook: 'Envio Webhook',
  portal_acesso: 'Acesso Portal',
  agendar_retorno: 'Agendar Retorno',
};

const eventoGrupos: Record<string, { label: string; acoes: string[] }> = {
  todos: { label: 'Todos', acoes: [] },
  autenticacao: { label: 'Autenticação', acoes: ['login', 'login_sucesso', 'login_falha', 'logout', 'sessao_expirada', 'login_erro'] },
  prontuario: { label: 'Prontuário', acoes: ['prontuario_visualizado', 'prontuario_criado', 'prontuario_editado', 'prontuario_exportado_pdf'] },
  atendimento: { label: 'Atendimento', acoes: ['atendimento_iniciado', 'atendimento_finalizado', 'iniciar_atendimento', 'finalizar_atendimento'] },
  chamada: { label: 'Chamada de Paciente', acoes: ['paciente_chamado', 'paciente_rechamado', 'fila_chamada'] },
};

const statusBadge: Record<string, string> = {
  sucesso: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  erro: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  tentativa: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};

const maskCpf = (cpf: string) => {
  if (!cpf || cpf.length < 11) return cpf || '-';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length < 11) return cpf;
  return `***.${clean.substring(3, 6)}.${clean.substring(6, 9)}-**`;
};

const formatCpf = (cpf: string) => {
  if (!cpf) return '-';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return cpf;
  return `${clean.substring(0, 3)}.${clean.substring(3, 6)}.${clean.substring(6, 9)}-${clean.substring(9)}`;
};

const Auditoria: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { funcionarios } = useData();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  // Filters
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterModulo, setFilterModulo] = useState('');
  const [filterAcao, setFilterAcao] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterUnidade, setFilterUnidade] = useState('');
  const [filterCpf, setFilterCpf] = useState('');
  const [filterEventoGrupo, setFilterEventoGrupo] = useState('');

  const isMaster = user?.role === 'master';
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

      // Filter by evento grupo
      if (filterEventoGrupo && filterEventoGrupo !== 'todos') {
        const grupo = eventoGrupos[filterEventoGrupo];
        if (grupo && grupo.acoes.length > 0) {
          query = query.in('acao', grupo.acoes);
        }
      }

      // Coordenador: only their unit
      if (user?.role === 'coordenador' && user.unidadeId) {
        query = query.eq('unidade_id', user.unidadeId);
      }

      const { data, count, error } = await query;
      if (error) throw error;

      let filtered = (data as unknown as LogEntry[]) || [];

      // Client-side CPF filter (CPF is stored in detalhes.usuario_cpf)
      if (filterCpf) {
        const cpfSearch = filterCpf.replace(/\D/g, '');
        filtered = filtered.filter(l => {
          const cpf = String((l.detalhes as any)?.usuario_cpf || '').replace(/\D/g, '');
          return cpf.includes(cpfSearch);
        });
      }

      setLogs(filtered);
      setTotalCount(filterCpf ? filtered.length : (count || 0));
    } catch (err) {
      console.error('Error loading logs:', err);
      toast.error('Erro ao carregar logs.');
    } finally {
      setLoading(false);
    }
  }, [page, filterDateFrom, filterDateTo, filterUser, filterRole, filterModulo, filterAcao, filterStatus, filterUnidade, filterCpf, filterEventoGrupo, search, user]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const clearFilters = () => {
    setFilterDateFrom(''); setFilterDateTo(''); setFilterUser(''); setFilterRole('');
    setFilterModulo(''); setFilterAcao(''); setFilterStatus(''); setFilterUnidade('');
    setFilterCpf(''); setFilterEventoGrupo('');
    setSearch(''); setPage(0);
  };

  const getCpfDisplay = (log: LogEntry) => {
    const cpf = String((log.detalhes as any)?.usuario_cpf || '');
    if (!cpf) return '-';
    return isMaster ? formatCpf(cpf) : maskCpf(cpf);
  };

  // Professional activity report
  const generateReport = useCallback(async () => {
    setReportLoading(true);
    try {
      let query = supabase
        .from('action_logs' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (filterDateFrom) query = query.gte('created_at', `${filterDateFrom}T00:00:00`);
      if (filterDateTo) query = query.lte('created_at', `${filterDateTo}T23:59:59`);
      if (user?.role === 'coordenador' && user.unidadeId) {
        query = query.eq('unidade_id', user.unidadeId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const allLogs = (data as unknown as LogEntry[]) || [];

      // Group by user
      const byUser: Record<string, { nome: string; cpf: string; role: string; logs: LogEntry[] }> = {};
      allLogs.forEach(l => {
        if (!l.user_id || l.user_id === '' || l.role === 'sistema') return;
        if (!byUser[l.user_id]) {
          byUser[l.user_id] = {
            nome: l.user_nome,
            cpf: String((l.detalhes as any)?.usuario_cpf || ''),
            role: l.role,
            logs: [],
          };
        }
        byUser[l.user_id].logs.push(l);
      });

      const report = Object.entries(byUser).map(([userId, data]) => {
        const logins = data.logs.filter(l => ['login', 'login_sucesso'].includes(l.acao)).length;
        const atendimentosIniciados = data.logs.filter(l => l.acao === 'atendimento_iniciado' || l.acao === 'iniciar_atendimento').length;
        const atendimentosFinalizados = data.logs.filter(l => l.acao === 'atendimento_finalizado' || l.acao === 'finalizar_atendimento').length;
        const prontuariosVisualizados = data.logs.filter(l => l.acao === 'prontuario_visualizado').length;
        const prontuariosEditados = data.logs.filter(l => l.acao === 'prontuario_editado').length;
        const prontuariosCriados = data.logs.filter(l => l.acao === 'prontuario_criado').length;

        const sorted = [...data.logs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const primeiroAcesso = sorted[0]?.created_at || '';
        const ultimoAcesso = sorted[sorted.length - 1]?.created_at || '';

        return {
          userId, nome: data.nome, cpf: data.cpf, role: data.role,
          logins, atendimentosIniciados, atendimentosFinalizados,
          prontuariosVisualizados, prontuariosEditados, prontuariosCriados,
          primeiroAcesso, ultimoAcesso, totalAcoes: data.logs.length,
        };
      }).sort((a, b) => b.totalAcoes - a.totalAcoes);

      setReportData(report);
      setShowReport(true);
    } catch (err) {
      console.error('Error generating report:', err);
      toast.error('Erro ao gerar relatório.');
    } finally {
      setReportLoading(false);
    }
  }, [filterDateFrom, filterDateTo, user]);

  const exportReportPDF = () => {
    if (!reportData.length) return;
    const rows = reportData.map(r => `
      <tr>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${r.nome}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${isMaster ? formatCpf(r.cpf) : maskCpf(r.cpf)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${r.role}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;text-align:center">${r.logins}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;text-align:center">${r.atendimentosIniciados}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;text-align:center">${r.atendimentosFinalizados}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;text-align:center">${r.prontuariosVisualizados}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;text-align:center">${r.prontuariosEditados}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;font-size:10px">${r.primeiroAcesso ? format(new Date(r.primeiroAcesso), 'dd/MM HH:mm') : '-'}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;font-size:10px">${r.ultimoAcesso ? format(new Date(r.ultimoAcesso), 'dd/MM HH:mm') : '-'}</td>
      </tr>
    `).join('');

    const periodo = filterDateFrom || filterDateTo
      ? `${filterDateFrom ? format(new Date(filterDateFrom + 'T12:00:00'), 'dd/MM/yyyy') : '...'} a ${filterDateTo ? format(new Date(filterDateTo + 'T12:00:00'), 'dd/MM/yyyy') : '...'}`
      : 'Todo o período';

    const body = `
      <div class="info-grid">
        <div><span class="info-label">Período:</span><br/><span class="info-value">${periodo}</span></div>
        <div><span class="info-label">Total de profissionais:</span><br/><span class="info-value">${reportData.length}</span></div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <thead><tr style="background:#f0f0f0">
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:left">Nome</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:left">CPF</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:left">Perfil</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:center">Logins</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:center">Atend. Inic.</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:center">Atend. Fin.</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:center">Pront. Vis.</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:center">Pront. Edit.</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:center">1º Acesso</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:center">Último</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

    openPrintDocument('Relatório de Atividade por Profissional', body, { 'Período': periodo });
  };

  const exportReportCSV = () => {
    if (!reportData.length) return;
    const headers = ['Nome', 'CPF', 'Perfil', 'Logins', 'Atend. Iniciados', 'Atend. Finalizados', 'Pront. Visualizados', 'Pront. Editados', 'Pront. Criados', 'Primeiro Acesso', 'Último Acesso'];
    const rows = reportData.map(r => [
      r.nome, isMaster ? formatCpf(r.cpf) : maskCpf(r.cpf), r.role,
      r.logins, r.atendimentosIniciados, r.atendimentosFinalizados,
      r.prontuariosVisualizados, r.prontuariosEditados, r.prontuariosCriados,
      r.primeiroAcesso ? format(new Date(r.primeiroAcesso), 'dd/MM/yyyy HH:mm') : '',
      r.ultimoAcesso ? format(new Date(r.ultimoAcesso), 'dd/MM/yyyy HH:mm') : '',
    ]);
    const csv = [headers.join(';'), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_profissionais_${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    if (!logs.length) return;
    const headers = ['Data/Hora', 'Usuário', 'CPF', 'Perfil', 'Ação', 'Módulo', 'Entidade', 'ID Registro', 'Status', 'Erro', 'Detalhes'];
    const rows = logs.map(l => [
      format(new Date(l.created_at), 'dd/MM/yyyy HH:mm:ss'),
      l.user_nome, getCpfDisplay(l), l.role,
      acaoLabels[l.acao] || l.acao,
      moduloLabels[l.modulo] || l.modulo || l.entidade,
      l.entidade, l.entidade_id, l.status, l.erro || '',
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
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${getCpfDisplay(l)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${l.role}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${acaoLabels[l.acao] || l.acao}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${l.status}</td>
      </tr>
    `).join('');

    const body = `
      <p style="font-size:12px;margin:12px 0">Total de registros: <strong>${totalCount}</strong> (exibindo ${logs.length})</p>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f0f0f0">
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">Data/Hora</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">Usuário</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">CPF</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">Perfil</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">Ação</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">Status</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>`;

    openPrintDocument('Relatório de Auditoria', body, {});
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
          <Button variant="outline" size="sm" onClick={generateReport} disabled={reportLoading}>
            <BarChart3 className="w-4 h-4 mr-1" /> {reportLoading ? 'Gerando...' : 'Relatório por Profissional'}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1" /> CSV
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
                <label className="text-xs font-medium text-muted-foreground mb-1 block">CPF do Funcionário</label>
                <Input placeholder="Filtrar por CPF" value={filterCpf} onChange={(e) => { setFilterCpf(e.target.value); setPage(0); }} />
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
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de Evento</label>
                <Select value={filterEventoGrupo} onValueChange={(v) => { setFilterEventoGrupo(v === '_all' ? '' : v); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Todos</SelectItem>
                    {Object.entries(eventoGrupos).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
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
                    <TableHead>CPF</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Módulo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedLog(log)}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {format(new Date(log.created_at), 'dd/MM/yy HH:mm:ss')}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{log.user_nome || 'Sistema'}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{getCpfDisplay(log)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{log.role}</Badge></TableCell>
                      <TableCell className="text-sm">{acaoLabels[log.acao] || log.acao}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{moduloLabels[log.modulo] || log.modulo || log.entidade}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${statusBadge[log.status] || 'bg-muted text-muted-foreground'}`}>
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        </Button>
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

      {/* Detail Side Panel */}
      <Sheet open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalhes do Log</SheetTitle>
          </SheetHeader>
          {selectedLog && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Funcionário</p>
                  <p className="text-sm font-medium">{selectedLog.user_nome || 'Sistema'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CPF</p>
                  <p className="text-sm font-mono">{getCpfDisplay(selectedLog)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Perfil</p>
                  <p className="text-sm"><Badge variant="outline">{selectedLog.role}</Badge></p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge className={`text-xs ${statusBadge[selectedLog.status] || ''}`}>{selectedLog.status}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Data/Hora</p>
                  <p className="text-sm">{format(new Date(selectedLog.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Dispositivo</p>
                  <p className="text-sm text-muted-foreground">{String((selectedLog.detalhes as any)?.dispositivo || '-')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">IP</p>
                  <p className="text-sm font-mono">{selectedLog.ip || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Evento</p>
                  <p className="text-sm font-medium">{acaoLabels[selectedLog.acao] || selectedLog.acao}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Módulo / Entidade</p>
                <p className="text-sm">{moduloLabels[selectedLog.modulo] || selectedLog.modulo} → {selectedLog.entidade}</p>
                {selectedLog.entidade_id && (
                  <p className="text-xs font-mono text-muted-foreground mt-1">ID: {selectedLog.entidade_id}</p>
                )}
              </div>

              {selectedLog.erro && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Erro</p>
                  <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{selectedLog.erro}</p>
                </div>
              )}

              {/* Patient info */}
              {((selectedLog.detalhes as any)?.paciente_nome || (selectedLog.detalhes as any)?.paciente) && (
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Paciente Envolvido</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Nome</p>
                      <p className="text-sm">{String((selectedLog.detalhes as any)?.paciente_nome || (selectedLog.detalhes as any)?.paciente || '-')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">CPF do Paciente</p>
                      <p className="text-sm font-mono">{String((selectedLog.detalhes as any)?.paciente_cpf || '-')}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Field-level changes for prontuario edits */}
              {(selectedLog.detalhes as any)?.campos_alterados && Object.keys((selectedLog.detalhes as any).campos_alterados).length > 0 && (
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Campos Alterados</p>
                  <div className="space-y-2">
                    {Object.entries((selectedLog.detalhes as any).campos_alterados).map(([campo, vals]: [string, any]) => (
                      <div key={campo} className="bg-muted/50 rounded p-2">
                        <p className="text-xs font-medium text-foreground mb-1">{campo}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-[10px] text-muted-foreground">Antes</p>
                            <p className="text-xs bg-destructive/10 text-destructive rounded p-1">{vals.anterior || '(vazio)'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Depois</p>
                            <p className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded p-1">{vals.novo || '(vazio)'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Duration info for atendimento */}
              {(selectedLog.detalhes as any)?.duracao_minutos !== undefined && (
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Duração do Atendimento</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Início</p>
                      <p className="text-sm">{String((selectedLog.detalhes as any)?.hora_inicio || '-')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Fim</p>
                      <p className="text-sm">{String((selectedLog.detalhes as any)?.hora_fim || '-')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Duração</p>
                      <p className="text-sm font-bold">{(selectedLog.detalhes as any)?.duracao_minutos} min</p>
                    </div>
                  </div>
                </div>
              )}

              {/* All details (raw) */}
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Dados Completos</p>
                <pre className="text-[10px] bg-muted p-2 rounded overflow-auto max-h-40 text-muted-foreground">
                  {JSON.stringify(selectedLog.detalhes, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Professional Activity Report Dialog */}
      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Relatório de Atividade por Profissional
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={exportReportCSV}>
                <Download className="w-4 h-4 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={exportReportPDF}>
                <FileText className="w-4 h-4 mr-1" /> PDF
              </Button>
            </div>

            {reportData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum dado encontrado para o período.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Perfil</TableHead>
                      <TableHead className="text-center">Logins</TableHead>
                      <TableHead className="text-center">Atend. Inic.</TableHead>
                      <TableHead className="text-center">Atend. Fin.</TableHead>
                      <TableHead className="text-center">Pront. Vis.</TableHead>
                      <TableHead className="text-center">Pront. Edit.</TableHead>
                      <TableHead className="text-center">1º Acesso</TableHead>
                      <TableHead className="text-center">Último</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.map((r) => (
                      <TableRow key={r.userId}>
                        <TableCell className="font-medium text-sm">{r.nome}</TableCell>
                        <TableCell className="text-xs font-mono">{isMaster ? formatCpf(r.cpf) : maskCpf(r.cpf)}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{r.role}</Badge></TableCell>
                        <TableCell className="text-center">{r.logins}</TableCell>
                        <TableCell className="text-center">{r.atendimentosIniciados}</TableCell>
                        <TableCell className="text-center">{r.atendimentosFinalizados}</TableCell>
                        <TableCell className="text-center">{r.prontuariosVisualizados}</TableCell>
                        <TableCell className="text-center">{r.prontuariosEditados}</TableCell>
                        <TableCell className="text-center text-xs">
                          {r.primeiroAcesso ? format(new Date(r.primeiroAcesso), 'dd/MM HH:mm') : '-'}
                        </TableCell>
                        <TableCell className="text-center text-xs">
                          {r.ultimoAcesso ? format(new Date(r.ultimoAcesso), 'dd/MM HH:mm') : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auditoria;

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { 
  Search, Download, FileText, ChevronLeft, ChevronRight, 
  RefreshCw, Filter, X, Eye, BarChart3, User, 
  Info, Shield, History, Monitor, Database, UserCheck, Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { openPrintDocument } from '@/lib/printLayout';

interface LogEntry {
  id: string;
  acao: string;
  acao_legivel?: string;
  tipo_evento?: string;
  modulo: string;
  entidade: string;
  entidade_id: string;
  entidade_nome?: string;
  user_id: string;
  user_nome: string;
  role: string;
  unidade_id: string;
  unidade_nome?: string;
  paciente_id?: string;
  paciente_nome?: string;
  profissional_id?: string;
  profissional_nome?: string;
  agendamento_id?: string;
  status: string;
  error_message?: string;
  ip: string;
  navegador?: string;
  dispositivo?: string;
  rota?: string;
  detalhes: Record<string, any>;
  before?: any;
  after?: any;
  changes?: Record<string, any>;
  campos_alterados?: string[];
  created_at: string;
}




interface EnrichedLog extends LogEntry {
  nome_entidade?: string;
  detalhes_resolvidos?: {
    paciente?: string;
    profissional?: string;
    agendamento?: string;
    unidade?: string;
    [key: string]: any;
  };

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

const formatAuditAction = (acao: string): string => {
  const customLabels: Record<string, string> = {
    // Pacientes
    edicao_paciente_pagina_pacientes: 'Edição de cadastro do paciente pela Página Pacientes',
    criacao_paciente: 'Cadastro de novo paciente',
    excluir_paciente: 'Exclusão de paciente',
    
    // Agendamentos
    novo_agendamento: 'Criação de novo agendamento',
    confirmar_chegada: 'Confirmação de chegada do paciente',
    agendar_sessao_tratamento: 'Agendamento de sessão de tratamento',
    desmarcar_sessao: 'Desmarcação de sessão',
    agendar_ciclo_completo: 'Agendamento de ciclo completo',
    status_change: 'Alteração de status de agendamento',
    
    // Atendimento / Prontuário
    iniciar_atendimento: 'Início de atendimento clínico',
    atendimento_iniciado: 'Atendimento iniciado',
    atendimento_finalizado: 'Atendimento finalizado',
    finalizar_atendimento: 'Finalização de atendimento',
    edicao_prontuario: 'Edição de prontuário',
    finalizar_prontuario: 'Finalização de prontuário',
    prontuario_visualizado: 'Visualização de prontuário',
    prontuario_criado: 'Criação de prontuário',
    prontuario_editado: 'Edição de prontuário',
    prontuario_exportado_pdf: 'Exportação de prontuário para PDF',
    
    // Autenticação
    login: 'Tentativa de login',
    login_sucesso: 'Login realizado com sucesso',
    login_falha: 'Falha na tentativa de login',
    logout: 'Saída do sistema (logout)',
    sessao_expirada: 'Sessão de usuário expirada',
    
    // Outros
    gerar_documento: 'Geração de documento oficial',
    baixar_pdf: 'Download de arquivo PDF',
    exportar: 'Exportação de dados',
    imprimir: 'Impressão de documento',
    vaga_liberada: 'Liberação de vaga na agenda',
    fila_chamada: 'Chamada de paciente da fila',
    fila_encaixe: 'Encaixe de paciente na fila',
  };

  if (customLabels[acao]) return customLabels[acao];

  // Fallback: transform snake_case to readable text
  return acao
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const statusBadge: Record<string, string> = {
  sucesso: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  erro: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  falha: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  tentativa: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  pendente: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  bloqueado: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
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

const maskCpf = (cpf: string) => {
  if (!cpf || cpf.length < 11) return cpf || '-';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length < 11) return cpf;
  return `${clean.substring(0, 3)}.***.***-${clean.substring(9)}`;
};

const formatCpf = (cpf: string) => {
  if (!cpf) return '-';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return cpf;
  return `${clean.substring(0, 3)}.${clean.substring(3, 6)}.${clean.substring(6, 9)}-${clean.substring(9)}`;
};

const generateHumanSummary = (log: EnrichedLog) => {
  const user = log.user_nome || 'O sistema';
  const acao = log.acao_legivel || log.acao;
  const entidade = log.entidade_nome || log.entidade_id || log.entidade;
  const data = format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  const unidade = log.unidade_nome || 'unidade não identificada';

  if (log.tipo_evento === 'login') return `${user} realizou login no sistema em ${data}.`;
  if (log.tipo_evento === 'criacao') return `${user} cadastrou ${log.entidade} "${entidade}" na ${unidade} em ${data}.`;
  if (log.tipo_evento === 'edicao') {
    const campos = log.campos_alterados?.join(', ') || 'campos';
    return `${user} editou o registro de ${log.entidade} "${entidade}", alterando ${campos}, na ${unidade} em ${data}.`;
  }
  if (log.tipo_evento === 'exclusao') return `${user} removeu o registro de ${log.entidade} "${entidade}" na ${unidade} em ${data}.`;
  
  return `${user} realizou a ação "${acao}" em ${data}.`;
};

const Auditoria: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const { funcionarios } = useData();
  const [logs, setLogs] = useState<EnrichedLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLog, setSelectedLog] = useState<EnrichedLog | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);


  // Helper to enrich a single log with names
  const enrichLog = useCallback(async (log: EnrichedLog) => {
    const enriched: EnrichedLog = { ...log, detalhes_resolvidos: {} };
    
    // Attempt to map new specialized columns
    enriched.detalhes_resolvidos = {
      paciente: log.detalhes?.paciente_nome || log.paciente_nome,
      profissional: log.detalhes?.profissional_nome || log.profissional_nome,
      agendamento: log.agendamento_id ? `ID: ${log.agendamento_id}` : undefined,
      unidade: log.unidade_nome
    };

    // Lazy resolve names if needed
    try {
      if (log.paciente_id && !enriched.detalhes_resolvidos.paciente) {
        const { data } = await supabase.from('pacientes').select('nome').eq('id', log.paciente_id).maybeSingle();
        if (data) enriched.detalhes_resolvidos.paciente = data.nome;
      }
      if (log.profissional_id && !enriched.detalhes_resolvidos.profissional) {
        const { data } = await supabase.from('funcionarios').select('nome').eq('id', log.profissional_id).maybeSingle();
        if (data) enriched.detalhes_resolvidos.profissional = data.nome;
      }
    } catch (err) {
      console.warn('Error resolving log names:', err);
    }
    
    enriched.nome_entidade = log.entidade_nome || enriched.detalhes_resolvidos.paciente || enriched.detalhes_resolvidos.profissional || log.entidade_id;
    
    return enriched;
  }, []);


  useEffect(() => {
    if (selectedLog && !selectedLog.detalhes_resolvidos) {
      const run = async () => {
        setIsResolving(true);
        const enriched = await enrichLog(selectedLog);
        setSelectedLog(enriched);
        setIsResolving(false);
      };
      run();
    }
  }, [selectedLog, enrichLog]);

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
  const canAccess = can('relatorios', 'can_view') || isMaster;

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
        query = query.or(`user_nome.ilike.%${search}%,acao.ilike.%${search}%,entidade.ilike.%${search}%,entidade_id.ilike.%${search}%,paciente_nome.ilike.%${search}%,profissional_nome.ilike.%${search}%,acao_legivel.ilike.%${search}%`);
      }


      // Filter by evento grupo
      if (filterEventoGrupo && filterEventoGrupo !== 'todos') {
        const grupo = eventoGrupos[filterEventoGrupo];
        if (grupo && grupo.acoes.length > 0) {
          query = query.in('acao', grupo.acoes);
        }
      }

      // Universal unit isolation (admin.sms sees all)
      if (user?.unidadeId && user?.usuario !== 'admin.sms') {
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
      if (user?.unidadeId && user?.usuario !== 'admin.sms') {
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
    const headers = ['Data/Hora', 'Usuário', 'CPF', 'Perfil', 'Ação', 'Resumo', 'Módulo', 'Registro Afetado', 'Entidade', 'ID Registro', 'Unidade', 'Status', 'IP', 'Navegador', 'Erro'];
    const rows = logs.map(l => [
      format(new Date(l.created_at), 'dd/MM/yyyy HH:mm:ss'),
      l.user_nome, getCpfDisplay(l), l.role,
      acaoLabels[l.acao] || l.acao,
      generateHumanSummary(l),
      moduloLabels[l.modulo] || l.modulo || l.entidade,
      l.paciente_nome || l.nome_entidade || '',
      l.entidade, l.entidade_id,
      l.unidade_nome || '',
      l.status, l.ip, l.navegador || '',
      l.error_message || '',
    ]);
    const csv = [headers.join(';'), ...rows.map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(';'))].join('\n');
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
                    <TableHead>Ação</TableHead>
                    <TableHead>Registro Afetado</TableHead>
                    <TableHead>Módulo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dispositivo</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedLog(log)}>
                      <TableCell className="whitespace-nowrap text-[11px] font-mono">
                        {format(new Date(log.created_at), 'dd/MM/yy HH:mm:ss')}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium leading-none">{log.user_nome || 'Sistema'}</span>
                          <span className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-semibold">{log.role}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <span className="text-xs font-medium block truncate" title={formatAuditAction(log.acao)}>
                          {formatAuditAction(log.acao)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <div className="flex flex-col gap-0.5 overflow-hidden">
                          <span className="text-xs font-semibold truncate" title={log.paciente_nome || log.nome_entidade || log.entidade_id}>
                            {log.paciente_nome || log.nome_entidade || (log.entidade_id && log.entidade_id.length > 5 ? log.entidade_id : log.entidade)}
                          </span>
                          {log.profissional_nome && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              Prof: {log.profissional_nome}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] font-normal uppercase tracking-tight">
                          {moduloLabels[log.modulo] || log.modulo || log.entidade}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] uppercase font-bold tracking-tight shadow-none ${statusBadge[log.status] || 'bg-muted text-muted-foreground'}`}>
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground max-w-[100px] truncate">
                        {String(log.detalhes?.dispositivo || '-')}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full hover:bg-primary/10">
                          <Eye className="w-4 h-4 text-primary" />
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
          <SheetHeader className="border-b pb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <SheetTitle className="text-xl">Detalhes da Auditoria</SheetTitle>
                <p className="text-xs text-muted-foreground font-mono">{selectedLog?.id}</p>
              </div>
            </div>
          </SheetHeader>
          
          {selectedLog && (
            <div className="space-y-6 mt-6 pb-20">
              {/* 1. RESUMO DO EVENTO */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Info className="w-4 h-4" />
                  RESUMO DO EVENTO
                </div>
                <div className="grid grid-cols-1 gap-4 bg-muted/30 p-4 rounded-xl border">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Ação Realizada</p>
                    <p className="text-sm font-semibold leading-tight text-foreground">{formatAuditAction(selectedLog.acao)}</p>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      "{generateHumanSummary(selectedLog)}"
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Status</p>
                      <Badge className={`text-[10px] font-bold uppercase ${statusBadge[selectedLog.status] || ''}`}>{selectedLog.status}</Badge>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Data e Hora</p>
                      <p className="text-sm font-medium">{format(new Date(selectedLog.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Módulo</p>
                      <p className="text-sm font-medium">{moduloLabels[selectedLog.modulo] || selectedLog.modulo}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Entidade</p>
                      <p className="text-sm font-medium">{selectedLog.entidade}</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* 2. RESPONSÁVEL */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <UserCheck className="w-4 h-4" />
                  RESPONSÁVEL
                </div>
                <div className="grid grid-cols-1 gap-3 bg-muted/30 p-4 rounded-xl border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {selectedLog.user_nome ? selectedLog.user_nome.charAt(0) : 'S'}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{selectedLog.user_nome || 'Sistema / Automação'}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{selectedLog.role}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-1">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">CPF</p>
                      <p className="text-xs font-mono">{getCpfDisplay(selectedLog)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Unidade</p>
                      <p className="text-xs font-medium">{selectedLog.detalhes_resolvidos?.unidade || 'Não informada'}</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* 3. REGISTRO AFETADO */}
              {(selectedLog.entidade_id || selectedLog.nome_entidade) && (
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <Database className="w-4 h-4" />
                    REGISTRO AFETADO
                  </div>
                  <div className="grid grid-cols-1 gap-3 bg-primary/5 p-4 rounded-xl border border-primary/10">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-primary tracking-wider mb-1">Identificação do Registro</p>
                      <p className="text-sm font-bold text-foreground">{selectedLog.nome_entidade || 'N/D'}</p>
                      <p className="text-[10px] font-mono text-muted-foreground mt-1">ID Técnico: {selectedLog.entidade_id || 'N/D'}</p>
                    </div>
                    
                    {selectedLog.detalhes_resolvidos?.paciente && (
                      <div className="border-t border-primary/10 pt-2">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Paciente</p>
                        <p className="text-xs font-medium">{selectedLog.detalhes_resolvidos.paciente}</p>
                      </div>
                    )}
                    {selectedLog.detalhes_resolvidos?.profissional && (
                      <div className="border-t border-primary/10 pt-2">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Profissional</p>
                        <p className="text-xs font-medium">{selectedLog.detalhes_resolvidos.profissional}</p>
                      </div>
                    )}
                    {selectedLog.detalhes_resolvidos?.agendamento && (
                      <div className="border-t border-primary/10 pt-2">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Agendamento</p>
                        <p className="text-xs font-medium">{selectedLog.detalhes_resolvidos.agendamento}</p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* 4. ALTERAÇÕES REALIZADAS */}
              {(selectedLog.before || selectedLog.after || selectedLog.changes || selectedLog.detalhes?.old_value || selectedLog.detalhes?.new_value || selectedLog.detalhes?.campos_alterados) && (
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <History className="w-4 h-4" />
                    ALTERAÇÕES REALIZADAS
                  </div>
                  <div className="space-y-2">
                    {/* Handle changes column (preferred) */}
                    {selectedLog.changes && Object.entries(selectedLog.changes).length > 0 && (
                      <div className="space-y-2">
                        {Object.entries(selectedLog.changes).map(([key, vals]: [string, any]) => (
                          <div key={key} className="bg-muted/50 rounded-xl p-3 border">
                            <p className="text-xs font-bold text-foreground mb-2 uppercase tracking-tight">{key.replace(/_/g, ' ')}</p>
                            <div className="grid grid-cols-1 gap-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[9px] border-red-200 text-red-600 bg-red-50 uppercase">DE</Badge>
                                <span className="text-xs text-muted-foreground line-through">{String(vals.from ?? '(vazio)')}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[9px] border-emerald-200 text-emerald-600 bg-emerald-50 uppercase">PARA</Badge>
                                <span className="text-xs font-medium text-foreground">{String(vals.to ?? '(vazio)')}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Fallback for legacy logs in detalhes */}
                    {!selectedLog.changes && selectedLog.detalhes?.old_value && selectedLog.detalhes?.new_value && (
                      <div className="space-y-2">
                        {Object.entries(selectedLog.detalhes.new_value).map(([key, value]: [string, any]) => {
                          const oldValue = selectedLog.detalhes?.old_value?.[key];
                          if (JSON.stringify(oldValue) === JSON.stringify(value)) return null;
                          return (
                            <div key={key} className="bg-muted/50 rounded-xl p-3 border">
                              <p className="text-xs font-bold text-foreground mb-2 uppercase tracking-tight">{key.replace(/_/g, ' ')}</p>
                              <div className="grid grid-cols-1 gap-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[9px] border-red-200 text-red-600 bg-red-50 uppercase">DE</Badge>
                                  <span className="text-xs text-muted-foreground line-through">{String(oldValue ?? '(vazio)')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[9px] border-emerald-200 text-emerald-600 bg-emerald-50 uppercase">PARA</Badge>
                                  <span className="text-xs font-medium text-foreground">{String(value ?? '(vazio)')}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!selectedLog.changes && !selectedLog.detalhes?.old_value && (
                      <p className="text-xs text-muted-foreground italic p-4 bg-muted/20 rounded-lg border border-dashed">
                        Este log antigo não possui comparação antes/depois registrada.
                      </p>
                    )}
                  </div>
                </section>
              )}


              {/* 5. CONTEXTO TÉCNICO */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Monitor className="w-4 h-4" />
                  CONTEXTO TÉCNICO
                </div>
                <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-xl border">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Endereço IP</p>
                    <p className="text-xs font-mono">{selectedLog.ip || 'Local/Sistema'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Navegador</p>
                    <p className="text-xs truncate">{String(selectedLog.detalhes?.dispositivo || selectedLog.detalhes?.user_agent || '-')}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Rota / Origem</p>
                    <p className="text-[11px] font-mono text-muted-foreground truncate">{String(selectedLog.detalhes?.rota || selectedLog.detalhes?.origin || '-')}</p>
                  </div>
                </div>
              </section>

              {/* 6. DADOS TÉCNICOS COMPLETOS */}
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="json-data" className="border-none">
                  <AccordionTrigger className="hover:no-underline bg-muted/50 rounded-xl px-4 py-3 text-xs font-bold text-muted-foreground">
                    VER DADOS TÉCNICOS COMPLETOS (JSON)
                  </AccordionTrigger>
                  <AccordionContent className="pt-2">
                    <div className="relative">
                      <pre className="text-[10px] bg-slate-950 text-slate-300 p-4 rounded-xl overflow-auto max-h-[300px] font-mono leading-relaxed">
                        {JSON.stringify(selectedLog.detalhes, (key, value) => {
                          // Mask sensitive data in technical view too
                          if (['token', 'password', 'senha', 'authorization', 'bearer'].some(s => key.toLowerCase().includes(s))) {
                            return '********';
                          }
                          return value;
                        }, 2)}
                      </pre>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="absolute top-2 right-2 text-slate-400 hover:text-white hover:bg-white/10"
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(selectedLog.detalhes, null, 2));
                          toast.success('JSON copiado!');
                        }}
                      >
                        <FileText className="w-4 h-4" />
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
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

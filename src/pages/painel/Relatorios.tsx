import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area } from 'recharts';
import { Download, FileText, Filter, Clock, Users, CalendarDays, TrendingUp, AlertTriangle, UserCheck, ListOrdered, Printer, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { openPrintDocument } from '@/lib/printLayout';

const COLORS = ['hsl(199, 89%, 38%)', 'hsl(168, 60%, 42%)', 'hsl(45, 93%, 47%)', 'hsl(0, 72%, 51%)', 'hsl(262, 83%, 58%)', 'hsl(200, 18%, 46%)', 'hsl(280, 60%, 50%)', 'hsl(30, 80%, 50%)'];

const statusLabels: Record<string, string> = {
  pendente: 'Pendente', confirmado: 'Confirmado', confirmado_chegada: 'Chegou',
  em_atendimento: 'Em Atendimento', concluido: 'Concluído', falta: 'Falta',
  cancelado: 'Cancelado', remarcado: 'Remarcado', atraso: 'Atraso',
};

interface AtendimentoDB {
  id: string; agendamento_id: string; paciente_id: string; paciente_nome: string;
  profissional_id: string; profissional_nome: string; unidade_id: string;
  sala_id: string; setor: string; procedimento: string; data: string;
  hora_inicio: string; hora_fim: string; duracao_minutos: number | null; status: string;
}

interface FilaDB {
  id: string; paciente_id: string; paciente_nome: string; unidade_id: string;
  profissional_id: string | null; setor: string; prioridade: string;
  prioridade_perfil: string; status: string; posicao: number;
  hora_chegada: string; hora_chamada: string | null; criado_em: string;
}

const Relatorios: React.FC = () => {
  const { agendamentos, pacientes, funcionarios, unidades, salas, fila } = useData();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('geral');
  const [filterRoleProd, setFilterRoleProd] = useState('all');
  const [timelineGroup, setTimelineGroup] = useState<'dia' | 'semana' | 'mes'>('dia');
  const [filterUnit, setFilterUnit] = useState('all');
  const [filterProf, setFilterProf] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSetor, setFilterSetor] = useState('all');
  const [filterTipo, setFilterTipo] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [atendimentosDB, setAtendimentosDB] = useState<AtendimentoDB[]>([]);
  const [filaDB, setFilaDB] = useState<FilaDB[]>([]);

  const profissionais = funcionarios.filter(f => f.role === 'profissional');
  const setoresUnicos = useMemo(() => {
    const s = new Set([...atendimentosDB.map(a => a.setor), ...agendamentos.map(a => a.tipo)].filter(Boolean));
    return Array.from(s).sort();
  }, [atendimentosDB, agendamentos]);

  const tiposUnicos = useMemo(() => {
    const s = new Set(agendamentos.map(a => a.tipo).filter(Boolean));
    return Array.from(s).sort();
  }, [agendamentos]);

  useEffect(() => {
    const load = async () => {
      try {
        let qAt = (supabase as any).from('atendimentos').select('*');
        let qFila = (supabase as any).from('fila_espera').select('*');
        if (user?.role === 'coordenador' && user.unidadeId) {
          qAt = qAt.eq('unidade_id', user.unidadeId);
          qFila = qFila.eq('unidade_id', user.unidadeId);
        }
        if (user?.role === 'profissional' && user.id) {
          qAt = qAt.eq('profissional_id', user.id);
          qFila = qFila.eq('profissional_id', user.id);
        }
        const [{ data: atData }, { data: filaData }] = await Promise.all([qAt, qFila]);
        if (atData) setAtendimentosDB(atData);
        if (filaData) setFilaDB(filaData);
      } catch (err) { console.error('Error loading report data:', err); }
    };
    load();
  }, [user]);

  // === FILTERS ===
  const filtered = useMemo(() => {
    return agendamentos.filter(a => {
      if (filterUnit !== 'all' && a.unidadeId !== filterUnit) return false;
      if (filterProf !== 'all' && a.profissionalId !== filterProf) return false;
      if (filterStatus !== 'all' && a.status !== filterStatus) return false;
      if (filterTipo !== 'all' && a.tipo !== filterTipo) return false;
      if (dateFrom && a.data < dateFrom) return false;
      if (dateTo && a.data > dateTo) return false;
      if (user?.role === 'coordenador' && user.unidadeId && a.unidadeId !== user.unidadeId) return false;
      if (user?.role === 'profissional' && user.id && a.profissionalId !== user.id) return false;
      if (user?.role === 'recepcao' && user.unidadeId && a.unidadeId !== user.unidadeId) return false;
      return true;
    });
  }, [agendamentos, filterUnit, filterProf, filterStatus, filterTipo, dateFrom, dateTo, user]);

  const filteredAtendimentos = useMemo(() => {
    return atendimentosDB.filter(a => {
      if (filterUnit !== 'all' && a.unidade_id !== filterUnit) return false;
      if (filterProf !== 'all' && a.profissional_id !== filterProf) return false;
      if (filterSetor !== 'all' && a.setor !== filterSetor) return false;
      if (dateFrom && a.data < dateFrom) return false;
      if (dateTo && a.data > dateTo) return false;
      return true;
    });
  }, [atendimentosDB, filterUnit, filterProf, filterSetor, dateFrom, dateTo]);

  // === STATS ===
  const stats = useMemo(() => {
    const total = filtered.length;
    const confirmados = filtered.filter(a => a.status === 'confirmado' || a.status === 'confirmado_chegada').length;
    const pendentes = filtered.filter(a => a.status === 'pendente').length;
    const concluidos = filtered.filter(a => a.status === 'concluido').length;
    const emAtendimento = filtered.filter(a => a.status === 'em_atendimento').length;
    const faltas = filtered.filter(a => a.status === 'falta').length;
    const cancelados = filtered.filter(a => a.status === 'cancelado').length;
    const remarcados = filtered.filter(a => a.status === 'remarcado').length;
    const online = filtered.filter(a => a.origem === 'online').length;
    const recepcao = filtered.filter(a => a.origem === 'recepcao').length;
    const retornos = filtered.filter(a => a.tipo === 'Retorno').length;
    const primeiraConsulta = filtered.filter(a => a.tipo === 'Consulta' || a.tipo === 'Primeira Consulta').length;
    const taxaComparecimento = total > 0 ? Math.round(((concluidos + emAtendimento) / (total - pendentes - cancelados || 1)) * 100) : 0;
    const taxaFalta = total > 0 ? Math.round((faltas / (total || 1)) * 100) : 0;
    return { total, confirmados, pendentes, concluidos, emAtendimento, faltas, cancelados, remarcados, online, recepcao, retornos, primeiraConsulta, taxaComparecimento, taxaFalta };
  }, [filtered]);

  const tempoStats = useMemo(() => {
    const finalizados = filteredAtendimentos.filter(a => a.status === 'finalizado' && a.duracao_minutos && a.duracao_minutos > 0);
    const totalMinutos = finalizados.reduce((s, a) => s + (a.duracao_minutos || 0), 0);
    const media = finalizados.length > 0 ? Math.round(totalMinutos / finalizados.length) : 0;
    return { totalAtendimentos: finalizados.length, tempoMedio: media, totalMinutos };
  }, [filteredAtendimentos]);

  // === PRODUCTIVITY BY PROFESSIONAL (unified source for screen + export) ===
  const porProfissional = useMemo(() => {
    const map: Record<string, { id: string; nome: string; role: string; unidade: string; total: number; concluidos: number; faltas: number; cancelados: number; remarcados: number; tempoTotal: number; atendimentos: number; retornos: number; pacientesSet: Set<string> }> = {};
    filtered.forEach(a => {
      const un = unidades.find(u => u.id === a.unidadeId);
      const func = funcionarios.find(f => f.id === a.profissionalId);
      const key = a.profissionalId || a.profissionalNome;
      if (!map[key]) map[key] = { id: a.profissionalId, nome: a.profissionalNome, role: func?.role || 'profissional', unidade: un?.nome || '', total: 0, concluidos: 0, faltas: 0, cancelados: 0, remarcados: 0, tempoTotal: 0, atendimentos: 0, retornos: 0, pacientesSet: new Set() };
      const m = map[key];
      m.total++;
      m.pacientesSet.add(a.pacienteId);
      if (a.status === 'concluido') m.concluidos++;
      if (a.status === 'falta') m.faltas++;
      if (a.status === 'cancelado') m.cancelados++;
      if (a.status === 'remarcado') m.remarcados++;
      if (a.tipo === 'Retorno') m.retornos++;
      if (!m.unidade && un?.nome) m.unidade = un.nome;
    });
    filteredAtendimentos.forEach(at => {
      const un = unidades.find(u => u.id === at.unidade_id);
      const func = funcionarios.find(f => f.id === at.profissional_id);
      const key = at.profissional_id || at.profissional_nome;
      if (!map[key]) map[key] = { id: at.profissional_id, nome: at.profissional_nome, role: func?.role || 'profissional', unidade: un?.nome || '', total: 0, concluidos: 0, faltas: 0, cancelados: 0, remarcados: 0, tempoTotal: 0, atendimentos: 0, retornos: 0, pacientesSet: new Set() };
      if (at.duracao_minutos && at.duracao_minutos > 0 && at.status === 'finalizado') {
        map[key].tempoTotal += at.duracao_minutos;
        map[key].atendimentos++;
      }
      map[key].pacientesSet.add(at.paciente_id);
      if (!map[key].unidade && un?.nome) map[key].unidade = un.nome;
    });
    return Object.values(map)
      .filter(d => filterRoleProd === 'all' || d.role === filterRoleProd)
      .map(d => ({
        id: d.id,
        nome: d.nome,
        role: d.role,
        unidade: d.unidade,
        total: d.total,
        concluidos: d.concluidos,
        faltas: d.faltas,
        cancelados: d.cancelados,
        remarcados: d.remarcados,
        retornos: d.retornos,
        atendimentos: d.atendimentos,
        tempoTotal: d.tempoTotal,
        pacientesAtendidos: d.pacientesSet.size,
        tempoMedio: d.atendimentos > 0 ? Math.round(d.tempoTotal / d.atendimentos) : 0,
        taxaConclusao: d.total > 0 ? Math.round((d.concluidos / d.total) * 100) : 0,
        taxaRetorno: d.total > 0 ? Math.round((d.retornos / d.total) * 100) : 0,
      })).sort((a, b) => b.total - a.total);
  }, [filtered, filteredAtendimentos, unidades, funcionarios, filterRoleProd]);

  // === BY UNIT ===
  const porUnidade = useMemo(() => {
    const map: Record<string, { nome: string; total: number; concluidos: number; faltas: number; cancelados: number }> = {};
    filtered.forEach(a => {
      const un = unidades.find(u => u.id === a.unidadeId);
      const name = un?.nome || 'Desconhecida';
      if (!map[name]) map[name] = { nome: name, total: 0, concluidos: 0, faltas: 0, cancelados: 0 };
      map[name].total++;
      if (a.status === 'concluido') map[name].concluidos++;
      if (a.status === 'falta') map[name].faltas++;
      if (a.status === 'cancelado') map[name].cancelados++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered, unidades]);

  // === FALTAS REPORT ===
  const faltasReport = useMemo(() => {
    const faltaAgs = filtered.filter(a => a.status === 'falta');
    const porPaciente: Record<string, { nome: string; email: string; telefone: string; profissional: string; unidade: string; datas: string[]; total: number }> = {};
    faltaAgs.forEach(a => {
      const pac = pacientes.find(p => p.id === a.pacienteId);
      const un = unidades.find(u => u.id === a.unidadeId);
      const key = a.pacienteId || a.pacienteNome;
      if (!porPaciente[key]) porPaciente[key] = { nome: a.pacienteNome, email: pac?.email || '', telefone: pac?.telefone || '', profissional: a.profissionalNome, unidade: un?.nome || '', datas: [], total: 0 };
      porPaciente[key].datas.push(a.data);
      porPaciente[key].total++;
    });
    return Object.values(porPaciente).sort((a, b) => b.total - a.total);
  }, [filtered, pacientes, unidades]);

  // === PATIENTS REPORT ===
  const pacientesReport = useMemo(() => {
    const pacIds = new Set(filtered.map(a => a.pacienteId));
    return Array.from(pacIds).map(pid => {
      const pac = pacientes.find(p => p.id === pid);
      const ags = filtered.filter(a => a.pacienteId === pid);
      const concluidos = ags.filter(a => a.status === 'concluido').length;
      const faltas = ags.filter(a => a.status === 'falta').length;
      const retornos = ags.filter(a => a.tipo === 'Retorno').length;
      return {
        id: pid,
        nome: pac?.nome || ags[0]?.pacienteNome || 'Desconhecido',
        email: pac?.email || '',
        telefone: pac?.telefone || '',
        totalAgendamentos: ags.length,
        concluidos,
        faltas,
        retornos,
        ultimaConsulta: ags.sort((a, b) => b.data.localeCompare(a.data))[0]?.data || '',
      };
    }).sort((a, b) => b.totalAgendamentos - a.totalAgendamentos);
  }, [filtered, pacientes]);

  // === FILA REPORT ===
  const filaReport = useMemo(() => {
    const filteredFila = filaDB.filter(f => {
      if (filterUnit !== 'all' && f.unidade_id !== filterUnit) return false;
      if (filterProf !== 'all' && f.profissional_id !== filterProf) return false;
      return true;
    });
    const aguardando = filteredFila.filter(f => f.status === 'aguardando').length;
    const chamados = filteredFila.filter(f => f.status === 'chamado' || f.status === 'atendido').length;
    const desistencias = filteredFila.filter(f => f.status === 'desistiu' || f.status === 'cancelado').length;
    return { items: filteredFila.sort((a, b) => a.posicao - b.posicao), aguardando, chamados, desistencias, total: filteredFila.length };
  }, [filaDB, filterUnit, filterProf]);

  // === TIMELINE DATA ===
  const timelineData = useMemo(() => {
    const map: Record<string, { data: string; agendamentos: number; concluidos: number; faltas: number }> = {};
    filtered.forEach(a => {
      if (!map[a.data]) map[a.data] = { data: a.data, agendamentos: 0, concluidos: 0, faltas: 0 };
      map[a.data].agendamentos++;
      if (a.status === 'concluido') map[a.data].concluidos++;
      if (a.status === 'falta') map[a.data].faltas++;
    });
    return Object.values(map).sort((a, b) => a.data.localeCompare(b.data)).slice(-30);
  }, [filtered]);

  const statusData = useMemo(() => [
    { name: 'Confirmados', value: stats.confirmados },
    { name: 'Pendentes', value: stats.pendentes },
    { name: 'Concluídos', value: stats.concluidos },
    { name: 'Em Atendimento', value: stats.emAtendimento },
    { name: 'Faltas', value: stats.faltas },
    { name: 'Cancelados', value: stats.cancelados },
    { name: 'Remarcados', value: stats.remarcados },
  ].filter(d => d.value > 0), [stats]);

  // === EXPORT CSV (uses same datasets as screen) ===
  const exportCSV = useCallback((type: string) => {
    let headers: string[] = [];
    let rows: string[][] = [];
    const filename = `relatorio_${type}_${new Date().toISOString().split('T')[0]}.csv`;

    if (type === 'agendamentos' || type === 'geral' || type === 'detalhado') {
      headers = ['Data', 'Hora', 'Paciente', 'Profissional', 'Unidade', 'Setor', 'Tipo', 'Status', 'Origem', 'Hora Início', 'Hora Fim', 'Duração (min)'];
      rows = filtered.map(a => {
        const un = unidades.find(u => u.id === a.unidadeId);
        const at = filteredAtendimentos.find(at => at.agendamento_id === a.id);
        return [a.data, a.hora, a.pacienteNome, a.profissionalNome, un?.nome || '', a.tipo, a.tipo, statusLabels[a.status] || a.status, a.origem, at?.hora_inicio || '', at?.hora_fim || '', at?.duracao_minutos?.toString() || ''];
      });
    } else if (type === 'produtividade') {
      headers = ['Profissional', 'Perfil', 'Unidade', 'Pacientes Atendidos', 'Total Agendamentos', 'Concluídos', 'Faltas', 'Cancelamentos', 'Remarcados', 'Retornos', 'Tempo Médio (min)', 'Taxa Conclusão (%)', 'Taxa Retorno (%)'];
      rows = porProfissional.map(p => {
        const roleLabel = p.role === 'master' ? 'Master' : p.role === 'coordenador' ? 'Coordenador' : 'Profissional';
        return [p.nome, roleLabel, p.unidade, p.pacientesAtendidos.toString(), p.total.toString(), p.concluidos.toString(), p.faltas.toString(), p.cancelados.toString(), p.remarcados.toString(), p.retornos.toString(), p.tempoMedio.toString(), p.taxaConclusao.toString(), p.taxaRetorno.toString()];
      });
    } else if (type === 'faltas') {
      headers = ['Paciente', 'E-mail', 'Telefone', 'Profissional', 'Unidade', 'Total Faltas', 'Datas'];
      rows = faltasReport.map(f => [f.nome, f.email, f.telefone, f.profissional, f.unidade, f.total.toString(), f.datas.join(', ')]);
    } else if (type === 'pacientes') {
      headers = ['Paciente', 'E-mail', 'Telefone', 'Total Agendamentos', 'Concluídos', 'Faltas', 'Retornos', 'Última Consulta'];
      rows = pacientesReport.map(p => [p.nome, p.email, p.telefone, p.totalAgendamentos.toString(), p.concluidos.toString(), p.faltas.toString(), p.retornos.toString(), p.ultimaConsulta]);
    } else if (type === 'fila') {
      headers = ['Posição', 'Paciente', 'Unidade', 'Setor', 'Prioridade', 'Status', 'Hora Chegada', 'Hora Chamada'];
      rows = filaReport.items.map(f => {
        const un = unidades.find(u => u.id === f.unidade_id);
        return [f.posicao.toString(), f.paciente_nome, un?.nome || '', f.setor, f.prioridade, f.status, f.hora_chegada, f.hora_chamada || ''];
      });
    }

    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }, [filtered, porProfissional, faltasReport, pacientesReport, filaReport, unidades, filteredAtendimentos]);

  // === EXPORT PDF ===
  const exportPDF = useCallback((type: string) => {
    const un = filterUnit !== 'all' ? unidades.find(u => u.id === filterUnit)?.nome : 'Todas';
    const prof = filterProf !== 'all' ? profissionais.find(p => p.id === filterProf)?.nome : 'Todos';
    const periodo = `${dateFrom || 'Início'} a ${dateTo || 'Atual'}`;

    let body = '';

    const summaryBlock = `
      <div class="summary">
        <div class="stat"><strong>${stats.total}</strong><small>Total Agendamentos</small></div>
        <div class="stat"><strong>${tempoStats.totalAtendimentos}</strong><small>Atendimentos</small></div>
        <div class="stat"><strong>${stats.concluidos}</strong><small>Concluídos</small></div>
        <div class="stat"><strong>${stats.faltas}</strong><small>Faltas</small></div>
        <div class="stat"><strong>${stats.cancelados}</strong><small>Cancelados</small></div>
        <div class="stat"><strong>${stats.remarcados}</strong><small>Remarcados</small></div>
        <div class="stat"><strong>${tempoStats.tempoMedio}min</strong><small>Tempo Médio</small></div>
        <div class="stat"><strong>${stats.taxaComparecimento}%</strong><small>Comparecimento</small></div>
      </div>`;

    if (type === 'agendamentos' || type === 'geral' || type === 'detalhado') {
      const rows = filtered.map(a => {
        const unName = unidades.find(u => u.id === a.unidadeId)?.nome || '';
        const at = filteredAtendimentos.find(at => at.agendamento_id === a.id);
        return `<tr><td>${a.data}</td><td>${a.hora}</td><td>${a.pacienteNome}</td><td>${a.profissionalNome}</td><td>${unName}</td><td>${a.tipo}</td><td>${statusLabels[a.status] || a.status}</td><td>${at?.hora_inicio || '-'}</td><td>${at?.hora_fim || '-'}</td><td>${at?.duracao_minutos ? at.duracao_minutos + 'min' : '-'}</td></tr>`;
      }).join('');
      const prodRows = porProfissional.map(p =>
        `<tr><td>${p.nome}</td><td>${p.unidade}</td><td>${p.pacientesAtendidos}</td><td>${p.total}</td><td>${p.concluidos}</td><td>${p.faltas}</td><td>${p.cancelados}</td><td>${p.tempoMedio ? p.tempoMedio + 'min' : '-'}</td><td>${p.taxaConclusao}%</td></tr>`
      ).join('');
      body = `${summaryBlock}
        <h2>Agendamentos Detalhados</h2>
        <table><thead><tr><th>Data</th><th>Hora</th><th>Paciente</th><th>Profissional</th><th>Unidade</th><th>Tipo</th><th>Status</th><th>Início</th><th>Fim</th><th>Duração</th></tr></thead><tbody>${rows}</tbody></table>
        <h2>Produtividade por Profissional</h2>
        <table><thead><tr><th>Profissional</th><th>Unidade</th><th>Pacientes</th><th>Total</th><th>Concluídos</th><th>Faltas</th><th>Cancelados</th><th>Tempo Médio</th><th>Taxa</th></tr></thead><tbody>${prodRows}</tbody></table>`;
    } else if (type === 'produtividade') {
      const prodRows = porProfissional.map(p =>
        `<tr><td>${p.nome}</td><td>${p.unidade}</td><td>${p.pacientesAtendidos}</td><td>${p.total}</td><td>${p.concluidos}</td><td>${p.faltas}</td><td>${p.cancelados}</td><td>${p.remarcados}</td><td>${p.retornos}</td><td>${p.tempoMedio ? p.tempoMedio + 'min' : '-'}</td><td>${p.taxaConclusao}%</td><td>${p.taxaRetorno}%</td></tr>`
      ).join('');
      body = `${summaryBlock}
        <h2>Produtividade por Profissional</h2>
        <table><thead><tr><th>Profissional</th><th>Unidade</th><th>Pacientes</th><th>Total</th><th>Concluídos</th><th>Faltas</th><th>Cancelamentos</th><th>Remarcados</th><th>Retornos</th><th>Tempo Médio</th><th>Taxa Conclusão</th><th>Taxa Retorno</th></tr></thead><tbody>${prodRows}</tbody></table>`;
    } else if (type === 'faltas') {
      const rows = faltasReport.map(f =>
        `<tr><td>${f.nome}</td><td>${f.email}</td><td>${f.telefone}</td><td>${f.profissional}</td><td>${f.unidade}</td><td>${f.total}</td><td>${f.datas.join(', ')}</td></tr>`
      ).join('');
      body = `${summaryBlock}
        <h2>Relatório de Faltas</h2>
        <table><thead><tr><th>Paciente</th><th>E-mail</th><th>Telefone</th><th>Profissional</th><th>Unidade</th><th>Total</th><th>Datas</th></tr></thead><tbody>${rows}</tbody></table>`;
    } else if (type === 'pacientes') {
      const rows = pacientesReport.map(p =>
        `<tr><td>${p.nome}</td><td>${p.email}</td><td>${p.telefone}</td><td>${p.totalAgendamentos}</td><td>${p.concluidos}</td><td>${p.faltas}</td><td>${p.retornos}</td><td>${p.ultimaConsulta}</td></tr>`
      ).join('');
      body = `${summaryBlock}
        <h2>Relatório de Pacientes</h2>
        <table><thead><tr><th>Paciente</th><th>E-mail</th><th>Telefone</th><th>Agendamentos</th><th>Concluídos</th><th>Faltas</th><th>Retornos</th><th>Última Consulta</th></tr></thead><tbody>${rows}</tbody></table>`;
    } else if (type === 'fila') {
      const filaRows = filaReport.items.map(f => {
        const unName = unidades.find(u => u.id === f.unidade_id)?.nome || '';
        return `<tr><td>${f.posicao}</td><td>${f.paciente_nome}</td><td>${unName}</td><td>${f.setor}</td><td>${f.prioridade}</td><td>${f.status}</td><td>${f.hora_chegada}</td><td>${f.hora_chamada || '-'}</td></tr>`;
      }).join('');
      body = `
        <div class="summary">
          <div class="stat"><strong>${filaReport.total}</strong><small>Total na Fila</small></div>
          <div class="stat"><strong>${filaReport.aguardando}</strong><small>Aguardando</small></div>
          <div class="stat"><strong>${filaReport.chamados}</strong><small>Chamados</small></div>
          <div class="stat"><strong>${filaReport.desistencias}</strong><small>Desistências</small></div>
        </div>
        <h2>Fila de Espera</h2>
        <table><thead><tr><th>Posição</th><th>Paciente</th><th>Unidade</th><th>Setor</th><th>Prioridade</th><th>Status</th><th>Chegada</th><th>Chamada</th></tr></thead><tbody>${filaRows}</tbody></table>`;
    }

    const titleMap: Record<string, string> = { geral: 'Relatório Geral', agendamentos: 'Relatório de Agendamentos', detalhado: 'Relatório Detalhado', produtividade: 'Relatório de Produtividade', faltas: 'Relatório de Faltas', pacientes: 'Relatório de Pacientes', fila: 'Relatório de Fila de Espera' };

    openPrintDocument(
      titleMap[type] || 'Relatório',
      body,
      { 'Período': periodo, 'Unidade': un || 'Todas', 'Profissional': prof || 'Todos' }
    );
  }, [filtered, porProfissional, faltasReport, pacientesReport, filaReport, stats, tempoStats, unidades, filteredAtendimentos, filterUnit, filterProf, dateFrom, dateTo, profissionais]);

  const clearFilters = () => {
    setFilterUnit('all'); setFilterProf('all'); setFilterStatus('all'); setFilterSetor('all'); setFilterTipo('all'); setDateFrom(''); setDateTo('');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> Relatórios
          </h1>
          <p className="text-muted-foreground text-sm">{filtered.length} agendamentos · {tempoStats.totalAtendimentos} atendimentos realizados</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => exportCSV(activeTab === 'geral' ? 'agendamentos' : activeTab)}>
            <Download className="w-4 h-4 mr-1" />CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPDF(activeTab)}>
            <FileText className="w-4 h-4 mr-1" />PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPDF(activeTab)}>
            <Printer className="w-4 h-4 mr-1" />Imprimir
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="shadow-card border-0">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Filter className="w-4 h-4 text-muted-foreground" /><span className="font-semibold text-foreground text-sm">Filtros</span></div>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-muted-foreground">Limpar filtros</Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div>
              <Label className="text-xs">Unidade</Label>
              <Select value={filterUnit} onValueChange={setFilterUnit}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todas</SelectItem>{unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Profissional</Label>
              <Select value={filterProf} onValueChange={setFilterProf}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos</SelectItem>{profissionais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos</SelectItem>{tiposUnicos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Setor</Label>
              <Select value={filterSetor} onValueChange={setFilterSetor}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos</SelectItem>{setoresUnicos.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">De</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" /></div>
            <div><Label className="text-xs">Até</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" /></div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-2">
        {[
          { label: 'Total', value: stats.total, icon: CalendarDays, color: 'text-foreground' },
          { label: 'Concluídos', value: stats.concluidos, icon: UserCheck, color: 'text-success' },
          { label: 'Pendentes', value: stats.pendentes, icon: Clock, color: 'text-warning' },
          { label: 'Faltas', value: stats.faltas, icon: AlertTriangle, color: 'text-destructive' },
          { label: 'Cancelados', value: stats.cancelados, icon: null, color: 'text-muted-foreground' },
          { label: 'Remarcados', value: stats.remarcados, icon: null, color: 'text-warning' },
          { label: 'Retornos', value: stats.retornos, icon: null, color: 'text-info' },
          { label: 'Tempo Médio', value: `${tempoStats.tempoMedio}m`, icon: Clock, color: 'text-primary' },
          { label: 'Comparecim.', value: `${stats.taxaComparecimento}%`, icon: TrendingUp, color: 'text-success' },
          { label: 'Taxa Falta', value: `${stats.taxaFalta}%`, icon: AlertTriangle, color: 'text-destructive' },
        ].map(s => (
          <Card key={s.label} className="shadow-card border-0">
            <CardContent className="p-2.5 text-center">
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="geral" className="text-xs">Geral</TabsTrigger>
          <TabsTrigger value="produtividade" className="text-xs">Produtividade</TabsTrigger>
          <TabsTrigger value="faltas" className="text-xs">Faltas</TabsTrigger>
          <TabsTrigger value="pacientes" className="text-xs">Pacientes</TabsTrigger>
          <TabsTrigger value="fila" className="text-xs">Fila de Espera</TabsTrigger>
          <TabsTrigger value="detalhado" className="text-xs">Detalhado</TabsTrigger>
        </TabsList>

        {/* === GERAL === */}
        <TabsContent value="geral" className="space-y-5 mt-4">
          {/* Timeline */}
          {timelineData.length > 1 && (
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4">Evolução por Dia</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" />
                    <XAxis dataKey="data" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="agendamentos" name="Agendamentos" stroke="hsl(199,89%,38%)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="concluidos" name="Concluídos" stroke="hsl(152,60%,42%)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="faltas" name="Faltas" stroke="hsl(0,72%,51%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4">Agendamentos por Profissional</h3>
                <ResponsiveContainer width="100%" height={Math.max(200, porProfissional.length * 40)}>
                  <BarChart data={porProfissional} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="nome" type="category" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="concluidos" name="Concluídos" stackId="a" fill="hsl(152,60%,42%)" />
                    <Bar dataKey="faltas" name="Faltas" stackId="a" fill="hsl(0,72%,51%)" />
                    <Bar dataKey="cancelados" name="Cancelados" stackId="a" fill="hsl(200,18%,46%)" />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4">Distribuição por Status</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {porUnidade.length > 1 && (
              <Card className="shadow-card border-0">
                <CardContent className="p-5">
                  <h3 className="font-semibold font-display text-foreground mb-4">Por Unidade</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={porUnidade}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" />
                      <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="concluidos" name="Concluídos" stackId="a" fill="hsl(152,60%,42%)" />
                      <Bar dataKey="faltas" name="Faltas" stackId="a" fill="hsl(0,72%,51%)" />
                      <Bar dataKey="cancelados" name="Cancelados" stackId="a" fill="hsl(200,18%,46%)" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4">Origem dos Agendamentos</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-accent rounded-xl">
                    <p className="text-2xl font-bold text-foreground">{stats.online}</p>
                    <p className="text-sm text-muted-foreground">Online</p>
                    <p className="text-xs text-muted-foreground">{stats.total > 0 ? Math.round((stats.online / stats.total) * 100) : 0}%</p>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-xl">
                    <p className="text-2xl font-bold text-foreground">{stats.recepcao}</p>
                    <p className="text-sm text-muted-foreground">Recepção</p>
                    <p className="text-xs text-muted-foreground">{stats.total > 0 ? Math.round((stats.recepcao / stats.total) * 100) : 0}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* === PRODUTIVIDADE === */}
        <TabsContent value="produtividade" className="space-y-5 mt-4">
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <h3 className="font-semibold font-display text-foreground flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary" /> Produtividade por Profissional</h3>
                <div className="flex items-center gap-2">
                  <Select value={filterRoleProd} onValueChange={setFilterRoleProd}>
                    <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Filtrar perfil" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os perfis</SelectItem>
                      <SelectItem value="profissional">Profissional</SelectItem>
                      <SelectItem value="coordenador">Coordenador</SelectItem>
                      <SelectItem value="master">Master</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => exportCSV('produtividade')}><Download className="w-3 h-3 mr-1" />CSV</Button>
                  <Button variant="ghost" size="sm" onClick={() => exportPDF('produtividade')}><FileText className="w-3 h-3 mr-1" />PDF</Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Profissional</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Total</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Concluídos</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Faltas</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Cancelados</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Remarcados</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Retornos</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Tempo Médio</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Taxa Conclusão</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Taxa Retorno</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porProfissional.map(p => {
                      const roleBadge = p.role === 'master'
                        ? { label: 'Master', class: 'bg-destructive/10 text-destructive' }
                        : p.role === 'coordenador'
                        ? { label: 'Coordenador', class: 'bg-info/10 text-info' }
                        : { label: 'Profissional', class: 'bg-success/10 text-success' };
                      return (
                        <tr key={p.id || p.nome} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2.5 px-3 text-foreground font-medium">
                            <div className="flex items-center gap-2">
                              {p.nome}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleBadge.class}`}>{roleBadge.label}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-center font-semibold">{p.total}</td>
                          <td className="py-2.5 px-2 text-center text-success font-medium">{p.concluidos}</td>
                          <td className="py-2.5 px-2 text-center text-destructive">{p.faltas}</td>
                          <td className="py-2.5 px-2 text-center text-muted-foreground">{p.cancelados}</td>
                          <td className="py-2.5 px-2 text-center text-warning">{p.remarcados}</td>
                          <td className="py-2.5 px-2 text-center text-info">{p.retornos}</td>
                          <td className="py-2.5 px-2 text-center text-primary font-medium">{p.tempoMedio ? `${p.tempoMedio}min` : '-'}</td>
                          <td className="py-2.5 px-2 text-center">
                            <Badge variant={p.taxaConclusao >= 70 ? 'default' : 'destructive'} className="text-xs">{p.taxaConclusao}%</Badge>
                          </td>
                          <td className="py-2.5 px-2 text-center text-muted-foreground">{p.taxaRetorno}%</td>
                        </tr>
                      );
                    })}
                    {porProfissional.length === 0 && <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">Nenhum dado encontrado para o período selecionado</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === FALTAS === */}
        <TabsContent value="faltas" className="space-y-5 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-destructive">{stats.faltas}</p><p className="text-xs text-muted-foreground">Total de Faltas</p></CardContent></Card>
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{faltasReport.length}</p><p className="text-xs text-muted-foreground">Pacientes com Faltas</p></CardContent></Card>
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-destructive">{stats.taxaFalta}%</p><p className="text-xs text-muted-foreground">Taxa de Faltas</p></CardContent></Card>
          </div>
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold font-display text-foreground flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" /> Faltas por Paciente</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => exportCSV('faltas')}><Download className="w-3 h-3 mr-1" />CSV</Button>
                  <Button variant="ghost" size="sm" onClick={() => exportPDF('faltas')}><FileText className="w-3 h-3 mr-1" />PDF</Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Paciente</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">E-mail</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Telefone</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Profissional</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Unidade</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Total</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Datas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faltasReport.map((f, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2.5 px-3 text-foreground font-medium">{f.nome}</td>
                        <td className="py-2.5 px-2 text-muted-foreground text-xs">{f.email || '-'}</td>
                        <td className="py-2.5 px-2 text-muted-foreground text-xs">{f.telefone || '-'}</td>
                        <td className="py-2.5 px-2 text-muted-foreground">{f.profissional}</td>
                        <td className="py-2.5 px-2 text-muted-foreground">{f.unidade}</td>
                        <td className="py-2.5 px-2 text-center"><Badge variant="destructive">{f.total}</Badge></td>
                        <td className="py-2.5 px-2 text-xs text-muted-foreground">{f.datas.join(', ')}</td>
                      </tr>
                    ))}
                    {faltasReport.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma falta registrada no período</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === PACIENTES === */}
        <TabsContent value="pacientes" className="space-y-5 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{pacientesReport.length}</p><p className="text-xs text-muted-foreground">Pacientes no Período</p></CardContent></Card>
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-info">{stats.primeiraConsulta}</p><p className="text-xs text-muted-foreground">Primeira Consulta</p></CardContent></Card>
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-secondary">{stats.retornos}</p><p className="text-xs text-muted-foreground">Retornos</p></CardContent></Card>
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{pacientesReport.length > 0 ? (filtered.length / pacientesReport.length).toFixed(1) : 0}</p><p className="text-xs text-muted-foreground">Agend./Paciente</p></CardContent></Card>
          </div>
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold font-display text-foreground flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> Pacientes</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => exportCSV('pacientes')}><Download className="w-3 h-3 mr-1" />CSV</Button>
                  <Button variant="ghost" size="sm" onClick={() => exportPDF('pacientes')}><FileText className="w-3 h-3 mr-1" />PDF</Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Paciente</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">E-mail</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Telefone</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Agendamentos</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Concluídos</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Faltas</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Retornos</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Última Consulta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pacientesReport.slice(0, 100).map(p => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2.5 px-3 text-foreground font-medium">{p.nome}</td>
                        <td className="py-2.5 px-2 text-muted-foreground text-xs">{p.email || '-'}</td>
                        <td className="py-2.5 px-2 text-muted-foreground text-xs">{p.telefone || '-'}</td>
                        <td className="py-2.5 px-2 text-center font-semibold">{p.totalAgendamentos}</td>
                        <td className="py-2.5 px-2 text-center text-success">{p.concluidos}</td>
                        <td className="py-2.5 px-2 text-center text-destructive">{p.faltas}</td>
                        <td className="py-2.5 px-2 text-center text-info">{p.retornos}</td>
                        <td className="py-2.5 px-2 text-muted-foreground">{p.ultimaConsulta}</td>
                      </tr>
                    ))}
                    {pacientesReport.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum paciente encontrado</td></tr>}
                  </tbody>
                </table>
                {pacientesReport.length > 100 && <p className="text-xs text-muted-foreground text-center mt-2">Mostrando 100 de {pacientesReport.length} — exporte para ver todos</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === FILA DE ESPERA === */}
        <TabsContent value="fila" className="space-y-5 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{filaReport.total}</p><p className="text-xs text-muted-foreground">Total na Fila</p></CardContent></Card>
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-warning">{filaReport.aguardando}</p><p className="text-xs text-muted-foreground">Aguardando</p></CardContent></Card>
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-success">{filaReport.chamados}</p><p className="text-xs text-muted-foreground">Chamados / Atendidos</p></CardContent></Card>
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-destructive">{filaReport.desistencias}</p><p className="text-xs text-muted-foreground">Desistências</p></CardContent></Card>
          </div>
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <h3 className="font-semibold font-display text-foreground flex items-center gap-2 mb-4"><ListOrdered className="w-5 h-5 text-primary" /> Registros da Fila</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">#</th>
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Paciente</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Setor</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Prioridade</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Status</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Chegada</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Chamada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filaReport.items.map(f => (
                      <tr key={f.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2.5 px-2 text-center text-muted-foreground">{f.posicao}</td>
                        <td className="py-2.5 px-3 text-foreground font-medium">{f.paciente_nome}</td>
                        <td className="py-2.5 px-2 text-muted-foreground">{f.setor || '-'}</td>
                        <td className="py-2.5 px-2">
                          <Badge variant={f.prioridade === 'urgente' ? 'destructive' : f.prioridade === 'alta' ? 'default' : 'secondary'} className="text-xs">{f.prioridade_perfil || f.prioridade}</Badge>
                        </td>
                        <td className="py-2.5 px-2">
                          <Badge variant={f.status === 'aguardando' ? 'outline' : f.status === 'atendido' ? 'default' : 'secondary'} className="text-xs">{f.status}</Badge>
                        </td>
                        <td className="py-2.5 px-2 text-muted-foreground text-xs">{f.hora_chegada}</td>
                        <td className="py-2.5 px-2 text-muted-foreground text-xs">{f.hora_chamada || '-'}</td>
                      </tr>
                    ))}
                    {filaReport.items.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum registro na fila</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === DETALHADO === */}
        <TabsContent value="detalhado" className="space-y-5 mt-4">
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold font-display text-foreground">Agendamentos Detalhados ({filtered.length})</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => exportCSV('agendamentos')}><Download className="w-3 h-3 mr-1" />CSV</Button>
                  <Button variant="ghost" size="sm" onClick={() => exportPDF('geral')}><FileText className="w-3 h-3 mr-1" />PDF</Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Data</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Hora</th>
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Paciente</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Profissional</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Unidade</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Tipo</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Status</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Origem</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Início</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Fim</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Duração</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 200).map(a => {
                      const un = unidades.find(u => u.id === a.unidadeId);
                      const at = atendimentosDB.find(at => at.agendamento_id === a.id);
                      return (
                        <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 px-2 text-foreground">{a.data}</td>
                          <td className="py-2 px-2 text-foreground">{a.hora}</td>
                          <td className="py-2 px-3 text-foreground font-medium">{a.pacienteNome}</td>
                          <td className="py-2 px-2 text-muted-foreground">{a.profissionalNome}</td>
                          <td className="py-2 px-2 text-muted-foreground text-xs">{un?.nome || ''}</td>
                          <td className="py-2 px-2"><Badge variant="outline" className="text-xs">{a.tipo}</Badge></td>
                          <td className="py-2 px-2"><Badge variant={a.status === 'concluido' ? 'default' : a.status === 'falta' ? 'destructive' : 'secondary'} className="text-xs">{statusLabels[a.status] || a.status}</Badge></td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">{a.origem}</td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">{at?.hora_inicio || '-'}</td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">{at?.hora_fim || '-'}</td>
                          <td className="py-2 px-2 text-center text-primary font-medium">{at?.duracao_minutos ? `${at.duracao_minutos}min` : '-'}</td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">Nenhum agendamento encontrado</td></tr>}
                  </tbody>
                </table>
                {filtered.length > 200 && <p className="text-xs text-muted-foreground text-center mt-2">Mostrando 200 de {filtered.length} — exporte para ver todos</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Relatorios;

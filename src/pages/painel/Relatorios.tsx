import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Download, FileText, Filter, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const COLORS = ['hsl(199, 89%, 38%)', 'hsl(168, 60%, 42%)', 'hsl(45, 93%, 47%)', 'hsl(0, 72%, 51%)', 'hsl(262, 83%, 58%)', 'hsl(200, 18%, 46%)'];

interface AtendimentoDB {
  id: string;
  agendamento_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  unidade_id: string;
  sala_id: string;
  setor: string;
  procedimento: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  duracao_minutos: number | null;
  status: string;
}

const Relatorios: React.FC = () => {
  const { agendamentos, pacientes, funcionarios, unidades } = useData();
  const { user } = useAuth();
  const [filterUnit, setFilterUnit] = useState('all');
  const [filterProf, setFilterProf] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [atendimentosDB, setAtendimentosDB] = useState<AtendimentoDB[]>([]);

  const profissionais = funcionarios.filter(f => f.role === 'profissional');

  // Load atendimentos from DB for time/productivity
  useEffect(() => {
    const load = async () => {
      try {
        let query = (supabase as any).from('atendimentos').select('*').eq('status', 'finalizado');
        if (user?.role === 'coordenador' && user.unidadeId) {
          query = query.eq('unidade_id', user.unidadeId);
        }
        if (user?.role === 'profissional' && user.id) {
          query = query.eq('profissional_id', user.id);
        }
        const { data } = await query;
        if (data) setAtendimentosDB(data);
      } catch (err) {
        console.error('Error loading atendimentos:', err);
      }
    };
    load();
  }, [user]);

  const filtered = useMemo(() => {
    return agendamentos.filter(a => {
      if (filterUnit !== 'all' && a.unidadeId !== filterUnit) return false;
      if (filterProf !== 'all' && a.profissionalId !== filterProf) return false;
      if (filterStatus !== 'all' && a.status !== filterStatus) return false;
      if (dateFrom && a.data < dateFrom) return false;
      if (dateTo && a.data > dateTo) return false;
      // Role-based filtering
      if (user?.role === 'coordenador' && user.unidadeId && a.unidadeId !== user.unidadeId) return false;
      if (user?.role === 'profissional' && user.id && a.profissionalId !== user.id) return false;
      if (user?.role === 'recepcao' && user.unidadeId && a.unidadeId !== user.unidadeId) return false;
      return true;
    });
  }, [agendamentos, filterUnit, filterProf, filterStatus, dateFrom, dateTo, user]);

  // Filter atendimentos by date range too
  const filteredAtendimentos = useMemo(() => {
    return atendimentosDB.filter(a => {
      if (filterUnit !== 'all' && a.unidade_id !== filterUnit) return false;
      if (filterProf !== 'all' && a.profissional_id !== filterProf) return false;
      if (dateFrom && a.data < dateFrom) return false;
      if (dateTo && a.data > dateTo) return false;
      return true;
    });
  }, [atendimentosDB, filterUnit, filterProf, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const confirmados = filtered.filter(a => a.status === 'confirmado').length;
    const pendentes = filtered.filter(a => a.status === 'pendente').length;
    const concluidos = filtered.filter(a => a.status === 'concluido').length;
    const emAtendimento = filtered.filter(a => a.status === 'em_atendimento').length;
    const faltas = filtered.filter(a => a.status === 'falta').length;
    const cancelados = filtered.filter(a => a.status === 'cancelado').length;
    const remarcados = filtered.filter(a => a.status === 'remarcado').length;
    const atrasos = filtered.filter(a => a.status === 'atraso').length;
    const online = filtered.filter(a => a.origem === 'online').length;
    const recepcao = filtered.filter(a => a.origem === 'recepcao').length;
    return { total, confirmados, pendentes, concluidos, emAtendimento, faltas, cancelados, remarcados, atrasos, online, recepcao };
  }, [filtered]);

  const porProfissional = useMemo(() => {
    const map: Record<string, { total: number; concluidos: number; faltas: number; tempoTotal: number; atendimentos: number }> = {};
    filtered.forEach(a => {
      if (!map[a.profissionalNome]) map[a.profissionalNome] = { total: 0, concluidos: 0, faltas: 0, tempoTotal: 0, atendimentos: 0 };
      map[a.profissionalNome].total++;
      if (a.status === 'concluido') map[a.profissionalNome].concluidos++;
      if (a.status === 'falta') map[a.profissionalNome].faltas++;
    });
    // Add time data from DB atendimentos
    filteredAtendimentos.forEach(at => {
      if (!map[at.profissional_nome]) map[at.profissional_nome] = { total: 0, concluidos: 0, faltas: 0, tempoTotal: 0, atendimentos: 0 };
      if (at.duracao_minutos && at.duracao_minutos > 0) {
        map[at.profissional_nome].tempoTotal += at.duracao_minutos;
        map[at.profissional_nome].atendimentos++;
      }
    });
    return Object.entries(map).map(([nome, d]) => ({
      nome,
      total: d.total,
      concluidos: d.concluidos,
      faltas: d.faltas,
      tempoMedio: d.atendimentos > 0 ? Math.round(d.tempoTotal / d.atendimentos) : 0,
      taxaConclusao: d.total > 0 ? Math.round((d.concluidos / d.total) * 100) : 0,
    })).sort((a, b) => b.total - a.total);
  }, [filtered, filteredAtendimentos]);

  const porUnidade = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(a => {
      const un = unidades.find(u => u.id === a.unidadeId);
      const name = un?.nome || 'Desconhecida';
      map[name] = (map[name] || 0) + 1;
    });
    return Object.entries(map).map(([nome, total]) => ({ nome, total }));
  }, [filtered, unidades]);

  const statusData = useMemo(() => [
    { name: 'Confirmados', value: stats.confirmados },
    { name: 'Pendentes', value: stats.pendentes },
    { name: 'Concluídos', value: stats.concluidos },
    { name: 'Em Atendimento', value: stats.emAtendimento },
    { name: 'Faltas', value: stats.faltas },
    { name: 'Cancelados', value: stats.cancelados },
    { name: 'Remarcados', value: stats.remarcados },
    { name: 'Atrasos', value: stats.atrasos },
  ].filter(d => d.value > 0), [stats]);

  // Global time stats
  const tempoStats = useMemo(() => {
    const finalizados = filteredAtendimentos.filter(a => a.duracao_minutos && a.duracao_minutos > 0);
    const totalMinutos = finalizados.reduce((s, a) => s + (a.duracao_minutos || 0), 0);
    const media = finalizados.length > 0 ? Math.round(totalMinutos / finalizados.length) : 0;
    return { totalAtendimentos: finalizados.length, tempoMedio: media, totalMinutos };
  }, [filteredAtendimentos]);

  const exportCSV = () => {
    const headers = ['Data', 'Hora', 'Paciente', 'Profissional', 'Unidade', 'Tipo', 'Status', 'Origem', 'Duração (min)'];
    const rows = filtered.map(a => {
      const un = unidades.find(u => u.id === a.unidadeId);
      const atDB = atendimentosDB.find(at => at.agendamento_id === a.id);
      return [a.data, a.hora, a.pacienteNome, a.profissionalNome, un?.nome || '', a.tipo, a.status, a.origem, atDB?.duracao_minutos || ''];
    });
    const csv = [headers, ...rows].map(r => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `relatorio_${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const un = filterUnit !== 'all' ? unidades.find(u => u.id === filterUnit)?.nome : 'Todas';
    const prof = filterProf !== 'all' ? profissionais.find(p => p.id === filterProf)?.nome : 'Todos';
    const rows = filtered.map(a => {
      const unName = unidades.find(u => u.id === a.unidadeId)?.nome || '';
      const atDB = atendimentosDB.find(at => at.agendamento_id === a.id);
      return `<tr><td>${a.data}</td><td>${a.hora}</td><td>${a.pacienteNome}</td><td>${a.profissionalNome}</td><td>${unName}</td><td>${a.tipo}</td><td>${a.status}</td><td>${atDB?.duracao_minutos ? atDB.duracao_minutos + 'min' : '-'}</td></tr>`;
    }).join('');
    
    const prodRows = porProfissional.map(p =>
      `<tr><td>${p.nome}</td><td>${p.total}</td><td>${p.concluidos}</td><td>${p.faltas}</td><td>${p.tempoMedio ? p.tempoMedio + 'min' : '-'}</td><td>${p.taxaConclusao}%</td></tr>`
    ).join('');

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Relatório SMS Oriximiná</title>
      <style>body{font-family:Arial,sans-serif;margin:20px}h1{font-size:18px;margin-bottom:4px}h2{font-size:14px;margin-top:20px;color:#0369a1}
      .meta{font-size:12px;color:#666;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
      th{background:#f5f5f5}
      .summary{display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap}
      .stat{background:#f0f0f0;padding:8px 12px;border-radius:6px;text-align:center}
      .stat strong{display:block;font-size:18px}
      </style></head><body>
      <h1>Relatório de Agendamentos e Produtividade — SMS Oriximiná</h1>
      <p class="meta">Período: ${dateFrom || 'Início'} a ${dateTo || 'Atual'} | Unidade: ${un} | Profissional: ${prof}</p>
      <div class="summary">
        <div class="stat"><strong>${stats.total}</strong>Total</div>
        <div class="stat"><strong>${stats.concluidos}</strong>Concluídos</div>
        <div class="stat"><strong>${stats.faltas}</strong>Faltas</div>
        <div class="stat"><strong>${stats.cancelados}</strong>Cancelados</div>
        <div class="stat"><strong>${stats.remarcados}</strong>Remarcados</div>
        <div class="stat"><strong>${tempoStats.tempoMedio}min</strong>Tempo Médio</div>
      </div>
      <h2>Agendamentos</h2>
      <table><thead><tr><th>Data</th><th>Hora</th><th>Paciente</th><th>Profissional</th><th>Unidade</th><th>Tipo</th><th>Status</th><th>Duração</th></tr></thead><tbody>${rows}</tbody></table>
      <h2>Produtividade por Profissional</h2>
      <table><thead><tr><th>Profissional</th><th>Total</th><th>Concluídos</th><th>Faltas</th><th>Tempo Médio</th><th>Taxa</th></tr></thead><tbody>${prodRows}</tbody></table>
      </body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Relatórios</h1>
          <p className="text-muted-foreground text-sm">Análises e indicadores — {filtered.length} registros</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}><Download className="w-4 h-4 mr-2" />CSV</Button>
          <Button variant="outline" onClick={exportPDF}><FileText className="w-4 h-4 mr-2" />PDF</Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="shadow-card border-0">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3"><Filter className="w-4 h-4 text-muted-foreground" /><span className="font-semibold text-foreground text-sm">Filtros</span></div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="confirmado">Confirmado</SelectItem>
                  <SelectItem value="em_atendimento">Em Atendimento</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                  <SelectItem value="falta">Falta</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                  <SelectItem value="remarcado">Remarcado</SelectItem>
                  <SelectItem value="atraso">Atraso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">De</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" /></div>
            <div><Label className="text-xs">Até</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" /></div>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-foreground' },
          { label: 'Confirmados', value: stats.confirmados, color: 'text-success' },
          { label: 'Pendentes', value: stats.pendentes, color: 'text-warning' },
          { label: 'Concluídos', value: stats.concluidos, color: 'text-info' },
          { label: 'Faltas', value: stats.faltas, color: 'text-destructive' },
          { label: 'Cancelados', value: stats.cancelados, color: 'text-muted-foreground' },
          { label: 'Remarcados', value: stats.remarcados, color: 'text-warning' },
          { label: 'Atrasos', value: stats.atrasos, color: 'text-warning' },
        ].map(s => (
          <Card key={s.label} className="shadow-card border-0">
            <CardContent className="p-3 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Time / Productivity KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-8 h-8 text-primary" />
            <div>
              <p className="text-2xl font-bold text-foreground">{tempoStats.tempoMedio}<span className="text-sm font-normal text-muted-foreground">min</span></p>
              <p className="text-xs text-muted-foreground">Tempo Médio de Atendimento</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center text-success font-bold text-sm">✓</div>
            <div>
              <p className="text-2xl font-bold text-foreground">{tempoStats.totalAtendimentos}</p>
              <p className="text-xs text-muted-foreground">Atendimentos Realizados</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-info/10 flex items-center justify-center text-info font-bold text-sm">⏱</div>
            <div>
              <p className="text-2xl font-bold text-foreground">{Math.round(tempoStats.totalMinutos / 60)}<span className="text-sm font-normal text-muted-foreground">h</span></p>
              <p className="text-xs text-muted-foreground">Horas Totais em Atendimento</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-card border-0">
          <CardContent className="p-5">
            <h3 className="font-semibold font-display text-foreground mb-4">Agendamentos por Profissional</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={porProfissional} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
                <XAxis type="number" />
                <YAxis dataKey="nome" type="category" width={120} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="total" fill="hsl(199, 89%, 38%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card border-0">
          <CardContent className="p-5">
            <h3 className="font-semibold font-display text-foreground mb-4">Por Status</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`}>
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
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={porUnidade}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
                  <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="total" fill="hsl(168, 60%, 42%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-card border-0">
          <CardContent className="p-5">
            <h3 className="font-semibold font-display text-foreground mb-4">Origem</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-muted rounded-xl">
                <p className="text-2xl font-bold text-foreground">{stats.online}</p>
                <p className="text-sm text-muted-foreground">Online</p>
              </div>
              <div className="text-center p-4 bg-muted rounded-xl">
                <p className="text-2xl font-bold text-foreground">{stats.recepcao}</p>
                <p className="text-sm text-muted-foreground">Recepção</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Produtividade por Profissional */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <h3 className="font-semibold font-display text-foreground mb-4">Produtividade por Profissional</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 text-muted-foreground font-medium">Profissional</th>
                  <th className="text-center py-2 text-muted-foreground font-medium">Total</th>
                  <th className="text-center py-2 text-muted-foreground font-medium">Concluídos</th>
                  <th className="text-center py-2 text-muted-foreground font-medium">Faltas</th>
                  <th className="text-center py-2 text-muted-foreground font-medium">Tempo Médio</th>
                  <th className="text-center py-2 text-muted-foreground font-medium">Taxa Conclusão</th>
                </tr>
              </thead>
              <tbody>
                {porProfissional.map(p => (
                  <tr key={p.nome} className="border-b last:border-0">
                    <td className="py-2 text-foreground">{p.nome}</td>
                    <td className="py-2 text-center">{p.total}</td>
                    <td className="py-2 text-center text-success">{p.concluidos}</td>
                    <td className="py-2 text-center text-destructive">{p.faltas}</td>
                    <td className="py-2 text-center text-primary font-medium">{p.tempoMedio ? `${p.tempoMedio}min` : '-'}</td>
                    <td className="py-2 text-center font-semibold">{p.taxaConclusao}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Relatorios;

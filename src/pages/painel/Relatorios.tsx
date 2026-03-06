import React, { useState, useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Download, FileText, Filter } from 'lucide-react';

const COLORS = ['hsl(199, 89%, 38%)', 'hsl(168, 60%, 42%)', 'hsl(45, 93%, 47%)', 'hsl(0, 72%, 51%)', 'hsl(262, 83%, 58%)', 'hsl(200, 18%, 46%)'];

const Relatorios: React.FC = () => {
  const { agendamentos, atendimentos, pacientes, funcionarios, unidades } = useData();
  const [filterUnit, setFilterUnit] = useState('all');
  const [filterProf, setFilterProf] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const profissionais = funcionarios.filter(f => f.role === 'profissional');

  const filtered = useMemo(() => {
    return agendamentos.filter(a => {
      if (filterUnit !== 'all' && a.unidadeId !== filterUnit) return false;
      if (filterProf !== 'all' && a.profissionalId !== filterProf) return false;
      if (filterStatus !== 'all' && a.status !== filterStatus) return false;
      if (dateFrom && a.data < dateFrom) return false;
      if (dateTo && a.data > dateTo) return false;
      return true;
    });
  }, [agendamentos, filterUnit, filterProf, filterStatus, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const confirmados = filtered.filter(a => a.status === 'confirmado').length;
    const pendentes = filtered.filter(a => a.status === 'pendente').length;
    const concluidos = filtered.filter(a => a.status === 'concluido').length;
    const faltas = filtered.filter(a => a.status === 'falta').length;
    const cancelados = filtered.filter(a => a.status === 'cancelado').length;
    const atrasos = filtered.filter(a => a.status === 'atraso').length;
    const online = filtered.filter(a => a.origem === 'online').length;
    const recepcao = filtered.filter(a => a.origem === 'recepcao').length;
    return { total, confirmados, pendentes, concluidos, faltas, cancelados, atrasos, online, recepcao };
  }, [filtered]);

  const porProfissional = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(a => { map[a.profissionalNome] = (map[a.profissionalNome] || 0) + 1; });
    return Object.entries(map).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
  }, [filtered]);

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
    { name: 'Faltas', value: stats.faltas },
    { name: 'Cancelados', value: stats.cancelados },
    { name: 'Atrasos', value: stats.atrasos },
  ].filter(d => d.value > 0), [stats]);

  const exportCSV = () => {
    const headers = ['Data', 'Hora', 'Paciente', 'Profissional', 'Unidade', 'Tipo', 'Status', 'Origem'];
    const rows = filtered.map(a => {
      const un = unidades.find(u => u.id === a.unidadeId);
      return [a.data, a.hora, a.pacienteNome, a.profissionalNome, un?.nome || '', a.tipo, a.status, a.origem];
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
      return `<tr><td>${a.data}</td><td>${a.hora}</td><td>${a.pacienteNome}</td><td>${a.profissionalNome}</td><td>${unName}</td><td>${a.tipo}</td><td>${a.status}</td></tr>`;
    }).join('');
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Relatório SMS Oriximiná</title>
      <style>body{font-family:Arial,sans-serif;margin:20px}h1{font-size:18px;margin-bottom:4px}
      .meta{font-size:12px;color:#666;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
      th{background:#f5f5f5}
      .summary{display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap}
      .stat{background:#f0f0f0;padding:8px 12px;border-radius:6px;text-align:center}
      .stat strong{display:block;font-size:18px}
      </style></head><body>
      <h1>Relatório de Agendamentos — SMS Oriximiná</h1>
      <p class="meta">Período: ${dateFrom || 'Início'} a ${dateTo || 'Atual'} | Unidade: ${un} | Profissional: ${prof}</p>
      <div class="summary">
        <div class="stat"><strong>${stats.total}</strong>Total</div>
        <div class="stat"><strong>${stats.concluidos}</strong>Concluídos</div>
        <div class="stat"><strong>${stats.faltas}</strong>Faltas</div>
        <div class="stat"><strong>${stats.cancelados}</strong>Cancelados</div>
        <div class="stat"><strong>${stats.atrasos}</strong>Atrasos</div>
      </div>
      <table><thead><tr><th>Data</th><th>Hora</th><th>Paciente</th><th>Profissional</th><th>Unidade</th><th>Tipo</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
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
                  <SelectItem value="concluido">Concluído</SelectItem>
                  <SelectItem value="falta">Falta</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-foreground' },
          { label: 'Confirmados', value: stats.confirmados, color: 'text-success' },
          { label: 'Pendentes', value: stats.pendentes, color: 'text-warning' },
          { label: 'Concluídos', value: stats.concluidos, color: 'text-info' },
          { label: 'Faltas', value: stats.faltas, color: 'text-destructive' },
          { label: 'Cancelados', value: stats.cancelados, color: 'text-muted-foreground' },
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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-card border-0">
          <CardContent className="p-5">
            <h3 className="font-semibold font-display text-foreground mb-4">Por Profissional</h3>
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

      {/* Produtividade */}
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
                  <th className="text-center py-2 text-muted-foreground font-medium">Taxa Conclusão</th>
                </tr>
              </thead>
              <tbody>
                {profissionais.map(p => {
                  const pAgs = filtered.filter(a => a.profissionalId === p.id);
                  const pConc = pAgs.filter(a => a.status === 'concluido').length;
                  const pFalt = pAgs.filter(a => a.status === 'falta').length;
                  const taxa = pAgs.length > 0 ? Math.round((pConc / pAgs.length) * 100) : 0;
                  return (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 text-foreground">{p.nome}</td>
                      <td className="py-2 text-center">{pAgs.length}</td>
                      <td className="py-2 text-center text-success">{pConc}</td>
                      <td className="py-2 text-center text-destructive">{pFalt}</td>
                      <td className="py-2 text-center font-semibold">{taxa}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Relatorios;

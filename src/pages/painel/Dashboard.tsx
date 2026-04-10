import React, { useState, useEffect, useMemo } from 'react';
import { usePacienteNomeResolver } from '@/hooks/usePacienteNomeResolver';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Users, Clock, CheckCircle, TrendingUp, XCircle, AlertTriangle, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { DashboardSkeleton } from '@/components/skeletons';

const COLORS = ['hsl(199, 89%, 38%)', 'hsl(168, 60%, 42%)', 'hsl(38, 92%, 50%)', 'hsl(280, 60%, 50%)', 'hsl(0, 72%, 51%)'];

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string; subtitle?: string; onClick?: () => void; critical?: boolean }> = ({ title, value, icon, color, subtitle, onClick, critical }) => (
  <Card className={cn("shadow-card border-0 transition-all", onClick && "cursor-pointer hover:ring-1 hover:ring-primary/30", critical && "ring-1 ring-destructive/40")} onClick={onClick}>
    <CardContent className="p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className={cn("text-2xl font-bold font-display", critical ? "text-destructive" : "text-foreground")}>{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </CardContent>
  </Card>
);

interface AtendimentoDB {
  id: string;
  profissional_nome: string;
  unidade_id: string;
  setor: string;
  data: string;
  status: string;
  duracao_minutos: number | null;
  sala_id: string;
}

const Dashboard: React.FC = () => {
  const { agendamentos, fila, funcionarios, unidades, disponibilidades, salas } = useData();
  const resolvePaciente = usePacienteNomeResolver();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [atendimentosDB, setAtendimentosDB] = useState<AtendimentoDB[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        let query = (supabase as any).from('atendimentos').select('id,profissional_nome,unidade_id,setor,data,status,duracao_minutos,sala_id').order('data', { ascending: false }).limit(1000);
        if (user?.role === 'coordenador' && user.unidadeId) query = query.eq('unidade_id', user.unidadeId);
        if (user?.role === 'recepcao' && user.unidadeId) query = query.eq('unidade_id', user.unidadeId);
        if (user?.role === 'profissional' && user.id) query = query.eq('profissional_id', user.id);
        const { data } = await query;
        if (data) setAtendimentosDB(data);
      } catch (err) {
        console.error('Error loading atendimentos for dashboard:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const today = new Date().toISOString().split('T')[0];

  const filteredAgendamentos = useMemo(() => {
    return agendamentos.filter(a => {
      if (user?.role === 'profissional' && a.profissionalId !== user.id) return false;
      if (user?.role === 'coordenador' && user.unidadeId && a.unidadeId !== user.unidadeId) return false;
      if (user?.role === 'recepcao' && user.unidadeId && a.unidadeId !== user.unidadeId) return false;
      return true;
    });
  }, [agendamentos, user]);

  const todayAg = filteredAgendamentos.filter(a => a.data === today);
  const confirmados = todayAg.filter(a => a.status === 'confirmado' || a.status === 'confirmado_chegada').length;
  const pendentes = todayAg.filter(a => a.status === 'pendente').length;
  const aguardando = fila.filter(f => f.status === 'aguardando').length;

  // KPIs
  const kpis = useMemo(() => {
    const totalAg = filteredAgendamentos.length;
    const faltas = filteredAgendamentos.filter(a => a.status === 'falta').length;
    const cancelados = filteredAgendamentos.filter(a => a.status === 'cancelado').length;
    const noShowRate = totalAg > 0 ? Math.round((faltas / totalAg) * 100) : 0;

    const finalizados = atendimentosDB.filter(a => a.status === 'finalizado' && a.duracao_minutos && a.duracao_minutos > 0);
    const avgTime = finalizados.length > 0
      ? Math.round(finalizados.reduce((s, a) => s + (a.duracao_minutos || 0), 0) / finalizados.length)
      : 0;

    // Occupancy per sala (today)
    const todayAtendimentos = atendimentosDB.filter(a => a.data === today);
    const salasAtivas = salas.filter(s => s.ativo).length;
    const salasOcupadas = new Set(todayAtendimentos.map(a => a.sala_id).filter(Boolean)).size;
    const occupancyRate = salasAtivas > 0 ? Math.round((salasOcupadas / salasAtivas) * 100) : 0;

    // Priority patients
    const prioritarios = fila.filter(f => f.prioridade === 'alta' || f.prioridade === 'urgente');
    const prioAtendidos = prioritarios.filter(f => f.status === 'atendido').length;
    const prioAguardando = prioritarios.filter(f => f.status === 'aguardando' || f.status === 'chamado').length;

    return { noShowRate, avgTime, occupancyRate, cancelados, faltas, prioAtendidos, prioAguardando, totalFinalizados: finalizados.length };
  }, [filteredAgendamentos, atendimentosDB, today, salas, fila]);

  const weekChartData = useMemo(() => {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const now = new Date();
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      // Use atendimentos (finalized) as primary source; only add agendamentos not yet in atendimentos
      const atendimentoCount = atendimentosDB.filter(a => a.data === dateStr).length;
      const agendamentoIds = new Set(atendimentosDB.filter(a => a.data === dateStr).map(a => a.id));
      const extraFromAgendamentos = filteredAgendamentos.filter(a => a.data === dateStr && (a.status === 'concluido' || a.status === 'em_atendimento') && !agendamentoIds.has(a.id)).length;
      result.push({ name: days[d.getDay()], atendimentos: atendimentoCount + extraFromAgendamentos });
    }
    return result;
  }, [atendimentosDB, filteredAgendamentos]);

  const profData = useMemo(() => {
    // Use agendamentos as the single source to avoid double-counting
    const map: Record<string, number> = {};
    filteredAgendamentos.forEach(a => {
      if (a.profissionalNome) map[a.profissionalNome] = (map[a.profissionalNome] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [filteredAgendamentos]);

  const totalAtendimentos = atendimentosDB.filter(a => a.status === 'finalizado').length;

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Dashboard Executivo</h1>
        <p className="text-muted-foreground text-sm">Visão geral e KPIs em tempo real</p>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Consultas Hoje" value={todayAg.length} icon={<Calendar className="w-5 h-5 text-primary-foreground" />} color="gradient-primary" onClick={() => navigate('/painel/agenda')} />
        <StatCard title="Confirmados/Chegou" value={confirmados} icon={<CheckCircle className="w-5 h-5 text-success-foreground" />} color="bg-success" onClick={() => navigate('/painel/agenda')} />
        <StatCard title="Na Fila" value={aguardando} icon={<Clock className="w-5 h-5 text-warning-foreground" />} color="bg-warning" onClick={() => navigate('/painel/fila')} />
        <StatCard title="Atendimentos Totais" value={totalAtendimentos} icon={<TrendingUp className="w-5 h-5 text-info-foreground" />} color="bg-info" onClick={() => navigate('/painel/atendimentos')} />
      </div>

      {/* Executive KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Taxa No-Show" 
          value={`${kpis.noShowRate}%`} 
          icon={<XCircle className="w-5 h-5 text-destructive-foreground" />} 
          color="bg-destructive"
          subtitle={`${kpis.faltas} faltas de ${filteredAgendamentos.length}`}
          onClick={() => navigate('/painel/relatorios')}
          critical={kpis.noShowRate > 20}
        />
        <StatCard 
          title="Tempo Médio" 
          value={`${kpis.avgTime}min`} 
          icon={<Clock className="w-5 h-5 text-primary-foreground" />} 
          color="gradient-primary"
          subtitle={`${kpis.totalFinalizados} atendimentos`}
          onClick={() => navigate('/painel/relatorios')}
        />
        <StatCard 
          title="Ocupação Salas" 
          value={`${kpis.occupancyRate}%`} 
          icon={<BarChart3 className="w-5 h-5 text-info-foreground" />} 
          color="bg-info"
          subtitle="Hoje"
          onClick={() => navigate('/painel/unidades')}
        />
        <StatCard 
          title="Prioritários" 
          value={kpis.prioAguardando} 
          icon={<AlertTriangle className="w-5 h-5 text-warning-foreground" />} 
          color="bg-warning"
          subtitle={`${kpis.prioAtendidos} atendidos`}
          onClick={() => navigate('/painel/fila')}
          critical={kpis.prioAguardando > 5}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-card border-0">
          <CardContent className="p-5">
            <h3 className="font-semibold font-display text-foreground mb-4">Atendimentos da Semana</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={weekChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
                <XAxis dataKey="name" tick={{ fill: 'hsl(215, 15%, 50%)' }} />
                <YAxis tick={{ fill: 'hsl(215, 15%, 50%)' }} />
                <Tooltip />
                <Bar dataKey="atendimentos" fill="hsl(199, 89%, 38%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card border-0">
          <CardContent className="p-5">
            <h3 className="font-semibold font-display text-foreground mb-4">Agendamentos por Profissional</h3>
            {profData.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                Nenhum dado disponível ainda.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={profData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`}>
                    {profData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Today's appointments summary */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <h3 className="font-semibold font-display text-foreground mb-4">Agenda de Hoje</h3>
          <div className="space-y-2">
            {todayAg.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum agendamento para hoje.</p>
            ) : (
              todayAg.sort((a, b) => a.hora.localeCompare(b.hora)).map(ag => {
                const tipoLabel = ag.tipo === 'Retorno' ? '🔄' : ag.tipo === 'Exame' ? '🔬' : '🩺';
                return (
                  <div key={ag.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-sm font-mono font-medium text-foreground w-14 shrink-0">{ag.hora}</span>
                      <span className="text-sm shrink-0" title={ag.tipo}>{tipoLabel}</span>
                      <span className="text-sm text-foreground truncate">{resolvePaciente(ag.pacienteId, ag.pacienteNome)}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap pl-0 sm:pl-0">
                      <span className="text-xs text-muted-foreground truncate max-w-[150px]">{ag.profissionalNome}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                        ag.status === 'confirmado' || ag.status === 'confirmado_chegada' ? 'bg-success/10 text-success' :
                        ag.status === 'pendente' ? 'bg-warning/10 text-warning' :
                        ag.status === 'cancelado' ? 'bg-destructive/10 text-destructive' :
                        ag.status === 'em_atendimento' ? 'bg-primary/10 text-primary' :
                        ag.status === 'concluido' ? 'bg-info/10 text-info' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {ag.status === 'confirmado_chegada' ? 'Chegou' : ag.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* System status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-card border-0">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{funcionarios.filter(f => f.role === 'profissional' && f.ativo).length}</p>
            <p className="text-xs text-muted-foreground">Profissionais Ativos</p>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{unidades.filter(u => u.ativo).length}</p>
            <p className="text-xs text-muted-foreground">Unidades Ativas</p>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{disponibilidades.length}</p>
            <p className="text-xs text-muted-foreground">Disponibilidades Configuradas</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;

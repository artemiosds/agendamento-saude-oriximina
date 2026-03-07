import React, { useState, useEffect, useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Users, Clock, CheckCircle, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '@/integrations/supabase/client';

const COLORS = ['hsl(199, 89%, 38%)', 'hsl(168, 60%, 42%)', 'hsl(38, 92%, 50%)', 'hsl(280, 60%, 50%)', 'hsl(0, 72%, 51%)'];

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string }> = ({ title, value, icon, color }) => (
  <Card className="shadow-card border-0">
    <CardContent className="p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold font-display text-foreground">{value}</p>
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
}

const Dashboard: React.FC = () => {
  const { agendamentos, fila, funcionarios, unidades, disponibilidades } = useData();
  const { user } = useAuth();
  const [atendimentosDB, setAtendimentosDB] = useState<AtendimentoDB[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await (supabase as any).from('atendimentos').select('*').order('data', { ascending: false }).limit(500);
        if (data) setAtendimentosDB(data);
      } catch (err) {
        console.error('Error loading atendimentos for dashboard:', err);
      }
    };
    load();
  }, []);

  const today = new Date().toISOString().split('T')[0];

  // Filter based on role
  const filteredAgendamentos = useMemo(() => {
    return agendamentos.filter(a => {
      if (user?.role === 'profissional' && a.profissionalId !== user.id) return false;
      if (user?.role === 'coordenador' && user.unidadeId && a.unidadeId !== user.unidadeId) return false;
      if (user?.role === 'recepcao' && user.unidadeId && a.unidadeId !== user.unidadeId) return false;
      return true;
    });
  }, [agendamentos, user]);

  const todayAg = filteredAgendamentos.filter(a => a.data === today);
  const confirmados = todayAg.filter(a => a.status === 'confirmado').length;
  const pendentes = todayAg.filter(a => a.status === 'pendente').length;
  const aguardando = fila.filter(f => f.status === 'aguardando').length;

  // Build chart from real atendimentos data
  const weekChartData = useMemo(() => {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const now = new Date();
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = atendimentosDB.filter(a => a.data === dateStr).length + 
                    filteredAgendamentos.filter(a => a.data === dateStr && (a.status === 'concluido' || a.status === 'em_atendimento')).length;
      result.push({ name: days[d.getDay()], atendimentos: count });
    }
    return result;
  }, [atendimentosDB, filteredAgendamentos]);

  // Build pie from real professionals
  const profData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredAgendamentos.forEach(a => {
      if (a.profissionalNome) {
        map[a.profissionalNome] = (map[a.profissionalNome] || 0) + 1;
      }
    });
    atendimentosDB.forEach(a => {
      if (a.profissional_nome) {
        map[a.profissional_nome] = (map[a.profissional_nome] || 0) + 1;
      }
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [filteredAgendamentos, atendimentosDB]);

  const totalAtendimentos = atendimentosDB.filter(a => a.status === 'finalizado').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Visão geral do dia</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Consultas Hoje" value={todayAg.length} icon={<Calendar className="w-5 h-5 text-primary-foreground" />} color="gradient-primary" />
        <StatCard title="Confirmados" value={confirmados} icon={<CheckCircle className="w-5 h-5 text-success-foreground" />} color="bg-success" />
        <StatCard title="Na Fila" value={aguardando} icon={<Clock className="w-5 h-5 text-warning-foreground" />} color="bg-warning" />
        <StatCard title="Atendimentos Totais" value={totalAtendimentos} icon={<TrendingUp className="w-5 h-5 text-info-foreground" />} color="bg-info" />
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
              todayAg.sort((a, b) => a.hora.localeCompare(b.hora)).map(ag => (
                <div key={ag.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-mono font-medium text-foreground w-14">{ag.hora}</span>
                  <span className="text-sm text-foreground flex-1">{ag.pacienteNome}</span>
                  <span className="text-xs text-muted-foreground">{ag.profissionalNome}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    ag.status === 'confirmado' ? 'bg-success/10 text-success' :
                    ag.status === 'pendente' ? 'bg-warning/10 text-warning' :
                    ag.status === 'cancelado' ? 'bg-destructive/10 text-destructive' :
                    ag.status === 'em_atendimento' ? 'bg-primary/10 text-primary' :
                    ag.status === 'concluido' ? 'bg-info/10 text-info' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {ag.status}
                  </span>
                </div>
              ))
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

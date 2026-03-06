import React from 'react';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Users, Clock, CheckCircle, AlertTriangle, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

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

const Dashboard: React.FC = () => {
  const { agendamentos, fila, atendimentos } = useData();

  const today = new Date().toISOString().split('T')[0];
  const todayAg = agendamentos.filter(a => a.data === today);
  const confirmados = todayAg.filter(a => a.status === 'confirmado').length;
  const pendentes = todayAg.filter(a => a.status === 'pendente').length;
  const faltas = todayAg.filter(a => a.status === 'falta').length;
  const aguardando = fila.filter(f => f.status === 'aguardando').length;

  const chartData = [
    { name: 'Seg', atendimentos: 12 },
    { name: 'Ter', atendimentos: 19 },
    { name: 'Qua', atendimentos: 15 },
    { name: 'Qui', atendimentos: 22 },
    { name: 'Sex', atendimentos: 18 },
  ];

  const pieData = [
    { name: 'Clínica Geral', value: 40 },
    { name: 'Pediatria', value: 25 },
    { name: 'Odontologia', value: 20 },
    { name: 'Enfermagem', value: 15 },
  ];
  const COLORS = ['hsl(199, 89%, 38%)', 'hsl(168, 60%, 42%)', 'hsl(38, 92%, 50%)', 'hsl(280, 60%, 50%)'];

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
        <StatCard title="Atendimentos" value={atendimentos.length} icon={<TrendingUp className="w-5 h-5 text-info-foreground" />} color="bg-info" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-card border-0">
          <CardContent className="p-5">
            <h3 className="font-semibold font-display text-foreground mb-4">Atendimentos da Semana</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
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
            <h3 className="font-semibold font-display text-foreground mb-4">Atendimentos por Setor</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
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
              todayAg.map(ag => (
                <div key={ag.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-mono font-medium text-foreground w-14">{ag.hora}</span>
                  <span className="text-sm text-foreground flex-1">{ag.pacienteNome}</span>
                  <span className="text-xs text-muted-foreground">{ag.profissionalNome}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    ag.status === 'confirmado' ? 'bg-success/10 text-success' :
                    ag.status === 'pendente' ? 'bg-warning/10 text-warning' :
                    ag.status === 'cancelado' ? 'bg-destructive/10 text-destructive' :
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
    </div>
  );
};

export default Dashboard;

import React from 'react';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Download } from 'lucide-react';

const Relatorios: React.FC = () => {
  const { atendimentos, agendamentos } = useData();

  const weekData = [
    { name: 'Seg', atendimentos: 12, faltas: 2 },
    { name: 'Ter', atendimentos: 19, faltas: 1 },
    { name: 'Qua', atendimentos: 15, faltas: 3 },
    { name: 'Qui', atendimentos: 22, faltas: 0 },
    { name: 'Sex', atendimentos: 18, faltas: 2 },
  ];

  const profData = [
    { nome: 'Dr. Carlos', atendimentos: 45 },
    { nome: 'Dra. Fernanda', atendimentos: 38 },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Relatórios</h1>
          <p className="text-muted-foreground text-sm">Análises e indicadores</p>
        </div>
        <Button variant="outline"><Download className="w-4 h-4 mr-2" />Exportar CSV</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-card border-0">
          <CardContent className="p-5">
            <h3 className="font-semibold font-display text-foreground mb-4">Atendimentos vs Faltas (Semana)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={weekData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="atendimentos" fill="hsl(199, 89%, 38%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="faltas" fill="hsl(0, 72%, 51%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card border-0">
          <CardContent className="p-5">
            <h3 className="font-semibold font-display text-foreground mb-4">Produtividade por Profissional</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={profData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
                <XAxis type="number" />
                <YAxis dataKey="nome" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="atendimentos" fill="hsl(168, 60%, 42%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <h3 className="font-semibold font-display text-foreground mb-4">Resumo</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted rounded-xl">
              <p className="text-2xl font-bold text-foreground">{atendimentos.length}</p>
              <p className="text-sm text-muted-foreground">Total Atendimentos</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-xl">
              <p className="text-2xl font-bold text-foreground">{agendamentos.length}</p>
              <p className="text-sm text-muted-foreground">Total Agendamentos</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-xl">
              <p className="text-2xl font-bold text-foreground">{agendamentos.filter(a => a.status === 'falta').length}</p>
              <p className="text-sm text-muted-foreground">Faltas</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-xl">
              <p className="text-2xl font-bold text-foreground">92%</p>
              <p className="text-sm text-muted-foreground">Taxa de Comparecimento</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Relatorios;

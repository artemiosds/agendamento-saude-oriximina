import React from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, Play, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const prioridadeColors: Record<string, string> = {
  normal: 'bg-muted text-muted-foreground',
  alta: 'bg-warning/10 text-warning',
  urgente: 'bg-destructive/10 text-destructive',
};

const statusLabels: Record<string, { label: string; color: string }> = {
  aguardando: { label: 'Aguardando', color: 'bg-warning/10 text-warning' },
  chamado: { label: 'Chamado', color: 'bg-info/10 text-info' },
  em_atendimento: { label: 'Em Atendimento', color: 'bg-success/10 text-success' },
  atendido: { label: 'Atendido', color: 'bg-muted text-muted-foreground' },
  falta: { label: 'Faltou', color: 'bg-destructive/10 text-destructive' },
};

const FilaEspera: React.FC = () => {
  const { fila, updateFila, removeFromFila } = useData();
  const sortedFila = [...fila].sort((a, b) => {
    const prioOrder = { urgente: 0, alta: 1, normal: 2 };
    if (prioOrder[a.prioridade] !== prioOrder[b.prioridade]) return prioOrder[a.prioridade] - prioOrder[b.prioridade];
    return a.horaChegada.localeCompare(b.horaChegada);
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Fila de Espera</h1>
        <p className="text-muted-foreground text-sm">{fila.filter(f => f.status === 'aguardando').length} aguardando</p>
      </div>

      <div className="space-y-2">
        {sortedFila.length === 0 ? (
          <Card className="shadow-card border-0"><CardContent className="p-8 text-center text-muted-foreground">Fila vazia.</CardContent></Card>
        ) : sortedFila.map((f, i) => (
          <Card key={f.id} className="shadow-card border-0">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">{f.pacienteNome}</p>
                <p className="text-sm text-muted-foreground">{f.setor} • Chegou: {f.horaChegada}</p>
              </div>
              <Badge className={cn('shrink-0', prioridadeColors[f.prioridade])}>{f.prioridade}</Badge>
              <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', statusLabels[f.status]?.color)}>
                {statusLabels[f.status]?.label}
              </span>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-8" onClick={() => updateFila(f.id, { status: 'chamado', horaChamada: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) })} title="Chamar">
                  <Bell className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => updateFila(f.id, { status: 'em_atendimento' })} title="Iniciar">
                  <Play className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => updateFila(f.id, { status: 'atendido' })} title="Finalizar">
                  <CheckCircle className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => updateFila(f.id, { status: 'falta' })} title="Faltou">
                  <XCircle className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default FilaEspera;

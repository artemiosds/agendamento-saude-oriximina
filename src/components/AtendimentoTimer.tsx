import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Clock, AlertTriangle } from 'lucide-react';

interface AtendimentoTimerProps {
  horaInicio: string; // HH:MM format
  tempoLimite: number; // minutes
  className?: string;
}

const AtendimentoTimer: React.FC<AtendimentoTimerProps> = ({ horaInicio, tempoLimite, className }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const [h, m] = horaInicio.split(':').map(Number);
    const startMs = new Date().setHours(h, m, 0, 0);

    const tick = () => {
      const now = Date.now();
      setElapsed(Math.max(0, Math.floor((now - startMs) / 1000)));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [horaInicio]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const limitSeconds = tempoLimite * 60;
  const warningAt = limitSeconds * 0.8; // warn at 80%
  const isWarning = elapsed >= warningAt && elapsed < limitSeconds;
  const isOver = elapsed >= limitSeconds;
  const pct = Math.min(100, (elapsed / limitSeconds) * 100);

  return (
    <div className={cn('flex items-center gap-3 p-3 rounded-xl border', 
      isOver ? 'border-destructive bg-destructive/5' : 
      isWarning ? 'border-warning bg-warning/5' : 
      'border-primary/20 bg-primary/5',
      className
    )}>
      {isOver ? (
        <AlertTriangle className="w-5 h-5 text-destructive animate-pulse shrink-0" />
      ) : (
        <Clock className={cn('w-5 h-5 shrink-0', isWarning ? 'text-warning' : 'text-primary')} />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className={cn('text-sm font-semibold font-mono',
            isOver ? 'text-destructive' : isWarning ? 'text-warning' : 'text-foreground'
          )}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
          <span className="text-xs text-muted-foreground">
            {isOver ? `Excedeu ${minutes - tempoLimite}min` : `Limite: ${tempoLimite}min`}
          </span>
        </div>
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-1000',
              isOver ? 'bg-destructive' : isWarning ? 'bg-warning' : 'bg-primary'
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default AtendimentoTimer;

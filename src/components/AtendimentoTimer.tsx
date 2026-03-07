import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Clock, AlertTriangle, Volume2 } from 'lucide-react';

interface AtendimentoTimerProps {
  horaInicio: string; // HH:MM format
  tempoLimite: number; // minutes
  agendamentoId?: string; // for localStorage persistence
  className?: string;
}

const AtendimentoTimer: React.FC<AtendimentoTimerProps> = ({ horaInicio, tempoLimite, agendamentoId, className }) => {
  const [elapsed, setElapsed] = useState(0);
  const [startMs, setStartMs] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasPlayedWarning = useRef(false);
  const hasPlayedOver = useRef(false);

  useEffect(() => {
    // Try to restore from localStorage for persistence across pages
    const storageKey = agendamentoId ? `timer_${agendamentoId}` : null;
    let resolvedStartMs: number;

    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          resolvedStartMs = parsed.startTimestamp;
        } catch {
          resolvedStartMs = calculateStartMs();
        }
      } else {
        resolvedStartMs = calculateStartMs();
      }
    } else {
      resolvedStartMs = calculateStartMs();
    }

    function calculateStartMs() {
      const [h, m] = horaInicio.split(':').map(Number);
      return new Date().setHours(h, m, 0, 0);
    }

    setStartMs(resolvedStartMs);

    const tick = () => {
      const now = Date.now();
      setElapsed(Math.max(0, Math.floor((now - resolvedStartMs) / 1000)));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [horaInicio, agendamentoId]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const hours = Math.floor(minutes / 60);
  const displayMinutes = minutes % 60;
  const limitSeconds = tempoLimite * 60;
  const warningAt5min = limitSeconds - (5 * 60); // 5 min before limit
  const warningAt80 = limitSeconds * 0.8;
  const isWarning5min = elapsed >= warningAt5min && elapsed < limitSeconds;
  const isWarning = elapsed >= warningAt80 && elapsed < limitSeconds;
  const isOver = elapsed >= limitSeconds;
  const pct = Math.min(100, (elapsed / limitSeconds) * 100);

  // Alert sounds
  useEffect(() => {
    if (isWarning5min && !hasPlayedWarning.current) {
      hasPlayedWarning.current = true;
      // Visual only - toast could be added
    }
    if (isOver && !hasPlayedOver.current) {
      hasPlayedOver.current = true;
    }
  }, [isWarning5min, isOver]);

  return (
    <div className={cn('flex items-center gap-3 p-3 rounded-xl border transition-all duration-500', 
      isOver ? 'border-destructive bg-destructive/5 animate-pulse' : 
      isWarning5min ? 'border-warning bg-warning/5' :
      isWarning ? 'border-warning/50 bg-warning/5' : 
      'border-primary/20 bg-primary/5',
      className
    )}>
      {isOver ? (
        <AlertTriangle className="w-5 h-5 text-destructive animate-pulse shrink-0" />
      ) : isWarning5min ? (
        <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
      ) : (
        <Clock className={cn('w-5 h-5 shrink-0', isWarning ? 'text-warning' : 'text-primary')} />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className={cn('text-sm font-semibold font-mono',
            isOver ? 'text-destructive' : isWarning5min ? 'text-warning' : 'text-foreground'
          )}>
            {hours > 0 && `${String(hours).padStart(2, '0')}:`}
            {String(displayMinutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
          <span className="text-xs text-muted-foreground">
            {isOver 
              ? `Excedeu ${minutes - tempoLimite}min` 
              : isWarning5min 
                ? `⚠️ ${Math.ceil((limitSeconds - elapsed) / 60)}min restantes`
                : `Limite: ${tempoLimite}min`
            }
          </span>
        </div>
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-1000',
              isOver ? 'bg-destructive' : isWarning5min ? 'bg-warning' : isWarning ? 'bg-warning/70' : 'bg-primary'
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        {isOver && (
          <p className="text-xs text-destructive mt-1 font-medium animate-pulse">
            ⚠️ Tempo de atendimento ultrapassado!
          </p>
        )}
        {isWarning5min && !isOver && (
          <p className="text-xs text-warning mt-1 font-medium">
            Atenção: faltam poucos minutos para o limite.
          </p>
        )}
      </div>
    </div>
  );
};

export default AtendimentoTimer;

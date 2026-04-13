import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar, CalendarClock, ChevronLeft, ChevronRight, Loader2, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import { cn, todayLocalStr, dateStrToUtcDate } from '@/lib/utils';
import { toast } from 'sonner';

interface SessionInfo {
  id: string;
  session_number: number;
  total_sessions: number;
  scheduled_date: string;
  status: string;
  appointment_id: string | null;
}

interface ModalAgendarSessaoProps {
  open: boolean;
  onClose: () => void;
  session: SessionInfo | null;
  cycle: {
    id: string;
    patient_id: string;
    professional_id: string;
    unit_id: string;
    treatment_type: string;
  } | null;
  pacienteNome: string;
  profissionalNome: string;
  salas: Array<{ id: string; nome: string }>;
  availableDates: string[];
  getAvailableSlots: (profId: string, unitId: string, date: string) => string[];
  onConfirm: (data: string, hora: string, salaId: string) => Promise<void>;
  onRemarcar?: (newDate: string, newHora: string, salaId: string) => Promise<void>;
  mode?: 'agendar' | 'remarcar';
  isMaster?: boolean;
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface ConflictInfo {
  date: string;
  profissionalId: string;
  profissionalNome: string;
  hora: string;
}

export const ModalAgendarSessao: React.FC<ModalAgendarSessaoProps> = ({
  open,
  onClose,
  session,
  cycle,
  pacienteNome,
  profissionalNome,
  salas,
  availableDates,
  getAvailableSlots,
  onConfirm,
  onRemarcar,
  mode = 'agendar',
  isMaster = false,
}) => {
  const todayStr = todayLocalStr();
  const suggestedDate = session?.scheduled_date || '';

  const [selectedDate, setSelectedDate] = useState('');
  const [selectedHora, setSelectedHora] = useState('');
  const [selectedSala, setSelectedSala] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [loadingConflicts, setLoadingConflicts] = useState(false);

  const [viewMonth, setViewMonth] = useState({ year: 2026, month: 0 });

  // Initialize when modal opens
  useEffect(() => {
    if (!open || !session) return;
    const base = suggestedDate && suggestedDate >= todayStr ? suggestedDate : todayStr;
    setSelectedDate(suggestedDate && suggestedDate >= todayStr ? suggestedDate : '');
    setSelectedHora('');
    setSelectedSala('');
    const d = dateStrToUtcDate(base);
    setViewMonth({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  }, [open, session?.id]);

  // Load conflicts when modal opens
  useEffect(() => {
    if (!open || !cycle) return;
    setLoadingConflicts(true);
    const loadConflicts = async () => {
      try {
        const { data } = await supabase
          .from('agendamentos')
          .select('data, profissional_id, profissional_nome, hora')
          .eq('paciente_id', cycle.patient_id)
          .not('status', 'in', '("cancelado","falta","remarcado")');
        setConflicts((data || []).map((r: any) => ({
          date: r.data,
          profissionalId: r.profissional_id,
          profissionalNome: r.profissional_nome,
          hora: r.hora,
        })));
      } catch {
        setConflicts([]);
      } finally {
        setLoadingConflicts(false);
      }
    };
    loadConflicts();
  }, [open, cycle?.patient_id]);

  const availableSet = useMemo(() => new Set(availableDates), [availableDates]);

  // Calendar days
  const calendarDays = useMemo(() => {
    const firstDay = new Date(Date.UTC(viewMonth.year, viewMonth.month, 1, 12));
    const startDow = firstDay.getUTCDay();
    const daysInMonth = new Date(Date.UTC(viewMonth.year, viewMonth.month + 1, 0, 12)).getUTCDate();
    const cells: Array<{ day: number; dateStr: string } | null> = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(Date.UTC(viewMonth.year, viewMonth.month, d, 12));
      const yyyy = dateObj.getUTCFullYear();
      const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getUTCDate()).padStart(2, '0');
      cells.push({ day: d, dateStr: `${yyyy}-${mm}-${dd}` });
    }
    return cells;
  }, [viewMonth]);

  const monthLabel = useMemo(() => {
    const d = new Date(Date.UTC(viewMonth.year, viewMonth.month, 1, 12));
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }, [viewMonth]);

  // Conflict map per date
  const conflictMap = useMemo(() => {
    const map: Record<string, { sameProf: ConflictInfo[]; otherProf: ConflictInfo[] }> = {};
    if (!cycle) return map;
    for (const c of conflicts) {
      if (!map[c.date]) map[c.date] = { sameProf: [], otherProf: [] };
      if (c.profissionalId === cycle.professional_id) {
        map[c.date].sameProf.push(c);
      } else {
        map[c.date].otherProf.push(c);
      }
    }
    return map;
  }, [conflicts, cycle?.professional_id]);

  const getDayStatus = (dateStr: string) => {
    const isPast = dateStr < todayStr;
    if (isPast && !isMaster) return 'past' as const;
    const isSuggested = dateStr === suggestedDate;
    const conflict = conflictMap[dateStr];
    const hasSameProf = conflict?.sameProf && conflict.sameProf.length > 0;
    const hasOtherProf = conflict?.otherProf && conflict.otherProf.length > 0;

    // Already scheduled for this session (green)
    if (hasSameProf && session?.appointment_id && session.status === 'agendada' && dateStr === session.scheduled_date) {
      return 'already_scheduled' as const;
    }
    // Conflict with same professional (red)
    if (hasSameProf) return 'conflict_same' as const;
    // Conflict with other professional (orange)
    if (hasOtherProf) return 'conflict_other' as const;
    // Suggested date (blue)
    if (isSuggested) return 'suggested' as const;
    // Available
    if (availableSet.has(dateStr)) return 'available' as const;
    // In remarcar mode, allow all future dates even without availability slots
    if (mode === 'remarcar' && !isPast) return 'available' as const;
    return 'unavailable' as const;
  };

  const slots = useMemo(() => {
    if (!selectedDate || !cycle) return [];
    return getAvailableSlots(cycle.professional_id, cycle.unit_id, selectedDate);
  }, [selectedDate, cycle, getAvailableSlots]);

  // Validation message for selected date
  const dateWarning = useMemo(() => {
    if (!selectedDate || !cycle) return null;
    const conflict = conflictMap[selectedDate];
    if (!conflict) return null;

    if (session?.appointment_id && session.status === 'agendada' && selectedDate === session.scheduled_date && conflict.sameProf.length > 0) {
      const hora = conflict.sameProf[0]?.hora || '';
      return {
        type: 'success' as const,
        message: `✅ Sessão já agendada para ${formatDateBR(selectedDate)}${hora ? ` às ${hora}` : ''}.`,
      };
    }

    if (conflict.sameProf.length > 0) {
      return {
        type: 'error' as const,
        message: `⚠️ Este paciente já possui agendamento com este profissional em ${formatDateBR(selectedDate)}. Confirmar gerará duplicidade.`,
      };
    }

    if (conflict.otherProf.length > 0) {
      const names = [...new Set(conflict.otherProf.map(c => c.profissionalNome))].join(', ');
      return {
        type: 'warning' as const,
        message: `ℹ️ Este paciente já possui agendamento em ${formatDateBR(selectedDate)} com ${names}. Deseja continuar?`,
      };
    }

    return null;
  }, [selectedDate, conflictMap, session, cycle]);

  const prevMonth = () => setViewMonth(p => p.month === 0 ? { year: p.year - 1, month: 11 } : { year: p.year, month: p.month - 1 });
  const nextMonth = () => setViewMonth(p => p.month === 11 ? { year: p.year + 1, month: 0 } : { year: p.year, month: p.month + 1 });

  const canGoPrev = viewMonth.year > parseInt(todayStr.substring(0, 4)) || (viewMonth.year === parseInt(todayStr.substring(0, 4)) && viewMonth.month > parseInt(todayStr.substring(5, 7)) - 1);

  const handleConfirm = async () => {
    if (!selectedDate || !selectedHora) {
      toast.error('Selecione data e horário.');
      return;
    }
    setSaving(true);
    try {
      if (mode === 'remarcar' && onRemarcar) {
        await onRemarcar(selectedDate, selectedHora, selectedSala);
      } else {
        await onConfirm(selectedDate, selectedHora, selectedSala);
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao processar.');
    } finally {
      setSaving(false);
    }
  };

  const isAlreadyScheduled = dateWarning?.type === 'success';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'remarcar' ? <CalendarClock className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
            {mode === 'remarcar' ? 'Remarcar' : 'Agendar'} Sessão {session?.session_number}/{session?.total_sessions}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Patient / Professional / Treatment info */}
          <div className="p-3 bg-muted/30 rounded-lg text-sm space-y-1">
            <p><strong>Paciente:</strong> {pacienteNome}</p>
            <p><strong>Profissional:</strong> {profissionalNome}</p>
            <p><strong>Tratamento:</strong> {cycle?.treatment_type}</p>
            {mode === 'remarcar' && session?.scheduled_date && (
              <p className="text-warning font-medium mt-1">
                Remarcando sessão de {formatDateBR(session.scheduled_date)}
              </p>
            )}
          </div>

          {/* Calendar */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
              <button onClick={prevMonth} disabled={!canGoPrev} className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', canGoPrev ? 'hover:bg-primary/10' : 'text-muted-foreground/30 cursor-not-allowed')}>
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm font-semibold capitalize">{monthLabel}</span>
              <button onClick={nextMonth} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-primary/10">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-7 px-2 pt-2">
              {WEEKDAY_LABELS.map(l => (
                <div key={l} className="text-center text-xs font-medium text-muted-foreground py-1">{l}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 px-2 pb-2 gap-y-1">
              {calendarDays.map((cell, i) => {
                if (!cell) return <div key={`b-${i}`} />;
                const { day, dateStr } = cell;
                const status = getDayStatus(dateStr);
                const isSelected = dateStr === selectedDate;
                const canClick = status !== 'past' && (isMaster || status !== 'unavailable');

                return (
                  <div key={dateStr} className="flex items-center justify-center py-0.5">
                    <button
                      disabled={!canClick}
                      onClick={() => {
                        if (canClick) {
                          setSelectedDate(dateStr);
                          setSelectedHora('');
                        }
                      }}
                      className={cn(
                        'w-9 h-9 rounded-full text-sm font-medium transition-all relative',
                        isSelected && 'ring-2 ring-primary shadow-md bg-primary text-primary-foreground',
                        !isSelected && status === 'suggested' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-200',
                        !isSelected && status === 'already_scheduled' && 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
                        !isSelected && status === 'conflict_same' && 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                        !isSelected && status === 'conflict_other' && 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
                        !isSelected && status === 'available' && 'hover:bg-primary/10 text-foreground cursor-pointer',
                        status === 'past' && 'text-muted-foreground/30 cursor-default',
                        status === 'unavailable' && 'text-muted-foreground/40 cursor-default',
                      )}
                      title={
                        status === 'suggested' ? 'Data sugerida'
                        : status === 'already_scheduled' ? 'Já agendada'
                        : status === 'conflict_same' ? 'Conflito: mesmo profissional'
                        : status === 'conflict_other' ? 'Outro agendamento nesta data'
                        : status === 'available' ? 'Disponível'
                        : status === 'past' ? 'Data passada'
                        : 'Sem disponibilidade'
                      }
                    >
                      {day}
                      {status === 'suggested' && !isSelected && (
                        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-blue-500" />
                      )}
                      {status === 'already_scheduled' && !isSelected && (
                        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-green-500" />
                      )}
                      {(status === 'conflict_same') && !isSelected && (
                        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-red-500" />
                      )}
                      {(status === 'conflict_other') && !isSelected && (
                        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-orange-500" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="border-t px-3 py-2 flex flex-wrap gap-x-3 gap-y-1 bg-muted/10">
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400" /> Sugerida
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full bg-green-400" /> Agendada
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" /> Conflito
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-400" /> Outro prof.
              </span>
            </div>
          </div>

          {/* Date warning/validation */}
          {dateWarning && (
            <div className={cn(
              'p-3 rounded-lg text-sm flex items-start gap-2 border',
              dateWarning.type === 'error' && 'bg-destructive/10 border-destructive/30 text-destructive',
              dateWarning.type === 'warning' && 'bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-300',
              dateWarning.type === 'success' && 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300',
            )}>
              {dateWarning.type === 'error' && <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
              {dateWarning.type === 'warning' && <Info className="w-4 h-4 mt-0.5 shrink-0" />}
              {dateWarning.type === 'success' && <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              <span>{dateWarning.message}</span>
            </div>
          )}

          {/* Time slots */}
          {selectedDate && !isAlreadyScheduled && (
            <div>
              <Label className="mb-2 block">Horários disponíveis em {formatDateBR(selectedDate)}:</Label>
              {slots.length === 0 ? (
                isMaster ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Sem horários pré-configurados. Como Master, digite o horário manualmente:</p>
                    <input
                      type="time"
                      value={selectedHora}
                      onChange={(e) => setSelectedHora(e.target.value)}
                      className="flex h-9 w-32 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    />
                  </div>
                ) : (
                  <p className="text-sm text-warning">Sem horários disponíveis nesta data.</p>
                )
              ) : (
                <div className="grid grid-cols-5 gap-2">
                  {slots.map(slot => {
                    const occupied = conflicts.some(c => c.date === selectedDate && c.profissionalId === cycle?.professional_id && c.hora === slot);
                    return (
                      <Button
                        key={slot}
                        size="sm"
                        variant={selectedHora === slot ? 'default' : 'outline'}
                        disabled={occupied}
                        className={cn(
                          'text-xs',
                          selectedHora === slot && 'gradient-primary text-primary-foreground',
                          occupied && 'opacity-40 line-through',
                        )}
                        onClick={() => setSelectedHora(slot)}
                      >
                        {slot}
                      </Button>
                    );
                  })}
                  {isMaster && (
                    <div className="col-span-5 mt-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Ou digite:</span>
                      <input
                        type="time"
                        value={slots.includes(selectedHora) ? "" : selectedHora}
                        onChange={(e) => setSelectedHora(e.target.value)}
                        className="flex h-9 w-32 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Sala */}
          {salas.length > 0 && selectedDate && selectedHora && (
            <div>
              <Label>Sala (opcional)</Label>
              <Select value={selectedSala || 'none'} onValueChange={v => setSelectedSala(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {salas.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Selection summary */}
          {selectedDate && selectedHora && (
            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 text-sm">
              ✅ Selecionado: <strong>{formatDateBR(selectedDate)}</strong> às <strong>{selectedHora}</strong>
            </div>
          )}

          {/* Action button */}
          <Button
            onClick={handleConfirm}
            className="w-full gradient-primary text-primary-foreground"
            disabled={!selectedDate || !selectedHora || saving}
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando...</>
            ) : isAlreadyScheduled && mode === 'agendar' ? (
              <><CalendarClock className="w-4 h-4 mr-2" /> Remarcar</>
            ) : (
              <><Calendar className="w-4 h-4 mr-2" /> {mode === 'remarcar' ? 'Confirmar Remarcação' : 'Confirmar Agendamento'}</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

function formatDateBR(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR');
}

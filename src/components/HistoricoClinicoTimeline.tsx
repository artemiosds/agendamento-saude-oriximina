import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, FileText, ChevronDown, ChevronUp, Activity, Calendar, UserCheck, Clock, X, ListOrdered, Stethoscope, AlertTriangle } from 'lucide-react';

interface TimelineEvent {
  id: string;
  type: 'consulta' | 'retorno' | 'sessao' | 'procedimento' | 'alta' | 'fila' | 'falta';
  date: string;
  time?: string;
  professional: string;
  specialtyOrType: string;
  summary: string;
  procedimentos?: string;
  unidade?: string;
  episodioTitle?: string;
  sessionInfo?: string;
  status?: string;
}

const typeConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  consulta: { icon: <Stethoscope className="w-3.5 h-3.5" />, color: 'bg-[#3B82F6] text-white', label: '1ª Consulta' },
  retorno: { icon: <Calendar className="w-3.5 h-3.5" />, color: 'bg-[#10B981] text-white', label: 'Retorno' },
  sessao: { icon: <Activity className="w-3.5 h-3.5" />, color: 'bg-[#F97316] text-white', label: 'Sessão' },
  procedimento: { icon: <ListOrdered className="w-3.5 h-3.5" />, color: 'bg-[#8B5CF6] text-white', label: 'Procedimento' },
  alta: { icon: <UserCheck className="w-3.5 h-3.5" />, color: 'bg-muted text-muted-foreground', label: 'Alta' },
  fila: { icon: <Clock className="w-3.5 h-3.5" />, color: 'bg-[#F59E0B] text-white', label: 'Entrada na Fila' },
  falta: { icon: <X className="w-3.5 h-3.5" />, color: 'bg-[#EF4444] text-white', label: 'Falta' },
};

interface Props {
  pacienteId: string;
  unidades: { id: string; nome: string }[];
  currentProfissionalId?: string;
}

export const HistoricoClinicoTimeline: React.FC<Props> = ({ pacienteId, unidades, currentProfissionalId }) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    if (!pacienteId) return;
    const load = async () => {
      setLoading(true);
      const allEvents: TimelineEvent[] = [];

      // 1. Prontuários
      const { data: prontuarios } = await (supabase as any).from('prontuarios')
        .select('id,data_atendimento,hora_atendimento,profissional_nome,queixa_principal,evolucao,procedimentos_texto,outro_procedimento,indicacao_retorno,unidade_id,episodio_id')
        .eq('paciente_id', pacienteId)
        .order('data_atendimento', { ascending: false });

      // Load episodios for titles
      const { data: episodios } = await (supabase as any).from('episodios_clinicos')
        .select('id,titulo').eq('paciente_id', pacienteId);
      const episodioMap = new Map((episodios || []).map((e: any) => [e.id, e.titulo]));

      (prontuarios || []).forEach((p: any) => {
        const unidade = unidades.find(u => u.id === p.unidade_id);
        allEvents.push({
          id: `pront_${p.id}`,
          type: 'consulta', // Will be refined below
          date: p.data_atendimento,
          time: p.hora_atendimento,
          professional: p.profissional_nome,
          specialtyOrType: 'Consulta',
          summary: p.queixa_principal || p.evolucao || '',
          procedimentos: p.procedimentos_texto,
          unidade: unidade?.nome,
          episodioTitle: p.episodio_id ? (episodioMap.get(p.episodio_id) || '') : '',
        });
      });

      // 2. Agendamentos (faltas)
      const { data: agendamentos } = await (supabase as any).from('agendamentos')
        .select('id,data,hora,profissional_nome,tipo,status,unidade_id')
        .eq('paciente_id', pacienteId)
        .eq('status', 'falta')
        .order('data', { ascending: false });

      (agendamentos || []).forEach((a: any) => {
        const unidade = unidades.find(u => u.id === a.unidade_id);
        allEvents.push({
          id: `falta_${a.id}`,
          type: 'falta',
          date: a.data,
          time: a.hora,
          professional: a.profissional_nome,
          specialtyOrType: a.tipo || 'Consulta',
          summary: 'Paciente não compareceu',
          unidade: unidade?.nome,
          status: 'falta',
        });
      });

      // 3. Treatment sessions
      const { data: treatmentSessions } = await (supabase as any).from('treatment_sessions')
        .select('id,cycle_id,session_number,total_sessions,scheduled_date,status,clinical_notes,procedure_done,professional_id')
        .eq('patient_id', pacienteId)
        .order('scheduled_date', { ascending: false });

      // Load cycle info
      const cycleIds = [...new Set((treatmentSessions || []).map((s: any) => s.cycle_id))];
      let cycleMap = new Map<string, any>();
      if (cycleIds.length > 0) {
        const { data: cyclesData } = await (supabase as any).from('treatment_cycles')
          .select('id,treatment_type,specialty,unit_id').in('id', cycleIds);
        cycleMap = new Map((cyclesData || []).map((c: any) => [c.id, c]));
      }

      (treatmentSessions || []).forEach((s: any) => {
        if (s.status === 'agendada') return; // Skip future sessions
        const cycle = cycleMap.get(s.cycle_id);
        const unidade = cycle ? unidades.find(u => u.id === cycle.unit_id) : undefined;
        allEvents.push({
          id: `session_${s.id}`,
          type: 'sessao',
          date: s.scheduled_date,
          professional: '', // Will show from cycle
          specialtyOrType: cycle?.treatment_type || 'Tratamento',
          summary: s.clinical_notes || s.procedure_done || '',
          sessionInfo: `Sessão ${s.session_number}/${s.total_sessions}`,
          unidade: unidade?.nome,
          status: s.status,
        });
      });

      // 4. Discharges
      const { data: discharges } = await (supabase as any).from('patient_discharges')
        .select('id,cycle_id,professional_id,discharge_date,reason,final_notes')
        .eq('patient_id', pacienteId)
        .order('discharge_date', { ascending: false });

      (discharges || []).forEach((d: any) => {
        const cycle = cycleMap.get(d.cycle_id);
        allEvents.push({
          id: `alta_${d.id}`,
          type: 'alta',
          date: d.discharge_date,
          professional: '',
          specialtyOrType: cycle?.treatment_type || 'Tratamento',
          summary: `${d.reason}${d.final_notes ? ' — ' + d.final_notes : ''}`,
        });
      });

      // Sort by date desc
      allEvents.sort((a, b) => b.date.localeCompare(a.date));
      setEvents(allEvents);
      setLoading(false);
    };
    load();
  }, [pacienteId, unidades]);

  const paginatedEvents = useMemo(() => events.slice(0, page * PAGE_SIZE), [events, page]);
  const hasMore = events.length > page * PAGE_SIZE;

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">Nenhum evento clínico registrado para este paciente.</p>;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-muted-foreground" /> Linha do Tempo Clínica ({events.length} evento(s))
      </h3>
      <ScrollArea className="max-h-[500px]">
        <div className="relative pl-8 space-y-3">
          <div className="absolute left-3 top-3 bottom-3 w-px bg-border" />
          {paginatedEvents.map(ev => {
            const config = typeConfig[ev.type] || typeConfig.consulta;
            const expanded = expandedId === ev.id;
            return (
              <div key={ev.id} className="relative">
                <div className={`absolute -left-5 top-2 w-7 h-7 rounded-full flex items-center justify-center ${config.color}`}>
                  {config.icon}
                </div>
                <Card className="border-0 shadow-sm ml-2">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-primary">
                            {new Date(ev.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </span>
                          {ev.time && <span className="text-xs text-muted-foreground">{ev.time}</span>}
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{config.label}</Badge>
                          {ev.episodioTitle && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">{ev.episodioTitle}</Badge>}
                          {ev.sessionInfo && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-500/30 text-orange-600">{ev.sessionInfo}</Badge>}
                        </div>
                        <p className="text-sm text-foreground mt-0.5">{ev.professional || ev.specialtyOrType}</p>
                        {ev.unidade && <p className="text-xs text-muted-foreground">{ev.unidade}</p>}
                        {ev.procedimentos && <p className="text-xs text-muted-foreground mt-1">📋 {ev.procedimentos}</p>}
                        {ev.summary && !expanded && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ev.summary.substring(0, 150)}</p>
                        )}
                      </div>
                      {ev.summary && ev.summary.length > 50 && (
                        <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => setExpandedId(expanded ? null : ev.id)}>
                          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                    </div>
                    {expanded && ev.summary && (
                      <div className="mt-2 text-xs border-t pt-2 text-foreground whitespace-pre-wrap">
                        {ev.summary}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
        {hasMore && (
          <div className="flex justify-center pt-3">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>
              Carregar mais ({events.length - paginatedEvents.length} restantes)
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

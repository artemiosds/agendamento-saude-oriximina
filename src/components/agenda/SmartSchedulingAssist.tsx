import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOperacional } from '@/contexts/OperacionalContext';
import { useAgendamentos } from '@/contexts/AgendamentosContext';
import { statusOcupaVaga } from '@/lib/appointmentCapacity';
import { isoDayOfWeek } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Info, AlertTriangle, CheckCircle2, Lightbulb, Repeat } from 'lucide-react';
import type { Paciente } from '@/types';

interface Props {
  paciente?: Paciente;
  profissionalId: string;
  profissionalNome?: string;
  unidadeId: string;
  date: string;
  hora: string;
  onSetTipo: (tipo: string) => void;
  onGoToDate: (date: string, hora?: string) => void;
}

interface CycleInfo { id: string; professional_id: string; specialty: string | null; total_sessions: number; sessions_done: number; }

const fmt = (d: string) => d.split('-').reverse().join('/');
const DIAS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

/** Assistente informativo: nunca bloqueia o agendamento. */
export function SmartSchedulingAssist({ paciente, profissionalId, profissionalNome, unidadeId, date, hora, onSetTipo, onGoToDate }: Props) {
  const { getTurnoInfo, getNextAvailableSlots } = useOperacional();
  const { agendamentos } = useAgendamentos();
  const [cycles, setCycles] = useState<CycleInfo[]>([]);

  useEffect(() => {
    let alive = true;
    setCycles([]);
    if (!paciente?.id) return;
    supabase.from('treatment_cycles')
      .select('id, professional_id, specialty, total_sessions, sessions_done')
      .eq('patient_id', paciente.id).eq('status', 'em_andamento').limit(20)
      .then(({ data, error }) => { if (alive && !error) setCycles((data as CycleInfo[]) || []); });
    return () => { alive = false; };
  }, [paciente?.id]);

  const cycleProf = cycles.find((c) => c.professional_id === profissionalId);

  const conflitos = useMemo(() => {
    if (!paciente?.id) return [];
    return agendamentos.filter((a) => a.pacienteId === paciente.id && a.data === date && statusOcupaVaga(a.status));
  }, [agendamentos, paciente?.id, date]);

  const capacidade = useMemo(() => {
    if (!profissionalId || !unidadeId) return null;
    const turnos = getTurnoInfo(profissionalId, unidadeId, date);
    const total = turnos.reduce((s, t) => s + t.vagasTotal, 0);
    if (total <= 0) return null;
    const ocupadas = agendamentos.filter((a) => a.profissionalId === profissionalId && a.unidadeId === unidadeId && a.data === date && statusOcupaVaga(a.status)).length;
    return { total, ocupadas, livres: Math.max(0, total - ocupadas) };
  }, [getTurnoInfo, agendamentos, profissionalId, unidadeId, date]);

  const sugestao = useMemo(() => {
    if (!profissionalId || !unidadeId) return null;
    if (capacidade && capacidade.livres > 0) return null;
    const next = getNextAvailableSlots(profissionalId, unidadeId, date, 6).find((s) => !s.startsWith(date));
    if (!next) return null;
    const [d, h] = next.split(' ');
    return { d, h };
  }, [capacidade, getNextAvailableSlots, profissionalId, unidadeId, date]);

  if (!paciente) return null;
  const cadastroOk = !!(paciente.cns && paciente.cpf && paciente.telefone && paciente.dataNascimento);
  const dow = isoDayOfWeek(date);

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2 text-sm" aria-label="Assistente de agendamento">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">{paciente.nome}</p>
          <p className="text-xs text-muted-foreground">
            {paciente.dataNascimento ? `Nasc. ${fmt(paciente.dataNascimento)}` : 'Nasc. não informado'} · CPF {paciente.cpf || '—'} · CNS {paciente.cns || '—'} · Tel {paciente.telefone || '—'}
          </p>
        </div>
        {cadastroOk
          ? <span className="text-xs text-success flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Cadastro básico completo</span>
          : <span className="text-xs text-warning flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Cadastro com pendência (não impede agendar)</span>}
      </div>

      {cycles.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Repeat className="w-3.5 h-3.5 text-primary" />
          <span>{cycleProf
            ? `Ciclo ativo com ${profissionalNome || 'este profissional'}: ${cycleProf.sessions_done}/${cycleProf.total_sessions} sessões realizadas.`
            : `Paciente com ${cycles.length} ciclo(s) de tratamento ativo(s) em outro(s) profissional(is).`}</span>
          {cycleProf && <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => onSetTipo('Sessão de Tratamento')}>Usar Sessão de Tratamento</Button>}
          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => onSetTipo('Retorno')}>Usar Retorno</Button>
        </div>
      )}

      {conflitos.length > 0 && (
        <p className="text-xs text-warning flex items-start gap-1">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Paciente já tem {conflitos.length} agendamento(s) em {fmt(date)}: {conflitos.map((c) => `${c.hora} ${c.profissionalNome || ''}`.trim()).join(', ')}{hora && conflitos.some((c) => c.hora === hora) ? ' — mesmo horário selecionado.' : '.'}
        </p>
      )}

      {profissionalId && dow === 5 && (
        <p className="text-xs text-muted-foreground flex items-start gap-1">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />Sexta-feira: confira se o profissional reservou o dia para pendências. Agendamento liberado.
        </p>
      )}

      {capacidade && (
        <p className={`text-xs flex items-start gap-1 ${capacidade.livres === 0 ? 'text-warning' : 'text-muted-foreground'}`}>
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {capacidade.ocupadas} de {capacidade.total} vagas ocupadas em {DIAS[dow]} {fmt(date)}{capacidade.livres === 0 ? ' — dia lotado; segue as regras atuais de encaixe.' : ` (${capacidade.livres} livre(s)).`}
        </p>
      )}

      {sugestao && (
        <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" onClick={() => onGoToDate(sugestao.d, sugestao.h)}>
          <Lightbulb className="w-3.5 h-3.5 mr-1" />Próxima vaga livre: {DIAS[isoDayOfWeek(sugestao.d)]} {fmt(sugestao.d)} às {sugestao.h}
        </Button>
      )}
    </div>
  );
}

import { useCallback } from 'react';
import { useData } from '@/contexts/DataContext';
import { useWebhookNotify } from '@/hooks/useWebhookNotify';
import { toast } from 'sonner';

const RESERVA_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface SlotInfo {
  data: string;
  hora: string;
  profissionalId: string;
  profissionalNome: string;
  unidadeId: string;
  salaId?: string;
  tipo?: string;
  agendamentoOrigemId?: string;
}

export function useFilaAutomatica() {
  const {
    fila, pacientes, funcionarios, unidades,
    updateFila, addAgendamento, logAction, refreshFila, refreshAgendamentos,
  } = useData();
  const { notify } = useWebhookNotify();

  /**
   * Find the next eligible patient in the queue for a given slot,
   * sorted by priority then entry time.
   */
  const getNextInQueue = useCallback((profissionalId: string, unidadeId: string) => {
    const priorityRank: Record<string, number> = {
      urgente: 0, gestante: 1, idoso: 2, alta: 3, pcd: 4, crianca: 5, normal: 6,
    };

    return [...fila]
      .filter(f =>
        f.status === 'aguardando' &&
        f.unidadeId === unidadeId &&
        (!f.profissionalId || f.profissionalId === profissionalId)
      )
      .sort((a, b) => {
        const aRank = priorityRank[a.prioridade] ?? 99;
        const bRank = priorityRank[b.prioridade] ?? 99;
        if (aRank !== bRank) return aRank - bRank;
        return a.horaChegada.localeCompare(b.horaChegada);
      });
  }, [fila]);

  /**
   * Notify the next patient in queue about an available slot.
   * Marks the queue entry as "chamado" and sets a 30-min reservation timer.
   * Returns true if someone was notified, false if queue was empty.
   */
  const chamarProximoDaFila = useCallback(async (slot: SlotInfo, user?: any): Promise<boolean> => {
    const candidates = getNextInQueue(slot.profissionalId, slot.unidadeId);
    if (candidates.length === 0) return false;

    const next = candidates[0];
    const pac = pacientes.find(p => p.id === next.pacienteId);
    const unidade = unidades.find(u => u.id === slot.unidadeId);
    const prof = funcionarios.find(f => f.id === slot.profissionalId);

    // Mark as "chamado" with reservation timestamp
    const agora = new Date();
    const horaChamada = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    await updateFila(next.id, {
      status: 'chamado',
      horaChamada,
      observacoes: `Vaga disponível: ${slot.data} às ${slot.hora} com ${slot.profissionalNome}. Reserva expira em 30min.`,
    });

    // Log the queue call
    await logAction({
      acao: 'fila_vaga_liberada',
      entidade: 'fila_espera',
      entidadeId: next.id,
      user,
      unidadeId: slot.unidadeId,
      detalhes: {
        pacienteNome: next.pacienteNome,
        profissionalNome: slot.profissionalNome,
        data: slot.data,
        hora: slot.hora,
        motivo: slot.agendamentoOrigemId ? 'cancelamento/falta' : 'manual',
      },
    });

    // Send notification via webhook + email
    await notify({
      evento: 'vaga_liberada',
      paciente_nome: next.pacienteNome,
      telefone: pac?.telefone || '',
      email: pac?.email || '',
      data_consulta: slot.data,
      hora_consulta: slot.hora,
      unidade: unidade?.nome || '',
      profissional: prof?.nome || slot.profissionalNome,
      tipo_atendimento: slot.tipo || 'Consulta',
      status_agendamento: 'aguardando',
      id_agendamento: slot.agendamentoOrigemId || '',
      observacoes: `Vaga disponível. Confirme em até 30 minutos.`,
    });

    toast.info(`Vaga notificada para ${next.pacienteNome} (fila de espera). Reserva de 30 min.`);

    // Set reservation expiry timer
    const reservaKey = `fila_reserva_${next.id}`;
    localStorage.setItem(reservaKey, JSON.stringify({
      filaId: next.id,
      slot,
      expiresAt: agora.getTime() + RESERVA_TIMEOUT_MS,
    }));

    // Auto-expire after 30 min
    setTimeout(async () => {
      const stored = localStorage.getItem(reservaKey);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      // Check if still in "chamado" status (not confirmed yet)
      localStorage.removeItem(reservaKey);
      // We can't reliably check current state from a timer in React,
      // so we'll handle expiration check on the FilaEspera page
    }, RESERVA_TIMEOUT_MS);

    return true;
  }, [getNextInQueue, pacientes, unidades, funcionarios, updateFila, logAction, notify]);

  /**
   * Confirm a queue patient into the slot — creates the appointment.
   */
  const confirmarEncaixe = useCallback(async (filaId: string, slot: SlotInfo, user?: any) => {
    const filaItem = fila.find(f => f.id === filaId);
    if (!filaItem) return;

    const agId = `ag${Date.now()}`;
    await addAgendamento({
      id: agId,
      pacienteId: filaItem.pacienteId,
      pacienteNome: filaItem.pacienteNome,
      unidadeId: slot.unidadeId,
      salaId: slot.salaId || '',
      setorId: '',
      profissionalId: slot.profissionalId,
      profissionalNome: slot.profissionalNome,
      data: slot.data,
      hora: slot.hora,
      status: 'confirmado',
      tipo: slot.tipo || 'Consulta',
      observacoes: 'Encaixe automático da fila de espera',
      origem: 'recepcao',
      criadoEm: new Date().toISOString(),
      criadoPor: user?.id || 'sistema',
    });

    await updateFila(filaId, { status: 'encaixado' });

    // Remove reservation
    localStorage.removeItem(`fila_reserva_${filaId}`);

    await logAction({
      acao: 'fila_encaixe_confirmado',
      entidade: 'fila_espera',
      entidadeId: filaId,
      user,
      unidadeId: slot.unidadeId,
      detalhes: {
        pacienteNome: filaItem.pacienteNome,
        agendamentoId: agId,
        data: slot.data,
        hora: slot.hora,
      },
    });

    const pac = pacientes.find(p => p.id === filaItem.pacienteId);
    const unidade = unidades.find(u => u.id === slot.unidadeId);
    await notify({
      evento: 'novo_agendamento',
      paciente_nome: filaItem.pacienteNome,
      telefone: pac?.telefone || '',
      email: pac?.email || '',
      data_consulta: slot.data,
      hora_consulta: slot.hora,
      unidade: unidade?.nome || '',
      profissional: slot.profissionalNome,
      tipo_atendimento: slot.tipo || 'Consulta',
      status_agendamento: 'confirmado',
      id_agendamento: agId,
      observacoes: 'Encaixe da fila de espera confirmado.',
    });

    toast.success(`${filaItem.pacienteNome} encaixado na agenda!`);
    await refreshAgendamentos();
    await refreshFila();
  }, [fila, pacientes, unidades, addAgendamento, updateFila, logAction, notify, refreshAgendamentos, refreshFila]);

  /**
   * Expire a reservation — return patient to "aguardando" and call next.
   */
  const expirarReserva = useCallback(async (filaId: string, slot: SlotInfo, user?: any) => {
    await updateFila(filaId, {
      status: 'aguardando',
      observacoes: 'Reserva expirada — não confirmou no prazo.',
    });

    localStorage.removeItem(`fila_reserva_${filaId}`);

    const filaItem = fila.find(f => f.id === filaId);
    await logAction({
      acao: 'fila_reserva_expirada',
      entidade: 'fila_espera',
      entidadeId: filaId,
      user,
      unidadeId: slot.unidadeId,
      detalhes: {
        pacienteNome: filaItem?.pacienteNome || '',
        data: slot.data,
        hora: slot.hora,
      },
    });

    toast.warning(`Reserva de ${filaItem?.pacienteNome} expirou. Chamando próximo...`);

    // Call next in queue
    await chamarProximoDaFila(slot, user);
  }, [fila, updateFila, logAction, chamarProximoDaFila]);

  /**
   * Handle slot freed by cancellation or no-show.
   * Called from Agenda when status changes to "cancelado" or "falta".
   */
  const handleVagaLiberada = useCallback(async (agendamento: {
    id: string;
    data: string;
    hora: string;
    profissionalId: string;
    profissionalNome: string;
    unidadeId: string;
    salaId?: string;
    tipo: string;
  }, motivo: 'cancelamento' | 'falta', user?: any) => {
    await logAction({
      acao: `vaga_liberada_${motivo}`,
      entidade: 'agendamento',
      entidadeId: agendamento.id,
      user,
      unidadeId: agendamento.unidadeId,
      detalhes: {
        data: agendamento.data,
        hora: agendamento.hora,
        profissionalNome: agendamento.profissionalNome,
      },
    });

    const called = await chamarProximoDaFila({
      data: agendamento.data,
      hora: agendamento.hora,
      profissionalId: agendamento.profissionalId,
      profissionalNome: agendamento.profissionalNome,
      unidadeId: agendamento.unidadeId,
      salaId: agendamento.salaId,
      tipo: agendamento.tipo,
      agendamentoOrigemId: agendamento.id,
    }, user);

    if (!called) {
      toast.info('Nenhum paciente na fila de espera para esta vaga.');
    }

    return called;
  }, [logAction, chamarProximoDaFila]);

  return {
    getNextInQueue,
    chamarProximoDaFila,
    confirmarEncaixe,
    expirarReserva,
    handleVagaLiberada,
  };
}

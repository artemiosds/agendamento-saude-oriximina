import type { Agendamento } from '@/types';

type RpcResponse = { data: Record<string, unknown> | null; error: { message?: string; code?: string } | null };
export type TreatmentOperationRpcClient = { rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResponse> };

export interface TreatmentSessionOperationResult {
  status: 'agendado' | 'ja_agendado' | 'remarcado' | 'desmarcado';
  session: { status?: string; appointment_id?: string | null; scheduled_date?: string };
  appointment: Agendamento | null;
}

export interface AgendaMutationBridge {
  addAgendamentoTransactionally: (
    appointment: Agendamento,
    persist: (normalized: Agendamento) => Promise<{ appointment: Agendamento; created: boolean }>,
  ) => Promise<{ appointment: Agendamento; created: boolean }>;
  deleteAgendamentoTransactionally: (appointmentId: string, persist: () => Promise<void>) => Promise<void>;
  applyTreatmentAgendamentoUpdate: (appointment: Agendamento) => void;
}

export interface TreatmentSessionOperationsDependencies {
  client: TreatmentOperationRpcClient;
  agenda: AgendaMutationBridge;
  findDuplicate: (input: {
    patientId: string;
    professionalId?: string;
    date: string;
    time: string;
    exceptAppointmentId?: string;
  }) => Promise<{ professionalName?: string } | null>;
  ensurePatientCanBeScheduled: (patientId: string, professionalId: string) => Promise<void>;
  isDateBlocked: (date: string, professionalId: string, unitId: string) => Promise<boolean>;
}

function throwRpcError(error: { message?: string; code?: string }): never {
  const safeMessages: Record<string, string> = {
    '42501': 'Você não tem permissão para realizar esta operação nesta unidade/profissional.',
    '40001': 'A sessão mudou durante a operação. Recarregue o ciclo e tente novamente.',
    '23505': 'Já existe um agendamento conflitante para este horário.',
    '23503': 'O vínculo entre a sessão e o agendamento não é válido.',
  };
  const message = error.code ? safeMessages[error.code] : undefined;
  if (message) throw new Error(message);
  throw new Error('Não foi possível concluir a operação da sessão. Verifique a conexão e tente novamente.');
}

type AppointmentRow = Record<string, unknown>;

function rowString(row: AppointmentRow, key: string, fallback = ''): string {
  const value = row[key];
  return typeof value === 'string' ? value : fallback;
}

function fromAppointmentRow(row: AppointmentRow): Agendamento {
  if (!row || typeof row !== 'object') throw new Error('A operação não retornou o agendamento confirmado.');
  return {
    id: rowString(row, 'id'),
    pacienteId: rowString(row, 'paciente_id'),
    pacienteNome: rowString(row, 'paciente_nome'),
    unidadeId: rowString(row, 'unidade_id'),
    salaId: rowString(row, 'sala_id'),
    setorId: rowString(row, 'setor_id'),
    profissionalId: rowString(row, 'profissional_id'),
    profissionalNome: rowString(row, 'profissional_nome'),
    data: rowString(row, 'data'),
    hora: rowString(row, 'hora'),
    status: rowString(row, 'status') as Agendamento['status'],
    tipo: rowString(row, 'tipo'),
    observacoes: rowString(row, 'observacoes'),
    origem: rowString(row, 'origem', 'recepcao') as Agendamento['origem'],
    googleEventId: rowString(row, 'google_event_id'),
    syncStatus: rowString(row, 'sync_status') as Agendamento['syncStatus'],
    criadoEm: rowString(row, 'criado_em'),
    criadoPor: rowString(row, 'criado_por'),
    horaChegada: rowString(row, 'hora_chegada'),
  };
}

function appointmentToRow(appointment: Agendamento) {
  return {
    id: appointment.id,
    paciente_id: appointment.pacienteId,
    paciente_nome: appointment.pacienteNome,
    unidade_id: appointment.unidadeId,
    sala_id: appointment.salaId || '',
    setor_id: appointment.setorId || '',
    profissional_id: appointment.profissionalId,
    profissional_nome: appointment.profissionalNome,
    data: appointment.data,
    hora: appointment.hora,
    status: appointment.status,
    tipo: appointment.tipo,
    observacoes: appointment.observacoes,
    origem: appointment.origem,
    google_event_id: appointment.googleEventId || '',
    sync_status: appointment.syncStatus || 'pendente',
    criado_por: appointment.criadoPor || '',
  };
}

function requireOperationResult(data: Record<string, unknown> | null, accepted: string[]): TreatmentSessionOperationResult {
  const status = typeof data?.status === 'string' ? data.status : '';
  if (!data || !accepted.includes(status)) {
    const messages: Record<string, string> = {
      duplicado: 'Já existe um agendamento ativo para este paciente, profissional e horário.',
      data_bloqueada: 'Data bloqueada.',
      fora_escopo: 'Você não tem permissão para realizar esta operação nesta unidade/profissional.',
      sessao_ja_vinculada: 'Esta sessão já está vinculada a outro agendamento. Recarregue o ciclo.',
      vinculo_inconsistente: 'O vínculo entre a sessão e o agendamento está inconsistente. Nenhum dado foi alterado.',
      estado_protegido: 'O estado atual da sessão não permite esta operação.',
      conflito: 'A sessão foi alterada por outra pessoa. Recarregue o ciclo e tente novamente.',
      nao_encontrado: 'A sessão não foi encontrada. Recarregue o ciclo e tente novamente.',
      payload_invalido: 'Os dados enviados para o agendamento são inválidos.',
    };
    const reason = typeof data?.reason === 'string' ? data.reason : 'estado_inconsistente';
    throw new Error(messages[status] || `A operação não foi concluída (${reason}). Recarregue o ciclo e tente novamente.`);
  }
  const appointment = data.appointment && typeof data.appointment === 'object'
    ? fromAppointmentRow(data.appointment as AppointmentRow)
    : null;
  return {
    status: status as TreatmentSessionOperationResult['status'],
    session: data.session && typeof data.session === 'object'
      ? data.session as TreatmentSessionOperationResult['session']
      : {},
    appointment,
  };
}

export function createTreatmentSessionOperations(deps: TreatmentSessionOperationsDependencies) {
  return {
    async schedule(input: {
      session: { id: string; cycle_id: string; patient_id: string; professional_id: string; scheduled_date: string; status: string; appointment_id: string | null };
      cycle: { id: string; patient_id: string; professional_id: string; unit_id: string; status: string };
      appointment: Agendamento;
      duplicateScope: 'patient' | 'patient_professional';
      checkPatientAbsenceBlock?: boolean;
    }): Promise<TreatmentSessionOperationResult> {
      const duplicate = await deps.findDuplicate({
        patientId: input.cycle.patient_id,
        professionalId: input.duplicateScope === 'patient_professional' ? input.cycle.professional_id : undefined,
        date: input.appointment.data,
        time: input.appointment.hora,
      });
      if (duplicate) {
        const date = new Date(`${input.appointment.data}T12:00:00`).toLocaleDateString('pt-BR');
        if (input.duplicateScope === 'patient') {
          throw new Error(`Este paciente já possui agendamento em ${date} às ${input.appointment.hora}${duplicate.professionalName ? ` com ${duplicate.professionalName}` : ''}. Escolha outro horário.`);
        }
        throw new Error('Já existe um agendamento para este paciente, profissional e horário.');
      }
      if (input.checkPatientAbsenceBlock) {
        await deps.ensurePatientCanBeScheduled(input.cycle.patient_id, input.cycle.professional_id);
      }

      let rpcResult: TreatmentSessionOperationResult | undefined;
      await deps.agenda.addAgendamentoTransactionally(input.appointment, async (normalized) => {
        const { data, error } = await deps.client.rpc('schedule_treatment_session', {
          p_session_id: input.session.id,
          p_cycle_id: input.cycle.id,
          p_expected_session_date: input.session.scheduled_date,
          p_appointment: appointmentToRow(normalized),
          p_check_patient_conflict: input.duplicateScope === 'patient',
        });
        if (error) throwRpcError(error);
        rpcResult = requireOperationResult(data, ['agendado', 'ja_agendado']);
        if (!rpcResult.appointment) throw new Error('A operação não retornou o vínculo da sessão com a Agenda.');
        return { appointment: rpcResult.appointment, created: rpcResult.status === 'agendado' };
      });
      if (!rpcResult) throw new Error('A operação não retornou confirmação do banco.');
      return rpcResult;
    },

    async reschedule(input: {
      session: { id: string; cycle_id: string; patient_id: string; professional_id: string; scheduled_date: string; status: string; appointment_id: string | null };
      cycle: { id: string; patient_id: string; professional_id: string; unit_id: string; status: string };
      newDate: string;
      newTime?: string;
      checkPatientConflict?: boolean;
      bypassBlockCheck?: boolean;
    }): Promise<TreatmentSessionOperationResult> {
      if (input.checkPatientConflict && input.newTime) {
        const duplicate = await deps.findDuplicate({
          patientId: input.cycle.patient_id,
          date: input.newDate,
          time: input.newTime,
          exceptAppointmentId: input.session.appointment_id || undefined,
        });
        if (duplicate) {
          const date = new Date(`${input.newDate}T12:00:00`).toLocaleDateString('pt-BR');
          throw new Error(`Este paciente já possui agendamento em ${date} às ${input.newTime}${duplicate.professionalName ? ` com ${duplicate.professionalName}` : ''}. Escolha outro horário.`);
        }
      }
      if (!input.bypassBlockCheck && await deps.isDateBlocked(input.newDate, input.cycle.professional_id, input.cycle.unit_id)) {
        throw new Error('Data bloqueada.');
      }
      const { data, error } = await deps.client.rpc('reschedule_treatment_session', {
        p_session_id: input.session.id,
        p_cycle_id: input.cycle.id,
        p_expected_session_date: input.session.scheduled_date,
        p_expected_appointment_id: input.session.appointment_id,
        p_new_date: input.newDate,
        p_new_time: input.newTime || null,
        p_check_patient_conflict: !!input.checkPatientConflict,
      });
      if (error) throwRpcError(error);
      const result = requireOperationResult(data, ['remarcado']);
      if (result.appointment) {
        deps.agenda.applyTreatmentAgendamentoUpdate(result.appointment);
      }
      return result;
    },

    async unschedule(input: {
      session: { id: string; cycle_id: string; patient_id: string; professional_id: string; scheduled_date: string; status: string; appointment_id: string | null };
      cycle: { id: string; patient_id: string; professional_id: string; unit_id: string; status: string };
    }): Promise<TreatmentSessionOperationResult> {
      if (!input.session.appointment_id) {
        throw new Error('Vínculo inconsistente: o agendamento da sessão não foi encontrado. Nenhum dado foi alterado.');
      }
      let rpcResult: TreatmentSessionOperationResult | undefined;
      await deps.agenda.deleteAgendamentoTransactionally(input.session.appointment_id, async () => {
        const { data, error } = await deps.client.rpc('unschedule_treatment_session', {
          p_session_id: input.session.id,
          p_cycle_id: input.cycle.id,
          p_expected_appointment_id: input.session.appointment_id,
          p_expected_session_date: input.session.scheduled_date,
        });
        if (error) throwRpcError(error);
        rpcResult = requireOperationResult(data, ['desmarcado']);
      });
      if (!rpcResult) throw new Error('A operação não retornou confirmação do banco.');
      return rpcResult;
    },
  };
}

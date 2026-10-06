export interface TreatmentSessionLinkSnapshot {
  status: string;
  appointment_id: string | null;
  patient_id: string;
  professional_id: string;
  scheduled_date: string;
}

export interface TreatmentAppointmentSnapshot {
  id: string;
  paciente_id: string;
  profissional_id: string;
  unidade_id: string;
  data: string;
  hora?: string;
  status: string;
}

export type TreatmentSessionIntegrityState =
  | { kind: 'pendente' }
  | { kind: 'agendada'; appointment: TreatmentAppointmentSnapshot }
  | { kind: 'possivel_sem_vinculo'; candidates: TreatmentAppointmentSnapshot[] }
  | { kind: 'appointment_id_inexistente'; appointmentId: string }
  | { kind: 'vinculo_divergente'; appointment: TreatmentAppointmentSnapshot | null; reason: string }
  | { kind: 'estado_protegido' };

const INACTIVE_APPOINTMENT_STATUSES = new Set(['cancelado', 'falta', 'remarcado']);
// Sessões encerradas (atendidas ou com falta registrada) são histórico clínico e não exigem vínculo ativo.
const PROTECTED_SESSION_STATUSES = new Set(['realizada', 'falta', 'paciente_faltou']);

export function isActiveTreatmentAppointmentStatus(status: string): boolean {
  return !INACTIVE_APPOINTMENT_STATUSES.has(status.trim().toLocaleLowerCase());
}

export function resolveTreatmentSessionIntegrity(input: {
  session: TreatmentSessionLinkSnapshot;
  unitId: string;
  appointmentById: TreatmentAppointmentSnapshot | null;
  sameDayCandidates: TreatmentAppointmentSnapshot[];
}): TreatmentSessionIntegrityState {
  const { session, unitId, appointmentById, sameDayCandidates } = input;

  if (PROTECTED_SESSION_STATUSES.has(String(session.status || '').trim().toLocaleLowerCase())) {
    return { kind: 'estado_protegido' };
  }

  if (session.appointment_id) {
    if (!appointmentById) {
      return { kind: 'appointment_id_inexistente', appointmentId: session.appointment_id };
    }
    const identityMatches = appointmentById.id === session.appointment_id
      && appointmentById.paciente_id === session.patient_id
      && appointmentById.profissional_id === session.professional_id
      && appointmentById.unidade_id === unitId
      && appointmentById.data === session.scheduled_date;
    if (!identityMatches || !isActiveTreatmentAppointmentStatus(appointmentById.status)) {
      return { kind: 'vinculo_divergente', appointment: appointmentById, reason: 'identidade_data_ou_status' };
    }
    if (session.status !== 'agendada') {
      return { kind: 'vinculo_divergente', appointment: appointmentById, reason: 'status_da_sessao' };
    }
    return { kind: 'agendada', appointment: appointmentById };
  }

  if (session.status === 'agendada') {
    return { kind: 'vinculo_divergente', appointment: null, reason: 'appointment_id_ausente' };
  }
  if (session.status !== 'pendente_agendamento') return { kind: 'estado_protegido' };

  const candidates = sameDayCandidates.filter((appointment) =>
    appointment.paciente_id === session.patient_id
    && appointment.profissional_id === session.professional_id
    && appointment.unidade_id === unitId
    && appointment.data === session.scheduled_date
    && isActiveTreatmentAppointmentStatus(appointment.status),
  );
  return candidates.length > 0
    ? { kind: 'possivel_sem_vinculo', candidates }
    : { kind: 'pendente' };
}

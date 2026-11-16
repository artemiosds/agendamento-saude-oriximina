export interface AppointmentScopeRecord {
  id: string;
}

export interface TriageAppointmentRecord {
  agendamento_id: string;
}

export interface ReportPatientAppointmentRecord {
  pacienteId?: string | null;
}

export interface AppointmentSectorRecord extends AppointmentScopeRecord {
  setor_id?: string | null;
}

export interface AttendanceSectorRecord {
  agendamento_id: string;
  setor?: string | null;
}

export const filterAppointmentsToSectorScope = <T extends AppointmentSectorRecord>(
  appointments: T[],
  attendances: AttendanceSectorRecord[],
  sector: string,
): T[] => {
  if (sector === 'all') return appointments;
  const appointmentIdsInSector = new Set(attendances
    .filter(attendance => attendance.setor?.trim() === sector)
    .map(attendance => attendance.agendamento_id));
  return appointments.filter(appointment => appointmentIdsInSector.has(appointment.id));
};

/** Keeps triage reporting inside the appointment scope already authorized and filtered by the report. */
export const filterTriagesToAppointmentScope = <T extends TriageAppointmentRecord>(
  triages: T[],
  appointments: AppointmentScopeRecord[],
): T[] => {
  const scopedAppointmentIds = new Set(appointments.map(appointment => appointment.id));
  return triages.filter(triage => scopedAppointmentIds.has(triage.agendamento_id));
};

/** Returns the distinct patient cohort represented by the already-filtered report rows. */
export const getPatientIdsInReportScope = <T extends ReportPatientAppointmentRecord>(
  records: T[],
): Set<string> => new Set(records
  .map(record => record.pacienteId)
  .filter((patientId): patientId is string => Boolean(patientId)));

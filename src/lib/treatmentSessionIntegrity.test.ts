import { describe, expect, it } from 'vitest';
import { resolveTreatmentSessionIntegrity, type TreatmentAppointmentSnapshot } from './treatmentSessionIntegrity';

const session = (patch: Record<string, unknown> = {}) => ({
  status: 'pendente_agendamento',
  appointment_id: null as string | null,
  patient_id: 'patient-1',
  professional_id: 'staff-1',
  scheduled_date: '2026-10-01',
  ...patch,
});

const appointment: TreatmentAppointmentSnapshot = {
  id: 'appointment-1',
  paciente_id: 'patient-1',
  profissional_id: 'staff-1',
  unidade_id: 'unit-1',
  data: '2026-10-01',
  status: 'confirmado',
};

describe('resolveTreatmentSessionIntegrity', () => {
  it('keeps an unlinked session pending when no exact candidate exists', () => {
    expect(resolveTreatmentSessionIntegrity({
      session: session(), unitId: 'unit-1', appointmentById: null, sameDayCandidates: [],
    })).toEqual({ kind: 'pendente' });
  });

  it('classifies a similar same-day appointment as a candidate, never as a confirmed link', () => {
    expect(resolveTreatmentSessionIntegrity({
      session: session(), unitId: 'unit-1', appointmentById: null, sameDayCandidates: [appointment],
    })).toEqual({ kind: 'possivel_sem_vinculo', candidates: [appointment] });
  });

  it('accepts only an existing active appointment with matching patient, professional, unit, and date', () => {
    expect(resolveTreatmentSessionIntegrity({
      session: session({ status: 'agendada', appointment_id: appointment.id }),
      unitId: 'unit-1', appointmentById: appointment, sameDayCandidates: [],
    })).toEqual({ kind: 'agendada', appointment });
  });

  it('reports missing appointment identifiers instead of guessing from a similar appointment', () => {
    expect(resolveTreatmentSessionIntegrity({
      session: session({ status: 'agendada', appointment_id: 'missing' }),
      unitId: 'unit-1', appointmentById: null, sameDayCandidates: [appointment],
    })).toEqual({ kind: 'appointment_id_inexistente', appointmentId: 'missing' });
  });

  it.each([
    ['patient', { paciente_id: 'other-patient' }],
    ['professional', { profissional_id: 'other-staff' }],
    ['unit', { unidade_id: 'other-unit' }],
    ['date', { data: '2026-10-02' }],
    ['inactive appointment', { status: 'cancelado' }],
  ])('rejects a linked appointment with a mismatching %s', (_label, patch) => {
    expect(resolveTreatmentSessionIntegrity({
      session: session({ status: 'agendada', appointment_id: appointment.id }),
      unitId: 'unit-1', appointmentById: { ...appointment, ...patch }, sameDayCandidates: [],
    }).kind).toBe('vinculo_divergente');
  });

  it('protects completed sessions even when appointment data is supplied', () => {
    expect(resolveTreatmentSessionIntegrity({
      session: session({ status: 'realizada', appointment_id: appointment.id }),
      unitId: 'unit-1', appointmentById: appointment, sameDayCandidates: [],
    })).toEqual({ kind: 'estado_protegido' });
  });
});

describe('sessões com falta registrada', () => {
  for (const status of ['falta', 'paciente_faltou']) {
    it(`${status} com agendamento em falta é protegida`, () => {
      const r = resolveTreatmentSessionIntegrity({
        session: { id: 's', patient_id: 'p', professional_id: 'f', appointment_id: 'a', scheduled_date: '2026-10-06', status } as any,
        unitId: 'u',
        appointmentById: { id: 'a', paciente_id: 'p', profissional_id: 'f', unidade_id: 'u', data: '2026-10-06', status: 'falta' } as any,
        sameDayCandidates: [],
      });
      expect(r.kind).toBe('estado_protegido');
    });
  }
});

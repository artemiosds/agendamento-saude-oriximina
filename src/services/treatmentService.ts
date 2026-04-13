import { supabase } from '@/integrations/supabase/client';

async function fetchAllRows<T>(
  table: string,
  build?: (query: any) => any,
  orderBy?: { column: string; ascending?: boolean },
): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  const allRows: T[] = [];

  while (true) {
    let query = (supabase as any).from(table).select('*');
    if (build) query = build(query);
    if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    query = query.range(from, from + pageSize - 1);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;

    allRows.push(...data);

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

export interface SoapPayload {
  subjetivo: string;
  objetivo: string;
  avaliacao: string;
  plano: string;
}

interface RegisterCompletedSessionInput {
  cycle: {
    id: string;
    total_sessions: number;
    sessions_done: number;
    status: string;
  };
  session: {
    id: string;
    cycle_id: string;
    patient_id: string;
    professional_id: string;
    appointment_id?: string | null;
    scheduled_date: string;
    session_number: number;
    status: string;
    total_sessions: number;
    clinical_notes?: string;
    procedure_done?: string;
    absence_type?: string | null;
  };
  soap: Partial<SoapPayload> | null | undefined;
  procedureDone: string;
  userId?: string;
  appointmentId?: string | null;
}

interface RegisterCompletedSessionResult {
  appointmentId: string | null;
  cycleStatus: string;
  progressPercent: number;
  sessionsDone: number;
}

function trimValue(value: string | null | undefined) {
  return (value || '').trim();
}

export function normalizeSoapPayload(soap: Partial<SoapPayload> | null | undefined): SoapPayload {
  return {
    subjetivo: trimValue(soap?.subjetivo),
    objetivo: trimValue(soap?.objetivo),
    avaliacao: trimValue(soap?.avaliacao),
    plano: trimValue(soap?.plano),
  };
}

export function getSoapValidationError(soap: Partial<SoapPayload> | null | undefined, options?: { required?: boolean }) {
  // If SOAP is explicitly not required, skip validation
  if (options?.required === false) return null;

  const normalized = normalizeSoapPayload(soap);

  if (!normalized.subjetivo) return 'Preencha o campo Subjetivo (S)';
  if (!normalized.objetivo) return 'Preencha o campo Objetivo (O)';
  if (!normalized.avaliacao) return 'Preencha o campo Avaliação (A)';
  if (!normalized.plano) return 'Preencha o campo Plano (P)';

  return null;
}

export function isSoapComplete(soap: Partial<SoapPayload> | null | undefined) {
  return !getSoapValidationError(soap);
}

async function resolveLinkedAppointment(params: {
  appointmentId?: string | null;
  patientId: string;
  professionalId: string;
  scheduledDate: string;
}) {
  if (params.appointmentId) {
    const { data, error } = await (supabase as any)
      .from('agendamentos')
      .select('id, hora, status')
      .eq('id', params.appointmentId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data as { id: string; hora: string; status: string };
  }

  const { data, error } = await (supabase as any)
    .from('agendamentos')
    .select('id, hora, status')
    .eq('paciente_id', params.patientId)
    .eq('profissional_id', params.professionalId)
    .eq('data', params.scheduledDate)
    .not('status', 'in', '("cancelado","falta","remarcado")')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as { id: string; hora: string; status: string } | null) || null;
}

async function countCompletedSessions(cycleId: string) {
  const { count, error } = await (supabase as any)
    .from('treatment_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('cycle_id', cycleId)
    .eq('status', 'realizada');

  if (error) throw error;
  return count ?? 0;
}

export const treatmentService = {
  async getCycles(filters?: { professionalId?: string; unitId?: string; status?: string }) {
    let query = (supabase as any).from('treatment_cycles').select('*').order('created_at', { ascending: false });
    if (filters?.professionalId) query = query.eq('professional_id', filters.professionalId);
    if (filters?.unitId) query = query.eq('unit_id', filters.unitId);
    if (filters?.status) query = query.eq('status', filters.status);
    const { data } = await query;
    return data || [];
  },

  async getSessions(cycleId?: string) {
    return fetchAllRows('treatment_sessions', (query) => {
      if (cycleId) return query.eq('cycle_id', cycleId);
      return query;
    }, { column: 'session_number', ascending: true });
  },

  async getExtensions(cycleId?: string) {
    let query = (supabase as any).from('treatment_extensions').select('*').order('changed_at', { ascending: false });
    if (cycleId) query = query.eq('cycle_id', cycleId);
    const { data } = await query;
    return data || [];
  },

  async registerCompletedSession(input: RegisterCompletedSessionInput): Promise<RegisterCompletedSessionResult> {
    const soap = normalizeSoapPayload(input.soap);
    const soapValidationError = getSoapValidationError(soap);

    if (soapValidationError) {
      throw new Error(soapValidationError);
    }

    const procedureDone =
      trimValue(input.procedureDone) || trimValue(input.session.procedure_done) || 'Sessão registrada';

    const previousSession = {
      status: input.session.status,
      clinical_notes: input.session.clinical_notes || '',
      procedure_done: input.session.procedure_done || '',
      absence_type: input.session.absence_type ?? null,
      appointment_id: input.session.appointment_id ?? null,
    };

    const previousCycle = {
      sessions_done: input.cycle.sessions_done,
      status: input.cycle.status,
    };

    const linkedAppointment = await resolveLinkedAppointment({
      appointmentId: input.appointmentId ?? input.session.appointment_id ?? null,
      patientId: input.session.patient_id,
      professionalId: input.session.professional_id,
      scheduledDate: input.session.scheduled_date,
    });

    const appointmentIdForSession = input.appointmentId ?? input.session.appointment_id ?? linkedAppointment?.id ?? null;
    const appointmentIdToFinalize = linkedAppointment?.id ?? null;
    const previousAppointmentStatus = linkedAppointment?.status ?? null;

    let sessionUpdated = false;
    let cycleUpdated = false;
    let appointmentUpdated = false;

    try {
      const clinicalNotesJson = JSON.stringify({
        tipo: 'soap',
        subjetivo: soap.subjetivo,
        objetivo: soap.objetivo,
        avaliacao: soap.avaliacao,
        plano: soap.plano,
        registrado_em: new Date().toISOString(),
        registrado_por: input.userId || null,
      });

      const { error: sessionError } = await (supabase as any)
        .from('treatment_sessions')
        .update({
          status: 'realizada',
          clinical_notes: clinicalNotesJson,
          procedure_done: procedureDone,
          absence_type: null,
          appointment_id: appointmentIdForSession,
        })
        .eq('id', input.session.id);

      if (sessionError) throw sessionError;
      sessionUpdated = true;

      const completedSessions = await countCompletedSessions(input.cycle.id);
      const sessionsDone = Math.min(input.cycle.total_sessions, completedSessions);
      const cycleStatus = sessionsDone >= input.cycle.total_sessions
        ? 'concluido'
        : input.cycle.status === 'ativo'
          ? 'ativo'
          : 'em_andamento';

      const { error: cycleError } = await (supabase as any)
        .from('treatment_cycles')
        .update({
          sessions_done: sessionsDone,
          status: cycleStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.cycle.id);

      if (cycleError) throw cycleError;
      cycleUpdated = true;

      if (appointmentIdToFinalize) {
        const { error: appointmentError } = await (supabase as any)
          .from('agendamentos')
          .update({
            status: 'concluido',
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', appointmentIdToFinalize);

        if (appointmentError) throw appointmentError;
        appointmentUpdated = true;
      }

      return {
        appointmentId: appointmentIdForSession,
        cycleStatus,
        sessionsDone,
        progressPercent: input.cycle.total_sessions > 0
          ? Math.round((sessionsDone / input.cycle.total_sessions) * 100)
          : 0,
      };
    } catch (error) {
      if (appointmentUpdated && appointmentIdToFinalize && previousAppointmentStatus) {
        await (supabase as any)
          .from('agendamentos')
          .update({
            status: previousAppointmentStatus,
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', appointmentIdToFinalize);
      }

      if (cycleUpdated) {
        await (supabase as any)
          .from('treatment_cycles')
          .update({
            sessions_done: previousCycle.sessions_done,
            status: previousCycle.status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.cycle.id);
      }

      if (sessionUpdated) {
        await (supabase as any)
          .from('treatment_sessions')
          .update(previousSession)
          .eq('id', input.session.id);
      }

      throw error;
    }
  },
};

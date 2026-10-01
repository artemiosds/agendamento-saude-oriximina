import { describe, expect, it, vi } from 'vitest';
import type { Agendamento } from '@/types';
import { createTreatmentSessionOperations } from './treatmentSessionOperations';

const session = (patch: Record<string, unknown> = {}) => ({
  id: 'session-1', cycle_id: 'cycle-1', patient_id: 'patient-1', professional_id: 'staff-1',
  scheduled_date: '2026-09-28', status: 'pendente_agendamento', appointment_id: null as string | null,
  ...patch,
});

const cycle = (patch: Record<string, unknown> = {}) => ({
  id: 'cycle-1', patient_id: 'patient-1', professional_id: 'staff-1', unit_id: 'unit-1', status: 'em_andamento',
  ...patch,
});

const appointment: Agendamento = {
  id: 'ag-test-1', pacienteId: 'patient-1', pacienteNome: 'PACIENTE TESTE', unidadeId: 'unit-1',
  salaId: 'room-1', setorId: '', profissionalId: 'staff-1', profissionalNome: 'PROFISSIONAL TESTE',
  data: '2026-09-29', hora: '10:30', status: 'confirmado', tipo: 'Sessão de Tratamento',
  observacoes: 'Sessão 1/10 — Terapia', origem: 'recepcao', criadoEm: '2026-09-27T12:00:00Z', criadoPor: 'staff-1',
};

const appointmentRow = {
  id: appointment.id, paciente_id: appointment.pacienteId, paciente_nome: appointment.pacienteNome,
  unidade_id: appointment.unidadeId, sala_id: appointment.salaId, setor_id: '',
  profissional_id: appointment.profissionalId, profissional_nome: appointment.profissionalNome,
  data: appointment.data, hora: appointment.hora, status: appointment.status,
  tipo: appointment.tipo, observacoes: appointment.observacoes, origem: appointment.origem,
  google_event_id: '', sync_status: 'pendente', criado_em: appointment.criadoEm, criado_por: appointment.criadoPor,
};

describe('treatmentSessionOperations: batch link to existing appointment', () => {
  it('links an existing appointment through the scoped server RPC and synchronizes the Agenda cache', async () => {
    const ctx = setup();
    ctx.rpc.mockResolvedValue({
      data: {
        status: 'ja_agendado',
        session: { status: 'agendada', appointment_id: appointment.id, scheduled_date: appointment.data },
        appointment: appointmentRow,
      },
      error: null,
    });

    const result = await ctx.service.linkExistingAppointment({
      session: session(), cycle: cycle(), appointmentId: appointment.id,
    });

    expect(result.status).toBe('ja_agendado');
    expect(result.appointment?.id).toBe(appointment.id);
    expect(ctx.rpc).toHaveBeenCalledWith('link_existing_treatment_session_appointment', {
      p_session_id: 'session-1',
      p_cycle_id: 'cycle-1',
      p_expected_session_date: '2026-09-28',
      p_appointment_id: appointment.id,
    });
    expect(ctx.applyTreatmentAgendamentoUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: appointment.id }));
  });

  it('does not call the server when the existing appointment identifier is missing', async () => {
    const ctx = setup();
    await expect(ctx.service.linkExistingAppointment({ session: session(), cycle: cycle(), appointmentId: '' }))
      .rejects.toThrow(/não foi informado/);
    expect(ctx.rpc).not.toHaveBeenCalled();
    expect(ctx.applyTreatmentAgendamentoUpdate).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'vínculo divergente', response: { data: { status: 'vinculo_inconsistente', reason: 'agendamento_divergente' }, error: null } },
    { label: 'estado protegido', response: { data: { status: 'estado_protegido', reason: 'sessao_alterada' }, error: null } },
    { label: 'unidade ou permissão negada', response: { data: null, error: { code: '42501', message: 'permission denied' } } },
  ])('não sincroniza estado local quando a operação é recusada: $label', async ({ response }) => {
    const ctx = setup();
    ctx.rpc.mockResolvedValue(response);
    await expect(ctx.service.linkExistingAppointment({ session: session(), cycle: cycle(), appointmentId: appointment.id }))
      .rejects.toThrow();
    expect(ctx.applyTreatmentAgendamentoUpdate).not.toHaveBeenCalled();
  });

  it('trata duas chamadas concorrentes idempotentes sem duplicar o agendamento', async () => {
    const ctx = setup();
    ctx.rpc
      .mockResolvedValueOnce({ data: { status: 'ja_agendado', session: { status: 'agendada', appointment_id: appointment.id }, appointment: appointmentRow }, error: null })
      .mockResolvedValueOnce({ data: { status: 'ja_agendado', session: { status: 'agendada', appointment_id: appointment.id }, appointment: appointmentRow }, error: null });
    const input = { session: session(), cycle: cycle(), appointmentId: appointment.id };

    const results = await Promise.all([
      ctx.service.linkExistingAppointment(input),
      ctx.service.linkExistingAppointment(input),
    ]);

    expect(results.map((result) => result.status)).toEqual(['ja_agendado', 'ja_agendado']);
    expect(ctx.rpc).toHaveBeenCalledTimes(2);
    expect(ctx.applyTreatmentAgendamentoUpdate).toHaveBeenCalledTimes(2);
  });
});

function setup() {
  const rpc = vi.fn();
  const scheduleCommits: Array<{ appointment: Agendamento; created: boolean }> = [];
  const addAgendamentoTransactionally = vi.fn(async (_ag: Agendamento, persist: (ag: Agendamento) => Promise<{ appointment: Agendamento; created: boolean }>) => {
    const result = await persist(_ag);
    scheduleCommits.push(result);
    return result;
  });
  let appointmentPresent = true;
  const deleteAgendamentoTransactionally = vi.fn(async (_id: string, persist: () => Promise<void>) => {
    appointmentPresent = false;
    try {
      await persist();
    } catch (error) {
      appointmentPresent = true;
      throw error;
    }
  });
  const applyTreatmentAgendamentoUpdate = vi.fn();
  const findDuplicate = vi.fn(async () => null);
  const ensurePatientCanBeScheduled = vi.fn(async () => undefined);
  const isDateBlocked = vi.fn(async () => false);
  const service = createTreatmentSessionOperations({
    client: { rpc },
    agenda: { addAgendamentoTransactionally, deleteAgendamentoTransactionally, applyTreatmentAgendamentoUpdate },
    findDuplicate, ensurePatientCanBeScheduled, isDateBlocked,
  });
  return { service, rpc, addAgendamentoTransactionally, deleteAgendamentoTransactionally, applyTreatmentAgendamentoUpdate, findDuplicate, ensurePatientCanBeScheduled, isDateBlocked, appointmentPresent: () => appointmentPresent, scheduleCommits };
}

describe('treatmentSessionOperations: schedule', () => {
  it('usa a RPC manual apenas quando a Gestão autoriza encaixe e mantém o vínculo com a Agenda', async () => {
    const ctx = setup();
    ctx.rpc.mockResolvedValue({ data: { status: 'agendado', session: { status: 'agendada', appointment_id: appointment.id, scheduled_date: appointment.data }, appointment: appointmentRow }, error: null });
    await ctx.service.schedule({ session: session(), cycle: cycle(), appointment, duplicateScope: 'patient', manualCapacityOverride: true });
    expect(ctx.rpc).toHaveBeenCalledWith('schedule_treatment_session_manual_capacity', expect.objectContaining({ p_session_id: 'session-1' }));
    expect(ctx.scheduleCommits).toEqual([{ appointment: expect.objectContaining({ id: appointment.id }), created: true }]);
  });
  it('cria o vínculo por RPC e só confirma depois do resultado completo', async () => {
    const ctx = setup();
    ctx.rpc.mockResolvedValue({ data: { status: 'agendado', session: { status: 'agendada', appointment_id: appointment.id, scheduled_date: appointment.data }, appointment: appointmentRow }, error: null });
    const result = await ctx.service.schedule({ session: session(), cycle: cycle(), appointment, duplicateScope: 'patient_professional' });
    expect(result.status).toBe('agendado');
    expect(result.appointment?.id).toBe(appointment.id);
    expect(ctx.rpc).toHaveBeenCalledWith('schedule_treatment_session_batch', expect.objectContaining({
      p_session_id: 'session-1', p_cycle_id: 'cycle-1', p_appointment: expect.objectContaining({ id: appointment.id, status: 'confirmado', sala_id: 'room-1' }),
      p_check_patient_conflict: false,
    }));
  });

  it('encaminha ao banco a regra mais ampla de conflito usada pelo modal', async () => {
    const ctx = setup();
    ctx.rpc.mockResolvedValue({ data: { status: 'agendado', session: { status: 'agendada', appointment_id: appointment.id }, appointment: appointmentRow }, error: null });
    await ctx.service.schedule({ session: session(), cycle: cycle(), appointment, duplicateScope: 'patient' });
    expect(ctx.rpc).toHaveBeenCalledWith('schedule_treatment_session_batch', expect.objectContaining({ p_check_patient_conflict: true }));
  });

  it('usa validação transacional estrita para qualquer agendamento de sessão', async () => {
    const ctx = setup();
    ctx.rpc.mockResolvedValue({ data: { status: 'agendado', session: { status: 'agendada', appointment_id: appointment.id, scheduled_date: appointment.data }, appointment: appointmentRow }, error: null });
    await ctx.service.schedule({ session: session(), cycle: cycle(), appointment, duplicateScope: 'patient_professional' });
    expect(ctx.rpc).toHaveBeenCalledWith('schedule_treatment_session_batch', expect.objectContaining({
      p_session_id: 'session-1', p_cycle_id: 'cycle-1', p_check_patient_conflict: false,
    }));
  });

  it('bloqueia o lote com instrução clara se a migration do servidor ainda não estiver aplicada', async () => {
    const ctx = setup();
    ctx.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'function not found' } });
    await expect(ctx.service.schedule({ session: session(), cycle: cycle(), appointment, duplicateScope: 'patient_professional' }))
      .rejects.toThrow(/Aplique a migration de agendamento de tratamentos/);
    expect(ctx.scheduleCommits).toHaveLength(0);
  });

  it.each([
    ['falha ao criar agendamento', { message: 'insert failed' }],
    ['falha ao atualizar sessão após inserir agendamento', { message: 'session update failed' }],
    ['permissão negada', { code: '42501', message: 'permission denied' }],
  ])('não confirma nem sincroniza quando a RPC falha: %s', async (_label, error) => {
    const ctx = setup();
    ctx.rpc.mockResolvedValue({ data: null, error });
    await expect(ctx.service.schedule({ session: session(), cycle: cycle(), appointment, duplicateScope: 'patient_professional' })).rejects.toThrow();
    expect(ctx.addAgendamentoTransactionally).toHaveBeenCalledTimes(1);
  });

  it('preserva o bloqueio por falta no caminho que já o exigia', async () => {
    const ctx = setup();
    ctx.ensurePatientCanBeScheduled.mockRejectedValue(new Error('Paciente bloqueado por faltas injustificadas para este profissional.'));
    await expect(ctx.service.schedule({ session: session(), cycle: cycle(), appointment, duplicateScope: 'patient_professional', checkPatientAbsenceBlock: true })).rejects.toThrow(/faltas injustificadas/);
    expect(ctx.rpc).not.toHaveBeenCalled();
  });

  it('mantém as duas políticas existentes de duplicidade', async () => {
    const ctx = setup();
    ctx.findDuplicate.mockResolvedValue({ professionalName: 'OUTRO PROFISSIONAL' });
    await expect(ctx.service.schedule({ session: session(), cycle: cycle(), appointment, duplicateScope: 'patient_professional' })).rejects.toThrow(/Já existe um agendamento/);
    await expect(ctx.service.schedule({ session: session(), cycle: cycle(), appointment, duplicateScope: 'patient' })).rejects.toThrow(/OUTRO PROFISSIONAL/);
    expect(ctx.rpc).not.toHaveBeenCalled();
  });

  it('trata repetição já aplicada sem registrar segunda criação', async () => {
    const ctx = setup();
    ctx.rpc.mockResolvedValue({ data: { status: 'ja_agendado', session: { status: 'agendada', appointment_id: appointment.id, scheduled_date: appointment.data }, appointment: appointmentRow }, error: null });
    const result = await ctx.service.schedule({ session: session(), cycle: cycle(), appointment, duplicateScope: 'patient_professional' });
    expect(result.status).toBe('ja_agendado');
    expect(ctx.addAgendamentoTransactionally.mock.calls).toHaveLength(1);
    expect(ctx.scheduleCommits[0].created).toBe(false);
  });

  it.each([
    ['vínculo divergente', 'vinculo_inconsistente'],
    ['status protegido', 'estado_protegido'],
    ['unidade diferente', 'fora_escopo'],
  ])('não aceita %s', async (_label, status) => {
    const ctx = setup();
    ctx.rpc.mockResolvedValue({ data: { status, reason: status }, error: null });
    await expect(ctx.service.schedule({ session: session(), cycle: cycle(), appointment, duplicateScope: 'patient_professional' })).rejects.toThrow();
  });

  it('duas chamadas concorrentes não transformam a segunda em nova criação', async () => {
    const ctx = setup();
    ctx.rpc
      .mockResolvedValueOnce({ data: { status: 'agendado', session: { status: 'agendada', appointment_id: appointment.id, scheduled_date: appointment.data }, appointment: appointmentRow }, error: null })
      .mockResolvedValueOnce({ data: { status: 'ja_agendado', session: { status: 'agendada', appointment_id: appointment.id, scheduled_date: appointment.data }, appointment: appointmentRow }, error: null });
    const results = await Promise.all([
      ctx.service.schedule({ session: session(), cycle: cycle(), appointment, duplicateScope: 'patient_professional' }),
      ctx.service.schedule({ session: session(), cycle: cycle(), appointment: { ...appointment, id: 'ag-test-2' }, duplicateScope: 'patient_professional' }),
    ]);
    expect(results.map((item) => item.status)).toEqual(['agendado', 'ja_agendado']);
    expect(ctx.rpc).toHaveBeenCalledTimes(2);
    expect(ctx.scheduleCommits.filter((item) => item.created)).toHaveLength(1);
  });
});

describe('treatmentSessionOperations: reschedule', () => {
  it('remarca por RPC manual e atualiza a Agenda só após confirmação', async () => {
    const ctx = setup();
    ctx.rpc.mockResolvedValue({ data: { status: 'remarcado', session: { status: 'agendada', appointment_id: appointment.id, scheduled_date: '2026-10-01' }, appointment: { ...appointmentRow, data: '2026-10-01' } }, error: null });
    await ctx.service.reschedule({ session: session({ status: 'agendada', appointment_id: appointment.id }), cycle: cycle(), newDate: '2026-10-01', newTime: '10:30', manualCapacityOverride: true });
    expect(ctx.rpc).toHaveBeenCalledWith('reschedule_treatment_session_manual_capacity', expect.objectContaining({ p_expected_appointment_id: appointment.id }));
    expect(ctx.applyTreatmentAgendamentoUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: appointment.id, data: '2026-10-01' }));
  });
  it('remarca sessão e sincroniza somente a data no fluxo que não altera hora', async () => {
    const ctx = setup();
    ctx.rpc.mockResolvedValue({ data: { status: 'remarcado', session: { status: 'agendada', appointment_id: appointment.id, scheduled_date: '2026-10-01' }, appointment: { ...appointmentRow, data: '2026-10-01' } }, error: null });
    await ctx.service.reschedule({ session: session({ status: 'agendada', appointment_id: appointment.id }), cycle: cycle(), newDate: '2026-10-01', bypassBlockCheck: true });
    expect(ctx.rpc).toHaveBeenCalledWith('reschedule_treatment_session', expect.objectContaining({ p_new_date: '2026-10-01', p_new_time: null }));
    expect(ctx.applyTreatmentAgendamentoUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: appointment.id, data: '2026-10-01', hora: appointment.hora }));
  });

  it('preserva a alteração de hora do callback do modal', async () => {
    const ctx = setup();
    ctx.rpc.mockResolvedValue({ data: { status: 'remarcado', session: { status: 'agendada', scheduled_date: '2026-10-01' }, appointment: { ...appointmentRow, data: '2026-10-01', hora: '11:00' } }, error: null });
    await ctx.service.reschedule({ session: session({ status: 'agendada', appointment_id: appointment.id }), cycle: cycle(), newDate: '2026-10-01', newTime: '11:00', checkPatientConflict: true, bypassBlockCheck: true });
    expect(ctx.applyTreatmentAgendamentoUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: appointment.id, data: '2026-10-01', hora: '11:00' }));
  });

  it('não sincroniza quando a transação retorna conflito, vínculo divergente ou estado protegido', async () => {
    const ctx = setup();
    for (const status of ['conflito', 'vinculo_inconsistente', 'estado_protegido', 'duplicado']) {
      ctx.rpc.mockResolvedValueOnce({ data: { status, reason: status }, error: null });
      await expect(ctx.service.reschedule({ session: session({ status: 'agendada', appointment_id: appointment.id }), cycle: cycle(), newDate: '2026-10-01', bypassBlockCheck: true })).rejects.toThrow();
    }
    expect(ctx.applyTreatmentAgendamentoUpdate).not.toHaveBeenCalled();
  });

  it('interrompe quando a data está bloqueada ou a consulta da regra falha', async () => {
    const ctx = setup();
    ctx.isDateBlocked.mockResolvedValue(true);
    const linkedSession = session({ status: 'agendada', appointment_id: appointment.id });
    await expect(ctx.service.reschedule({ session: linkedSession, cycle: cycle(), newDate: '2026-10-01' })).rejects.toThrow('Data bloqueada.');
    ctx.isDateBlocked.mockRejectedValue(new Error('check failed'));
    await expect(ctx.service.reschedule({ session: linkedSession, cycle: cycle(), newDate: '2026-10-01' })).rejects.toThrow('check failed');
    expect(ctx.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['falha da sessão', { message: 'session update failed' }],
    ['falha do agendamento', { message: 'appointment update failed' }],
    ['permissão/unidade recusada', { code: '42501', message: 'permission denied' }],
  ])('não aplica estado local após %s', async (_label, error) => {
    const ctx = setup();
    ctx.rpc.mockResolvedValue({ data: null, error });
    await expect(ctx.service.reschedule({ session: session({ status: 'agendada', appointment_id: appointment.id }), cycle: cycle(), newDate: '2026-10-01', bypassBlockCheck: true })).rejects.toThrow();
    expect(ctx.applyTreatmentAgendamentoUpdate).not.toHaveBeenCalled();
  });
});

describe('treatmentSessionOperations: unschedule', () => {
  it('exclui o agendamento através da transação e mantém a confirmação estruturada', async () => {
    const ctx = setup();
    ctx.rpc.mockResolvedValue({ data: { status: 'desmarcado', session: { status: 'pendente_agendamento', appointment_id: null, scheduled_date: '2026-09-28' }, appointment_id: appointment.id }, error: null });
    const result = await ctx.service.unschedule({ session: session({ status: 'agendada', appointment_id: appointment.id }), cycle: cycle() });
    expect(result.status).toBe('desmarcado');
    expect(ctx.appointmentPresent()).toBe(false);
    expect(ctx.deleteAgendamentoTransactionally).toHaveBeenCalledWith(appointment.id, expect.any(Function));
    expect(ctx.rpc).toHaveBeenCalledWith('unschedule_treatment_session', expect.objectContaining({ p_expected_appointment_id: appointment.id }));
  });

  it('recusa vínculo ausente sem chamar a RPC ou remover estado local', async () => {
    const ctx = setup();
    await expect(ctx.service.unschedule({ session: session({ status: 'agendada' }), cycle: cycle() })).rejects.toThrow(/Vínculo inconsistente/);
    expect(ctx.rpc).not.toHaveBeenCalled();
    expect(ctx.deleteAgendamentoTransactionally).not.toHaveBeenCalled();
  });

  it.each([
    ['falha ao excluir', { message: 'delete failed' }],
    ['falha ao atualizar sessão após excluir', { message: 'session update failed' }],
    ['status protegido', { data: { status: 'estado_protegido', reason: 'sessao_realizada' }, error: null }],
    ['vínculo divergente', { data: { status: 'vinculo_inconsistente', reason: 'appointment' }, error: null }],
    ['permissão/unidade recusada', { code: '42501', message: 'permission denied' }],
  ])('propaga %s e restaura o estado otimista em caso de falha', async (_label, response) => {
    const ctx = setup();
    ctx.rpc.mockResolvedValue('data' in response ? response : { data: null, error: response });
    await expect(ctx.service.unschedule({ session: session({ status: 'agendada', appointment_id: appointment.id }), cycle: cycle() })).rejects.toThrow();
    expect(ctx.appointmentPresent()).toBe(true);
  });

  it('não corrige automaticamente ciclo de outra unidade ou profissional', async () => {
    const ctx = setup();
    ctx.rpc.mockResolvedValue({ data: { status: 'fora_escopo', reason: 'unit' }, error: null });
    await expect(ctx.service.unschedule({ session: session({ status: 'agendada', appointment_id: appointment.id }), cycle: cycle({ unit_id: 'unit-other', professional_id: 'staff-other' }) })).rejects.toThrow();
  });
});

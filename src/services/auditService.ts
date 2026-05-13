import { supabase } from '@/integrations/supabase/client';
import { getPublicIp, getDeviceInfo } from '@/lib/clientInfo';

interface AuditParams {
  acao: string;
  entidade: string;
  entidadeId?: string;
  modulo?: string;
  user?: { id?: string; nome?: string; role?: string; unidadeId?: string; cpf?: string } | null;
  detalhes?: Record<string, any>;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  pacienteId?: string;
  pacienteNome?: string;
  profissionalId?: string;
  profissionalNome?: string;
  agendamentoId?: string;
  unidadeNome?: string;
  rota?: string;
  status?: string;
}

export const auditService = {
  async log(params: AuditParams) {
    try {
      const ip = await getPublicIp();
      const device = getDeviceInfo();

      const detalhes: Record<string, any> = { ...params.detalhes };
      
      // Basic context enrichement
      if (params.oldValue) detalhes.old_value = params.oldValue;
      if (params.newValue) detalhes.new_value = params.newValue;
      if (device) detalhes.device = device;
      if (params.pacienteId) detalhes.paciente_id = params.pacienteId;
      if (params.pacienteNome) detalhes.paciente_nome = params.pacienteNome;
      if (params.profissionalId) detalhes.profissional_id = params.profissionalId;
      if (params.profissionalNome) detalhes.profissional_nome = params.profissionalNome;
      if (params.agendamentoId) detalhes.agendamento_id = params.agendamentoId;
      if (params.unidadeNome) detalhes.unidade_nome = params.unidadeNome;
      if (params.rota) detalhes.rota = params.rota;
      if (params.user?.cpf) detalhes.usuario_cpf = params.user.cpf;

      await supabase.from('action_logs').insert({
        acao: params.acao,
        entidade: params.entidade,
        entidade_id: params.entidadeId || '',
        modulo: params.modulo || params.entidade,
        user_id: params.user?.id || '',
        user_nome: params.user?.nome || '',
        role: params.user?.role || '',
        unidade_id: params.user?.unidadeId || '',
        ip,
        detalhes,
        status: params.status || 'sucesso',
      });
    } catch (err) {
      console.error('Audit log error:', err);
    }
  },
};

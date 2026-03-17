import { supabase } from '@/integrations/supabase/client';
import { getPublicIp, getDeviceInfo } from '@/lib/clientInfo';

interface AuditParams {
  acao: string;
  entidade: string;
  entidadeId?: string;
  modulo?: string;
  user?: { id?: string; nome?: string; role?: string; unidadeId?: string } | null;
  detalhes?: Record<string, any>;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
}

export const auditService = {
  async log(params: AuditParams) {
    try {
      const ip = await getPublicIp();
      const device = getDeviceInfo();

      const detalhes: Record<string, any> = { ...params.detalhes };
      if (params.oldValue) detalhes.old_value = params.oldValue;
      if (params.newValue) detalhes.new_value = params.newValue;
      if (device) detalhes.device = device;

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
        status: 'sucesso',
      });
    } catch (err) {
      console.error('Audit log error:', err);
    }
  },
};

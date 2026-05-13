import { supabase } from '@/integrations/supabase/client';
import { getPublicIp, getDeviceInfo } from '@/lib/clientInfo';

export interface AuditParams {
  acao: string;
  acaoLegivel?: string;
  tipoEvento?: 'criacao' | 'edicao' | 'exclusao' | 'visualizacao' | 'download' | 'impressao' | 'login' | 'erro' | 'sistema' | 'bloqueio';
  modulo: string;
  entidade: string;
  entidadeId?: string;
  entidadeNome?: string;
  user?: { id?: string; nome?: string; role?: string; unidadeId?: string; cpf?: string; email?: string } | null;
  detalhes?: Record<string, any>;
  before?: any;
  after?: any;
  oldValue?: any; // Compatibilidade legada
  newValue?: any; // Compatibilidade legada
  pacienteId?: string;
  pacienteNome?: string;
  profissionalId?: string;
  profissionalNome?: string;
  agendamentoId?: string;
  prontuarioId?: string;
  documentoId?: string;
  unidadeId?: string;
  unidadeNome?: string;
  origem?: string;
  rota?: string;
  status?: 'sucesso' | 'erro' | 'bloqueado' | 'pendente';
  errorMessage?: string;
  errorCode?: string;

}

export const auditService = {
  /**
   * Generates a readable description of changes between two objects
   */
  diffObjects(before: any, after: any) {
    if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return { changes: {}, fields: [] };
    
    const changes: Record<string, { from: any; to: any }> = {};
    const fields: string[] = [];
    
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    
    allKeys.forEach(key => {
      // Skip internal/meta fields
      if (['id', 'created_at', 'updated_at', 'user_id', 'unidade_id'].includes(key)) return;
      
      const valBefore = before[key];
      const valAfter = after[key];
      
      if (JSON.stringify(valBefore) !== JSON.stringify(valAfter)) {
        changes[key] = { from: valBefore, to: valAfter };
        fields.push(key);
      }
    });
    
    return { changes, fields };
  },

  /**
   * Masks sensitive data like CPF or passwords
   */
  maskSensitiveData(data: any): any {
    if (!data) return data;
    if (typeof data === 'string') {
      // Mask password/token fields if value looks like one or key is known
      return '********';
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.maskSensitiveData(item));
    }
    
    if (typeof data === 'object') {
      const masked = { ...data };
      const sensitiveKeys = ['password', 'senha', 'token', 'access_token', 'secret', 'key', 'api_key', 'authorization'];
      
      Object.keys(masked).forEach(key => {
        if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
          masked[key] = '********';
        } else if (typeof masked[key] === 'object') {
          masked[key] = this.maskSensitiveData(masked[key]);
        }
      });
      return masked;
    }
    
    return data;
  },

  async log(params: AuditParams) {
    try {
      const ip = await getPublicIp();
      const device = getDeviceInfo();
      const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent : '';
      const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
      
      // Calculate changes if before/after provided
      let changes = null;
      let camposAlterados = null;
      const effectiveBefore = params.before || params.oldValue;
      const effectiveAfter = params.after || params.newValue;

      if (effectiveBefore && effectiveAfter) {
        const diff = this.diffObjects(effectiveBefore, effectiveAfter);
        changes = diff.changes;
        camposAlterados = diff.fields;
      }

      // Mask before/after/detalhes for security
      const safeBefore = effectiveBefore ? this.maskSensitiveData(effectiveBefore) : null;
      const safeAfter = effectiveAfter ? this.maskSensitiveData(effectiveAfter) : null;

      const safeDetalhes = params.detalhes ? this.maskSensitiveData(params.detalhes) : {};

      const payload: any = {
        acao: params.acao,
        acao_legivel: params.acaoLegivel || params.acao,
        tipo_evento: params.tipoEvento || (params.acao.includes('criar') ? 'criacao' : params.acao.includes('editar') ? 'edicao' : params.acao.includes('excluir') ? 'exclusao' : 'sistema'),
        modulo: params.modulo,
        entidade: params.entidade,
        entidade_id: params.entidadeId || '',
        entidade_nome: params.entidadeNome,
        user_id: params.user?.id || '',
        user_nome: params.user?.nome || '',
        role: params.user?.role || '',
        unidade_id: params.unidadeId || params.user?.unidadeId || '',
        unidade_nome: params.unidadeNome,
        paciente_id: params.pacienteId,
        paciente_nome: params.pacienteNome,
        profissional_id: params.profissionalId,
        profissional_nome: params.profissionalNome,
        agendamento_id: params.agendamentoId,
        prontuario_id: params.prontuarioId,
        documento_id: params.documentoId,
        ip,
        user_agent: userAgent,
        navegador: device?.browser || '',
        sistema_operacional: device?.os || '',
        dispositivo: device?.device || 'desktop',
        rota: params.rota || (typeof window !== 'undefined' ? window.location.pathname : ''),
        origem: params.origem || 'frontend',
        status: params.status || 'sucesso',
        error_message: params.errorMessage,
        error_code: params.errorCode,
        before: safeBefore,
        after: safeAfter,
        changes: changes,
        campos_alterados: camposAlterados,
        detalhes: {
          ...safeDetalhes,
          usuario_cpf: params.user?.cpf,
          usuario_email: params.user?.email,
          url: currentUrl
        }
      };

      await supabase.from('action_logs').insert(payload);
    } catch (err) {
      console.error('Audit log error:', err);
    }
  },

  // Specialized helpers
  async auditCreate(params: Omit<AuditParams, 'tipoEvento'>) {
    return this.log({ ...params, tipoEvento: 'criacao' });
  },

  async auditUpdate(params: Omit<AuditParams, 'tipoEvento'>) {
    return this.log({ ...params, tipoEvento: 'edicao' });
  },

  async auditDelete(params: Omit<AuditParams, 'tipoEvento'>) {
    return this.log({ ...params, tipoEvento: 'exclusao' });
  },

  async auditError(params: Omit<AuditParams, 'tipoEvento' | 'status'>) {
    return this.log({ ...params, tipoEvento: 'erro', status: 'erro' });
  }
};

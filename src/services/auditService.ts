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
      if (['id', 'created_at', 'updated_at', 'user_id', 'unidade_id', 'custom_data'].includes(key)) return;
      
      const valBefore = before[key];
      const valAfter = after[key];
      
      if (JSON.stringify(valBefore) !== JSON.stringify(valAfter)) {
        changes[key] = { from: valBefore, to: valAfter };
        fields.push(key);
      }
    });
    
    // Handle nested custom_data if present
    if (before.custom_data && after.custom_data) {
      const cdDiff = this.diffObjects(before.custom_data, after.custom_data);
      Object.entries(cdDiff.changes).forEach(([k, v]) => {
        changes[`custom_data.${k}`] = v;
        fields.push(`custom_data.${k}`);
      });
    }
    
    return { changes, fields };
  },

  /**
   * Masks sensitive data like passwords or tokens
   */
  maskSensitiveData(data: any): any {
    if (!data) return data;
    if (typeof data === 'string') {
      const sensitiveKeys = ['password', 'senha', 'token', 'access_token', 'secret', 'key', 'api_key', 'authorization'];
      // This is a bit aggressive but safer
      return data.length > 20 ? '********' : data;
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
        } else if (typeof masked[key] === 'object' && masked[key] !== null) {
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
        acao_legivel: params.acaoLegivel || this.formatAuditAction(params.acao),
        tipo_evento: params.tipoEvento || this.inferEventType(params.acao),
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

  inferEventType(acao: string): string {
    const a = acao.toLowerCase();
    if (a.includes('criar') || a.includes('novo') || a.includes('cadastrar')) return 'criacao';
    if (a.includes('editar') || a.includes('alterar') || a.includes('atualizar')) return 'edicao';
    if (a.includes('excluir') || a.includes('remover') || a.includes('deletar')) return 'exclusao';
    if (a.includes('visualizar') || a.includes('ver') || a.includes('abrir')) return 'visualizacao';
    if (a.includes('baixar') || a.includes('download')) return 'download';
    if (a.includes('imprimir')) return 'impressao';
    if (a.includes('login')) return 'login';
    if (a.includes('erro') || a.includes('falha')) return 'erro';
    if (a.includes('bloque')) return 'bloqueio';
    return 'sistema';
  },

  formatAuditAction(acao: string): string {
    const customLabels: Record<string, string> = {
      // Pacientes
      edicao_paciente_pagina_pacientes: 'Edição de cadastro do paciente pela Página Pacientes',
      criacao_paciente: 'Cadastro de novo paciente',
      excluir_paciente: 'Exclusão de paciente',
      
      // Agendamentos
      novo_agendamento: 'Criação de novo agendamento',
      confirmar_chegada: 'Confirmação de chegada do paciente',
      agendar_sessao_tratamento: 'Agendamento de sessão de tratamento',
      desmarcar_sessao: 'Desmarcação de sessão',
      agendar_ciclo_completo: 'Agendamento de ciclo completo',
      status_change: 'Alteração de status de agendamento',
      
      // Atendimento / Prontuário
      iniciar_atendimento: 'Início de atendimento clínico',
      atendimento_iniciado: 'Atendimento iniciado',
      atendimento_finalizado: 'Atendimento finalizado',
      finalizar_atendimento: 'Finalização de atendimento',
      edicao_prontuario: 'Edição de prontuário',
      finalizar_prontuario: 'Finalização de prontuário',
      prontuario_visualizado: 'Visualização de prontuário',
      prontuario_criado: 'Criação de prontuário',
      prontuario_editado: 'Edição de prontuário',
      prontuario_exportado_pdf: 'Exportação de prontuário para PDF',
      
      // Autenticação
      login: 'Tentativa de login',
      login_sucesso: 'Login realizado com sucesso',
      login_falha: 'Falha na tentativa de login',
      logout: 'Saída do sistema (logout)',
      sessao_expirada: 'Sessão de usuário expirada',
      
      // Outros
      gerar_documento: 'Geração de documento oficial',
      baixar_pdf: 'Download de arquivo PDF',
      exportar: 'Exportação de dados',
      imprimir: 'Impressão de documento',
      vaga_liberada: 'Liberação de vaga na agenda',
      fila_chamada: 'Chamada de paciente da fila',
      fila_encaixe: 'Encaixe de paciente na fila',
    };

    if (customLabels[acao]) return customLabels[acao];

    return acao
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
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

  async auditAction(params: AuditParams) {
    return this.log(params);
  },

  async auditError(params: Omit<AuditParams, 'tipoEvento' | 'status'>) {
    return this.log({ ...params, tipoEvento: 'erro', status: 'erro' });
  }
};

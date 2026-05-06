
export interface GranularAction {
  id: string;
  label: string;
  description?: string;
  category?: 'atendimento' | 'clinico' | 'gestao' | 'sistema' | 'producao';
}

export interface ModuleDefinition {
  id: string;
  label: string;
  description?: string;
  actions: GranularAction[];
}

/**
 * Central Registry of all granular actions available in the system.
 * This is the "Truth" of what the system can do.
 */
export const PERMISSIONS_REGISTRY: ModuleDefinition[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    actions: [
      { id: 'view_indicators', label: 'Visualizar Indicadores Críticos', category: 'gestao' },
      { id: 'view_unit_stats', label: 'Estatísticas da Unidade', category: 'gestao' },
    ]
  },
  {
    id: 'agenda',
    label: 'Agenda',
    actions: [
      { id: 'view', label: 'Visualizar Agenda', category: 'atendimento' },
      { id: 'create', label: 'Novo Agendamento', category: 'atendimento' },
      { id: 'edit', label: 'Editar Agendamento', category: 'atendimento' },
      { id: 'cancel', label: 'Cancelar Agendamento', category: 'atendimento' },
      { id: 'confirm_arrival', label: 'Confirmar Chegada (Recepção)', category: 'atendimento', description: 'Muda status para "Presente"' },
      { id: 'start_appointment', label: 'Iniciar Atendimento', category: 'atendimento', description: 'Inicia o fluxo clínico' },
      { id: 'reschedule', label: 'Remarcar Horário', category: 'atendimento' },
      { id: 'approve_online', label: 'Aprovar Agendamentos Online', category: 'atendimento' },
      { id: 'block_time', label: 'Bloquear Horários', category: 'gestao' },
      { id: 'unlock_time', label: 'Liberar Horários Bloqueados', category: 'gestao' },
    ]
  },
  {
    id: 'pacientes',
    label: 'Pacientes',
    actions: [
      { id: 'view', label: 'Visualizar Pacientes', category: 'atendimento' },
      { id: 'create', label: 'Cadastrar Novo Paciente', category: 'atendimento' },
      { id: 'edit', label: 'Editar Cadastro', category: 'atendimento' },
      { id: 'delete', label: 'Excluir Registro', category: 'gestao' },
      { id: 'export', label: 'Exportar Lista de Pacientes', category: 'gestao' },
      { id: 'import', label: 'Importar Pacientes (CSV)', category: 'gestao' },
      { id: 'update_cadastral', label: 'Central de Atualização Cadastral', category: 'gestao', description: 'Correção de pendências BPA' },
    ]
  },
  {
    id: 'prontuario',
    label: 'Prontuário',
    actions: [
      { id: 'view', label: 'Visualizar Histórico', category: 'clinico' },
      { id: 'create', label: 'Novo Atendimento / Evolução', category: 'clinico' },
      { id: 'save_draft', label: 'Salvar Rascunho', category: 'clinico' },
      { id: 'finalize', label: 'Finalizar Atendimento', category: 'clinico', description: 'Bloqueia edição e gera produção' },
      { id: 'reopen', label: 'Reabrir Atendimento Finalizado', category: 'gestao' },
      { id: 'edit_own', label: 'Editar Próprios Registros', category: 'clinico' },
      { id: 'edit_others', label: 'Editar Registros de Terceiros', category: 'gestao' },
      { id: 'add_procedure', label: 'Vincular Procedimentos (SIGTAP)', category: 'clinico' },
      { id: 'add_cid', label: 'Vincular CID-10', category: 'clinico' },
      { id: 'attach_doc', label: 'Anexar Documentos/Exames', category: 'clinico' },
      { id: 'sign', label: 'Assinatura Eletrônica', category: 'clinico' },
      { id: 'print', label: 'Imprimir Prontuário', category: 'clinico' },
      { id: 'export_pdf', label: 'Exportar PDF', category: 'clinico' },
    ]
  },
  {
    id: 'bpa_producao',
    label: 'BPA-Produção',
    actions: [
      { id: 'view', label: 'Visualizar Painel de Produção', category: 'producao' },
      { id: 'generate', label: 'Gerar Lote BPA', category: 'producao' },
      { id: 'export', label: 'Exportar Arquivos (.txt / .xlsx)', category: 'producao' },
      { id: 'audit', label: 'Auditoria de Lançamentos', category: 'producao' },
      { id: 'validate', label: 'Validar Inconsistências', category: 'producao' },
    ]
  },
  {
    id: 'triagem',
    label: 'Triagem / Acolhimento',
    actions: [
      { id: 'view', label: 'Visualizar Fila', category: 'atendimento' },
      { id: 'perform', label: 'Realizar Triagem', category: 'clinico' },
      { id: 'edit', label: 'Editar Triagem Realizada', category: 'clinico' },
    ]
  },
  {
    id: 'gestao_tratamentos',
    label: 'Gestão de Tratamentos',
    actions: [
      { id: 'view', label: 'Visualizar Planos de Tratamento', category: 'clinico' },
      { id: 'manage', label: 'Criar/Encerrar Tratamentos', category: 'clinico' },
      { id: 'schedule_sessions', label: 'Agendar Sessões de Tratamento', category: 'clinico' },
    ]
  },
  {
    id: 'funcionarios',
    label: 'Funcionários / Usuários',
    actions: [
      { id: 'view', label: 'Listar Funcionários', category: 'gestao' },
      { id: 'create', label: 'Cadastrar Novo', category: 'gestao' },
      { id: 'edit', label: 'Editar Cadastro', category: 'gestao' },
      { id: 'delete', label: 'Inativar Funcionário', category: 'gestao' },
      { id: 'manage_passwords', label: 'Resetar Senhas', category: 'gestao' },
    ]
  },
  {
    id: 'unidades_salas',
    label: 'Estrutura (Unidades/Salas)',
    actions: [
      { id: 'view', label: 'Visualizar Estrutura', category: 'gestao' },
      { id: 'manage', label: 'Criar/Editar Unidades e Salas', category: 'gestao' },
    ]
  },
  {
    id: 'configuracoes',
    label: 'Configurações do Sistema',
    actions: [
      { id: 'view', label: 'Acessar Painel', category: 'sistema' },
      { id: 'edit', label: 'Alterar Parâmetros Gerais', category: 'sistema' },
      { id: 'advanced', label: 'Acesso a Config. Avançadas', category: 'sistema' },
    ]
  },
  {
    id: 'permissoes',
    label: 'Gestão de Permissões',
    actions: [
      { id: 'view', label: 'Visualizar Matriz', category: 'sistema' },
      { id: 'edit', label: 'Alterar Níveis de Acesso', category: 'sistema', description: 'Requer perfil MASTER' },
    ]
  },
  {
    id: 'logs_auditoria',
    label: 'Logs e Auditoria',
    actions: [
      { id: 'view', label: 'Visualizar Logs de Sistema', category: 'sistema' },
      { id: 'export', label: 'Exportar Relatórios de Auditoria', category: 'sistema' },
    ]
  }
];

export const getRegistryModule = (moduleId: string) => 
  PERMISSIONS_REGISTRY.find(m => m.id === moduleId);

export const getAllGranularActions = () => 
  PERMISSIONS_REGISTRY.flatMap(m => m.actions.map(a => `${m.id}:${a.id}`));

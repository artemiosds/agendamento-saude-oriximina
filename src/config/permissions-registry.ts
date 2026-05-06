
export interface GranularAction {
  id: string;
  label: string;
  description?: string;
  category?: 'atendimento' | 'clinico' | 'gestao' | 'sistema';
}

export interface ModuleDefinition {
  id: string;
  label: string;
  actions: GranularAction[];
}

/**
 * Central Registry of all granular actions available in the system.
 * This registry is used to populate the Permissions UI and to 
 * validate access in the code.
 */
export const PERMISSIONS_REGISTRY: ModuleDefinition[] = [
  {
    id: 'agenda',
    label: 'Agenda',
    actions: [
      { id: 'view', label: 'Visualizar Agenda' },
      { id: 'create', label: 'Novo Agendamento' },
      { id: 'edit', label: 'Editar Agendamento' },
      { id: 'cancel', label: 'Cancelar Agendamento' },
      { id: 'confirm_arrival', label: 'Confirmar Chegada (Recepção)' },
      { id: 'start_appointment', label: 'Iniciar Atendimento' },
      { id: 'reschedule', label: 'Remarcar' },
      { id: 'block_time', label: 'Bloquear Horário' },
      { id: 'unlock_time', label: 'Liberar Horário' },
    ]
  },
  {
    id: 'pacientes',
    label: 'Pacientes',
    actions: [
      { id: 'view', label: 'Visualizar Pacientes' },
      { id: 'create', label: 'Cadastrar Paciente' },
      { id: 'edit', label: 'Editar Cadastro' },
      { id: 'delete', label: 'Excluir Paciente' },
      { id: 'export', label: 'Exportar Lista' },
      { id: 'import', label: 'Importar Lista (CSV)' },
      { id: 'update_cadastral', label: 'Central de Atualização Cadastral' },
    ]
  },
  {
    id: 'prontuario',
    label: 'Prontuário',
    actions: [
      { id: 'view', label: 'Visualizar Prontuário' },
      { id: 'create', label: 'Novo Registro de Prontuário' },
      { id: 'edit_own', label: 'Editar Próprios Registros' },
      { id: 'edit_others', label: 'Editar Registros de Terceiros' },
      { id: 'finalize', label: 'Finalizar Prontuário' },
      { id: 'save_draft', label: 'Salvar Rascunho' },
      { id: 'reopen', label: 'Reabrir Prontuário Finalizado' },
      { id: 'print', label: 'Imprimir' },
      { id: 'export_pdf', label: 'Exportar PDF' },
      { id: 'add_procedure', label: 'Vincular Procedimento' },
      { id: 'add_cid', label: 'Vincular CID' },
      { id: 'attach_doc', label: 'Anexar Documentos' },
      { id: 'sign', label: 'Assinar Digitalmente' },
    ]
  },
  {
    id: 'bpa_producao',
    label: 'BPA-Produção',
    actions: [
      { id: 'view', label: 'Visualizar Produção' },
      { id: 'generate', label: 'Gerar BPA' },
      { id: 'export', label: 'Exportar Arquivos BPA' },
      { id: 'audit', label: 'Auditar Lançamentos' },
    ]
  },
  {
    id: 'triagem',
    label: 'Triagem',
    actions: [
      { id: 'view', label: 'Visualizar Fila de Triagem' },
      { id: 'perform', label: 'Realizar Triagem' },
      { id: 'edit', label: 'Editar Triagem Realizada' },
    ]
  },
  {
    id: 'funcionarios',
    label: 'Funcionários',
    actions: [
      { id: 'view', label: 'Visualizar Funcionários' },
      { id: 'create', label: 'Cadastrar Novo' },
      { id: 'edit', label: 'Editar Cadastro' },
      { id: 'delete', label: 'Desativar/Excluir' },
      { id: 'manage_passwords', label: 'Redefinir Senhas' },
    ]
  },
  {
    id: 'unidades_salas',
    label: 'Unidades e Salas',
    actions: [
      { id: 'view', label: 'Visualizar Unidades' },
      { id: 'manage', label: 'Gerenciar Unidades/Salas' },
    ]
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    actions: [
      { id: 'view', label: 'Acessar Configurações' },
      { id: 'edit', label: 'Alterar Parâmetros do Sistema' },
      { id: 'advanced', label: 'Configurações Avançadas' },
    ]
  },
  {
    id: 'permissoes',
    label: 'Permissões',
    actions: [
      { id: 'view', label: 'Visualizar Matriz' },
      { id: 'edit', label: 'Alterar Permissões (Master Only)' },
    ]
  }
];

export const getRegistryModule = (moduleId: string) => 
  PERMISSIONS_REGISTRY.find(m => m.id === moduleId);

export const getAllGranularActions = () => 
  PERMISSIONS_REGISTRY.flatMap(m => m.actions.map(a => `${m.id}:${a.id}`));

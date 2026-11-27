// Navigation only: these flags mirror the existing master/global-master access.
export const CONFIG_GROUPS = [
  { id: 'clinica', label: 'Configuração clínica' },
  { id: 'operacao', label: 'Fluxos e atendimento' },
  { id: 'administracao', label: 'Administração e integrações' },
] as const;

export const CONFIG_SECTIONS = [
  { id: 'prontuario', label: 'Prontuário', group: 'clinica', globalOnly: false, description: 'Modelos, evolução SOAP, alertas e assinatura digital.', keywords: 'campos tipo prontuario tempo limite edição registro evolução assinatura' },
  { id: 'medicamentos', label: 'Medicamentos e Exames', group: 'clinica', globalOnly: false, description: 'Catálogos, classes terapêuticas e regras de prescrição.', keywords: 'RENAME REME receituário prescrição farmácia laboratório' },
  { id: 'impressao', label: 'Impressão e Documentos', group: 'clinica', globalOnly: false, description: 'Cabeçalhos, modelos, carimbo e documentos oficiais.', keywords: 'PDF A4 logo rodapé tipografia margens relatório termo consentimento receituário' },
  { id: 'especialidades', label: 'Especialidades', group: 'clinica', globalOnly: false, description: 'Campos e configurações por especialidade.', keywords: 'profissão fisioterapia fonoaudiologia psicologia nutrição' },
  { id: 'campos', label: 'Personalizar Campos', group: 'clinica', globalOnly: false, description: 'Identificação, validação e regras condicionais dos campos.', keywords: 'formulário obrigatório tela visibilidade condição' },
  { id: 'fluxo', label: 'Fluxo de Atendimento', group: 'operacao', globalOnly: false, description: 'Triagem, fila de espera, turnos e regras de atendimento.', keywords: 'risco agendamento PTS ciclo tratamento faltas tipos atendimento enfermagem' },
  { id: 'carencia', label: 'Carência Pós‑Alta', group: 'operacao', globalOnly: false, description: 'Regras de carência após a alta do paciente.', keywords: 'alta prazo retorno bloqueio período' },
  { id: 'usuarios', label: 'Usuários e Permissões', group: 'administracao', globalOnly: false, description: 'Portal do paciente, agendamento online e operações administrativas.', keywords: 'reativar iniciar atendimento transferir profissional paciente cancelamento acesso portal' },
  { id: 'whatsapp', label: 'WhatsApp', group: 'administracao', globalOnly: false, description: 'Provedores, mensagens, modelos e testes de envio.', keywords: 'Evolution API UazapiGO QR code notificações template tempo' },
  { id: 'integracoes', label: 'Sistemas Integrados', group: 'administracao', globalOnly: false, description: 'Gerenciamento das integrações do sistema.', keywords: 'sistemas conexões integração serviços' },
  { id: 'unidades', label: 'Unidades e Setores', group: 'administracao', globalOnly: true, description: 'Procedimentos, SIGTAP, Google Agenda e integrações institucionais.', keywords: 'SIGTAP procedimentos vincular calendário webhook Make Gmail SMTP notificações templates' },
  { id: 'sistema', label: 'Sistema', group: 'administracao', globalOnly: true, description: 'Instituição, aparência, dados, notificações e conformidade.', keywords: 'LGPD backup gestão operacional CNPJ endereço logo tema fonte retenção anonimização' },
] as const;

export type ConfigTabId = typeof CONFIG_SECTIONS[number]['id'];

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function visibleConfigSections(isGlobalMaster: boolean) {
  return CONFIG_SECTIONS.filter(section => !section.globalOnly || isGlobalMaster);
}

export function searchConfigSections(query: string, isGlobalMaster: boolean) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  return visibleConfigSections(isGlobalMaster).filter(section => {
    const haystack = normalize([section.label, section.description, section.keywords, CONFIG_GROUPS.find(group => group.id === section.group)?.label ?? ''].join(' '));
    return tokens.every(token => haystack.includes(token));
  });
}

export function resolveConfigTab(requested: ConfigTabId, isGlobalMaster: boolean): ConfigTabId {
  return visibleConfigSections(isGlobalMaster).some(section => section.id === requested) ? requested : 'prontuario';
}

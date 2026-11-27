// Public institutional portal address, aligned with patientPortalLink.ts. Never include a
// patient identifier, token, query parameter or administrative preview in the guide.
export const PORTAL_PUBLIC_URL = 'https://agendamento-saude-sms-oriximina.site/portal';
export const PORTAL_GUIDE_STEPS = [
  { title: 'Abra o portal', text: 'Use a câmera do celular para ler o QR Code ou digite o endereço indicado.' },
  { title: 'Se for seu primeiro acesso', text: 'Selecione Primeiro acesso, informe seu CPF e data de nascimento e confira o e-mail cadastrado, inclusive a caixa de spam.' },
  { title: 'Se já possui uma conta', text: 'Entre com seu e-mail e senha. Se esqueceu a senha, selecione Esqueci minha senha e siga o link recebido.' },
  { title: 'Se precisar de ajuda', text: 'Sem CPF, sem e-mail próprio acessível ou sem internet? Procure sua unidade de saúde com um documento de identificação. O atendimento presencial continua disponível.' },
] as const;
export const PORTAL_GUIDE_SECURITY = 'Nunca compartilhe senhas ou códigos de confirmação. Use apenas o endereço oficial e saia do portal após utilizar um aparelho compartilhado.';
export type AssistanceRoute = 'unknown' | 'disabled' | 'blocked' | 'review' | 'contact' | 'first' | 'legacy' | 'pending' | 'login';
type Diagnosis = { state: 'unlinked' | 'verified' | 'divergent' | 'unknown'; emailValid: boolean; emailConfirmed: boolean | null };
export function portalAssistanceRoute(input: { settingsReady: boolean; enabled?: boolean; blocked: boolean; diagnosis?: Diagnosis; cpf: string | null }): AssistanceRoute {
  if (!input.settingsReady || input.enabled === undefined) return 'unknown';
  if (!input.enabled) return 'disabled';
  if (input.blocked) return 'blocked';
  const d = input.diagnosis;
  if (!d || d.state === 'unknown') return 'unknown';
  if (d.state === 'divergent') return 'review';
  if (!d.emailValid) return 'contact';
  const hasCpf = (input.cpf || '').replace(/\D/g, '').length === 11;
  if (d.state === 'unlinked') return hasCpf ? 'first' : 'legacy';
  if (d.emailConfirmed === true) return 'login';
  if (d.emailConfirmed !== false) return 'unknown';
  return hasCpf ? 'pending' : 'review';
}
export const ASSISTANCE_GUIDANCE: Record<AssistanceRoute, { title: string; description: string }> = {
  unknown: { title: 'Conferência pendente', description: 'Atualize o diagnóstico e as regras antes de orientar uma operação de acesso. O guia geral permanece disponível.' },
  disabled: { title: 'Portal desativado', description: 'Aguarde a liberação institucional. O atendimento presencial continua disponível.' },
  blocked: { title: 'Acesso bloqueado', description: 'Não crie outra conta nem tente contornar o bloqueio. Encaminhe a conferência ao responsável autorizado.' },
  review: { title: 'Conferir a conta', description: 'Há divergência de vínculo ou confirmação insuficiente. Confira a titularidade e o cadastro antes de qualquer alteração.' },
  contact: { title: 'Atualizar contato', description: 'Oriente o paciente a cadastrar um e-mail próprio e acessível na ficha existente. Não crie ficha duplicada, e-mail fictício ou conta compartilhada. Sem e-mail, mantenha o atendimento presencial.' },
  first: { title: 'Primeiro acesso orientado', description: 'Oriente o paciente a abrir o portal no próprio aparelho e solicitar o link ao e-mail cadastrado. A solicitação não comprova ativação.' },
  legacy: { title: 'Cadastro antigo sem CPF completo', description: 'O primeiro acesso automático exige CPF. Se o paciente tem e-mail próprio acessível, o Master pode utilizar a criação administrativa já existente, após identificação presencial. Não invente CPF nem crie nova ficha.' },
  pending: { title: 'Confirmação de e-mail pendente', description: 'Oriente o paciente a conferir sua caixa de e-mail e spam ou solicitar novamente o primeiro acesso. Não crie uma segunda conta.' },
  login: { title: 'Entrada ou recuperação orientada', description: 'O paciente pode tentar entrar com sua conta. Se esqueceu a senha, oriente a recuperação pelo e-mail cadastrado. Não solicite a senha atual nem códigos de confirmação.' },
};
export function canContinueAssistedCreate(route: AssistanceRoute, checks: { identified: boolean; ownEmail: boolean; agreed: boolean }): boolean {
  return (route === 'first' || route === 'legacy') && checks.identified && checks.ownEmail && checks.agreed;
}

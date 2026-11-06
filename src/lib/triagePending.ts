/**
 * Lista informativa de campos essenciais ainda vazios na triagem.
 * Nunca bloqueia: serve apenas como lembrete visual ao profissional.
 */
export interface TriagePendingInput {
  pressaoArterial: string;
  peso: string;
  temperatura: string;
  saturacaoOxigenio: string;
  queixaPrincipal: string;
  classificacaoRisco: string;
}

export function getTriagePendingFields(form: TriagePendingInput): string[] {
  const pending: string[] = [];
  if (!form.pressaoArterial.trim()) pending.push('PA');
  if (!form.peso.trim()) pending.push('Peso');
  if (!form.temperatura.trim()) pending.push('Temperatura');
  if (!form.saturacaoOxigenio.trim()) pending.push('Saturação');
  if (!form.queixaPrincipal.trim()) pending.push('Queixa');
  if (!form.classificacaoRisco.trim()) pending.push('Classificação de risco');
  return pending;
}

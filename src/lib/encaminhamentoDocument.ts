import DOMPurify from 'dompurify';
import type { EncaminhamentoData } from '@/services/encaminhamentoService';

export const escapeReferralHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function referralDate(value?: string): string {
  if (!value) return 'Não informado';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}

export function referralFields(fields: Record<string, string>): string {
  return `<div class="info-grid">${Object.entries(fields).map(([label, value]) =>
    `<div class="field"><div class="field-label">${escapeReferralHtml(label)}</div><div class="field-value">${escapeReferralHtml(value || 'Não informado')}</div></div>`).join('')}</div>`;
}

/** A document body is shared by preview and printing; no clinical data is modified. */
export function receivedReferralBody(enc: EncaminhamentoData): string {
  const original = enc.conteudo_documento || '';
  // Both plain-text internal referrals and formatted document templates exist.
  const content = /<\/?(?:p|div|br|table|strong|b|em|ul|ol|li|span|h[1-6])(?:\s|\/?>)/i.test(original)
    ? DOMPurify.sanitize(original) : escapeReferralHtml(original);
  return DOMPurify.sanitize(`
    ${referralFields({ Paciente: enc.paciente_nome, CPF: enc.paciente_cpf, 'Cartão SUS': enc.paciente_cns,
      Nascimento: referralDate(enc.paciente_data_nascimento), Especialidade: enc.especialidade_destino,
      'CID-10': enc.paciente_cid, Emissão: referralDate(enc.data_geracao) })}
    <div class="section"><h3 class="section-title">Documento de encaminhamento</h3>
      <div class="section-content" style="white-space:pre-wrap;overflow-wrap:anywhere">${content}</div></div>
    <div class="section"><h3 class="section-title">Justificativa clínica / observação registrada</h3>
      <div class="section-content" style="white-space:pre-wrap">${escapeReferralHtml(enc.observacao || 'Consultar o conteúdo original do documento acima.')}</div></div>
    <div class="signature"><div class="signature-line"></div>
      <div class="name">${escapeReferralHtml(enc.profissional_origem_nome)}</div>
      <div class="role">${escapeReferralHtml(enc.profissional_origem_profissao)}</div>
      <div class="conselho">${escapeReferralHtml(enc.profissional_origem_conselho || 'Registro do conselho não informado no documento')}</div></div>`);
}

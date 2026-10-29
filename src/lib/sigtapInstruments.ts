/** Codes from SIGTAP tb_registro. Instrument is independent of clinical compatibility. */
const labels: Record<string, string> = {
  '01': 'BPA Consolidado (BPA-C)',
  '02': 'BPA Individualizado (BPA-I)',
  '03': 'AIH (procedimento principal)',
  '04': 'AIH (procedimento especial)',
  '05': 'AIH (procedimento secundário)',
  '06': 'APAC (procedimento principal)',
  '07': 'APAC (procedimento secundário)',
  '08': 'RAAS (Atenção Domiciliar)',
  '09': 'RAAS (Atenção Psicossocial)',
  '10': 'e-SUS APS (Atenção Primária à Saúde)',
};
export const instrumentoRotulo = (codes: readonly string[]) => codes.length
  ? [...new Set(codes)].sort().map(code => `${code} — ${labels[code] || 'Instrumento não identificado'}`).join('; ')
  : 'Instrumento não confirmado';
export const instrumentoBadge = (codes: readonly string[]) => {
  if (codes.includes('02')) return 'BPA-I';
  const names = codes.map(code => code === '01' ? 'BPA-C / Consolidado' : ['03','04','05'].includes(code) ? 'AIH' : ['06','07'].includes(code) ? 'APAC' : ['08','09'].includes(code) ? 'RAAS' : code === '10' ? 'e-SUS APS' : `Instrumento ${code}`);
  return names.length ? `${[...new Set(names)].join(' / ')} · Fora do BPA-I` : 'Instrumento não confirmado';
};
export function orientacaoInstrumento(codes: readonly string[]): string {
  if (codes.includes('02')) return 'Instrumento BPA-I disponível; confira também as demais regras do atendimento.';
  if (!codes.length) return 'Não foi possível confirmar o instrumento de registro. Confira a competência no SIGTAP.';
  return `Válido como registro clínico, mas fora do BPA-I: sem instrumento 02 nesta referência (${instrumentoRotulo(codes)}). Se o atendimento foi individual, confira e selecione o procedimento individualizado adequado à ação realizada. Não substitua o código de uma ação coletiva apenas para faturá-la no BPA-I.`;
}
export const isInstrumentRejection = (reason: string) => /instrumento.*(?:incompatível|não é BPA-I)|instrumento de registro incompatível/i.test(reason);

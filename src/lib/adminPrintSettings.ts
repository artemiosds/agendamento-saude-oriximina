/** Validation of newly edited print fields; existing settings are never silently rewritten. */
export function printSettingError(next: {margens: Record<string,number>; relatorioEvolucao: {historicoSessoes:number}}, previous: typeof next): string | null {
  for (const side of ['superior','inferior','esquerda','direita']) {
    const value = next.margens[side];
    if (value !== previous.margens[side] && (!Number.isInteger(value) || value < 5 || value > 50)) return 'Margens devem estar entre 5 e 50 mm.';
  }
  const count = next.relatorioEvolucao.historicoSessoes;
  if (count !== previous.relatorioEvolucao.historicoSessoes && (!Number.isInteger(count) || count < 1 || count > 50)) return 'Informe de 1 a 50 sessões.';
  return null;
}
export function logoExtension(mime: string): string | null {
  return ({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/svg+xml':'svg'} as Record<string,string>)[mime] ?? null;
}
export function legacyPrintHeader<T extends {linha1:string;linha2:string;linha3:string;linha4:string;logoEsquerda:string;logoCentral:string;logoDireita:string;mostrarLogoCentral:boolean}>(value:T, previous:Record<string,unknown> = {}) {
  return {...previous,linha1:value.linha1,linha2:value.linha2,linha3:value.linha3,linha4:value.linha4,logoEsquerda:value.logoEsquerda,logoCentral:value.logoCentral,logoDireita:value.logoDireita,mostrarLogoCentral:value.mostrarLogoCentral};
}

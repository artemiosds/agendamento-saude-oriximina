/** Accept decimal comma without guessing a clinical measurement or its unit. */
export const sanitizeVitalInput = (value: string): string => value.replace(/,/g, '.');

export interface TriageVitalInput {
  peso: string; altura: string; temperatura: string;
  frequenciaCardiaca: string; saturacaoOxigenio: string; glicemia: string;
}

const decimal = (value: string): number | null => {
  if (!value.trim()) return null;
  const normalized = sanitizeVitalInput(value.trim());
  return /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
};

export function validateTriageVitals(form: TriageVitalInput) {
  const errors: Partial<Record<keyof TriageVitalInput | 'imc', string>> = {};
  const peso = decimal(form.peso);
  const informedHeight = decimal(form.altura);
  const altura = informedHeight == null ? null : informedHeight <= 3 ? informedHeight * 100 : informedHeight;
  const temperatura = decimal(form.temperatura);
  const frequencia_cardiaca = decimal(form.frequenciaCardiaca);
  const saturacao_oxigenio = decimal(form.saturacaoOxigenio);
  const glicemia = decimal(form.glicemia);
  const outside = (v: number | null, min: number, max: number) => v != null && (!Number.isFinite(v) || v < min || v > max);
  if (outside(peso, 0.5, 400)) errors.peso = 'Peso inválido. Informe um valor entre 0,5 kg e 400 kg.';
  if (outside(altura, 20, 260)) errors.altura = 'Altura inválida. Informe entre 20 e 260 cm (ou o equivalente em metros).';
  if (outside(temperatura, 0, 60)) errors.temperatura = 'Temperatura inválida. Informe um valor entre 0 e 60 °C.';
  if (outside(frequencia_cardiaca, 0, 350) || (frequencia_cardiaca != null && !Number.isInteger(frequencia_cardiaca))) errors.frequenciaCardiaca = 'Frequência cardíaca inválida. Informe um número inteiro entre 0 e 350 bpm.';
  if (outside(saturacao_oxigenio, 0, 100) || (saturacao_oxigenio != null && !Number.isInteger(saturacao_oxigenio))) errors.saturacaoOxigenio = 'Saturação inválida. Informe um número inteiro entre 0 e 100%.';
  if (outside(glicemia, 0, 9999.99)) errors.glicemia = 'Glicemia inválida. Informe um valor entre 0 e 9999,99 mg/dL.';
  let imc: number | null = null;
  if (peso != null && altura != null && !errors.peso && !errors.altura) {
    imc = Number((peso / ((altura / 100) ** 2)).toFixed(2));
    if (!Number.isFinite(imc) || imc > 999.99) errors.imc = 'Confira peso e altura: o IMC calculado excede o limite suportado.';
  }
  return { errors, valid: Object.keys(errors).length === 0, values: { peso, altura: altura == null ? null : Number(altura.toFixed(2)), temperatura, frequencia_cardiaca, saturacao_oxigenio, glicemia, imc } };
}

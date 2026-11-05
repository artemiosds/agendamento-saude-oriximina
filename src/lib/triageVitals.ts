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

export type VitalAlertLevel = 'attention' | 'urgent';
export interface VitalAlert { field: 'pressaoArterial' | 'saturacaoOxigenio' | 'glicemia'; level: VitalAlertLevel; message: string }

/**
 * Screening prompts only (not diagnoses or Manchester decisions).
 * Adult thresholds are intentionally conservative; age, pregnancy, baseline
 * oxygenation, symptoms and measurement quality require professional review.
 */
export function getTriageVitalAlerts(input: Pick<TriageVitalInput, 'saturacaoOxigenio' | 'glicemia'> & { pressaoArterial: string }): VitalAlert[] {
  const alerts: VitalAlert[] = [];
  const pa = input.pressaoArterial.trim().match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
  if (pa) {
    const systolic = Number(pa[1]);
    const diastolic = Number(pa[2]);
    if (systolic >= 180 || diastolic >= 110) {
      alerts.push({ field: 'pressaoArterial', level: 'urgent', message: 'Pressão muito elevada: confira a medida e faça avaliação clínica imediata.' });
    } else if (systolic < 90 || diastolic < 60) {
      alerts.push({ field: 'pressaoArterial', level: 'urgent', message: 'Pressão baixa: confira a medida e avalie sintomas e condição clínica.' });
    }
  }
  const spo2 = decimal(input.saturacaoOxigenio);
  if (spo2 != null && Number.isFinite(spo2) && spo2 < 92) {
    alerts.push({ field: 'saturacaoOxigenio', level: 'urgent', message: 'Saturação abaixo de 92%: confirme a leitura e avalie imediatamente o paciente.' });
  } else if (spo2 != null && Number.isFinite(spo2) && spo2 < 95) {
    alerts.push({ field: 'saturacaoOxigenio', level: 'attention', message: 'Saturação abaixo de 95%: confira a leitura e considere o contexto clínico e a saturação basal.' });
  }
  const glucose = decimal(input.glicemia);
  if (glucose != null && Number.isFinite(glucose) && glucose < 54) {
    alerts.push({ field: 'glicemia', level: 'urgent', message: 'Glicemia muito baixa: confirme a medida e siga o protocolo institucional de atendimento imediato.' });
  } else if (glucose != null && Number.isFinite(glucose) && glucose < 70) {
    alerts.push({ field: 'glicemia', level: 'urgent', message: 'Possível hipoglicemia: confirme a medida e avalie sintomas imediatamente.' });
  } else if (glucose != null && Number.isFinite(glucose) && glucose > 250) {
    alerts.push({ field: 'glicemia', level: 'attention', message: 'Glicemia elevada: avalie sintomas, contexto e necessidade de conduta conforme protocolo.' });
  }
  return alerts;
}

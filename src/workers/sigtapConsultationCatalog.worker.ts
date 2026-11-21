import { getCompetenciaReferenciaCatalogo, loadBpaSigtapCatalog, SIGTAP_DETALHE_NAO_EXIGE_CBO } from '@/lib/bpaSigtapCatalog';
import type { SigtapConsultationRule } from '@/lib/sigtapConsultation';

self.onmessage = async (event: MessageEvent<string>) => {
  try {
    const catalog = await loadBpaSigtapCatalog(event.data);
    const consultation = new Map<string, SigtapConsultationRule>();
    for (const [code, rule] of catalog) {
      consultation.set(code, {
        instrumentos: rule.instrumentos,
        cbos: rule.cbos,
        servicosClassificacoes: rule.servicosClassificacoes,
        detalhes: rule.detalhes && new Set(['048', SIGTAP_DETALHE_NAO_EXIGE_CBO].filter(detail => rule.detalhes?.has(detail))),
      });
    }
    self.postMessage({ catalog: consultation, reference: getCompetenciaReferenciaCatalogo(catalog) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Falha ao consultar o SIGTAP.' });
  }
};

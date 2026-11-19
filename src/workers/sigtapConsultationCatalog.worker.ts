import { getCompetenciaReferenciaCatalogo, loadBpaSigtapCatalog } from '@/lib/bpaSigtapCatalog';

self.onmessage = async (event: MessageEvent<string>) => {
  try {
    const catalog = await loadBpaSigtapCatalog(event.data);
    self.postMessage({ catalog, reference: getCompetenciaReferenciaCatalogo(catalog) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Falha ao consultar o SIGTAP.' });
  }
};
